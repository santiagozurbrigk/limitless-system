import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-503: las acciones del Tablero devuelven sus errores esperables como
 * valor (`MutationResult`). En producción Next no le manda al cliente el
 * mensaje de un error lanzado por una server action: quien movía una tarea que
 * ya no existía, o cargaba un sprint sin nombre, veía un párrafo técnico en
 * inglés en vez del motivo, y `/workboard` entero terminaba en la pantalla de
 * error de Next si la lectura fallaba.
 */

const ORG = "org-1";
const OTRA_ORG = "org-2";
const T1 = "11111111-1111-4111-8111-111111111111";
const T_OTRA_ORG = "22222222-2222-4222-8222-222222222222";
const S1 = "33333333-3333-4333-8333-333333333333";
const S_OTRA_ORG = "44444444-4444-4444-8444-444444444444";
const M1 = "55555555-5555-4555-8555-555555555555";
const L1 = "66666666-6666-4666-8666-666666666666";
const NUEVA = "77777777-7777-4777-8777-777777777777";
const NO_EXISTE = "88888888-8888-4888-8888-888888888888";

type Fila = Record<string, unknown>;
type Consulta = {
  tabla: string;
  op: "select" | "insert" | "update" | "delete" | "upsert" | "rpc";
  valores?: unknown;
  filtros: Array<[string, unknown]>;
};
type ErrorDeLaBase = { message: string; code?: string };

const sim = vi.hoisted(() => ({
  reportes: [] as Array<{ error: unknown; contexto: unknown }>,
  sesion: true,
  perfil: null as Record<string, unknown> | null,
  tablas: {} as Record<string, Array<Record<string, unknown>>>,
  // Error que devuelve supabase-js como valor, por `tabla` o `tabla:op`.
  errores: {} as Record<string, { message: string; code?: string }>,
  // Si está, `from()` lanza: como un bug o una excepción de la red.
  lanza: null as unknown,
  consultas: [] as Array<{
    tabla: string;
    op: "select" | "insert" | "update" | "delete" | "upsert" | "rpc";
    valores?: unknown;
    filtros: Array<[string, unknown]>;
  }>,
  tareaReleida: true,
}));

