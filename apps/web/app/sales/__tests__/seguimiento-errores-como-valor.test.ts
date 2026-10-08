import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-504: las acciones del seguimiento de leads (`lead-actions.ts`) y del
 * catálogo de valores (`follow-up-options-actions.ts`) devuelven sus errores
 * como valor (`MutationResult`). Antes, sin sesión lanzaban (en producción el
 * cliente sólo ve un digest) y un error de la base llegaba crudo al usuario o,
 * en la tabla, se mostraba como "no hay leads".
 */

const ERROR_INESPERADO = "Ocurrió un error inesperado. Intentá de nuevo.";

type Fila = Record<string, unknown>;
type ErrorDeLaBase = { message: string; code?: string } | null;
type Operacion = { tabla: string; op: string; valores?: unknown; filtros: Array<[string, unknown]> };

const sim = vi.hoisted(() => ({
  reportes: [] as Array<{ error: unknown; contexto: unknown }>,
  sesion: true,
  tablas: {} as Record<string, Fila[]>,
  errores: {} as Record<string, ErrorDeLaBase>,
  // Error sólo para una operación: "tabla:op".
  erroresPorOp: {} as Record<string, ErrorDeLaBase>,
  lanza: null as unknown,
  operaciones: [] as Operacion[],
}));

vi.mock("@/lib/observability/reportar-falla", () => ({
  reportarFalla: (error: unknown, contexto: unknown) => sim.reportes.push({ error, contexto }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/bootstrap", async () => {
  const { ErrorEsperable } = await import("@/lib/server/error-esperable");
  return {
    requireOrganizationId: async () => {
      if (!sim.sesion) throw new ErrorEsperable("Sesión no válida");
      return "org-1";
    },
  };
});
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from(tabla: string) {
      if (sim.lanza) throw sim.lanza;
      const operacion: Operacion = { tabla, op: "select", filtros: [] };
      const ejecutar = () => {
        sim.operaciones.push(operacion);
        const error = sim.errores[tabla] ?? sim.erroresPorOp[`${tabla}:${operacion.op}`] ?? null;
        if (error) return { data: null, error };
        const filas = sim.tablas[tabla] ?? [];
        const coincidentes = filas.filter((f) => operacion.filtros.every(([c, v]) => f[c] === v));
        if (operacion.op === "update") coincidentes.forEach((f) => Object.assign(f, operacion.valores));
        if (operacion.op === "insert") {
          const nueva = { id: "nueva", archived_at: null, ...(operacion.valores as Fila) };
          filas.push(nueva);
          return { data: [nueva], error: null };
        }
        return { data: coincidentes, error: null };
      };
      const builder = {
        select: () => builder,
        order: () => builder,
        limit: () => builder,
        range: () => builder,
        insert(valores: unknown) {
          operacion.op = "insert";
          operacion.valores = valores;
          return builder;
        },
        update(valores: unknown) {
          operacion.op = "update";
          operacion.valores = valores;
          return builder;
        },
        eq(columna: string, valor: unknown) {
          operacion.filtros.push([columna, valor]);
          return builder;
        },
        maybeSingle: async () => {
          const { data, error } = ejecutar();
          return { data: data?.[0] ?? null, error };
        },
        single: async () => {
          const { data, error } = ejecutar();
          return { data: data?.[0] ?? null, error };
        },
        then(resolver: (r: unknown) => void) {
          resolver(ejecutar());
        },
      };
      return builder;
    },
  }),
}));

import {
  getLeadThreadAction,
  linkLeadToClientAction,
  listLeadsTableAction,
  saveCallFollowUpAction,
  setLeadQualificationAction,
  setNextActionAction,
  setNextActionNotesAction,
  setNextActionOwnerAction,
} from "../lead-actions";
import {
  createFollowUpOptionAction,
  getFollowUpCatalogAction,
  setFollowUpOptionArchivedAction,
  updateFollowUpOptionAction,
} from "../follow-up-options-actions";

function turno(id: string, org: string): Fila {
  return {
    id,
    organization_id: org,
    lead_id: `lead-${id}`,
    scheduled_at: "2026-10-01T15:00:00Z",
    status: "not_closed",
    next_action: null,
    next_action_at: null,
    next_action_owner_id: null,
    next_action_notes: null,
    pre_call_qualification: null,
    post_call_qualification: null,
  };
}

