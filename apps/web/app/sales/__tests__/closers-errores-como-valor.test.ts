import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-504: las mutaciones de closers (comisión, sync manual de Calendly y
 * desconectar Calendly) devuelven sus errores esperables como valor
 * (`MutationResult`). En producción Next no le manda al cliente el mensaje de
 * un error lanzado por una server action; y la sync de Calendly, con el token
 * vencido, avisaba "Sync completado: 0 nuevas" en verde. La sync corre con el
 * módulo real de `lib/calendly/closer-sync.ts`; lo que se simula es la API de
 * Calendly (`fetch`) y la base.
 */

const ERROR_INESPERADO = "Ocurrió un error inesperado. Intentá de nuevo.";
const SIN_INTEGRACION = "No se encontró integración Calendly para este closer";

type Fila = Record<string, unknown>;
type ErrorDeLaBase = { message: string; code?: string } | null;
type Operacion = { cliente: string; tabla: string; op: string; valores?: unknown; filtros: Array<[string, unknown]> };

const sim = vi.hoisted(() => ({
  reportes: [] as Array<{ error: unknown; contexto: unknown }>,
  sesion: true,
  perfil: { id: "yo", organization_id: "org-1" } as { id: string; organization_id: string } | null,
  tablas: {} as Record<string, Fila[]>,
  errores: {} as Record<string, ErrorDeLaBase>,
  // Si está, `from()` lanza: como un bug o una excepción de la red.
  lanza: null as unknown,
  operaciones: [] as Operacion[],
}));

vi.mock("@/lib/observability/reportar-falla", () => ({
  reportarFalla: (error: unknown, contexto: unknown) => sim.reportes.push({ error, contexto }),
}));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
// Como el real: la sesión que falta es un rechazo esperable.
vi.mock("@/lib/auth/bootstrap", async () => {
  const { ErrorEsperable } = await import("@/lib/server/error-esperable");
  return {
    requireOrganizationId: async () => {
      if (!sim.sesion) throw new ErrorEsperable("Sesión no válida");
      return "org-1";
    },
    getCurrentProfile: async () => (sim.sesion ? sim.perfil : null),
  };
});
vi.mock("@/lib/conversations/repair-links", () => ({
  repairClosingConversationLinks: async () => undefined,
}));
vi.mock("@/lib/utm/attribute-booking", () => ({ attributeBookingToUTM: async () => undefined }));

/**
 * Un cliente de Supabase en memoria: aplica los `.eq`, así que una acción que
 * deja de filtrar por organización toca o lee la fila de otra org y el test lo
 * ve. Anota cada operación.
 */
function clienteFalso(cliente: string) {
  return {
    from(tabla: string) {
      if (sim.lanza) throw sim.lanza;
      const operacion: Operacion = { cliente, tabla, op: "select", filtros: [] };
      const enLista: Array<[string, unknown[]]> = [];
      const ejecutar = () => {
        sim.operaciones.push(operacion);
        const error = sim.errores[tabla] ?? null;
        if (error) return { data: null, error };
        const filas = sim.tablas[tabla] ?? [];
        const coincidentes = filas.filter(
          (f) =>
            operacion.filtros.every(([c, v]) => f[c] === v) &&
            enLista.every(([c, vs]) => vs.includes(f[c]))
        );
        if (operacion.op === "update") coincidentes.forEach((f) => Object.assign(f, operacion.valores));
        if (operacion.op === "delete") sim.tablas[tabla] = filas.filter((f) => !coincidentes.includes(f));
        return { data: coincidentes, error: null };
      };
      const builder = {
        select: () => builder,
        ilike: () => builder,
        gte: () => builder,
        order: () => builder,
        limit: () => builder,
        in(columna: string, valores: unknown[]) {
          enLista.push([columna, valores]);
          return builder;
        },
        update(valores: unknown) {
          operacion.op = "update";
          operacion.valores = valores;
          return builder;
        },
        delete() {
          operacion.op = "delete";
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
        then(resolver: (r: unknown) => void) {
          resolver(ejecutar());
        },
      };
      return builder;
    },
  };
}
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => clienteFalso("usuario") }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => clienteFalso("admin") }));

import {
  disconnectMyCalendlyAction,
  getCloserCallsAction,
  getCloserMetricsAction,
  getClosersWithCalendlyStatusAction,
  syncCloserCalendlyAction,
  updateCloserCommissionAction,
} from "../closer-actions";