vi.mock("@/lib/observability/reportar-falla", () => ({
  reportarFalla: (error: unknown, contexto: unknown) => sim.reportes.push({ error, contexto }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// Como el real: la sesión que falta es un rechazo esperable.
vi.mock("@/lib/auth/bootstrap", async () => {
  const { ErrorEsperable } = await import("@/lib/server/error-esperable");
  return {
    requireOrganizationId: async () => {
      if (!sim.sesion) throw new ErrorEsperable("Sesión no válida");
      return "org-1";
    },
    getCurrentProfile: async () => sim.perfil,
    isMissingTableError: (msg: string) =>
      msg.includes("does not exist") || msg.includes("Could not find the table"),
  };
});
vi.mock("@/lib/workboard/tarea-con-vinculos", async () => {
  const { FallaDeLaBase } = await import("@/lib/server/action-result");
  return {
    TAREA_NO_ENCONTRADA: "No se encontró la tarea. Puede que la hayan eliminado.",
    loadTaskLinksBundle: async () => ({
      attachments: new Map(),
      documents: new Map(),
      sops: new Map(),
    }),
    deleteTaskAttachmentsForTask: async () => undefined,
    // La relectura de la tarea creada. La real (`leerTareaConVinculos`) se
    // prueba a través de `getWorkboardTaskByIdAction` en
    // `vinculos-de-tareas-errores-como-valor.test.ts`.
    leerTareaConVinculos: async (id: string, organizationId: string) => {
      if (!sim.tareaReleida) throw new FallaDeLaBase({ message: "boom al releer" });
      const fila = (sim.tablas.workboard_tasks ?? []).find(
        (f) => f.id === id && f.organization_id === organizationId
      );
      return { id, title: fila?.title };
    },
  };
});
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    // `crear_sprint` (migración 20261008120000), como la base: completa el
    // activo de la organización e inserta el nuevo, todo o nada.
    rpc(nombre: string, args: Record<string, unknown>) {
      if (sim.lanza) throw sim.lanza;
      sim.consultas.push({ tabla: `rpc:${nombre}`, op: "rpc", valores: args, filtros: [] });
      const resultado = () => {
        const error = sim.errores[`rpc:${nombre}`];
        if (error) return { data: null, error };
        for (const f of sim.tablas.sprints ?? []) {
          if (f.organization_id === args.p_organization_id && f.status === "active") f.status = "completed";
        }
        const fila = {
          id: NUEVA,
          organization_id: args.p_organization_id,
          name: args.p_name,
          goal: args.p_goal,
          area_focus: args.p_area_focus,
          start_date: args.p_start_date,
          end_date: args.p_end_date,
          status: "active",
          completion_rate: 0,
          created_by: args.p_created_by,
          created_at: "2026-10-08T00:00:00Z",
          updated_at: "2026-10-08T00:00:00Z",
        };
        sim.tablas.sprints = [...(sim.tablas.sprints ?? []), fila];
        return { data: fila, error: null };
      };
      return { single: async () => resultado() };
    },
    from(tabla: string) {
      if (sim.lanza) throw sim.lanza;
      const consulta: Consulta = { tabla, op: "select", filtros: [] };
      sim.consultas.push(consulta);
      // Aplica los `.eq` pedidos: si una acción deja de filtrar por
      // organización, toca o lee la fila de otra org y el test lo ve.
      const coincidentes = () =>
        (sim.tablas[tabla] ?? []).filter((f) =>
          consulta.filtros.every(([c, v]) => f[c] === v)
        );
      const errorDeLaBase = (): ErrorDeLaBase | null =>
        sim.errores[`${tabla}:${consulta.op}`] ?? sim.errores[tabla] ?? null;
      const resolver = (modo: "lista" | "una" | "quizas") => {
        const error = errorDeLaBase();
        if (error) return { data: null, error };
        let filas: Fila[];
        if (consulta.op === "insert") {
          const fila = { id: NUEVA, ...(consulta.valores as object) };
          sim.tablas[tabla] = [...(sim.tablas[tabla] ?? []), fila];
          filas = [fila];
        } else if (consulta.op === "update") {
          filas = coincidentes();
          for (const f of filas) Object.assign(f, consulta.valores);
        } else if (consulta.op === "delete") {
          filas = coincidentes();
          sim.tablas[tabla] = (sim.tablas[tabla] ?? []).filter((f) => !filas.includes(f));
        } else {
          filas = coincidentes();
        }
        if (modo === "lista") return { data: filas, error: null };
        if (modo === "quizas") return { data: filas[0] ?? null, error: null };
        if (!filas[0]) {
          return {
            data: null,
            error: { code: "PGRST116", message: "Cannot coerce the result to a single JSON object" },
          };
        }
        return { data: filas[0], error: null };
      };
      const builder = {
        select: () => builder,
        order: () => builder,
        limit: () => builder,
        eq(columna: string, valor: unknown) {
          consulta.filtros.push([columna, valor]);
          return builder;
        },
        insert(valores: unknown) {
          consulta.op = "insert";
          consulta.valores = valores;
          return builder;
        },
        update(valores: unknown) {
          consulta.op = "update";
          consulta.valores = valores;
          return builder;
        },
        delete() {
          consulta.op = "delete";
          return builder;
        },
        upsert(valores: unknown) {
          consulta.op = "upsert";
          consulta.valores = valores;
          return builder;
        },
        single: async () => resolver("una"),
        maybeSingle: async () => resolver("quizas"),
        then(alResolver: (r: unknown) => unknown, alRechazar?: (e: unknown) => unknown) {
          return Promise.resolve(resolver("lista")).then(alResolver, alRechazar);
        },
      };
      return builder;
    },
  }),
}));

import {
  assignTaskToLaunchAction,
  assignTaskToSprintAction,
  createSprintAction,
  createWorkboardTaskAction,
  deleteWorkboardTaskAction,
  getActiveSprintAction,
  getSprintsAction,
  getTimeByMemberAction,
  listWorkboardMembersAction,
  listWorkboardTasksAction,
  loadWorkboardPageDataAction,
  logTaskTimeAction,
  moveWorkboardTaskAction,
  setMemberHourlyRateAction,
  updateSprintAction,
  updateSprintCompletionAction,
  updateWorkboardTaskAction,
} from "../actions";

const TEXTO_FIJO = "Ocurrió un error inesperado. Intentá de nuevo.";
const TAREA_NO_ENCONTRADA = "No se encontró la tarea. Puede que la hayan eliminado.";
const CLAVE_FORANEA = {
  message: 'insert or update on table "workboard_tasks" violates foreign key constraint',
  code: "23503",
};

function tarea(id: string, organizationId: string, extra: Fila = {}): Fila {
  return {
    id,
    organization_id: organizationId,
    title: `Tarea ${id.slice(0, 4)}`,
    description: "",
    status: "todo",
    area: "general",
    priority: "medium",
    assignee_id: null,
    assignee_ids: [],
    due_date: null,
    tags: [],
    position: 0,
    created_by: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    sprint_id: null,
    launch_id: null,
    time_entries: [],
    estimated_minutes: null,
    actual_minutes: 0,
    ...extra,
  };
}

