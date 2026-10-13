import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-516: las tareas del cliente devuelven sus errores esperables como
 * valor. Antes, con `runMutation`, el texto crudo de la base llegaba a la
 * ficha, y la lista devolvía `[]` ante una falla: «Sin tareas todavía».
 */

const sim = vi.hoisted(() => ({
  tablero: null as null | { ok: boolean; created: number; taskIds: string[]; error?: string },
  pedidosAlTablero: [] as unknown[],
}));

vi.mock("@/lib/observability/reportar-falla", async () => {
  const { base } = await import("./supabase-falso");
  return {
    reportarFalla: (error: unknown, contexto: unknown) => base.reportes.push({ error, contexto }),
  };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", async () => {
  const { base } = await import("./supabase-falso");
  return { createClient: async () => base.cliente() };
});
vi.mock("@/lib/auth/bootstrap", async () => {
  const { base, ORG, esTablaFaltante } = await import("./supabase-falso");
  const { ErrorEsperable } = await import("@/lib/server/error-esperable");
  return {
    requireOrganizationId: async () => {
      if (!base.sesion) throw new ErrorEsperable("Sesión no válida");
      return ORG;
    },
    getCurrentProfile: async () => base.perfil,
    isMissingTableError: esTablaFaltante,
  };
});
vi.mock("@/lib/fechas/organizacion", () => ({
  leerZonaHorariaDeLaOrganizacion: async () => "America/Argentina/Buenos_Aires",
}));
vi.mock("@/app/agent/workboard-actions", () => ({
  createWorkboardTasksAction: async (input: unknown) => {
    sim.pedidosAlTablero.push(input);
    return sim.tablero ?? { ok: true, created: 1, taskIds: ["tablero-1"] };
  },
}));

import {
  createClientTaskAction,
  deleteClientTaskAction,
  listClientTasksAction,
  sendClientTaskToBoardAction,
  toggleClientTaskAction,
  updateClientTaskAction,
} from "../task-actions";
import { base, ORG, OTRA_ORG, TEXTO_FIJO } from "./supabase-falso";

const CLIENTE = "22222222-2222-4222-8222-222222222222";
const TAREA = "44444444-4444-4444-8444-444444444444";
const TAREA_AJENA = "55555555-5555-4555-8555-555555555555";
const FETCH_FAILED = { message: "TypeError: fetch failed" };
const NO_ENCONTRADA = "No se encontró la tarea. Puede que la hayan borrado.";

function tarea(id: string, org: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    organization_id: org,
    client_id: CLIENTE,
    title: "Mandar la plantilla",
    description: "",
    owner: "coach",
    status: "pending",
    due_date: null,
    source: "manual",
    source_call_id: null,
    workboard_task_id: null,
    completed_at: null,
    created_at: "2026-10-01T00:00:00Z",
    position: 1,
    fathom_calls: null,
    ...extra,
  };
}

let consola: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  base.reiniciar();
  sim.tablero = null;
  sim.pedidosAlTablero = [];
  base.tablas.client_tasks = [tarea(TAREA, ORG), tarea(TAREA_AJENA, OTRA_ORG)];
  base.tablas.clients = [{ id: CLIENTE, organization_id: ORG, name: "Ana" }];
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => consola.mockRestore());

describe("listClientTasksAction", () => {
  it("devuelve las tareas del cliente en la organización de la sesión", async () => {
    const r = await listClientTasksAction(CLIENTE);
    expect(r.success && r.data.map((t) => t.id)).toEqual([TAREA]);
    expect(base.operaciones[0].filtros).toEqual([
      ["organization_id", ORG],
      ["client_id", CLIENTE],
    ]);
  });

  it("sin la tabla, la lista vacía (la migración no corrió)", async () => {
    base.errores.client_tasks = { message: "Could not find the table 'public.client_tasks' in the schema cache" };
    await expect(listClientTasksAction(CLIENTE)).resolves.toEqual({ success: true, data: [] });
    expect(base.reportes).toEqual([]);
  });

  it("⭐ una falla de la base ya no es «Sin tareas»: texto fijo y se reporta", async () => {
    base.errores.client_tasks = FETCH_FAILED;
    await expect(listClientTasksAction(CLIENTE)).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
    expect(base.reportes).toHaveLength(1);
  });

  it("sin sesión devuelve el motivo", async () => {
    base.sesion = false;
    await expect(listClientTasksAction(CLIENTE)).resolves.toEqual({
      success: false,
      error: "Sesión no válida",
    });
  });
});

