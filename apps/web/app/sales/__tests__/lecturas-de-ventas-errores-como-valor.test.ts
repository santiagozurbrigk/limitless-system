import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-504: las lecturas de Ventas (ranking y evolución de closers, métricas
 * de rendimiento y métricas importadas) devuelven sus errores como valor
 * (`MutationResult`). En producción Next no le manda al cliente el mensaje de
 * un error lanzado por una server action: la pantalla mostraba un estado de
 * error sin motivo, o el párrafo técnico de Next.
 */

const ERROR_INESPERADO = "Ocurrió un error inesperado. Intentá de nuevo.";

type Fila = Record<string, unknown> & { organization_id?: string };
type ErrorDeLaBase = { message: string; code?: string } | null;

const sim = vi.hoisted(() => ({
  reportes: [] as Array<{ error: unknown; contexto: unknown }>,
  configurado: true,
  sesion: true,
  tablas: {} as Record<string, Fila[]>,
  errores: {} as Record<string, ErrorDeLaBase>,
  // Si está, `from()` lanza: como un bug o una excepción de la red.
  lanza: null as unknown,
  filtrosOrg: {} as Record<string, unknown[]>,
}));

vi.mock("@/lib/observability/reportar-falla", () => ({
  reportarFalla: (error: unknown, contexto: unknown) => sim.reportes.push({ error, contexto }),
}));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => sim.configurado }));
// Como el real: la sesión que falta es un rechazo esperable.
vi.mock("@/lib/auth/bootstrap", async () => {
  const { ErrorEsperable } = await import("@/lib/server/error-esperable");
  return {
    requireOrganizationId: async () => {
      if (!sim.sesion) throw new ErrorEsperable("Sesión no válida");
      return "org-1";
    },
    isMissingTableError: (msg: string) => msg.includes("does not exist"),
  };
});
vi.mock("@/lib/metrics/frequent-objections", () => ({
  // Como la real: lee `call_analyses` de la org y, si la base falla, lanza un
  // `Error` con el mensaje de la base.
  getFrequentObjections: async (organizationId: string) => {
    if (sim.lanza) throw sim.lanza;
    const error = sim.errores.call_analyses;
    if (error) {
      const { FallaDeLaBase } = await import("@/lib/server/action-result");
      throw new FallaDeLaBase(error);
    }
    sim.filtrosOrg.objeciones = [organizationId];
    return { objections: [], dataSource: "calls" };
  },
  mockFrequentObjectionSummaries: () => [],
}));
vi.mock("@/lib/sales/lead-journey", () => ({
  getLeadJourney: vi.fn(),
  getZernioLeadJourney: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from(tabla: string) {
      if (sim.lanza) throw sim.lanza;
      // Aplica los `.eq` pedidos: si una lectura deja de filtrar por
      // organización, trae filas de otra org y el test lo ve.
      const filtros: Array<[string, unknown]> = [];
      const leer = () => {
        const error = sim.errores[tabla] ?? null;
        const data = error
          ? null
          : (sim.tablas[tabla] ?? []).filter((f) => filtros.every(([c, v]) => f[c] === v));
        return { data, error };
      };
      const builder = {
        select: () => builder,
        order: () => builder,
        limit: () => builder,
        gte: () => builder,
        lte: () => builder,
        eq(columna: string, valor: unknown) {
          filtros.push([columna, valor]);
          if (columna === "organization_id") (sim.filtrosOrg[tabla] ??= []).push(valor);
          return builder;
        },
        maybeSingle: async () => {
          const { data, error } = leer();
          return { data: data?.[0] ?? null, error };
        },
        then(resolver: (r: unknown) => void) {
          resolver(leer());
        },
      };
      return builder;
    },
  }),
}));

import {
  getCloserEvolutionAction,
  getTeamAverageEvolutionAction,
  getTeamRankingAction,
} from "../actions";
import * as acciones from "../actions";
import {
  getSalesMetricsSnapshotsAction,
  getSalesPerformanceMetricsAction,
} from "../metrics-actions";

function analisis(org: string, closer: string, score: number, dia: string): Fila {
  return {
    organization_id: org,
    closer_id: `id-${closer}`,
    closer_name: closer,
    overall_score: score,
    booked: true,
    sold: false,
    call_date: `${dia}T15:00:00Z`,
  };
}