function sprint(id: string, organizationId: string, status = "active"): Fila {
  return {
    id,
    organization_id: organizationId,
    name: `Sprint ${id.slice(0, 4)}`,
    goal: null,
    area_focus: null,
    start_date: "2026-10-01",
    end_date: "2026-10-14",
    status,
    completion_rate: 0,
    created_by: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  };
}

let consola: ReturnType<typeof vi.spyOn>;
afterEach(() => consola.mockRestore());

beforeEach(() => {
  sim.reportes = [];
  sim.sesion = true;
  sim.perfil = { id: M1, organization_id: ORG, role: "founder", email: "a@b.c", full_name: "Ana" };
  sim.tablas = {
    profiles: [
      { id: M1, organization_id: ORG, full_name: "Ana", email: "a@b.c", role: "founder" },
      { id: "m-otra", organization_id: OTRA_ORG, full_name: "Otro", email: "o@b.c", role: "founder" },
    ],
    workboard_tasks: [
      tarea(T1, ORG, { sprint_id: S1 }),
      tarea(T_OTRA_ORG, OTRA_ORG),
    ],
    sprints: [sprint(S1, ORG), sprint(S_OTRA_ORG, OTRA_ORG)],
    workboard_time_by_member: [
      {
        organization_id: ORG,
        assignee_id: M1,
        member_name: "Ana",
        avatar_url: null,
        hourly_rate: null,
        hourly_rate_currency: null,
        task_id: T1,
        task_title: "Tarea",
        area: "general",
        estimated_minutes: 60,
        actual_minutes: 30,
        task_cost_usd: 0,
      },
    ],
  };
  sim.errores = {};
  sim.lanza = null;
  sim.consultas = [];
  sim.tareaReleida = true;
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
});

const escrituras = () => sim.consultas.filter((c) => c.op !== "select");
const filaDe = (tabla: string, id: string) => sim.tablas[tabla].find((f) => f.id === id);

const NUEVA_TAREA = { title: "Llamar a Ana", status: "todo", area: "general", priority: "medium" };

describe("lecturas", () => {
  it("listWorkboardMembersAction devuelve sólo los miembros de la organización", async () => {
    const r = await listWorkboardMembersAction();
    expect(r.success && r.data.map((m) => m.id)).toEqual([M1]);
  });

  it("listWorkboardTasksAction devuelve sólo las tareas de la organización", async () => {
    const r = await listWorkboardTasksAction();
    expect(r.success && r.data.map((t) => t.id)).toEqual([T1]);
  });

  it("una tabla que falta se lee como vacía, como antes", async () => {
    sim.errores.workboard_tasks = { message: 'relation "workboard_tasks" does not exist' };
    await expect(listWorkboardTasksAction()).resolves.toEqual({ success: true, data: [] });
    expect(sim.reportes).toEqual([]);
  });

  it("getActiveSprintAction devuelve el sprint activo de la organización, o null", async () => {
    const r = await getActiveSprintAction();
    expect(r.success && r.data?.id).toBe(S1);
    sim.tablas.sprints = [sprint(S_OTRA_ORG, OTRA_ORG)];
    await expect(getActiveSprintAction()).resolves.toEqual({ success: true, data: null });
  });

  it("getSprintsAction devuelve los sprints de la organización con sus tareas", async () => {
    const r = await getSprintsAction();
    expect(r.success && r.data.map((s) => [s.id, s.totalTasks])).toEqual([[S1, 1]]);
  });

  it("getTimeByMemberAction devuelve el reporte de la organización, o null si no hay", async () => {
    const r = await getTimeByMemberAction();
    expect(r.success && r.data?.map((m) => m.memberId)).toEqual([M1]);
    sim.tablas.workboard_time_by_member = [];
    await expect(getTimeByMemberAction()).resolves.toEqual({ success: true, data: null });
  });

  it("loadWorkboardPageDataAction junta tareas, miembros y sprints", async () => {
    const r = await loadWorkboardPageDataAction();
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.tasks.map((t) => t.id)).toEqual([T1]);
    expect(r.data.members.map((m) => m.id)).toEqual([M1]);
    expect(r.data.sprints.map((s) => s.id)).toEqual([S1]);
  });

  it.each([
    ["listWorkboardMembersAction", () => listWorkboardMembersAction()],
    ["listWorkboardTasksAction", () => listWorkboardTasksAction()],
    ["loadWorkboardPageDataAction", () => loadWorkboardPageDataAction()],
    ["getActiveSprintAction", () => getActiveSprintAction()],
    ["getSprintsAction", () => getSprintsAction()],
    ["getTimeByMemberAction", () => getTimeByMemberAction()],
  ] as const)("⭐ %s sin sesión devuelve el motivo y no se reporta", async (_n, correr) => {
    sim.sesion = false;
    await expect(correr()).resolves.toEqual({ success: false, error: "Sesión no válida" });
    expect(sim.reportes).toEqual([]);
    expect(consola).not.toHaveBeenCalled();
  });
});

