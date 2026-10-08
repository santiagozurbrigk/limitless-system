"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from "react";
import {
  assignTaskToLaunchAction,
  assignTaskToSprintAction,
  createWorkboardTaskAction,
  deleteWorkboardTaskAction,
  getSprintsAction,
  logTaskTimeAction,
  moveWorkboardTaskAction,
  updateWorkboardTaskAction,
} from "@/app/workboard/actions";
import { correrMutacion, type Aviso } from "@/lib/client/correr-accion";
import type { MutationResult } from "@/lib/server/action-result";
import { useToast } from "@/providers/toast-provider";
import { formatearDuracion } from "@/lib/workboard/duracion";
import type { LaunchPickerOption } from "@/types/launches";
import type {
  TaskArea,
  TaskPriority,
  TaskStatus,
  WorkboardMember,
  WorkboardSprint,
  WorkboardTask,
} from "@/types/workboard";

type TaskUpdatePatch = Partial<{
  /** ⭐ Varios responsables. `assigneeId` sigue aceptándose para lo viejo. */
  assigneeIds: string[];
  title: string;
  description: string;
  status: TaskStatus;
  area: TaskArea;
  priority: TaskPriority;
  assigneeId: string | null;
  dueDate: string | null;
  tags: string[];
  estimatedMinutes: number;
  launchId: string | null;
}>;

type WorkboardContextValue = {
  tasks: WorkboardTask[];
  members: WorkboardMember[];
  sprints: WorkboardSprint[];
  launches: LaunchPickerOption[];
  sprintFilterId: string;
  setSprintFilterId: (id: string) => void;
  launchFilterId: string;
  setLaunchFilterId: (id: string) => void;
  assigneeFilterId: string;
  setAssigneeFilterId: (id: string) => void;
  refreshSprints: () => Promise<void>;
  areaFilter: string;
  setAreaFilter: (v: string) => void;
  view: "board" | "calendar" | "time";
  setView: (v: "board" | "calendar" | "time") => void;
  selectedTask: WorkboardTask | null;
  setSelectedTask: (task: WorkboardTask | null) => void;
  pendingCompleteTask: WorkboardTask | null;
  pendingCompletePatch: TaskUpdatePatch | null;
  /**
   * Minutos que ya quedaron registrados en este intento de completar la tarea
   * (el completado rechazó después). El modal de tiempo los muestra y no deja
   * cargar otros: confirmar sólo completa.
   */
  pendingTimeLoggedMinutes: number | null;
  isSaving: boolean;
  createTask: (input: {
    title: string;
    description?: string;
    status: TaskStatus;
    area: TaskArea;
    priority: TaskPriority;
    assigneeId?: string | null;
    /** ⭐ Varios responsables. `assigneeId` queda para lo que ya lo usaba. */
    assigneeIds?: string[];
    dueDate?: string | null;
    tags?: string[];
    launchId?: string | null;
    sopId?: string | null;
    documentIds?: string[];
  }) => Promise<WorkboardTask | null>;
  /** `false` si la acción rechazó (ya se avisó con un toast). */
  moveTask: (taskId: string, status: TaskStatus) => Promise<boolean>;
  /** `false` si la acción rechazó (ya se avisó con un toast). */
  updateTask: (taskId: string, patch: TaskUpdatePatch) => Promise<boolean>;
  deleteTask: (taskId: string) => Promise<boolean>;
  confirmCompleteWithTime: (minutes: number, note?: string) => Promise<boolean>;
  skipTimeAndComplete: () => Promise<boolean>;
  cancelComplete: () => void;
  upsertTaskInState: (task: WorkboardTask) => void;
  assignTaskToSprint: (taskId: string, sprintId: string | null) => Promise<boolean>;
  assignTaskToLaunch: (taskId: string, launchId: string | null) => Promise<boolean>;
  kanbanDoneVisibleUntil: Record<string, number>;
};

const WorkboardContext = createContext<WorkboardContextValue | null>(null);