const EN_UN_ANIO = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
const AYER = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

function integracion(userId: string, org: string, config: Fila | null): Fila {
  return { user_id: userId, organization_id: org, integration_type: "calendly", config, last_sync_at: null };
}

function configCalendly(extra: Fila = {}): Fila {
  return {
    access_token: "token-vigente",
    refresh_token: "refresh",
    token_expires_at: EN_UN_ANIO,
    calendly_user_uri: "https://api.calendly.com/users/yo",
    ...extra,
  };
}

/** Respuestas simuladas de Calendly, por URL. */
let calendly: (url: string) => { status: number; json: unknown };
const fetchFalso = vi.fn(async (url: string) => {
  const { status, json } = calendly(url);
  return { ok: status >= 200 && status < 300, status, json: async () => json };
});

let consola: ReturnType<typeof vi.spyOn>;
let aviso: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  sim.reportes = [];
  sim.sesion = true;
  sim.perfil = { id: "yo", organization_id: "org-1" };
  sim.lanza = null;
  sim.errores = {};
  sim.operaciones = [];
  sim.tablas = {
    profiles: [
      { id: "closer-1", organization_id: "org-1", commission_pct: 10, custom_role_id: "rol-closer", full_name: "Closer Uno" },
      { id: "closer-ajeno", organization_id: "org-2", commission_pct: 10, custom_role_id: "rol-ajeno", full_name: "Ajeno" },
    ],
    team_roles: [
      { id: "rol-closer", organization_id: "org-1", name: "Closer" },
      { id: "rol-ajeno", organization_id: "org-2", name: "Closer" },
    ],
    closing_calls: [
      { organization_id: "org-1", closer_id: "closer-1", status: "closed", amount_closed: 1000, id: "c1" },
      { organization_id: "org-2", closer_id: "closer-ajeno", status: "closed", amount_closed: 5000, id: "c-ajena" },
    ],
    call_analyses: [{ organization_id: "org-1", closer_id: "closer-1", overall_score: 80 }],
    team_member_integrations: [
      integracion("yo", "org-1", configCalendly()),
      integracion("closer-1", "org-1", configCalendly({ calendly_user_uri: "https://api.calendly.com/users/c1" })),
      integracion("closer-ajeno", "org-2", configCalendly()),
    ],
  };
  calendly = () => ({ status: 200, json: { collection: [], pagination: { next_page: null } } });
  fetchFalso.mockClear();
  vi.stubGlobal("fetch", fetchFalso);
  process.env.CALENDLY_CLIENT_ID = "cliente";
  process.env.CALENDLY_CLIENT_SECRET = "secreto";
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
  aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  consola.mockRestore();
  aviso.mockRestore();
  vi.unstubAllGlobals();
});

function esperarFallaRegistrada(etiqueta: string, error: unknown) {
  expect(consola).toHaveBeenCalledWith(etiqueta, error);
  expect(sim.reportes).toEqual([{ error, contexto: { accion: etiqueta } }]);
}

function esperarSinReporte() {
  expect(sim.reportes).toEqual([]);
  expect(consola).not.toHaveBeenCalled();
}