describe("createWorkboardTaskAction", () => {
  it("crea la tarea en la organización y en el sprint activo, y devuelve la tarea releída", async () => {
    const r = await createWorkboardTaskAction(NUEVA_TAREA);
    expect(r).toEqual({ success: true, data: { id: NUEVA, title: "Llamar a Ana" } });
    const alta = escrituras().find((c) => c.tabla === "workboard_tasks" && c.op === "insert");
    expect(alta?.valores).toMatchObject({ organization_id: ORG, sprint_id: S1, created_by: M1 });
  });

  it("⭐ un dato inválido vuelve con el mensaje de validación, sin escribir", async () => {
    await expect(createWorkboardTaskAction({ ...NUEVA_TAREA, title: "" })).resolves.toEqual({
      success: false,
      error: "Campo requerido",
    });
    expect(escrituras()).toEqual([]);
  });

  it("un sprint, lanzamiento o responsable que ya no existe vuelve con un mensaje claro", async () => {
    sim.errores["workboard_tasks:insert"] = CLAVE_FORANEA;
    await expect(createWorkboardTaskAction({ ...NUEVA_TAREA, launchId: L1 })).resolves.toEqual({
      success: false,
      error:
        "El responsable, el sprint, el lanzamiento o el SOP que elegiste ya no existe. Recargá la página e intentá de nuevo.",
    });
    expect(sim.reportes).toEqual([]);
  });

  it("si falta la tabla devuelve el mensaje que lo explica", async () => {
    sim.errores["workboard_tasks:insert"] = { message: 'relation "workboard_tasks" does not exist' };
    await expect(createWorkboardTaskAction(NUEVA_TAREA)).resolves.toEqual({
      success: false,
      error: "Falta la tabla workboard_tasks en Supabase. Aplicá las migraciones de supabase/migrations.",
    });
  });

  it("si la tarea creada no se puede releer, es inesperado: texto fijo y se reporta", async () => {
    sim.tareaReleida = false;
    await expect(createWorkboardTaskAction(NUEVA_TAREA)).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
    expect(sim.reportes).toEqual([
      {
        error: expect.objectContaining({ name: "FallaDeLaBase", message: "boom al releer" }),
        contexto: { accion: "[createWorkboardTask]" },
      },
    ]);
  });
});

describe("moveWorkboardTaskAction", () => {
  it("mueve la tarea filtrando por el id y la organización", async () => {
    await expect(moveWorkboardTaskAction({ taskId: T1, status: "in_progress" })).resolves.toEqual({
      success: true,
      data: undefined,
    });
    const update = escrituras().find((c) => c.tabla === "workboard_tasks" && c.op === "update");
    expect(update?.filtros).toEqual([
      ["id", T1],
      ["organization_id", ORG],
    ]);
    expect(filaDe("workboard_tasks", T1)?.status).toBe("in_progress");
  });

  it("⭐ un estado inválido vuelve con el mensaje de validación, sin escribir", async () => {
    const r = await moveWorkboardTaskAction({ taskId: "no-es-un-id", status: "in_progress" });
    expect(r).toEqual({ success: false, error: "ID inválido" });
    expect(escrituras()).toEqual([]);
  });

  it("la tarea de otra organización no se toca", async () => {
    await moveWorkboardTaskAction({ taskId: T_OTRA_ORG, status: "done" });
    expect(filaDe("workboard_tasks", T_OTRA_ORG)?.status).toBe("todo");
  });
});

describe("updateWorkboardTaskAction", () => {
  it("guarda el cambio filtrando por la organización y devuelve la tarea", async () => {
    const r = await updateWorkboardTaskAction({ taskId: T1, title: "Nuevo título" });
    expect(r.success && r.data.title).toBe("Nuevo título");
    const update = escrituras().find((c) => c.tabla === "workboard_tasks" && c.op === "update");
    expect(update?.filtros).toContainEqual(["organization_id", ORG]);
  });

  it("⭐ una tarea de otra organización vuelve como no encontrada, sin tocarla", async () => {
    await expect(
      updateWorkboardTaskAction({ taskId: T_OTRA_ORG, title: "Ajeno" })
    ).resolves.toEqual({ success: false, error: TAREA_NO_ENCONTRADA });
    expect(filaDe("workboard_tasks", T_OTRA_ORG)?.title).not.toBe("Ajeno");
    expect(sim.reportes).toEqual([]);
  });

  it("sin cambios vuelve con el mensaje de validación", async () => {
    await expect(updateWorkboardTaskAction({ taskId: T1 })).resolves.toEqual({
      success: false,
      error: "Sin cambios para guardar",
    });
    expect(escrituras()).toEqual([]);
  });

  it("un responsable que ya no existe vuelve con un mensaje claro", async () => {
    sim.errores["workboard_tasks:update"] = CLAVE_FORANEA;
    const r = await updateWorkboardTaskAction({ taskId: T1, assigneeIds: [NO_EXISTE] });
    expect(r).toEqual({
      success: false,
      error:
        "El responsable, el sprint, el lanzamiento o el SOP que elegiste ya no existe. Recargá la página e intentá de nuevo.",
    });
  });
});