let consola: ReturnType<typeof vi.spyOn>;
let avisoDeConsola: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  sim.reportes = [];
  sim.sesion = true;
  sim.lanza = null;
  sim.errores = {};
  sim.erroresPorOp = {};
  sim.operaciones = [];
  sim.tablas = {
    closing_calls: [turno("c1", "org-1"), turno("c-ajena", "org-2")],
    sales_leads: [
      { id: "lead-c1", organization_id: "org-1", name: "Ana", email: "ana@ejemplo.com", phone: null, client_id: null, closing_calls: [turno("c1", "org-1")] },
      { id: "lead-ajeno", organization_id: "org-2", name: "Ajeno", email: null, phone: null, client_id: null, closing_calls: [turno("c-ajena", "org-2")] },
    ],
    sales_follow_up_options: [
      { id: "o1", organization_id: "org-1", kind: "next_action", slug: "propio", label: "Propio", color: "slate", behavior: "needs_date", sort_order: 0, archived_at: null },
      { id: "o-ajena", organization_id: "org-2", kind: "next_action", slug: "ajeno", label: "Ajeno", color: "slate", behavior: "needs_date", sort_order: 0, archived_at: null },
    ],
    organizations: [{ id: "org-1", timezone: "America/Argentina/Buenos_Aires" }],
  };
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
  avisoDeConsola = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  consola.mockRestore();
  avisoDeConsola.mockRestore();
});

/**
 * Por acción: sin sesión el motivo como valor y sin reporte; una excepción y
 * un error de la base que supabase-js devuelve como valor vuelven con el texto
 * fijo, se registran en la consola y van a Sentry con la etiqueta.
 */
const casos: Array<{
  nombre: string;
  etiqueta: string;
  tabla: string;
  llamar: () => Promise<{ success: boolean }>;
}> = [
  { nombre: "listLeadsTableAction", etiqueta: "[listLeadsTable]", tabla: "sales_leads", llamar: () => listLeadsTableAction() },
  { nombre: "getLeadThreadAction", etiqueta: "[getLeadThread]", tabla: "sales_leads", llamar: () => getLeadThreadAction("lead-c1") },
  { nombre: "setNextActionAction", etiqueta: "[setNextAction]", tabla: "closing_calls", llamar: () => setNextActionAction({ callId: "c1", nextAction: null }) },
  { nombre: "saveCallFollowUpAction", etiqueta: "[saveCallFollowUp]", tabla: "closing_calls", llamar: () => saveCallFollowUpAction({ callId: "c1", nextAction: null }) },
  { nombre: "setNextActionOwnerAction", etiqueta: "[setNextActionOwner]", tabla: "closing_calls", llamar: () => setNextActionOwnerAction({ callId: "c1", ownerId: "u1" }) },
  { nombre: "setNextActionNotesAction", etiqueta: "[setNextActionNotes]", tabla: "closing_calls", llamar: () => setNextActionNotesAction({ callId: "c1", notes: "x" }) },
  { nombre: "setLeadQualificationAction", etiqueta: "[setLeadQualification]", tabla: "closing_calls", llamar: () => setLeadQualificationAction({ callId: "c1", moment: "post", qualification: null }) },
  { nombre: "linkLeadToClientAction", etiqueta: "[linkLeadToClient]", tabla: "closing_calls", llamar: () => linkLeadToClientAction({ callId: "c1", clientId: "cli-1" }) },
  { nombre: "createFollowUpOptionAction", etiqueta: "[createFollowUpOption]", tabla: "sales_follow_up_options", llamar: () => createFollowUpOptionAction({ kind: "next_action", label: "Nuevo" }) },
  { nombre: "updateFollowUpOptionAction", etiqueta: "[updateFollowUpOption]", tabla: "sales_follow_up_options", llamar: () => updateFollowUpOptionAction({ id: "o1", label: "Otro" }) },
  { nombre: "setFollowUpOptionArchivedAction", etiqueta: "[setFollowUpOptionArchived]", tabla: "sales_follow_up_options", llamar: () => setFollowUpOptionArchivedAction({ id: "o1", archived: true }) },
];

describe.each(casos)("$nombre", ({ etiqueta, tabla, llamar }) => {
  it("⭐ sin sesión devuelve el motivo como valor y no lo reporta", async () => {
    sim.sesion = false;
    await expect(llamar()).resolves.toEqual({ success: false, error: "Sesión no válida" });
    expect(sim.reportes).toEqual([]);
    expect(consola).not.toHaveBeenCalled();
  });

  it("⭐ una excepción de la red vuelve con el texto fijo, a la consola y a Sentry", async () => {
    sim.lanza = new TypeError("fetch failed");
    await expect(llamar()).resolves.toEqual({ success: false, error: ERROR_INESPERADO });
    expect(consola).toHaveBeenCalledWith(etiqueta, sim.lanza);
    expect(sim.reportes).toEqual([{ error: sim.lanza, contexto: { accion: etiqueta } }]);
  });

  it("⭐ un error de la red que supabase-js devuelve como valor no llega crudo", async () => {
    sim.errores[tabla] = { message: "TypeError: fetch failed" };
    const r = await llamar();
    expect(r).toEqual({ success: false, error: ERROR_INESPERADO });
    const detalle = expect.objectContaining({ name: "FallaDeLaBase", message: "TypeError: fetch failed" });
    expect(consola).toHaveBeenCalledWith(etiqueta, detalle);
    expect(sim.reportes).toEqual([{ error: detalle, contexto: { accion: etiqueta } }]);
  });
});

