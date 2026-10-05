"use client";

/**
 * Las tareas que quedaron de las sesiones 1-1.
 *
 * ⭐ Separadas por dueño —lo del cliente y lo del coach— y no en una lista
 * sola. En una 1-1 se reparten compromisos para los dos lados; una lista única
 * hace que el coach lea la suya como si fuera del cliente y cierre la sesión sin
 * registro de lo que se llevó él.
 *
 * ⭐ Las que salieron de una llamada quedan marcadas como tales. Una tarea que
 * escribió una IA y una que escribió una persona no valen lo mismo cuando hay
 * que discutirlas en la sesión siguiente, y sin la marca no se distinguen.
 */

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, GlassPanel, Input, Label } from "@ai-coo/ui";
import {
  CheckCircle2,
  ClipboardList,
  Loader2,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import {
  createClientTaskAction,
  deleteClientTaskAction,
  listClientTasksAction,
  sendClientTaskToBoardAction,
  toggleClientTaskAction,
} from "@/app/clients/task-actions";
import {
  CLIENT_TASK_OWNER_LABEL,
  type ClientTask,
  type ClientTaskOwner,
} from "@/types/client-tasks";
import { CLIENT_TASKS_CHANGED, notifyClientTasksChanged } from "@/lib/clients/tasks-events";
import { isOverdue, pickNextTask } from "@/lib/clients/next-task";
import { useFechaDeHoyLocal } from "@/lib/hooks/use-fecha-de-hoy-local";
import { ACCION_DE_FILA, FichaSection } from "@/components/clients/ficha-section";
import { useToast } from "@/providers/toast-provider";
import { cn } from "@/lib/utils";

const CONTROL_CLASS =
  "h-9 w-full rounded-md border border-border bg-background px-2 text-sm";

function formatearFecha(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * El campo para escribir una tarea, siempre visible.
 *
 * ⭐ Antes había que apretar «Agregar» para que apareciera un formulario de tres
 * campos. Asignar una tarea es lo que más se hace en esta sección —el founder lo
 * pidió así: "escribir manualmente la próxima tarea"—, y una acción frecuente
 * escondida detrás de un botón se usa menos de lo que debería.
 *
 * Los detalles —para quién, para cuándo— siguen existiendo, pero se despliegan:
 * el 90% de las veces alcanza con el título y Enter.
 */
function CampoRapido({
  clientId,
  onCreated,
}: {
  clientId: string;
  onCreated: (task: ClientTask) => void;
}) {
  const { push } = useToast();
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState<ClientTaskOwner>("client");
  const [dueDate, setDueDate] = useState("");
  const [detalles, setDetalles] = useState(false);
  const [saving, setSaving] = useState(false);

  const guardar = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    const result = await createClientTaskAction({
      clientId,
      title,
      description: "",
      owner,
      dueDate: dueDate || null,
    });
    setSaving(false);

    if (!result.success) {
      push({ title: "No se pudo crear la tarea", description: result.error });
      return;
    }
    onCreated(result.data);
    notifyClientTasksChanged();
    setTitle("");
    setDueDate("");
    setDetalles(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Plus
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Asignar una tarea y apretar Enter"
            aria-label="Nueva tarea para el cliente"
            className="h-9 pl-9"
            disabled={saving}
            onKeyDown={(event) => {
              if (event.key === "Enter") guardar();
            }}
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="shrink-0 text-xs text-muted-foreground"
          onClick={() => setDetalles((prev) => !prev)}
          aria-expanded={detalles}
        >
          {detalles ? "Menos" : "Detalles"}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={guardar}
          disabled={saving || !title.trim()}
          className="shrink-0 gap-1.5"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Agregar
        </Button>
      </div>

      {detalles ? (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border/60 p-3 dark:border-white/[0.08]">
          <div className="space-y-1.5">
            <Label htmlFor="tarea-owner">Le toca a</Label>
            <select
              id="tarea-owner"
              className={cn(CONTROL_CLASS, "w-32")}
              value={owner}
              disabled={saving}
              onChange={(event) => setOwner(event.target.value as ClientTaskOwner)}
            >
              <option value="client">Cliente</option>
              <option value="coach">Coach</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tarea-fecha">Para cuándo</Label>
            <input
              id="tarea-fecha"
              type="date"
              className={cn(CONTROL_CLASS, "w-40")}
              value={dueDate}
              disabled={saving}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Tarea({
  task,
  esProxima,
  onChanged,
  onRemoved,
}: {
  task: ClientTask;
  /** La que la tabla de clientes muestra como «Próxima tarea». */
  esProxima: boolean;
  onChanged: (task: ClientTask) => void;
  onRemoved: (taskId: string) => void;
}) {
  const { push } = useToast();
  const [busy, setBusy] = useState(false);
  const hecha = task.status === "done";
  const hoy = useFechaDeHoyLocal();
  const vencida = hoy !== null && isOverdue(task, hoy);

  const tildar = async () => {
    setBusy(true);
    const result = await toggleClientTaskAction({ taskId: task.id, done: !hecha });
    setBusy(false);
    if (!result.success) {
      push({ title: "No se pudo actualizar", description: result.error });
      return;
    }
    onChanged(result.data);
  };

  const borrar = async () => {
    setBusy(true);
    const result = await deleteClientTaskAction(task.id);
    setBusy(false);
    if (!result.success) {
      push({ title: "No se pudo borrar", description: result.error });
      return;
    }
    onRemoved(task.id);
  };

  const mandarAlTablero = async () => {
    setBusy(true);
    const result = await sendClientTaskToBoardAction({ taskId: task.id });
    setBusy(false);
    if (!result.success) {
      push({ title: "No se pudo mandar al tablero", description: result.error });
      return;
    }
    onChanged(result.data);
    push({
      title: "Está en el tablero",
      description: "La tarea sigue acá y ahora también aparece en el tablero de trabajo.",
      variant: "success",
    });
  };

  return (
    <li className="flex items-start gap-3 px-3 py-2.5">
      <input
        type="checkbox"
        className="mt-1 shrink-0"
        checked={hecha}
        disabled={busy}
        onChange={tildar}
        aria-label={hecha ? `Destildar ${task.title}` : `Marcar ${task.title} como hecha`}
      />

      <div className="min-w-0 flex-1 space-y-1">
        <p className={cn("text-sm", hecha && "text-muted-foreground line-through")}>
          {task.title}
          {/*
            ⭐ La marca existe para que la ficha y la tabla no se contradigan:
            ésta es exactamente la que la lista de clientes muestra en «Próxima
            tarea», y sin decirlo acá uno se pregunta por qué esa y no otra.
          */}
          {esProxima ? (
            <Badge variant="ai" className="ml-2 align-middle text-[10px] font-normal">
              Próxima
            </Badge>
          ) : null}
        </p>

        {task.description ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {task.description}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {task.dueDate ? (
            <span className={cn(vencida && "font-medium text-destructive")}>
              {vencida ? "venció el " : "para el "}
              {formatearFecha(task.dueDate)}
            </span>
          ) : null}

          {task.source === "fathom_call" && task.sourceCallDate ? (
            <Badge variant="outline" className="text-[11px] font-normal">
              de la 1-1 del {formatearFecha(task.sourceCallDate)}
            </Badge>
          ) : null}

          {task.workboardTaskId ? (
            <Badge variant="outline" className="gap-1 text-[11px] font-normal">
              <CheckCircle2 className="h-3 w-3" />
              en el tablero
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {/*
          Mandar al tablero sólo tiene sentido para lo que le toca al equipo: el
          cliente no tiene usuario en Limitless y no puede tener una tarea
          asignada allá.
        */}
        {task.owner === "coach" && !task.workboardTaskId && !hecha ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className={ACCION_DE_FILA}
            disabled={busy}
            onClick={mandarAlTablero}
            title="Mandar al tablero de trabajo"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        ) : null}

        <Button
          type="button"
          size="icon"
          variant="ghost"
          className={cn(ACCION_DE_FILA, "hover:text-destructive")}
          disabled={busy}
          onClick={borrar}
          title="Borrar la tarea"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </li>
  );
}

function Grupo({
  titulo,
  tasks,
  proximaId,
  onChanged,
  onRemoved,
}: {
  titulo: string;
  tasks: ClientTask[];
  proximaId: string | null;
  onChanged: (task: ClientTask) => void;
  onRemoved: (taskId: string) => void;
}) {
  if (tasks.length === 0) return null;

  const pendientes = tasks.filter((task) => task.status === "pending").length;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">
        {titulo}
        {pendientes > 0 ? ` · ${pendientes} pendiente${pendientes === 1 ? "" : "s"}` : " · al día"}
      </p>
      <GlassPanel className="divide-y divide-border/40 p-0">
        <ul>
          {tasks.map((task) => (
            <Tarea
              key={task.id}
              task={task}
              esProxima={task.id === proximaId}
              onChanged={onChanged}
              onRemoved={onRemoved}
            />
          ))}
        </ul>
      </GlassPanel>
    </div>
  );
}

export function ClientTasksSection({ clientId }: { clientId: string }) {
  const [tasks, setTasks] = useState<ClientTask[]>([]);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(() => {
    let alive = true;
    listClientTasksAction(clientId)
      .then((next) => {
        if (alive) setTasks(next);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [clientId]);

  useEffect(() => cargar(), [cargar]);

  /**
   * ⭐ Recargar cuando las sesiones 1-1 crean tareas.
   *
   * Sin esto, subís una llamada, se cargan cinco tareas, y esta sección sigue
   * diciendo «Sin tareas todavía» hasta que recargues la página — que es
   * exactamente cuando uno concluye que la feature no anda.
   */
  useEffect(() => {
    const alCambiar = () => cargar();
    window.addEventListener(CLIENT_TASKS_CHANGED, alCambiar);
    return () => window.removeEventListener(CLIENT_TASKS_CHANGED, alCambiar);
  }, [cargar]);

  const reemplazar = (task: ClientTask) =>
    setTasks((prev) => prev.map((item) => (item.id === task.id ? task : item)));

  const quitar = (taskId: string) =>
    setTasks((prev) => prev.filter((item) => item.id !== taskId));

  const proximaId = pickNextTask(tasks)?.id ?? null;
  const delCliente = tasks.filter((task) => task.owner === "client");
  const delCoach = tasks.filter((task) => task.owner === "coach");
  const pendientes = tasks.filter((task) => task.status === "pending").length;

  if (loading) return null;

  return (
    <FichaSection
      icon={ClipboardList}
      title="Tareas"
      meta={pendientes > 0 ? `${pendientes} pendiente${pendientes === 1 ? "" : "s"}` : undefined}
    >
      <div className="space-y-4">
        <CampoRapido
          clientId={clientId}
          onCreated={(task) => setTasks((prev) => [...prev, task])}
        />

        {tasks.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/60 px-4 py-6 text-center text-xs text-muted-foreground dark:border-white/[0.08]">
            Sin tareas todavía. Escribí una arriba, o subí una sesión 1-1 y se
            cargan solas.
          </p>
        ) : (
          <>
            <Grupo
              titulo={`Le toca al ${CLIENT_TASK_OWNER_LABEL.client.toLowerCase()}`}
              tasks={delCliente}
              proximaId={proximaId}
              onChanged={reemplazar}
              onRemoved={quitar}
            />
            <Grupo
              titulo={`Le toca al ${CLIENT_TASK_OWNER_LABEL.coach.toLowerCase()}`}
              tasks={delCoach}
              proximaId={proximaId}
              onChanged={reemplazar}
              onRemoved={quitar}
            />
          </>
        )}
      </div>
    </FichaSection>
  );
}