describe("deleteWorkboardTaskAction", () => {
  it("borra filtrando por el id y la organización", async () => {
    await expect(deleteWorkboardTaskAction(T1)).resolves.toEqual({ success: true, data: undefined });
    expect(escrituras()).toEqual([
      { tabla: "workboard_tasks", op: "delete", filtros: [["id", T1], ["organization_id", ORG]] },
    ]);
  });

  it("⭐ un id inválido vuelve con el mensaje de validación, sin borrar", async () => {
    await expect(deleteWorkboardTaskAction("x")).resolves.toEqual({
      success: false,
      error: "ID inválido",
    });
    expect(escrituras()).toEqual([]);
  });

  it("la tarea de otra organización no se borra", async () => {
    await deleteWorkboardTaskAction(T_OTRA_ORG);
    expect(filaDe("workboard_tasks", T_OTRA_ORG)).toBeDefined();
  });
});

describe("assignTaskToLaunchAction", () => {
  it("asigna el lanzamiento filtrando por la organización y devuelve la tarea", async () => {
    const r = await assignTaskToLaunchAction(T1, L1);
    expect(r.success && r.data.launchId).toBe(L1);
    const update = escrituras().find((c) => c.op === "update");
    expect(update?.filtros).toEqual([
      ["id", T1],
      ["organization_id", ORG],
    ]);
  });

  it("⭐ un lanzamiento que ya no existe vuelve con un mensaje claro", async () => {
    sim.errores["workboard_tasks:update"] = CLAVE_FORANEA;
    await expect(assignTaskToLaunchAction(T1, NO_EXISTE)).resolves.toEqual({
      success: false,
      error: "El lanzamiento que elegiste ya no existe. Recargá la página e intentá de nuevo.",
    });
    expect(sim.reportes).toEqual([]);
  });

  it("una tarea de otra organización vuelve como no encontrada", async () => {
    await expect(assignTaskToLaunchAction(T_OTRA_ORG, L1)).resolves.toEqual({
      success: false,
      error: TAREA_NO_ENCONTRADA,
    });
    expect(filaDe("workboard_tasks", T_OTRA_ORG)?.launch_id).toBeNull();
  });

  it("un id inválido vuelve con el mensaje de validación", async () => {
    await expect(assignTaskToLaunchAction("x", L1)).resolves.toEqual({
      success: false,
      error: "ID inválido",
    });
  });
});

describe("logTaskTimeAction", () => {
  it("suma el tiempo a la tarea de la organización", async () => {
    await expect(
      logTaskTimeAction({ taskId: T1, actualMinutes: 45, note: "listo" })
    ).resolves.toEqual({ success: true, data: undefined });
    const fila = filaDe("workboard_tasks", T1);
    expect(fila?.actual_minutes).toBe(45);
    expect(fila?.time_entries).toEqual([
      expect.objectContaining({ minutes: 45, note: "listo", logged_by: M1 }),
    ]);
  });

  it("⭐ una tarea de otra organización vuelve como no encontrada, sin escribir", async () => {
    await expect(
      logTaskTimeAction({ taskId: T_OTRA_ORG, actualMinutes: 10 })
    ).resolves.toEqual({ success: false, error: TAREA_NO_ENCONTRADA });
    expect(escrituras()).toEqual([]);
  });

  it("sin perfil devuelve la sesión no válida", async () => {
    sim.perfil = null;
    await expect(logTaskTimeAction({ taskId: T1, actualMinutes: 10 })).resolves.toEqual({
      success: false,
      error: "Sesión no válida",
    });
  });

  it("minutos negativos vuelven con el mensaje de validación", async () => {
    await expect(logTaskTimeAction({ taskId: T1, actualMinutes: -5 })).resolves.toEqual({
      success: false,
      error: "No puede ser negativo",
    });
  });
});

