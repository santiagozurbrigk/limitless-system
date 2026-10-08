/**
 * SCRUM-503: el provider del Tablero corre las acciones y avisa sus rechazos.
 * Las acciones devuelven sus errores esperables como valor: el motivo se
 * muestra en un toast y quien llamó se entera de que no salió (para dejar el
 * formulario abierto o deshacer lo adelantado). Si la acción lanza, es
 * inesperado: texto fijo y registro en la consola. Ninguna promesa rechaza.
 *
 * El entorno de tests es Node, sin DOM: el provider se dibuja con
 * `renderToStaticMarkup` y un hijo guarda el valor del contexto para llamar a
 * sus funciones. Los `setState` después del render no hacen nada en el
 * servidor; lo que se mira es el aviso y lo que devuelve cada función.
 */

import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sim = vi.hoisted(() => ({
  avisos: [] as Array<{ title: string; description?: string; variant?: string }>,
  acciones: {} as Record<string, (...args: unknown[]) => Promise<unknown>>,
}));

vi.mock("@/providers/toast-provider", () => ({
  useToast: () => ({ push: (aviso: { title: string }) => sim.avisos.push(aviso) }),
}));
vi.mock("@/app/workboard/actions", () => {
  const nombres = [
    "assignTaskToLaunchAction",
    "assignTaskToSprintAction",
    "createWorkboardTaskAction",
    "deleteWorkboardTaskAction",
    "getSprintsAction",
    "logTaskTimeAction",
    "moveWorkboardTaskAction",
    "updateWorkboardTaskAction",
  ];
  return Object.fromEntries(
    nombres.map((n) => [n, (...args: unknown[]) => sim.acciones[n](...args)])
  );
});

import {
  completarConTiempo,
  avisoAlCancelar,
  confirmacionDeCompletado,
  intentarCompletar,
  SIN_CONFIRMACION,
  correrEnElTablero,
  useWorkboard,
  WorkboardProvider,
} from "@/providers/workboard-provider";
import type { WorkboardTask } from "@/types/workboard";

const TEXTO_FIJO = "Ocurrió un error inesperado. Intentá de nuevo.";

const TAREA = {
  id: "t1",
  title: "Llamar",
  description: "",
  status: "todo",
  area: "general",
  priority: "medium",
  tags: [],
  position: 0,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
} as unknown as WorkboardTask;

function contexto() {
  let valor: ReturnType<typeof useWorkboard> | null = null;
  function Sonda() {
    valor = useWorkboard();
    return null;
  }
  // Los hijos van como tercer argumento (`react/no-children-prop`); el tipo
  // de las props los pide, así que se le dice que vienen por ahí.
  const props = {
    initialTasks: [TAREA],
    members: [],
    initialSprints: [],
    initialSprintFilterId: "all",
    launches: [],
  } as unknown as ComponentProps<typeof WorkboardProvider>;
  renderToStaticMarkup(createElement(WorkboardProvider, props, createElement(Sonda)));
  if (!valor) throw new Error("sin contexto");
  return valor as ReturnType<typeof useWorkboard>;
}

const rechaza = (motivo: string) => async () => ({ success: false, error: motivo });
const lanza = async () => {
  throw new TypeError("fetch failed");
};

let consola: ReturnType<typeof vi.spyOn>;
afterEach(() => consola.mockRestore());