describe("createClientTaskAction", () => {
  it("crea la tarea en la organización de la sesión", async () => {
    const r = await createClientTaskAction({ clientId: CLIENTE, title: "Llamar" });
    expect(r).toMatchObject({ success: true, data: { title: "Llamar", clientId: CLIENTE } });
    expect(base.escrituras()[0]).toMatchObject({
      op: "insert",
      valores: { organization_id: ORG, client_id: CLIENTE, position: 2 },
    });
  });

  it("⭐ sin título vuelve con el motivo, sin escribir", async () => {
    await expect(createClientTaskAction({ clientId: CLIENTE, title: " " })).resolves.toEqual({
      success: false,
      error: "La tarea necesita un título.",
    });
    expect(base.escrituras()).toEqual([]);
  });

  it("un cliente que ya no existe (23503) vuelve con el motivo", async () => {
    base.errores["client_tasks:insert"] = {
      code: "23503",
      message: 'insert or update on table "client_tasks" violates foreign key constraint',
    };
    await expect(createClientTaskAction({ clientId: CLIENTE, title: "Llamar" })).resolves.toEqual({
      success: false,
      error: "El cliente ya no existe. Recargá la página.",
    });
    expect(base.reportes).toEqual([]);
  });

  it("⭐ si no se puede leer la última posición no escribe: texto fijo y se reporta", async () => {
    base.errores["client_tasks:select"] = FETCH_FAILED;
    await expect(createClientTaskAction({ clientId: CLIENTE, title: "Llamar" })).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
    expect(base.escrituras()).toEqual([]);
  });
});

describe("updateClientTaskAction", () => {
  it("actualiza filtrando por id y organización", async () => {
    const r = await updateClientTaskAction({ taskId: TAREA, title: "Nuevo" });
    expect(r).toMatchObject({ success: true, data: { title: "Nuevo" } });
    expect(base.escrituras()[0].filtros).toEqual([
      ["id", TAREA],
      ["organization_id", ORG],
    ]);
  });

  it.each([
    [{ title: "  " }, "La tarea necesita un título."],
    [{ dueDate: "mañana" }, "La fecha tiene que ser un día del calendario."],
  ])("⭐ un dato inválido vuelve con su motivo, sin escribir", async (patch, motivo) => {
    await expect(updateClientTaskAction({ taskId: TAREA, ...patch })).resolves.toEqual({
      success: false,
      error: motivo,
    });
    expect(base.escrituras()).toEqual([]);
  });

  it("⭐ una tarea de otra organización vuelve como no encontrada, sin tocarla", async () => {
    await expect(updateClientTaskAction({ taskId: TAREA_AJENA, title: "x" })).resolves.toEqual({
      success: false,
      error: NO_ENCONTRADA,
    });
    expect(base.tablas.client_tasks.find((t) => t.id === TAREA_AJENA)?.title).toBe(
      "Mandar la plantilla"
    );
  });
});

describe("toggleClientTaskAction", () => {
  it("tilda la tarea con autor y fecha", async () => {
    const r = await toggleClientTaskAction({ taskId: TAREA, done: true });
    expect(r).toMatchObject({ success: true, data: { status: "done" } });
    expect(base.escrituras()[0].valores).toMatchObject({ status: "done", completed_by: "yo" });
  });

  it("⭐ una tarea de otra organización vuelve como no encontrada", async () => {
    await expect(toggleClientTaskAction({ taskId: TAREA_AJENA, done: true })).resolves.toEqual({
      success: false,
      error: NO_ENCONTRADA,
    });
    expect(base.tablas.client_tasks.find((t) => t.id === TAREA_AJENA)?.status).toBe("pending");
  });
});