describe("setMemberHourlyRateAction", () => {
  it("guarda el sueldo del miembro filtrando por la organización del perfil", async () => {
    await expect(
      setMemberHourlyRateAction({ memberId: M1, hourlyRate: 20, currency: "USD" })
    ).resolves.toEqual({ success: true, data: undefined });
    expect(escrituras()[0].filtros).toEqual([
      ["id", M1],
      ["organization_id", ORG],
    ]);
    expect(filaDe("profiles", M1)?.hourly_rate).toBe(20);
  });

  it("⭐ sin el rol que puede configurar sueldos vuelve con el motivo, sin escribir", async () => {
    sim.perfil = { ...sim.perfil, role: "viewer" };
    await expect(
      setMemberHourlyRateAction({ memberId: M1, hourlyRate: 20, currency: "USD" })
    ).resolves.toEqual({ success: false, error: "Sin permisos para configurar sueldos" });
    expect(escrituras()).toEqual([]);
    expect(sim.reportes).toEqual([]);
  });

  it("sin perfil devuelve la sesión no válida", async () => {
    sim.perfil = null;
    await expect(
      setMemberHourlyRateAction({ memberId: M1, hourlyRate: 20, currency: "USD" })
    ).resolves.toEqual({ success: false, error: "Sesión no válida" });
  });

  it("un sueldo negativo vuelve con el mensaje de validación", async () => {
    await expect(
      setMemberHourlyRateAction({ memberId: M1, hourlyRate: -1, currency: "USD" })
    ).resolves.toEqual({ success: false, error: "No puede ser negativo" });
  });
});

describe("createSprintAction", () => {
  const NUEVO_SPRINT = { name: "Sprint 4", startDate: "2026-10-08", endDate: "2026-10-22" };

  it("⭐ crea el sprint con la función atómica de la base, en la organización de la sesión", async () => {
    const r = await createSprintAction(NUEVO_SPRINT);
    expect(r.success && r.data).toMatchObject({ id: NUEVA, name: "Sprint 4", status: "active" });
    // Una sola llamada: completar el activo y crear el nuevo no son dos escrituras.
    expect(escrituras()).toEqual([
      {
        tabla: "rpc:crear_sprint",
        op: "rpc",
        valores: {
          p_organization_id: ORG,
          p_name: "Sprint 4",
          p_goal: null,
          p_area_focus: null,
          p_start_date: "2026-10-08",
          p_end_date: "2026-10-22",
          p_created_by: M1,
        },
        filtros: [],
      },
    ]);
    expect(filaDe("sprints", S1)?.status).toBe("completed");
    expect(filaDe("sprints", S_OTRA_ORG)?.status).toBe("active");
  });

  it("⭐ si la función falla no queda nada a medias: texto fijo y se reporta", async () => {
    sim.errores["rpc:crear_sprint"] = { message: "TypeError: fetch failed" };
    await expect(createSprintAction(NUEVO_SPRINT)).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
    expect(filaDe("sprints", S1)?.status).toBe("active");
    expect(sim.reportes).toEqual([
      {
        error: expect.objectContaining({ name: "FallaDeLaBase" }),
        contexto: { accion: "[createSprint]" },
      },
    ]);
  });

  it("si la función no existe (migración sin aplicar) es una falla de despliegue: texto fijo y Sentry", async () => {
    sim.errores["rpc:crear_sprint"] = {
      code: "PGRST202",
      message: "Could not find the function public.crear_sprint(...) in the schema cache",
    };
    await expect(createSprintAction(NUEVO_SPRINT)).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
    expect(sim.reportes).toHaveLength(1);
  });

  it("⭐ sin nombre vuelve con el mensaje de validación, sin escribir", async () => {
    await expect(createSprintAction({ ...NUEVO_SPRINT, name: "" })).resolves.toEqual({
      success: false,
      error: "Campo requerido",
    });
    expect(escrituras()).toEqual([]);
  });

  it("una fecha inválida vuelve con el mensaje de validación", async () => {
    await expect(createSprintAction({ ...NUEVO_SPRINT, endDate: "mañana" })).resolves.toEqual({
      success: false,
      error: "Fecha inválida",
    });
  });
});

describe("updateSprintAction", () => {
  it("actualiza el sprint filtrando por el id y la organización", async () => {
    await expect(updateSprintAction(S1, { name: "Renombrado" })).resolves.toEqual({
      success: true,
      data: undefined,
    });
    expect(filaDe("sprints", S1)?.name).toBe("Renombrado");
    expect(escrituras()[0].filtros).toEqual([
      ["id", S1],
      ["organization_id", ORG],
    ]);
  });

  it("⭐ sin cambios vuelve con el mensaje de validación, sin escribir", async () => {
    await expect(updateSprintAction(S1, {})).resolves.toEqual({
      success: false,
      error: "Sin cambios para guardar",
    });
    expect(escrituras()).toEqual([]);
  });

  it("un id inválido vuelve con el mensaje de validación", async () => {
    await expect(updateSprintAction("x", { name: "a" })).resolves.toEqual({
      success: false,
      error: "ID inválido",
    });
  });

  it("⭐ activar un sprint con otro activo (índice único) vuelve con el motivo", async () => {
    sim.errores["sprints:update"] = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "sprints_un_activo_por_org"',
    };
    await expect(updateSprintAction(S1, { status: "active" })).resolves.toEqual({
      success: false,
      error: "Ya hay un sprint activo. Completalo antes de activar otro.",
    });
    expect(sim.reportes).toEqual([]);
  });

  it("el sprint de otra organización no se toca", async () => {
    await updateSprintAction(S_OTRA_ORG, { name: "Ajeno" });
    expect(filaDe("sprints", S_OTRA_ORG)?.name).not.toBe("Ajeno");
  });
});