beforeEach(() => {
  sim.avisos = [];
  sim.acciones = {
    getSprintsAction: async () => ({ success: true, data: [] }),
  };
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("correrEnElTablero", () => {
  it("con éxito devuelve el dato y no avisa", async () => {
    const r = await correrEnElTablero({
      accion: async () => ({ success: true as const, data: 7 }),
      avisar: (a) => sim.avisos.push(a),
      tituloError: "No se pudo",
      etiqueta: "[x]",
    });
    expect(r).toEqual({ data: 7 });
    expect(sim.avisos).toEqual([]);
  });

  it("⭐ un rechazo esperable se avisa con su motivo y devuelve null", async () => {
    const r = await correrEnElTablero({
      accion: async () => ({ success: false as const, error: "Sesión no válida" }),
      avisar: (a) => sim.avisos.push(a),
      tituloError: "No se pudo",
      etiqueta: "[x]",
    });
    expect(r).toBeNull();
    expect(sim.avisos).toEqual([
      { title: "No se pudo", description: "Sesión no válida", variant: "default" },
    ]);
  });

  it("⭐ si la acción lanza: texto fijo, consola y null, sin rechazar", async () => {
    const r = await correrEnElTablero<number>({
      accion: lanza,
      avisar: (a) => sim.avisos.push(a),
      tituloError: "No se pudo",
      etiqueta: "[x]",
    });
    expect(r).toBeNull();
    expect(sim.avisos).toEqual([
      { title: "No se pudo", description: TEXTO_FIJO, variant: "default" },
    ]);
    expect(consola).toHaveBeenCalledWith("[x]", expect.any(TypeError));
  });
});

describe("WorkboardProvider", () => {
  it("createTask: el motivo se muestra y devuelve null para dejar el formulario abierto", async () => {
    sim.acciones.createWorkboardTaskAction = rechaza("Campo requerido");
    const r = await contexto().createTask({
      title: "",
      status: "todo",
      area: "general",
      priority: "medium",
    });
    expect(r).toBeNull();
    expect(sim.avisos).toEqual([
      { title: "No se pudo crear la tarea", description: "Campo requerido", variant: "default" },
    ]);
  });

  it("createTask: con éxito devuelve la tarea creada, sin avisos", async () => {
    sim.acciones.createWorkboardTaskAction = async () => ({ success: true, data: TAREA });
    const r = await contexto().createTask({
      title: "Llamar",
      status: "todo",
      area: "general",
      priority: "medium",
    });
    expect(r).toBe(TAREA);
    expect(sim.avisos).toEqual([]);
  });

  it("⭐ createTask: si la acción lanza, el texto fijo y la consola", async () => {
    sim.acciones.createWorkboardTaskAction = lanza;
    const r = await contexto().createTask({
      title: "Llamar",
      status: "todo",
      area: "general",
      priority: "medium",
    });
    expect(r).toBeNull();
    expect(sim.avisos).toEqual([
      { title: "No se pudo crear la tarea", description: TEXTO_FIJO, variant: "default" },
    ]);
    expect(consola).toHaveBeenCalledWith("[Workboard] crear tarea", expect.any(TypeError));
  });

  it("updateTask: el motivo se muestra y devuelve false para dejar el detalle abierto", async () => {
    sim.acciones.updateWorkboardTaskAction = rechaza(
      "No se encontró la tarea. Puede que la hayan eliminado."
    );
    await expect(contexto().updateTask("t1", { title: "Otro" })).resolves.toBe(false);
    expect(sim.avisos).toEqual([
      {
        title: "No se pudo guardar la tarea",
        description: "No se encontró la tarea. Puede que la hayan eliminado.",
        variant: "default",
      },
    ]);
  });

  it("updateTask: con éxito devuelve true", async () => {
    sim.acciones.updateWorkboardTaskAction = async () => ({ success: true, data: TAREA });
    await expect(contexto().updateTask("t1", { title: "Otro" })).resolves.toBe(true);
    expect(sim.avisos).toEqual([]);
  });

  it("deleteTask: el motivo se muestra y devuelve false", async () => {
    sim.acciones.deleteWorkboardTaskAction = rechaza("ID inválido");
    await expect(contexto().deleteTask("t1")).resolves.toBe(false);
    expect(sim.avisos).toEqual([
      { title: "No se pudo eliminar la tarea", description: "ID inválido", variant: "default" },
    ]);
  });

  it("⭐ moveTask: el motivo se muestra, devuelve false y la promesa no rechaza (el kanban la llama con void)", async () => {
    sim.acciones.moveWorkboardTaskAction = rechaza("Sesión no válida");
    await expect(contexto().moveTask("t1", "in_progress")).resolves.toBe(false);
    expect(sim.avisos).toEqual([
      { title: "No se pudo mover la tarea", description: "Sesión no válida", variant: "default" },
    ]);
  });

  it("moveTask: con éxito devuelve true", async () => {
    sim.acciones.moveWorkboardTaskAction = async () => ({ success: true, data: undefined });
    await expect(contexto().moveTask("t1", "in_progress")).resolves.toBe(true);
    expect(sim.avisos).toEqual([]);
  });

  it("moveTask: si la acción lanza, el texto fijo", async () => {
    sim.acciones.moveWorkboardTaskAction = lanza;
    await expect(contexto().moveTask("t1", "in_progress")).resolves.toBe(false);
    expect(sim.avisos[0]?.description).toBe(TEXTO_FIJO);
  });

  it("assignTaskToSprint: el motivo se muestra y devuelve false para volver el selector", async () => {
    sim.acciones.assignTaskToSprintAction = rechaza(
      "El sprint que elegiste ya no existe. Recargá la página e intentá de nuevo."
    );
    await expect(contexto().assignTaskToSprint("t1", "s1")).resolves.toBe(false);
    expect(sim.avisos).toEqual([
      {
        title: "No se pudo cambiar el sprint",
        description: "El sprint que elegiste ya no existe. Recargá la página e intentá de nuevo.",
        variant: "default",
      },
    ]);
  });

  it("assignTaskToLaunch: el motivo se muestra y devuelve false", async () => {
    sim.acciones.assignTaskToLaunchAction = rechaza(
      "El lanzamiento que elegiste ya no existe. Recargá la página e intentá de nuevo."
    );
    await expect(contexto().assignTaskToLaunch("t1", "l1")).resolves.toBe(false);
    expect(sim.avisos).toEqual([
      {
        title: "No se pudo cambiar el lanzamiento",
        description: "El lanzamiento que elegiste ya no existe. Recargá la página e intentá de nuevo.",
        variant: "default",
      },
    ]);
  });

  it("assignTaskToLaunch: si la acción lanza, el texto fijo", async () => {
    sim.acciones.assignTaskToLaunchAction = lanza;
    await expect(contexto().assignTaskToLaunch("t1", "l1")).resolves.toBe(false);
    expect(sim.avisos[0]?.description).toBe(TEXTO_FIJO);
    expect(consola).toHaveBeenCalledWith("[Workboard] asignar lanzamiento", expect.any(TypeError));
  });

  it("refreshSprints: si la lectura rechaza, avisa el motivo", async () => {
    sim.acciones.getSprintsAction = rechaza("Sesión no válida");
    await contexto().refreshSprints();
    expect(sim.avisos).toEqual([
      {
        title: "No se pudieron actualizar los sprints",
        description: "Sesión no válida",
        variant: "default",
      },
    ]);
  });
});

/**
 * M3 de la AR de SCRUM-503: completar una tarea con tiempo son dos acciones.
 * Si el registro sale y el completado rechaza, el reintento no vuelve a
 * registrar el tiempo (`logTaskTimeAction` acumula y lo sumaría dos veces), y
 * si completar falla (también el movimiento del Kanban) el modal no se cierra.
 */
describe("completarConTiempo", () => {
  it("⭐ registro bien y completado rechazado: no completada, con el tiempo ya registrado", async () => {
    const registrarTiempo = vi.fn(async () => true);
    const completar = vi.fn(async () => false);
    await expect(
      completarConTiempo({ minutos: 30, tiempoYaRegistrado: false, registrarTiempo, completar })
    ).resolves.toEqual({ completada: false, tiempoRegistrado: true });
    expect(registrarTiempo).toHaveBeenCalledWith(30);
    expect(completar).toHaveBeenCalledWith(true);
  });

  it("⭐ el reintento con el tiempo ya registrado no lo vuelve a registrar", async () => {
    const registrarTiempo = vi.fn(async () => true);
    const completar = vi.fn(async () => true);
    await expect(
      completarConTiempo({ minutos: 30, tiempoYaRegistrado: true, registrarTiempo, completar })
    ).resolves.toEqual({ completada: true, tiempoRegistrado: true });
    expect(registrarTiempo).not.toHaveBeenCalled();
    expect(completar).toHaveBeenCalledWith(true);
  });

  it("si el registro rechaza, no se completa", async () => {
    const completar = vi.fn(async () => true);
    await expect(
      completarConTiempo({
        minutos: 30,
        tiempoYaRegistrado: false,
        registrarTiempo: async () => false,
        completar,
      })
    ).resolves.toEqual({ completada: false, tiempoRegistrado: false });
    expect(completar).not.toHaveBeenCalled();
  });

  it("sin minutos sólo completa, y un completado que falla (el Kanban) no se da por hecho", async () => {
    const registrarTiempo = vi.fn(async () => true);
    await expect(
      completarConTiempo({ tiempoYaRegistrado: false, registrarTiempo, completar: async () => false })
    ).resolves.toEqual({ completada: false, tiempoRegistrado: false });
    expect(registrarTiempo).not.toHaveBeenCalled();
  });
});

/**
 * Revisiones 2 y 3 de SCRUM-503: el tiempo ya registrado vale sólo para la
 * confirmación abierta, y una respuesta tardía de otra confirmación (otra
 * tarea, u otra apertura de la misma) se ignora.
 */
describe("confirmacionDeCompletado", () => {
  const A = { ...TAREA, id: "a" } as WorkboardTask;
  const B = { ...TAREA, id: "b" } as WorkboardTask;
  const abrir = (tarea: WorkboardTask) =>
    ({ tipo: "abrir", tarea, patch: null, estadoAnterior: "todo" }) as const;
  const de = (c: { numero: number }, taskId: string) => ({ numero: c.numero, taskId });

  it("al registrar el tiempo en la confirmación abierta lo recuerda (el primero manda)", () => {
    let c = confirmacionDeCompletado(SIN_CONFIRMACION, abrir(A));
    c = confirmacionDeCompletado(c, { tipo: "tiempoRegistrado", minutos: 30, ...de(c, "a") });
    c = confirmacionDeCompletado(c, { tipo: "tiempoRegistrado", minutos: 45, ...de(c, "a") });
    expect(c.minutosRegistrados).toBe(30);
  });

  it("⭐ cancelar olvida el tiempo registrado", () => {
    let c = confirmacionDeCompletado(SIN_CONFIRMACION, abrir(A));
    c = confirmacionDeCompletado(c, { tipo: "tiempoRegistrado", minutos: 30, ...de(c, "a") });
    c = confirmacionDeCompletado(c, { tipo: "cancelar" });
    expect(c.tarea).toBeNull();
    expect(c.minutosRegistrados).toBeNull();
  });

  it("⭐ abrir una confirmación nueva, aunque sea de la misma tarea, empieza sin tiempo registrado", () => {
    let c = confirmacionDeCompletado(SIN_CONFIRMACION, abrir(A));
    c = confirmacionDeCompletado(c, { tipo: "tiempoRegistrado", minutos: 30, ...de(c, "a") });
    c = confirmacionDeCompletado(c, abrir(A));
    expect(c.minutosRegistrados).toBeNull();
    expect(c.tarea).toBe(A);
  });

  it("⭐ la respuesta tardía de A no marca tiempo en la confirmación de B (escenario del informe)", () => {
    // A: 30 min, el registro sale y el completado sigue en vuelo.
    let c = confirmacionDeCompletado(SIN_CONFIRMACION, abrir(A));
    const deA = de(c, "a");
    // El usuario cierra el modal de A y abre B.
    c = confirmacionDeCompletado(c, { tipo: "cancelar" });
    c = confirmacionDeCompletado(c, abrir(B));
    // Llega el rechazo de A: su evento trae la confirmación de A.
    c = confirmacionDeCompletado(c, { tipo: "tiempoRegistrado", minutos: 30, ...deA });
    expect(c.tarea).toBe(B);
    expect(c.minutosRegistrados).toBeNull();
  });

  it("⭐ si A se completa tarde, no cierra la confirmación de B", () => {
    let c = confirmacionDeCompletado(SIN_CONFIRMACION, abrir(A));
    const deA = de(c, "a");
    c = confirmacionDeCompletado(c, { tipo: "cancelar" });
    c = confirmacionDeCompletado(c, abrir(B));
    c = confirmacionDeCompletado(c, { tipo: "completada", ...deA });
    expect(c.tarea).toBe(B);
  });

  it("una respuesta de una apertura anterior de la misma tarea también se ignora", () => {
    let c = confirmacionDeCompletado(SIN_CONFIRMACION, abrir(A));
    const primera = de(c, "a");
    c = confirmacionDeCompletado(c, { tipo: "cancelar" });
    c = confirmacionDeCompletado(c, abrir(A));
    c = confirmacionDeCompletado(c, { tipo: "tiempoRegistrado", minutos: 30, ...primera });
    expect(c.minutosRegistrados).toBeNull();
  });

  it("completar la abierta la cierra, y sin confirmación abierta no se registra nada", () => {
    let c = confirmacionDeCompletado(SIN_CONFIRMACION, abrir(A));
    c = confirmacionDeCompletado(c, { tipo: "completada", ...de(c, "a") });
    expect(c.tarea).toBeNull();
    const sin = confirmacionDeCompletado(c, { tipo: "tiempoRegistrado", minutos: 5, numero: c.numero, taskId: "a" });
    expect(sin.minutosRegistrados).toBeNull();
  });
});

describe("intentarCompletar (lo que corre finalizeComplete)", () => {
  const A = { ...TAREA, id: "a" } as WorkboardTask;
  const abierta = confirmacionDeCompletado(SIN_CONFIRMACION, {
    tipo: "abrir",
    tarea: A,
    patch: null,
    estadoAnterior: "todo",
  });

  it("⭐ registro bien y completado rechazado: devuelve el evento que marca el tiempo de esta confirmación", async () => {
    await expect(
      intentarCompletar({
        confirmacion: abierta,
        minutos: 30,
        registrarTiempo: async () => true,
        completar: async () => false,
      })
    ).resolves.toEqual({
      completada: false,
      evento: { tipo: "tiempoRegistrado", minutos: 30, numero: abierta.numero, taskId: "a" },
    });
  });

  it("⭐ con el tiempo ya registrado en la confirmación, el reintento no lo vuelve a registrar", async () => {
    const conTiempo = { ...abierta, minutosRegistrados: 30 };
    const registrarTiempo = vi.fn(async () => true);
    const completar = vi.fn(async () => true);
    await expect(
      intentarCompletar({ confirmacion: conTiempo, minutos: 30, registrarTiempo, completar })
    ).resolves.toEqual({
      completada: true,
      evento: { tipo: "completada", numero: abierta.numero, taskId: "a" },
    });
    expect(registrarTiempo).not.toHaveBeenCalled();
    expect(completar).toHaveBeenCalledWith(true);
  });

  it("el evento lleva el número de la confirmación aunque no sea la primera apertura", async () => {
    let tercera = abierta;
    for (let n = 0; n < 2; n += 1) {
      tercera = confirmacionDeCompletado(tercera, { tipo: "cancelar" });
      tercera = confirmacionDeCompletado(tercera, { tipo: "abrir", tarea: A, patch: null, estadoAnterior: "todo" });
    }
    expect(tercera.numero).toBe(3);
    await expect(
      intentarCompletar({ confirmacion: tercera, registrarTiempo: async () => true, completar: async () => true })
    ).resolves.toEqual({ completada: true, evento: { tipo: "completada", numero: 3, taskId: "a" } });
  });

  it("si el registro rechaza, no hay evento ni se completa", async () => {
    const completar = vi.fn(async () => true);
    await expect(
      intentarCompletar({
        confirmacion: abierta,
        minutos: 30,
        registrarTiempo: async () => false,
        completar,
      })
    ).resolves.toEqual({ completada: false, evento: null });
    expect(completar).not.toHaveBeenCalled();
  });

  it("sin confirmación abierta no hace nada", async () => {
    const registrarTiempo = vi.fn(async () => true);
    await expect(
      intentarCompletar({
        confirmacion: SIN_CONFIRMACION,
        minutos: 30,
        registrarTiempo,
        completar: async () => true,
      })
    ).resolves.toEqual({ completada: false, evento: null });
    expect(registrarTiempo).not.toHaveBeenCalled();
  });
});

describe("avisoAlCancelar", () => {
  it("⭐ con tiempo registrado avisa que quedó guardado aunque la tarea no se completó", () => {
    expect(avisoAlCancelar({ ...SIN_CONFIRMACION, minutosRegistrados: 60 })).toEqual({
      title: "La tarea no se completó, pero el tiempo quedó registrado",
      description: "Tiempo registrado: 1 hora. Si volvés a completarla, no lo cargues otra vez.",
      variant: "default",
    });
  });

  it("sin tiempo registrado no avisa", () => {
    expect(avisoAlCancelar(SIN_CONFIRMACION)).toBeNull();
  });
});