/**
 * ⭐ La confirmación de "completar con tiempo" que está abierta (SCRUM-503,
 * revisiones 2 y 3). El tiempo registrado vale sólo para esta confirmación:
 * abrir una nueva (aunque sea de la misma tarea), cancelar o completar lo
 * olvidan, así un intento posterior registra sus propios minutos en vez de
 * saltearse el registro. Cada apertura lleva un número: la respuesta tardía de
 * un intento (registró el tiempo, se completó) trae el número y la tarea de su
 * confirmación, y si ya no es la abierta se ignora.
 */
export type ConfirmacionDeCompletado = {
  /** Sube en cada apertura; identifica la confirmación. */
  numero: number;
  tarea: WorkboardTask | null;
  patch: TaskUpdatePatch | null;
  estadoAnterior: TaskStatus | null;
  /** Minutos ya registrados en esta confirmación, o null. */
  minutosRegistrados: number | null;
};

/** De qué confirmación es una respuesta. */
type DeLaConfirmacion = { numero: number; taskId: string };

export type EventoDeConfirmacion =
  | { tipo: "abrir"; tarea: WorkboardTask; patch: TaskUpdatePatch | null; estadoAnterior: TaskStatus }
  | ({ tipo: "tiempoRegistrado"; minutos: number } & DeLaConfirmacion)
  | { tipo: "cancelar" }
  | ({ tipo: "completada" } & DeLaConfirmacion);

export const SIN_CONFIRMACION: ConfirmacionDeCompletado = {
  numero: 0,
  tarea: null,
  patch: null,
  estadoAnterior: null,
  minutosRegistrados: null,
};

function esLaAbierta(actual: ConfirmacionDeCompletado, evento: DeLaConfirmacion): boolean {
  return actual.tarea?.id === evento.taskId && actual.numero === evento.numero;
}

export function confirmacionDeCompletado(
  actual: ConfirmacionDeCompletado,
  evento: EventoDeConfirmacion
): ConfirmacionDeCompletado {
  switch (evento.tipo) {
    case "abrir":
      return {
        numero: actual.numero + 1,
        tarea: evento.tarea,
        patch: evento.patch,
        estadoAnterior: evento.estadoAnterior,
        minutosRegistrados: null,
      };
    case "tiempoRegistrado":
      // Sólo en la confirmación de la que viene, y el primer registro manda.
      if (!esLaAbierta(actual, evento)) return actual;
      return { ...actual, minutosRegistrados: actual.minutosRegistrados ?? evento.minutos };
    case "completada":
      if (!esLaAbierta(actual, evento)) return actual;
      return { ...SIN_CONFIRMACION, numero: actual.numero };
    case "cancelar":
      return { ...SIN_CONFIRMACION, numero: actual.numero };
  }
}

/**
 * ⭐ Completar una tarea registrando su tiempo (SCRUM-503).
 *
 * Son dos acciones: registrar el tiempo y completar. Si el registro sale y el
 * completado rechaza, el modal queda abierto para reintentar; el reintento no
 * vuelve a registrar el tiempo (`tiempoYaRegistrado`), porque
 * `logTaskTimeAction` acumula y lo sumaría dos veces. `completar` recibe si el
 * tiempo ya quedó guardado, para decirlo en el aviso.
 */
export async function completarConTiempo(op: {
  minutos?: number;
  tiempoYaRegistrado: boolean;
  registrarTiempo: (minutos: number) => Promise<boolean>;
  completar: (tiempoRegistrado: boolean) => Promise<boolean>;
}): Promise<{ completada: boolean; tiempoRegistrado: boolean }> {
  let tiempoRegistrado = op.tiempoYaRegistrado;
  if (!tiempoRegistrado && op.minutos != null && op.minutos > 0) {
    if (!(await op.registrarTiempo(op.minutos))) {
      return { completada: false, tiempoRegistrado: false };
    }
    tiempoRegistrado = true;
  }
  const completada = await op.completar(tiempoRegistrado);
  return { completada, tiempoRegistrado };
}

/**
 * Un intento de completar la tarea de la confirmación abierta: corre
 * `completarConTiempo` con lo que la confirmación sabe (si el tiempo ya se
 * registró) y devuelve el evento que hay que despachar con su resultado. Es
 * lo que usa `finalizeComplete`; vive acá para poder probarlo sin dibujar el
 * provider.
 */