describe("assignTaskToSprintAction", () => {
  it("asigna el sprint filtrando por la organización y devuelve la tarea", async () => {
    const r = await assignTaskToSprintAction(T1, null);
    expect(r.success && r.data.sprintId).toBeUndefined();
    const update = escrituras().find((c) => c.tabla === "workboard_tasks" && c.op === "update");
    expect(update?.filtros).toEqual([
      ["id", T1],
      ["organization_id", ORG],
    ]);
  });

  it("⭐ un sprint que ya no existe vuelve con un mensaje claro", async () => {
    sim.errores["workboard_tasks:update"] = CLAVE_FORANEA;
    await expect(assignTaskToSprintAction(T1, NO_EXISTE)).resolves.toEqual({
      success: false,
      error: "El sprint que elegiste ya no existe. Recargá la página e intentá de nuevo.",
    });
  });

  it("una tarea de otra organización vuelve como no encontrada", async () => {
    await expect(assignTaskToSprintAction(T_OTRA_ORG, S1)).resolves.toEqual({
      success: false,
      error: TAREA_NO_ENCONTRADA,
    });
  });

  it("un id inválido vuelve con el mensaje de validación", async () => {
    await expect(assignTaskToSprintAction("x", S1)).resolves.toEqual({
      success: false,
      error: "ID inválido",
    });
  });
});

describe("updateSprintCompletionAction", () => {
  it("recalcula el avance del sprint de la organización", async () => {
    filaDe("workboard_tasks", T1)!.status = "done";
    await expect(updateSprintCompletionAction(S1)).resolves.toEqual({
      success: true,
      data: undefined,
    });
    expect(filaDe("sprints", S1)?.completion_rate).toBe(100);
    expect(escrituras()[0].filtros).toEqual([
      ["id", S1],
      ["organization_id", ORG],
    ]);
  });

  it("⭐ un id inválido vuelve con el mensaje de validación", async () => {
    await expect(updateSprintCompletionAction("x")).resolves.toEqual({
      success: false,
      error: "ID inválido",
    });
  });

  it("sin sesión devuelve el motivo", async () => {
    sim.sesion = false;
    await expect(updateSprintCompletionAction(S1)).resolves.toEqual({
      success: false,
      error: "Sesión no válida",
    });
  });
});

describe("mutaciones sin sesión", () => {
  it.each([
    ["createWorkboardTaskAction", () => createWorkboardTaskAction(NUEVA_TAREA)],
    ["moveWorkboardTaskAction", () => moveWorkboardTaskAction({ taskId: T1, status: "done" })],
    ["updateWorkboardTaskAction", () => updateWorkboardTaskAction({ taskId: T1, title: "a" })],
    ["deleteWorkboardTaskAction", () => deleteWorkboardTaskAction(T1)],
    ["assignTaskToLaunchAction", () => assignTaskToLaunchAction(T1, L1)],
    ["logTaskTimeAction", () => logTaskTimeAction({ taskId: T1, actualMinutes: 5 })],
    ["createSprintAction", () => createSprintAction({ name: "a", startDate: "2026-10-01", endDate: "2026-10-02" })],
    ["updateSprintAction", () => updateSprintAction(S1, { name: "a" })],
    ["assignTaskToSprintAction", () => assignTaskToSprintAction(T1, S1)],
  ] as const)("%s devuelve el motivo, sin escribir ni reportar", async (_n, correr) => {
    sim.sesion = false;
    await expect(correr()).resolves.toEqual({ success: false, error: "Sesión no válida" });
    expect(escrituras()).toEqual([]);
    expect(sim.reportes).toEqual([]);
  });
});

/*
 * Lo inesperado, para cada una de las 17 acciones: una excepción de la red
 * lanzada y el mismo error devuelto como valor por supabase-js. El usuario ve
 * el texto fijo, nunca el mensaje crudo; queda en la consola y en Sentry con
 * la etiqueta de la acción.
 */
const ACCIONES: ReadonlyArray<
  readonly [string, () => Promise<{ success: boolean }>, string, string]
