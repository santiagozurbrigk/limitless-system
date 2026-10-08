import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-504 (AR pasada 2, MAYOR-1): si sólo falla la lectura de los pagos,
 * Finanzas no pierde su configuración. Los pagos se leen aparte: la falla se
 * registra, los totales por plataforma quedan en cero con `pagosSinLeer`, y
 * gastos, suscripciones, equipo y plataformas llegan igual. Con la primera
 * versión del fix-pack, la falla vaciaba todo (gastos en cero, plataformas
 * vacías en Configuración).
 */

type Fila = Record<string, unknown>;

const sim = vi.hoisted(() => ({
  reportes: [] as Array<{ error: unknown; contexto: unknown }>,
  tablas: {} as Record<string, Fila[]>,
  errores: {} as Record<string, { message: string } | null>,
  filtrosOrg: {} as Record<string, unknown[]>,
}));

vi.mock("@/lib/observability/reportar-falla", () => ({
  reportarFalla: (error: unknown, contexto: unknown) => sim.reportes.push({ error, contexto }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/auth/bootstrap", () => ({
  requireOrganizationId: async () => "org-1",
  tryRequireOrganizationId: async () => "org-1",
  getCurrentProfile: async () => ({ id: "yo", role: "founder" }),
  isMissingTableError: (msg: string) => msg.includes("does not exist"),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from(tabla: string) {
      const filtros: Array<[string, unknown]> = [];
      const leer = () => {
        const error = sim.errores[tabla] ?? null;
        if (error) return { data: null, error };
        return {
          data: (sim.tablas[tabla] ?? []).filter((f) => filtros.every(([c, v]) => f[c] === v)),
          error: null,
        };
      };
      const builder = {
        select: () => builder,
        order: () => builder,
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

import { loadFinanceConfigAction } from "../actions";

let consola: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  sim.reportes = [];
  sim.errores = {};
  sim.filtrosOrg = {};
  sim.tablas = {
    fixed_expenses: [{ id: "g1", organization_id: "org-1", name: "Oficina", category: "x", amount: 10, currency: "USD", frequency: "monthly", status: "active" }],
    subscriptions: [{ id: "s1", organization_id: "org-1", name: "Herramienta", status: "active", amount: 5, currency: "USD" }],
    team_compensation: [{ id: "t1", organization_id: "org-1", member_name: "Ana" }],
    payment_platforms: [{ id: "p1", organization_id: "org-1", name: "Stripe", currency: "USD" }],
    client_payments: [
      { id: "pago", organization_id: "org-1", client_id: "c1", amount: 100, payment_date: "2026-10-01", payment_destination_platform_id: "p1" },
    ],
    organizations: [{ id: "org-1", timezone: "America/Argentina/Buenos_Aires" }],
  };
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => consola.mockRestore());

describe("loadFinanceConfigAction", () => {
  it("con todo bien trae la configuración y los totales por plataforma", async () => {
    const r = await loadFinanceConfigAction();
    expect(r.pagosSinLeer).toBe(false);
    expect(r.fixedExpenses.map((g) => g.id)).toEqual(["g1"]);
    expect(r.paymentPlatforms.map((p) => [p.id, p.totalReceived])).toEqual([["p1", 100]]);
    expect(sim.filtrosOrg.client_payments).toEqual(["org-1"]);
    expect(sim.reportes).toEqual([]);
  });

  it("⭐ con client_payments caído, el resto llega igual, la falla se reporta una vez y se avisa", async () => {
    sim.errores.client_payments = { message: "TypeError: fetch failed" };
    const r = await loadFinanceConfigAction();
    expect(r.fixedExpenses.map((g) => g.id)).toEqual(["g1"]);
    expect(r.subscriptions.map((s) => s.id)).toEqual(["s1"]);
    expect(r.teamCompensation.map((t) => t.id)).toEqual(["t1"]);
    expect(r.paymentPlatforms.map((p) => [p.id, p.totalReceived])).toEqual([["p1", 0]]);
    expect(r.pagosSinLeer).toBe(true);
    expect(sim.reportes).toEqual([
      {
        error: expect.objectContaining({ name: "FallaDeLaBase", message: "TypeError: fetch failed" }),
        contexto: { accion: "[loadFinanceConfig] pagos" },
      },
    ]);
  });
});