describe("lecturas del seguimiento", () => {
  it("la tabla trae los leads de la organización de la sesión, y no los de otra", async () => {
    const r = await listLeadsTableAction({ scope: "all" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.rows.map((row) => row.leadId)).toEqual(["lead-c1"]);
    expect(r.data.catalog.nextActions.some((o) => o.slug === "propio")).toBe(true);
    expect(r.data.catalog.nextActions.some((o) => o.slug === "ajeno")).toBe(false);
  });

  it("el hilo de un lead de otra organización no existe", async () => {
    await expect(getLeadThreadAction("lead-ajeno")).resolves.toEqual({ success: true, data: null });
  });

  it("el catálogo es el de la organización; si su lectura falla, el de fábrica, como antes", async () => {
    const r = await getFollowUpCatalogAction();
    expect(r.success && r.data.nextActions.some((o) => o.slug === "propio")).toBe(true);
    sim.errores.sales_follow_up_options = { message: "permission denied" };
    const deFabrica = await getFollowUpCatalogAction();
    expect(deFabrica.success && deFabrica.data.nextActions.some((o) => o.slug === "propio")).toBe(false);
    // ⭐ La falla no se pierde: queda en la consola y en Sentry (AR, MAYOR-1).
    const detalle = expect.objectContaining({ name: "FallaDeLaBase", message: "permission denied" });
    expect(consola).toHaveBeenCalledWith("[getFollowUpCatalog]", detalle);
    expect(sim.reportes).toEqual([{ error: detalle, contexto: { accion: "[getFollowUpCatalog]" } }]);
  });

  it("⭐ la tabla con el catálogo caído usa el de fábrica y reporta la falla", async () => {
    sim.errores.sales_follow_up_options = { message: "TypeError: fetch failed" };
    const r = await listLeadsTableAction({ scope: "all" });
    expect(r.success && r.data.rows.map((row) => row.leadId)).toEqual(["lead-c1"]);
    expect(sim.reportes).toEqual([
      {
        error: expect.objectContaining({ name: "FallaDeLaBase" }),
        contexto: { accion: "[listLeadsTable] catálogo" },
      },
    ]);
  });

  it("⭐ el hilo con el catálogo caído usa el de fábrica y reporta la falla", async () => {
    sim.errores.sales_follow_up_options = { message: "TypeError: fetch failed" };
    const r = await getLeadThreadAction("lead-c1");
    expect(r.success && r.data?.leadId).toBe("lead-c1");
    expect(sim.reportes).toHaveLength(1);
  });

  it("el catálogo sin sesión devuelve el motivo", async () => {
    sim.sesion = false;
    await expect(getFollowUpCatalogAction()).resolves.toEqual({ success: false, error: "Sesión no válida" });
  });
});

describe("mutaciones del seguimiento", () => {
  it("guarda el próximo paso en el turno de la organización de la sesión", async () => {
    await expect(
      setNextActionAction({ callId: "c1", nextAction: "propio", nextActionAt: "2026-10-10T15:00:00Z" })
    ).resolves.toEqual({ success: true, data: undefined });
    expect(sim.tablas.closing_calls[0].next_action).toBe("propio");
    const escritura = sim.operaciones.find((o) => o.tabla === "closing_calls" && o.op === "update");
    expect(escritura?.filtros).toEqual([
      ["id", "c1"],
      ["organization_id", "org-1"],
    ]);
  });

  it("un turno de otra organización no se toca", async () => {
    await setNextActionOwnerAction({ callId: "c-ajena", ownerId: "u1" });
    expect(sim.tablas.closing_calls[1].next_action_owner_id).toBeNull();
  });

  it.each([
    [{ callId: "c1", nextAction: "no-existe" }, "Ese próximo paso no existe en el catálogo."],
    [{ callId: "c1", nextAction: "propio" }, "El próximo paso necesita una fecha."],
  ])("⭐ setNextAction con un valor inválido devuelve el motivo", async (params, motivo) => {
    await expect(setNextActionAction(params)).resolves.toEqual({ success: false, error: motivo });
    expect(sim.reportes).toEqual([]);
  });

  it("⭐ saveCallFollowUp con una calificación inexistente devuelve el motivo", async () => {
    await expect(
      saveCallFollowUpAction({ callId: "c1", qualification: "no-existe" })
    ).resolves.toEqual({ success: false, error: "Esa calificación no existe en el catálogo." });
  });

  it("⭐ setLeadQualification con una calificación inexistente devuelve el motivo", async () => {
    await expect(
      setLeadQualificationAction({ callId: "c1", moment: "pre", qualification: "no-existe" })
    ).resolves.toEqual({ success: false, error: "Esa calificación no existe en el catálogo." });
  });

  it("vincular un turno sin lead no es un error", async () => {
    sim.tablas.closing_calls[0].lead_id = null;
    await expect(linkLeadToClientAction({ callId: "c1", clientId: "cli-1" })).resolves.toEqual({
      success: true,
      data: undefined,
    });
  });

  it("vincula el lead del turno con el cliente", async () => {
    await linkLeadToClientAction({ callId: "c1", clientId: "cli-1" });
    expect(sim.tablas.sales_leads[0].client_id).toBe("cli-1");
    expect(sim.tablas.sales_leads[1].client_id).toBeNull();
  });
});

describe("escrituras con el catálogo caído (AR, MAYOR-1)", () => {
  // Antes caían en el catálogo de fábrica y rechazaban un valor propio válido
  // con "no existe en el catálogo", sin registrar nada.
  it.each([
    ["setNextActionAction", "[setNextAction]", () => setNextActionAction({ callId: "c1", nextAction: "propio", nextActionAt: "2026-10-10T15:00:00Z" })],
    ["saveCallFollowUpAction", "[saveCallFollowUp]", () => saveCallFollowUpAction({ callId: "c1", nextAction: "propio", nextActionAt: "2026-10-10T15:00:00Z" })],
    ["setLeadQualificationAction", "[setLeadQualification]", () => setLeadQualificationAction({ callId: "c1", moment: "post", qualification: "propio" })],
  ])("⭐ %s devuelve el texto fijo y reporta, no un rechazo falso", async (_nombre, etiqueta, llamar) => {
    sim.errores.sales_follow_up_options = { message: "TypeError: fetch failed" };
    await expect(llamar()).resolves.toEqual({ success: false, error: ERROR_INESPERADO });
    const detalle = expect.objectContaining({ name: "FallaDeLaBase", message: "TypeError: fetch failed" });
    expect(consola).toHaveBeenCalledWith(etiqueta, detalle);
    expect(sim.reportes).toEqual([{ error: detalle, contexto: { accion: etiqueta } }]);
    expect(sim.tablas.closing_calls[0].next_action).toBeNull();
  });
});

describe("catálogo de valores", () => {
  it("crea un valor propio en la organización de la sesión", async () => {
    const r = await createFollowUpOptionAction({ kind: "next_action", label: "Llamar el lunes" });
    expect(r.success && r.data.slug).toBeTruthy();
    const alta = sim.operaciones.find((o) => o.op === "insert");
    expect((alta?.valores as Fila).organization_id).toBe("org-1");
  });

  it.each([
    [{ kind: "next_action" as const, label: "  " }, "El valor necesita un nombre."],
    [{ kind: "next_action" as const, label: "x".repeat(61) }, "El nombre no puede pasar de 60 caracteres."],
    [{ kind: "next_action" as const, label: "Nuevo", behavior: "neutral" as const }, "Un próximo paso tiene que pedir fecha o cerrar el hilo."],
  ])("⭐ crear con datos inválidos devuelve el motivo", async (params, motivo) => {
    await expect(createFollowUpOptionAction(params)).resolves.toEqual({ success: false, error: motivo });
  });

  it("⭐ un nombre repetido en la base (23505) devuelve el motivo y no se reporta", async () => {
    sim.erroresPorOp["sales_follow_up_options:insert"] = {
      message: "duplicate key value violates unique constraint",
      code: "23505",
    };
    await expect(
      createFollowUpOptionAction({ kind: "next_action", label: "Nuevo" })
    ).resolves.toEqual({ success: false, error: "Ya existe un valor con ese nombre." });
    expect(sim.reportes).toEqual([]);
  });

  it("⭐ renombrar sin nombre devuelve el motivo", async () => {
    await expect(updateFollowUpOptionAction({ id: "o1", label: " " })).resolves.toEqual({
      success: false,
      error: "El valor necesita un nombre.",
    });
  });

  it("archivar sólo toca valores de la organización de la sesión", async () => {
    await setFollowUpOptionArchivedAction({ id: "o-ajena", archived: true });
    expect(sim.tablas.sales_follow_up_options[1].archived_at).toBeNull();
    await setFollowUpOptionArchivedAction({ id: "o1", archived: true });
    expect(sim.tablas.sales_follow_up_options[0].archived_at).not.toBeNull();
  });
});