> = [
  ["listWorkboardMembersAction", () => listWorkboardMembersAction(), "[listWorkboardMembers]", "profiles"],
  ["listWorkboardTasksAction", () => listWorkboardTasksAction(), "[listWorkboardTasks]", "workboard_tasks"],
  ["loadWorkboardPageDataAction", () => loadWorkboardPageDataAction(), "[loadWorkboardPageData]", "sprints"],
  ["createWorkboardTaskAction", () => createWorkboardTaskAction(NUEVA_TAREA), "[createWorkboardTask]", "workboard_tasks:insert"],
  ["moveWorkboardTaskAction", () => moveWorkboardTaskAction({ taskId: T1, status: "done" }), "[moveWorkboardTask]", "workboard_tasks:update"],
  ["updateWorkboardTaskAction", () => updateWorkboardTaskAction({ taskId: T1, title: "a" }), "[updateWorkboardTask]", "workboard_tasks:update"],
  ["deleteWorkboardTaskAction", () => deleteWorkboardTaskAction(T1), "[deleteWorkboardTask]", "workboard_tasks:delete"],
  ["assignTaskToLaunchAction", () => assignTaskToLaunchAction(T1, L1), "[assignTaskToLaunch]", "workboard_tasks:update"],
  ["logTaskTimeAction", () => logTaskTimeAction({ taskId: T1, actualMinutes: 5 }), "[logTaskTime]", "workboard_tasks"],
  ["getTimeByMemberAction", () => getTimeByMemberAction(), "[getTimeByMember]", "workboard_time_by_member"],
  ["setMemberHourlyRateAction", () => setMemberHourlyRateAction({ memberId: M1, hourlyRate: 1, currency: "USD" }), "[setMemberHourlyRate]", "profiles:update"],
  ["getActiveSprintAction", () => getActiveSprintAction(), "[getActiveSprint]", "sprints"],
  ["getSprintsAction", () => getSprintsAction(), "[getSprints]", "sprints"],
  ["createSprintAction", () => createSprintAction({ name: "a", startDate: "2026-10-01", endDate: "2026-10-02" }), "[createSprint]", "rpc:crear_sprint"],
  ["updateSprintAction", () => updateSprintAction(S1, { name: "a" }), "[updateSprint]", "sprints:update"],
  ["assignTaskToSprintAction", () => assignTaskToSprintAction(T1, S1), "[assignTaskToSprint]", "workboard_tasks:update"],
  ["updateSprintCompletionAction", () => updateSprintCompletionAction(S1), "[updateSprintCompletion]", "sprints:update"],
];

describe("lo inesperado (SCRUM-503)", () => {
  it.each(ACCIONES)(
    "⭐ %s: una excepción de la red devuelve el texto fijo, nunca el mensaje crudo, y se registra y reporta",
    async (_n, correr, etiqueta) => {
      const falla = new TypeError("fetch failed");
      sim.lanza = falla;
      const r = await correr();
      expect(r).toEqual({ success: false, error: TEXTO_FIJO });
      expect(consola).toHaveBeenCalledWith(etiqueta, falla);
      expect(sim.reportes).toEqual([{ error: falla, contexto: { accion: etiqueta } }]);
    }
  );

  it.each(ACCIONES)(
    "⭐ %s: el error de la red que supabase-js devuelve como valor tampoco llega crudo",
    async (_n, correr, etiqueta, tabla) => {
      sim.errores[tabla] = { message: "TypeError: fetch failed" };
      const r = await correr();
      expect(r).toEqual({ success: false, error: TEXTO_FIJO });
      expect(JSON.stringify(r)).not.toContain("fetch failed");
      expect(consola).toHaveBeenCalledWith(
        etiqueta,
        expect.objectContaining({ name: "FallaDeLaBase", message: "TypeError: fetch failed" })
      );
      expect(sim.reportes).toEqual([
        {
          error: expect.objectContaining({ message: "TypeError: fetch failed" }),
          contexto: { accion: etiqueta },
        },
      ]);
    }
  );

  it("una RLS que rechaza vuelve con el texto fijo y se reporta", async () => {
    sim.errores["workboard_tasks:update"] = {
      message: 'new row violates row-level security policy for table "workboard_tasks"',
      code: "42501",
    };
    await expect(updateWorkboardTaskAction({ taskId: T1, title: "a" })).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
    expect(sim.reportes).toHaveLength(1);
  });

  it("los rechazos esperables no se reportan ni se registran", async () => {
    await createWorkboardTaskAction({ ...NUEVA_TAREA, title: "" });
    await updateWorkboardTaskAction({ taskId: T_OTRA_ORG, title: "a" });
    await logTaskTimeAction({ taskId: T_OTRA_ORG, actualMinutes: 5 });
    sim.perfil = { ...sim.perfil, role: "viewer" };
    await setMemberHourlyRateAction({ memberId: M1, hourlyRate: 1, currency: "USD" });
    sim.sesion = false;
    await getSprintsAction();
    expect(sim.reportes).toEqual([]);
    expect(consola).not.toHaveBeenCalled();
  });
});