describe("updateCloserCommissionAction", () => {
  it("actualiza la comisión del closer de la organización de la sesión", async () => {
    await expect(updateCloserCommissionAction("closer-1", 15)).resolves.toEqual({
      success: true,
      data: undefined,
    });
    expect(sim.tablas.profiles[0].commission_pct).toBe(15);
    expect(sim.operaciones[0].filtros).toEqual([
      ["id", "closer-1"],
      ["organization_id", "org-1"],
    ]);
  });

  it("⭐ un closer de otra organización vuelve como motivo y no se toca", async () => {
    await expect(updateCloserCommissionAction("closer-ajeno", 50)).resolves.toEqual({
      success: false,
      error: "No se encontró el closer en tu organización o no tenés permiso para cambiar su comisión.",
    });
    expect(sim.tablas.profiles[1].commission_pct).toBe(10);
    esperarSinReporte();
  });

  it("⭐ un porcentaje fuera de rango vuelve como motivo, sin ir a la base", async () => {
    await expect(updateCloserCommissionAction("closer-1", 150)).resolves.toEqual({
      success: false,
      error: "La comisión tiene que ser un porcentaje entre 0 y 100.",
    });
    await expect(updateCloserCommissionAction("closer-1", Number.NaN)).resolves.toMatchObject({
      success: false,
    });
    expect(sim.operaciones).toEqual([]);
  });

  it("⭐ el rechazo del trigger de perfiles (42501) vuelve como motivo de permiso", async () => {
    sim.errores.profiles = { message: "profiles: sólo podés editar tu nombre, email y avatar", code: "42501" };
    await expect(updateCloserCommissionAction("closer-1", 15)).resolves.toEqual({
      success: false,
      error: "Sólo un founder o un admin puede cambiar la comisión.",
    });
    esperarSinReporte();
  });

  it("sin sesión devuelve el motivo", async () => {
    sim.sesion = false;
    await expect(updateCloserCommissionAction("closer-1", 15)).resolves.toEqual({
      success: false,
      error: "Sesión no válida",
    });
    esperarSinReporte();
  });

  it("⭐ una excepción de la red vuelve con el texto fijo, a la consola y a Sentry", async () => {
    sim.lanza = new TypeError("fetch failed");
    await expect(updateCloserCommissionAction("closer-1", 15)).resolves.toEqual({
      success: false,
      error: ERROR_INESPERADO,
    });
    esperarFallaRegistrada("[updateCloserCommission]", sim.lanza);
  });

  it("⭐ un error de la red que supabase-js devuelve como valor no llega crudo", async () => {
    sim.errores.profiles = { message: "TypeError: fetch failed" };
    const r = await updateCloserCommissionAction("closer-1", 15);
    expect(r).toEqual({ success: false, error: ERROR_INESPERADO });
    esperarFallaRegistrada(
      "[updateCloserCommission]",
      expect.objectContaining({ name: "FallaDeLaBase", message: "TypeError: fetch failed" })
    );
  });
});