export async function intentarCompletar(op: {
  confirmacion: ConfirmacionDeCompletado;
  minutos?: number;
  registrarTiempo: (minutos: number) => Promise<boolean>;
  completar: (tiempoRegistrado: boolean) => Promise<boolean>;
}): Promise<{ completada: boolean; evento: EventoDeConfirmacion | null }> {
  const tarea = op.confirmacion.tarea;
  if (!tarea) return { completada: false, evento: null };
  const yaRegistrado = op.confirmacion.minutosRegistrados != null;
  const resultado = await completarConTiempo({
    minutos: op.minutos,
    tiempoYaRegistrado: yaRegistrado,
    registrarTiempo: op.registrarTiempo,
    completar: op.completar,
  });
  const deLaConfirmacion = { numero: op.confirmacion.numero, taskId: tarea.id };
  if (resultado.completada) {
    return { completada: true, evento: { tipo: "completada", ...deLaConfirmacion } };
  }
  if (resultado.tiempoRegistrado && !yaRegistrado && op.minutos != null) {
    return {
      completada: false,
      evento: { tipo: "tiempoRegistrado", minutos: op.minutos, ...deLaConfirmacion },
    };
  }
  return { completada: false, evento: null };
}

/**
 * El aviso al cancelar una confirmación cuyo tiempo ya quedó registrado: la
 * tarea no se completó, pero los minutos están guardados y no hay que volver
 * a cargarlos. Sin tiempo registrado no hay nada que avisar.
 */
export function avisoAlCancelar(confirmacion: ConfirmacionDeCompletado): Aviso | null {
  if (confirmacion.minutosRegistrados == null) return null;
  return {
    title: "La tarea no se completó, pero el tiempo quedó registrado",
    description: `Tiempo registrado: ${formatearDuracion(confirmacion.minutosRegistrados)}. Si volvés a completarla, no lo cargues otra vez.`,
    variant: "default",
  };
}

/**
 * ⭐ Corre una acción del tablero desde la pantalla (SCRUM-503).
 *
 * Las acciones devuelven sus errores esperables como valor: el motivo se avisa
 * con un toast. Si la acción lanza, es inesperado: se registra en la consola y
 * se avisa con el texto fijo (`correrMutacion`). Devuelve el dato si salió
 * bien y `null` si no, para que quien llama deshaga lo que adelantó o deje el
 * formulario abierto. Nunca rechaza: un `void` sobre esto no deja una promesa
 * sin atender.
 */
export async function correrEnElTablero<T>(opciones: {
  accion: () => Promise<MutationResult<T>>;
  avisar: (aviso: Aviso) => void;
  tituloError: string;
  etiqueta: string;
}): Promise<{ data: T } | null> {
  const salida: { hecho: boolean; data?: T } = { hecho: false };
  await correrMutacion({
    ...opciones,
    alExito: (data) => {
      salida.hecho = true;
      salida.data = data;
    },
  });
  return salida.hecho ? { data: salida.data as T } : null;
}

function applyTaskPatch(
  prev: WorkboardTask,
  patch: TaskUpdatePatch,
  members: WorkboardMember[]
): WorkboardTask {
  const nextAssigneeId =
    patch.assigneeId !== undefined ? patch.assigneeId : prev.assigneeId;

  let assignee = prev.assignee;
  if (patch.assigneeId !== undefined) {
    if (patch.assigneeId) {
      const member = members.find((m) => m.id === patch.assigneeId);
      assignee = member
        ? { id: member.id, name: member.name, initials: member.initials }
        : undefined;
    } else {
      assignee = undefined;
    }
  }

  return {
    ...prev,
    ...patch,
    dueDate:
      patch.dueDate !== undefined
        ? (patch.dueDate ?? undefined)
        : prev.dueDate,
    assigneeId: nextAssigneeId,
    assignee,
  };
}