describe("deleteClientTaskAction", () => {
  it("borra filtrando por id y organización", async () => {
    await expect(deleteClientTaskAction(TAREA)).resolves.toEqual({ success: true, data: undefined });
    expect(base.tablas.client_tasks.map((t) => t.id)).toEqual([TAREA_AJENA]);
  });

  it("⭐ una tarea de otra organización no se borra", async () => {
    await deleteClientTaskAction(TAREA_AJENA);
    expect(base.tablas.client_tasks.map((t) => t.id)).toContain(TAREA_AJENA);
  });

  it("sin sesión devuelve el motivo", async () => {
    base.sesion = false;
    await expect(deleteClientTaskAction(TAREA)).resolves.toEqual({
      success: false,
      error: "Sesión no válida",
    });
  });
});

describe("sendClientTaskToBoardAction", () => {
  it("crea la tarea en el tablero y la marca", async () => {
    const r = await sendClientTaskToBoardAction({ taskId: TAREA });
    expect(r).toMatchObject({ success: true, data: { workboardTaskId: "tablero-1" } });
    expect(sim.pedidosAlTablero).toHaveLength(1);
  });

  it("⭐ una tarea de otra organización vuelve como no encontrada, sin crear nada", async () => {
    await expect(sendClientTaskToBoardAction({ taskId: TAREA_AJENA })).resolves.toEqual({
      success: false,
      error: NO_ENCONTRADA,
    });
    expect(sim.pedidosAlTablero).toEqual([]);
  });

  it("⭐ si el tablero no la crea, el texto crudo no llega: texto fijo y se reporta", async () => {
    sim.tablero = { ok: false, created: 0, taskIds: [], error: "duplicate key value violates unique constraint" };
    const r = await sendClientTaskToBoardAction({ taskId: TAREA });
    expect(r).toEqual({ success: false, error: TEXTO_FIJO });
    expect(base.reportes).toEqual([
      {
        error: expect.objectContaining({
          name: "FallaDeLaBase",
          message: "duplicate key value violates unique constraint",
        }),
        contexto: { accion: "[sendClientTaskToBoard]" },
      },
    ]);
    expect(base.tablas.client_tasks.find((t) => t.id === TAREA)?.workboard_task_id).toBeNull();
  });

  it("si no se puede leer el nombre del cliente no manda nada: texto fijo", async () => {
    base.errores.clients = FETCH_FAILED;
    await expect(sendClientTaskToBoardAction({ taskId: TAREA })).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
    expect(sim.pedidosAlTablero).toEqual([]);
  });
});

describe("lo inesperado (SCRUM-516)", () => {
  const casos = [
    ["listClientTasksAction", () => listClientTasksAction(CLIENTE), "[listClientTasks]"],
    ["createClientTaskAction", () => createClientTaskAction({ clientId: CLIENTE, title: "x" }), "[createClientTask]"],
    ["updateClientTaskAction", () => updateClientTaskAction({ taskId: TAREA, title: "x" }), "[updateClientTask]"],
    ["toggleClientTaskAction", () => toggleClientTaskAction({ taskId: TAREA, done: true }), "[toggleClientTask]"],
    ["deleteClientTaskAction", () => deleteClientTaskAction(TAREA), "[deleteClientTask]"],
    ["sendClientTaskToBoardAction", () => sendClientTaskToBoardAction({ taskId: TAREA }), "[sendClientTaskToBoard]"],
  ] as const;

  it.each(casos)(
    "⭐ %s: una excepción de la red devuelve el texto fijo y se registra y reporta",
    async (_n, correr, etiqueta) => {
      const falla = new TypeError("fetch failed: connect ECONNREFUSED 10.0.0.5:5432");
      base.lanza = falla;
      const r = await correr();
      expect(r).toEqual({ success: false, error: TEXTO_FIJO });
      expect(consola).toHaveBeenCalledWith(etiqueta, falla);
      expect(base.reportes).toEqual([{ error: falla, contexto: { accion: etiqueta } }]);
    }
  );

  it.each(casos)(
    "⭐ %s: el error de supabase-js devuelve el texto fijo y se reporta",
    async (_n, correr, etiqueta) => {
      base.errores.client_tasks = FETCH_FAILED;
      const r = await correr();
      expect(r).toEqual({ success: false, error: TEXTO_FIJO });
      expect(JSON.stringify(r)).not.toContain("fetch failed");
      expect(base.reportes).toEqual([
        {
          error: expect.objectContaining({ message: "TypeError: fetch failed" }),
          contexto: { accion: etiqueta },
        },
      ]);
    }
  );
});