describe("syncCloserCalendlyAction", () => {
  it("sincroniza el Calendly propio con el token del closer y su usuario", async () => {
    const r = await syncCloserCalendlyAction();
    expect(r).toEqual({
      success: true,
      data: { profileId: "yo", organizationId: "org-1", inserted: 0, updated: 0, skippedManualStatus: 0, fetched: 0 },
    });
    const [url] = fetchFalso.mock.calls[0];
    expect(String(url)).toContain(encodeURIComponent("https://api.calendly.com/users/yo"));
    const lectura = sim.operaciones.find((o) => o.tabla === "team_member_integrations");
    expect(lectura?.filtros).toEqual([
      ["organization_id", "org-1"],
      ["user_id", "yo"],
      ["integration_type", "calendly"],
    ]);
  });

  it("sincroniza el Calendly de otro closer de la organización", async () => {
    const r = await syncCloserCalendlyAction("closer-1");
    expect(r.success && r.data.profileId).toBe("closer-1");
  });

  it("⭐ un closer de otra organización vuelve como \"sin integración\"", async () => {
    await expect(syncCloserCalendlyAction("closer-ajeno")).resolves.toEqual({
      success: false,
      error: SIN_INTEGRACION,
    });
    expect(fetchFalso).not.toHaveBeenCalled();
    esperarSinReporte();
  });

  it("⭐ sin conexión (sin fila o sin token) vuelve con el motivo", async () => {
    sim.tablas.team_member_integrations = [integracion("yo", "org-1", { refresh_token: "r" })];
    await expect(syncCloserCalendlyAction()).resolves.toEqual({ success: false, error: SIN_INTEGRACION });
    sim.tablas.team_member_integrations = [];
    await expect(syncCloserCalendlyAction()).resolves.toEqual({ success: false, error: SIN_INTEGRACION });
    esperarSinReporte();
  });

  it("⭐ con el token vencido y el refresh rechazado (400 invalid_grant) pide reconectar", async () => {
    sim.tablas.team_member_integrations = [integracion("yo", "org-1", configCalendly({ token_expires_at: AYER }))];
    calendly = () => ({
      status: 400,
      json: { error: "invalid_grant", error_description: "The provided authorization grant is invalid, expired, revoked" },
    });
    await expect(syncCloserCalendlyAction()).resolves.toEqual({
      success: false,
      error: "Tu conexión con Calendly venció o fue revocada. Desconectala y volvé a conectarla para sincronizar.",
    });
    esperarSinReporte();
  });

  it("⭐ si el token vencido es de otro closer, el motivo lo dice", async () => {
    sim.tablas.team_member_integrations = [integracion("closer-1", "org-1", configCalendly({ token_expires_at: AYER }))];
    calendly = () => ({ status: 400, json: { error: "invalid_grant" } });
    await expect(syncCloserCalendlyAction("closer-1")).resolves.toEqual({
      success: false,
      error:
        "La conexión con Calendly de este closer venció o fue revocada. El closer tiene que volver a conectarla desde su configuración.",
    });
  });

  it("⭐ si Calendly rechaza el access token (401) pide reconectar", async () => {
    calendly = () => ({ status: 401, json: { title: "Unauthenticated", message: "The access token is invalid" } });
    const r = await syncCloserCalendlyAction();
    expect(r).toEqual({
      success: false,
      error: "Tu conexión con Calendly venció o fue revocada. Desconectala y volvé a conectarla para sincronizar.",
    });
    expect(JSON.stringify(r)).not.toContain("access token");
    esperarSinReporte();
  });

  it("⭐ si Calendly limita las consultas (429) lo dice", async () => {
    calendly = () => ({ status: 429, json: { title: "Too Many Requests" } });
    await expect(syncCloserCalendlyAction()).resolves.toEqual({
      success: false,
      error: "Calendly está limitando las consultas. Probá de nuevo en unos minutos.",
    });
    esperarSinReporte();
  });

  it("⭐ una conexión sin el usuario de Calendly vuelve con el motivo, no como \"0 nuevas\"", async () => {
    sim.tablas.team_member_integrations = [integracion("yo", "org-1", configCalendly({ calendly_user_uri: "" }))];
    await expect(syncCloserCalendlyAction()).resolves.toEqual({
      success: false,
      error:
        "Tu conexión con Calendly quedó incompleta (falta el usuario de Calendly). Desconectala y volvé a conectarla para sincronizar.",
    });
  });

  it("sin perfil y sin closerId no puede determinar el closer", async () => {
    sim.perfil = null;
    await expect(syncCloserCalendlyAction()).resolves.toEqual({
      success: false,
      error: "No se pudo determinar el closer",
    });
  });

  it("sin sesión devuelve el motivo", async () => {
    sim.sesion = false;
    await expect(syncCloserCalendlyAction()).resolves.toEqual({ success: false, error: "Sesión no válida" });
    esperarSinReporte();
  });

  it("⭐ una caída de Calendly (500) vuelve con el texto fijo y se reporta", async () => {
    calendly = () => ({ status: 500, json: { title: "Internal Server Error" } });
    await expect(syncCloserCalendlyAction()).resolves.toEqual({ success: false, error: ERROR_INESPERADO });
    esperarFallaRegistrada(
      "[syncCloserCalendly]",
      expect.objectContaining({ message: "Internal Server Error", status: 500 })
    );
  });

  it("⭐ una excepción de la red al hablar con Calendly vuelve con el texto fijo y se reporta", async () => {
    const caida = new TypeError("fetch failed");
    fetchFalso.mockRejectedValueOnce(caida);
    await expect(syncCloserCalendlyAction()).resolves.toEqual({ success: false, error: ERROR_INESPERADO });
    esperarFallaRegistrada("[syncCloserCalendly]", caida);
  });

  it("⭐ una excepción de la base vuelve con el texto fijo y se reporta", async () => {
    sim.lanza = new TypeError("fetch failed");
    await expect(syncCloserCalendlyAction()).resolves.toEqual({ success: false, error: ERROR_INESPERADO });
    esperarFallaRegistrada("[syncCloserCalendly]", sim.lanza);
  });

  it("⭐ un error de la red que supabase-js devuelve como valor no llega crudo", async () => {
    sim.errores.team_member_integrations = { message: "TypeError: fetch failed" };
    const r = await syncCloserCalendlyAction();
    expect(r).toEqual({ success: false, error: ERROR_INESPERADO });
    esperarFallaRegistrada(
      "[syncCloserCalendly]",
      expect.objectContaining({ name: "FallaDeLaBase", message: "TypeError: fetch failed" })
    );
  });
});