export function WorkboardProvider({
  initialTasks,
  members,
  initialSprints,
  initialSprintFilterId,
  launches,
  initialLaunchFilterId = "all",
  children,
}: {
  initialTasks: WorkboardTask[];
  members: WorkboardMember[];
  initialSprints: WorkboardSprint[];
  initialSprintFilterId: string;
  launches: LaunchPickerOption[];
  initialLaunchFilterId?: string;
  children: ReactNode;
}) {
  const { push } = useToast();
  const [tasks, setTasks] = useState(initialTasks);
  const [sprints, setSprints] = useState(initialSprints);
  const [sprintFilterId, setSprintFilterId] = useState(initialSprintFilterId);
  const [launchFilterId, setLaunchFilterId] = useState(initialLaunchFilterId);
  const [assigneeFilterId, setAssigneeFilterId] = useState("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const [view, setView] = useState<"board" | "calendar" | "time">("board");
  const [selectedTask, setSelectedTask] = useState<WorkboardTask | null>(null);
  const [confirmacion, despacharConfirmacion] = useReducer(
    confirmacionDeCompletado,
    SIN_CONFIRMACION
  );
  const pendingCompleteTask = confirmacion.tarea;
  const pendingCompletePatch = confirmacion.patch;
  const [isSaving, setIsSaving] = useState(false);
  const [kanbanDoneVisibleUntil, setKanbanDoneVisibleUntil] = useState<
    Record<string, number>
  >({});

  const markKanbanDoneVisible = useCallback((taskId: string) => {
    const until = Date.now() + 60_000;
    setKanbanDoneVisibleUntil((prev) => ({ ...prev, [taskId]: until }));
    window.setTimeout(() => {
      setKanbanDoneVisibleUntil((prev) => {
        if (prev[taskId] !== until) return prev;
        const next = { ...prev };
        delete next[taskId];
        return next;
      });
    }, 60_000);
  }, []);

  const clearKanbanDoneVisible = useCallback((taskId: string) => {
    setKanbanDoneVisibleUntil((prev) => {
      if (!(taskId in prev)) return prev;
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  }, []);

  const refreshSprints = useCallback(async () => {
    const leidos = await correrEnElTablero({
      accion: () => getSprintsAction(),
      avisar: push,
      tituloError: "No se pudieron actualizar los sprints",
      etiqueta: "[Workboard] actualizar sprints",
    });
    if (leidos) setSprints(leidos.data);
  }, [push]);

  const upsertTaskInState = useCallback((task: WorkboardTask) => {
    setTasks((prev) => {
      const idx = prev.findIndex((t) => t.id === task.id);
      if (idx === -1) return [...prev, task];
      const next = [...prev];
      next[idx] = task;
      return next;
    });
    setSelectedTask((prev) => (prev?.id === task.id ? task : prev));
  }, []);

  const performMove = useCallback(
    async (
      taskId: string,
      status: TaskStatus,
      tituloError = "No se pudo mover la tarea"
    ): Promise<boolean> => {
      const prev = tasks.find((t) => t.id === taskId);
      if (!prev) return false;
      if (prev.status === status) return true;

      if (status === "done") {
        markKanbanDoneVisible(taskId);
      } else if (prev.status === "done") {
        clearKanbanDoneVisible(taskId);
      }

      setTasks((current) =>
        current.map((t) => (t.id === taskId ? { ...t, status } : t))
      );

      const movida = await correrEnElTablero({
        accion: () => moveWorkboardTaskAction({ taskId, status }),
        avisar: push,
        tituloError,
        etiqueta: "[Workboard] mover tarea",
      });
      if (!movida) upsertTaskInState(prev);
      return Boolean(movida);
    },
    [tasks, upsertTaskInState, markKanbanDoneVisible, clearKanbanDoneVisible, push]
  );

  const finalizeComplete = useCallback(
    async (minutes?: number, note?: string): Promise<boolean> => {
      if (!pendingCompleteTask) return false;

      const tarea = pendingCompleteTask;
      setIsSaving(true);
      try {
        // Si algo rechaza, el modal de tiempo queda abierto para reintentar o
        // cancelar.
        const { completada, evento } = await intentarCompletar({
          confirmacion,
          minutos: minutes,
          registrarTiempo: async (minutos) =>
            Boolean(
              await correrEnElTablero({
                accion: () =>
                  logTaskTimeAction({
                    taskId: tarea.id,
                    actualMinutes: minutos,
                    estimatedMinutes: tarea.estimatedMinutes,
                    note,
                  }),
                avisar: push,
                tituloError: "No se pudo registrar el tiempo",
                etiqueta: "[Workboard] registrar tiempo",
              })
            ),
          completar: async (tiempoRegistrado) => {
            const tituloError = tiempoRegistrado
              ? "Se registró el tiempo, pero no se pudo completar la tarea"
              : "No se pudo completar la tarea";
            if (!pendingCompletePatch) return performMove(tarea.id, "done", tituloError);
            const actualizada = await correrEnElTablero({
              accion: () =>
                updateWorkboardTaskAction({
                  taskId: tarea.id,
                  ...pendingCompletePatch,
                  status: "done",
                }),
              avisar: push,
              tituloError,
              etiqueta: "[Workboard] completar tarea",
            });
            if (!actualizada) return false;
            upsertTaskInState(actualizada.data);
            markKanbanDoneVisible(tarea.id);
            return true;
          },
        });
        if (evento) despacharConfirmacion(evento);
        if (!completada) return false;

        setSelectedTask(null);
        await refreshSprints();
        return true;
      } finally {
        setIsSaving(false);
      }
    },
    [pendingCompleteTask, pendingCompletePatch, confirmacion, performMove, upsertTaskInState, refreshSprints, markKanbanDoneVisible, push]
  );

  const createTask = useCallback(
    async (input: Parameters<WorkboardContextValue["createTask"]>[0]) => {
      setIsSaving(true);
      try {
        const creada = await correrEnElTablero({
          accion: () => createWorkboardTaskAction(input),
          avisar: push,
          tituloError: "No se pudo crear la tarea",
          etiqueta: "[Workboard] crear tarea",
        });
        if (!creada) return null;
        upsertTaskInState(creada.data);
        return creada.data;
      } finally {
        setIsSaving(false);
      }
    },
    [upsertTaskInState, push]
  );

  const moveTask = useCallback(
    async (taskId: string, status: TaskStatus): Promise<boolean> => {
      const prev = tasks.find((t) => t.id === taskId);
      if (!prev) return false;
      if (prev.status === status) return true;

      if (status === "done") {
        despacharConfirmacion({ tipo: "abrir", tarea: prev, patch: null, estadoAnterior: prev.status });
        return true;
      }

      return performMove(taskId, status);
    },
    [tasks, performMove]
  );

  const updateTask = useCallback(
    async (taskId: string, patch: TaskUpdatePatch): Promise<boolean> => {
      const prev = tasks.find((t) => t.id === taskId);
      if (!prev) return true;

      if (patch.status === "done" && prev.status !== "done") {
        despacharConfirmacion({
          tipo: "abrir",
          tarea: applyTaskPatch(prev, patch, members),
          patch,
          estadoAnterior: prev.status,
        });
        return true;
      }

      setIsSaving(true);
      try {
        const actualizada = await correrEnElTablero({
          accion: () => updateWorkboardTaskAction({ taskId, ...patch }),
          avisar: push,
          tituloError: "No se pudo guardar la tarea",
          etiqueta: "[Workboard] guardar tarea",
        });
        if (!actualizada) return false;
        upsertTaskInState(actualizada.data);
        return true;
      } finally {
        setIsSaving(false);
      }
    },
    [tasks, members, upsertTaskInState, push]
  );

  const deleteTask = useCallback(async (taskId: string): Promise<boolean> => {
    setIsSaving(true);
    try {
      const borrada = await correrEnElTablero({
        accion: () => deleteWorkboardTaskAction(taskId),
        avisar: push,
        tituloError: "No se pudo eliminar la tarea",
        etiqueta: "[Workboard] eliminar tarea",
      });
      if (!borrada) return false;
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      setSelectedTask((prev) => (prev?.id === taskId ? null : prev));
      return true;
    } finally {
      setIsSaving(false);
    }
  }, [push]);

  const confirmCompleteWithTime = useCallback(
    (minutes: number, note?: string) => finalizeComplete(minutes, note),
    [finalizeComplete]
  );

  const skipTimeAndComplete = useCallback(
    () => finalizeComplete(),
    [finalizeComplete]
  );

  const cancelComplete = useCallback(() => {
    const { tarea, estadoAnterior } = confirmacion;
    if (!tarea) return;
    const taskId = tarea.id;
    if (estadoAnterior != null) {
      setTasks((current) =>
        current.map((t) => (t.id === taskId ? { ...t, status: estadoAnterior } : t))
      );
      setSelectedTask((sel) =>
        sel?.id === taskId ? { ...sel, status: estadoAnterior } : sel
      );
    }
    clearKanbanDoneVisible(taskId);
    const aviso = avisoAlCancelar(confirmacion);
    if (aviso) push(aviso);
    // Olvida también el tiempo registrado: un intento posterior registra el suyo.
    despacharConfirmacion({ tipo: "cancelar" });
  }, [confirmacion, clearKanbanDoneVisible, push]);

  const assignTaskToSprint = useCallback(
    async (taskId: string, sprintId: string | null): Promise<boolean> => {
      setIsSaving(true);
      try {
        const actualizada = await correrEnElTablero({
          accion: () => assignTaskToSprintAction(taskId, sprintId),
          avisar: push,
          tituloError: "No se pudo cambiar el sprint",
          etiqueta: "[Workboard] asignar sprint",
        });
        if (!actualizada) return false;
        upsertTaskInState(actualizada.data);
        await refreshSprints();
        return true;
      } finally {
        setIsSaving(false);
      }
    },
    [refreshSprints, upsertTaskInState, push]
  );

  /**
   * Cambia el lanzamiento de la tarea desde el detalle. Antes el detalle
   * llamaba a la acción directo; vive acá para avisar el rechazo igual que el
   * resto del tablero. No marca `isSaving`, como antes.
   */
  const assignTaskToLaunch = useCallback(
    async (taskId: string, launchId: string | null): Promise<boolean> => {
      const actualizada = await correrEnElTablero({
        accion: () => assignTaskToLaunchAction(taskId, launchId),
        avisar: push,
        tituloError: "No se pudo cambiar el lanzamiento",
        etiqueta: "[Workboard] asignar lanzamiento",
      });
      if (!actualizada) return false;
      upsertTaskInState(actualizada.data);
      return true;
    },
    [upsertTaskInState, push]
  );

  const value = useMemo(
    () => ({
      tasks,
      members,
      sprints,
      launches,
      sprintFilterId,
      setSprintFilterId,
      launchFilterId,
      setLaunchFilterId,
      assigneeFilterId,
      setAssigneeFilterId,
      refreshSprints,
      areaFilter,
      setAreaFilter,
      view,
      setView,
      selectedTask,
      setSelectedTask,
      pendingCompleteTask,
      pendingCompletePatch,
      pendingTimeLoggedMinutes: confirmacion.minutosRegistrados,
      isSaving,
      createTask,
      moveTask,
      updateTask,
      deleteTask,
      confirmCompleteWithTime,
      skipTimeAndComplete,
      cancelComplete,
      upsertTaskInState,
      assignTaskToSprint,
      assignTaskToLaunch,
      kanbanDoneVisibleUntil,
    }),
    [
      tasks,
      members,
      sprints,
      launches,
      sprintFilterId,
      launchFilterId,
      assigneeFilterId,
      refreshSprints,
      areaFilter,
      view,
      selectedTask,
      pendingCompleteTask,
      pendingCompletePatch,
      confirmacion.minutosRegistrados,
      isSaving,
      createTask,
      moveTask,
      updateTask,
      deleteTask,
      confirmCompleteWithTime,
      skipTimeAndComplete,
      cancelComplete,
      upsertTaskInState,
      assignTaskToSprint,
      assignTaskToLaunch,
      kanbanDoneVisibleUntil,
    ]
  );

  return (
    <WorkboardContext.Provider value={value}>
      {children}
    </WorkboardContext.Provider>
  );
}

export function useWorkboard() {
  const ctx = useContext(WorkboardContext);
  if (!ctx) {
    throw new Error("useWorkboard debe usarse dentro de WorkboardProvider");
  }
  return ctx;
}