let consola: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  sim.reportes = [];
  sim.configurado = true;
  sim.sesion = true;
  sim.lanza = null;
  sim.errores = {};
  sim.filtrosOrg = {};
  sim.tablas = {
    call_analyses: [
      analisis("org-1", "Laura", 80, "2026-10-01"),
      analisis("org-1", "Laura", 90, "2026-10-02"),
      analisis("org-2", "Ajeno", 10, "2026-10-01"),
    ],
    organizations: [{ id: "org-1", timezone: "America/Argentina/Buenos_Aires" }],
    metrics_snapshots: [
      {
        organization_id: "org-1",
        category: "sales",
        id: "s1",
        period_start: "2026-09-01",
        period_label: "Septiembre 2026",
        metrics: { cierres: 3 },
      },
      {
        organization_id: "org-2",
        category: "sales",
        id: "s-ajeno",
        period_start: "2026-09-01",
        period_label: null,
        metrics: {},
      },
    ],
    closing_calls: [
      { organization_id: "org-1", id: "c1", status: "closed", outcome: null },
      { organization_id: "org-1", id: "c2", status: "no_show", outcome: null },
      { organization_id: "org-2", id: "c-ajena", status: "closed", outcome: null },
    ],
    conversations: [
      { organization_id: "org-1", id: "v1", status: "booked", tag: null, ai_funnel_stage: null },
      { organization_id: "org-2", id: "v-ajena", status: "booked", tag: null, ai_funnel_stage: null },
    ],
  };
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
  return () => consola.mockRestore();
});

/**
 * Las mismas comprobaciones para cada lectura: sin sesión vuelve el motivo y
 * no se reporta; una excepción o un error de la base que supabase-js devuelve
 * como valor vuelven con el texto fijo, se registran en la consola y van a
 * Sentry con la etiqueta de la acción.
 */
const casos: Array<{
  nombre: string;
  etiqueta: string;
  tabla: string;
  llamar: () => Promise<{ success: boolean }>;
}> = [
  { nombre: "getTeamRankingAction", etiqueta: "[getTeamRanking]", tabla: "call_analyses", llamar: () => getTeamRankingAction() },
  { nombre: "getCloserEvolutionAction", etiqueta: "[getCloserEvolution]", tabla: "call_analyses", llamar: () => getCloserEvolutionAction("Laura") },
  { nombre: "getTeamAverageEvolutionAction", etiqueta: "[getTeamAverageEvolution]", tabla: "call_analyses", llamar: () => getTeamAverageEvolutionAction() },
  { nombre: "getSalesMetricsSnapshotsAction", etiqueta: "[getSalesMetricsSnapshots]", tabla: "metrics_snapshots", llamar: () => getSalesMetricsSnapshotsAction() },
  { nombre: "getFrequentObjectionsAction", etiqueta: "[getFrequentObjections]", tabla: "call_analyses", llamar: () => acciones.getFrequentObjectionsAction() },
  { nombre: "getSalesPerformanceMetricsAction", etiqueta: "[getSalesPerformanceMetrics]", tabla: "closing_calls", llamar: () => getSalesPerformanceMetricsAction("month") },
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
    const r = await llamar();
    expect(r).toEqual({ success: false, error: ERROR_INESPERADO });
    expect(consola).toHaveBeenCalledWith(etiqueta, sim.lanza);
    expect(sim.reportes).toEqual([{ error: sim.lanza, contexto: { accion: etiqueta } }]);
  });

  it("⭐ un error de la red que supabase-js devuelve como valor no llega crudo", async () => {
    sim.errores[tabla] = { message: "TypeError: fetch failed" };
    const r = await llamar();
    expect(r).toEqual({ success: false, error: ERROR_INESPERADO });
    expect(JSON.stringify(r)).not.toContain("fetch failed");
    const detalle = expect.objectContaining({ name: "FallaDeLaBase", message: "TypeError: fetch failed" });
    expect(consola).toHaveBeenCalledWith(etiqueta, detalle);
    expect(sim.reportes).toEqual([{ error: detalle, contexto: { accion: etiqueta } }]);
  });
});

describe("getTeamRankingAction", () => {
  it("devuelve el ranking de la organización de la sesión, y no el de otra", async () => {
    const r = await getTeamRankingAction();
    expect(r).toEqual({
      success: true,
      data: [{ name: "Laura", score: 85, calls: 2, bookings: 2, conversion: "100%", trend: "stable" }],
    });
    expect(sim.filtrosOrg.call_analyses).toEqual(["org-1"]);
  });

  it("si falta la tabla devuelve la lista vacía, como antes", async () => {
    sim.errores.call_analyses = { message: 'relation "call_analyses" does not exist' };
    await expect(getTeamRankingAction()).resolves.toEqual({ success: true, data: [] });
    expect(sim.reportes).toEqual([]);
  });

  it("sin Supabase configurado devuelve el ranking de ejemplo", async () => {
    sim.configurado = false;
    const r = await getTeamRankingAction();
    expect(r.success).toBe(true);
  });
});