describe("disconnectMyCalendlyAction", () => {
  it("borra sólo la integración propia en la organización del perfil", async () => {
    await expect(disconnectMyCalendlyAction()).resolves.toEqual({ success: true, data: undefined });
    expect(sim.tablas.team_member_integrations.map((f) => f.user_id)).toEqual(["closer-1", "closer-ajeno"]);
    expect(sim.operaciones[0]).toMatchObject({
      op: "delete",
      filtros: [
        ["organization_id", "org-1"],
        ["user_id", "yo"],
        ["integration_type", "calendly"],
      ],
    });
  });

  it("⭐ sin sesión devuelve el motivo", async () => {
    sim.sesion = false;
    await expect(disconnectMyCalendlyAction()).resolves.toEqual({ success: false, error: "Sesión no válida" });
    expect(sim.operaciones).toEqual([]);
    esperarSinReporte();
  });

  it("⭐ si el borrado falla no avisa \"desconectado\": texto fijo y se reporta", async () => {
    sim.errores.team_member_integrations = { message: "TypeError: fetch failed" };
    const r = await disconnectMyCalendlyAction();
    expect(r).toEqual({ success: false, error: ERROR_INESPERADO });
    esperarFallaRegistrada(
      "[disconnectMyCalendly]",
      expect.objectContaining({ name: "FallaDeLaBase", message: "TypeError: fetch failed" })
    );
  });

  it("⭐ una excepción de la red vuelve con el texto fijo y se reporta", async () => {
    sim.lanza = new TypeError("fetch failed");
    await expect(disconnectMyCalendlyAction()).resolves.toEqual({ success: false, error: ERROR_INESPERADO });
    esperarFallaRegistrada("[disconnectMyCalendly]", sim.lanza);
  });
});

describe("lecturas de closers", () => {
  const lecturas: Array<{ nombre: string; etiqueta: string; tabla: string; llamar: () => Promise<{ success: boolean }> }> = [
    { nombre: "getClosersWithCalendlyStatusAction", etiqueta: "[getClosersWithCalendlyStatus]", tabla: "team_roles", llamar: () => getClosersWithCalendlyStatusAction() },
    { nombre: "getCloserMetricsAction", etiqueta: "[getCloserMetrics]", tabla: "closing_calls", llamar: () => getCloserMetricsAction() },
    { nombre: "getCloserCallsAction", etiqueta: "[getCloserCalls]", tabla: "closing_calls", llamar: () => getCloserCallsAction("closer-1") },
  ];

  describe.each(lecturas)("$nombre", ({ etiqueta, tabla, llamar }) => {
    it("⭐ sin sesión devuelve el motivo como valor y no lo reporta", async () => {
      sim.sesion = false;
      await expect(llamar()).resolves.toEqual({ success: false, error: "Sesión no válida" });
      esperarSinReporte();
    });

    it("⭐ una excepción de la red vuelve con el texto fijo y se reporta", async () => {
      sim.lanza = new TypeError("fetch failed");
      await expect(llamar()).resolves.toEqual({ success: false, error: ERROR_INESPERADO });
      esperarFallaRegistrada(etiqueta, sim.lanza);
    });

    it("⭐ un error de la base que supabase-js devuelve como valor no llega crudo", async () => {
      sim.errores[tabla] = { message: "TypeError: fetch failed" };
      await expect(llamar()).resolves.toEqual({ success: false, error: ERROR_INESPERADO });
      esperarFallaRegistrada(
        etiqueta,
        expect.objectContaining({ name: "FallaDeLaBase", message: "TypeError: fetch failed" })
      );
    });
  });

  it("los closers con su Calendly son los de la organización de la sesión", async () => {
    const r = await getClosersWithCalendlyStatusAction();
    expect(r.success && r.data.map((c) => [c.id, c.calendly_connected])).toEqual([["closer-1", true]]);
  });

  it("las métricas son las de los closers de la organización de la sesión", async () => {
    const r = await getCloserMetricsAction();
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.map((m) => [m.closerId, m.closedCalls, m.totalRevenue, m.avgScore])).toEqual([
      ["closer-1", 1, 1000, 80],
    ]);
  });

  it("⭐ antes la falla de la lectura de llamadas se veía como \"sin closers\"; ahora es una falla", async () => {
    sim.errores.closing_calls = { message: 'column closing_calls.amount_closed does not exist', code: "42703" };
    await expect(getCloserMetricsAction()).resolves.toEqual({ success: false, error: ERROR_INESPERADO });
    expect(sim.reportes).toHaveLength(1);
  });

  it("las llamadas de un closer de otra organización no se leen", async () => {
    await expect(getCloserCallsAction("closer-ajeno")).resolves.toEqual({ success: true, data: [] });
    const r = await getCloserCallsAction("closer-1");
    expect(r.success && r.data.map((c) => c.id)).toEqual(["c1"]);
  });
});