describe("getCloserEvolutionAction", () => {
  it("devuelve los puntajes del closer en la organización de la sesión", async () => {
    await expect(getCloserEvolutionAction("Laura")).resolves.toEqual({ success: true, data: [80, 90] });
    expect(sim.filtrosOrg.call_analyses).toEqual(["org-1"]);
  });

  it("un closer de otra organización no trae nada", async () => {
    await expect(getCloserEvolutionAction("Ajeno")).resolves.toEqual({ success: true, data: [] });
  });

  it("si falta la tabla devuelve la lista vacía, como antes", async () => {
    sim.errores.call_analyses = { message: 'relation "call_analyses" does not exist' };
    await expect(getCloserEvolutionAction("Laura")).resolves.toEqual({ success: true, data: [] });
  });
});

describe("getTeamAverageEvolutionAction", () => {
  it("devuelve el promedio por día de la organización de la sesión", async () => {
    await expect(getTeamAverageEvolutionAction()).resolves.toEqual({ success: true, data: [80, 90] });
    expect(sim.filtrosOrg.call_analyses).toEqual(["org-1"]);
  });

  it("si falta la tabla devuelve la lista vacía, como antes", async () => {
    sim.errores.call_analyses = { message: 'relation "call_analyses" does not exist' };
    await expect(getTeamAverageEvolutionAction()).resolves.toEqual({ success: true, data: [] });
  });
});

describe("getSalesMetricsSnapshotsAction", () => {
  it("sin Supabase configurado no hay métricas importadas", async () => {
    sim.configurado = false;
    await expect(getSalesMetricsSnapshotsAction()).resolves.toEqual({ success: true, data: [] });
  });

  it("devuelve las métricas importadas de la organización de la sesión, y no las de otra", async () => {
    await expect(getSalesMetricsSnapshotsAction()).resolves.toEqual({
      success: true,
      data: [{ id: "s1", periodStart: "2026-09-01", periodLabel: "Septiembre 2026", metrics: { cierres: 3 } }],
    });
    expect(sim.filtrosOrg.metrics_snapshots).toEqual(["org-1"]);
  });
});

describe("getSalesPerformanceMetricsAction", () => {
  it("cuenta llamadas y conversaciones de la organización de la sesión, y no las de otra", async () => {
    const r = await getSalesPerformanceMetricsAction("custom", {
      from: "2026-10-01T00:00:00Z",
      to: "2026-10-31T00:00:00Z",
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.period).toBe("custom");
    expect(r.data.schedules.totalAgendas).toBe(2);
    expect(r.data.calls.cierres).toBe(1);
    expect(r.data.calls.noShows).toBe(1);
    expect(r.data.leads.leadsCount).toBe(1);
    expect(sim.filtrosOrg.closing_calls).toEqual(["org-1"]);
    expect(sim.filtrosOrg.conversations).toEqual(["org-1"]);
  });

  it("si falla la lectura de conversaciones vuelve con el texto fijo y se reporta", async () => {
    sim.errores.conversations = { message: "permission denied for table conversations" };
    await expect(getSalesPerformanceMetricsAction()).resolves.toEqual({
      success: false,
      error: ERROR_INESPERADO,
    });
    expect(sim.reportes).toHaveLength(1);
  });
});

describe("getFrequentObjectionsAction", () => {
  it("lee las objeciones de la organización de la sesión", async () => {
    await expect(acciones.getFrequentObjectionsAction()).resolves.toEqual({
      success: true,
      data: { objections: [], dataSource: "calls" },
    });
    expect(sim.filtrosOrg.objeciones).toEqual(["org-1"]);
  });

  it("sin Supabase configurado devuelve las de ejemplo", async () => {
    sim.configurado = false;
    await expect(acciones.getFrequentObjectionsAction()).resolves.toEqual({
      success: true,
      data: { objections: [], dataSource: "mock" },
    });
  });
});

describe("getCallAnalysesAction", () => {
  it("ya no existe: no tenía llamadores y era un endpoint expuesto", () => {
    expect("getCallAnalysesAction" in acciones).toBe(false);
  });
});
