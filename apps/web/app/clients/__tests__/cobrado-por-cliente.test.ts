import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-504 (AR, MAYOR-2): lo cobrado por cliente para Cobros devuelve su
 * error como valor. Antes, si los pagos no se podían leer, llegaba vacío y
 * cada cliente aparecía con la deuda completa.
 */

const ERROR_INESPERADO = "Ocurrió un error inesperado. Intentá de nuevo.";

const sim = vi.hoisted(() => ({
  reportes: [] as Array<{ error: unknown; contexto: unknown }>,
  sesion: true,
  pagos: [] as Array<{ clientId: string; amount: number }>,
  fallaPagos: null as unknown,
}));

vi.mock("@/lib/observability/reportar-falla", () => ({
  reportarFalla: (error: unknown, contexto: unknown) => sim.reportes.push({ error, contexto }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/clients/actions", () => ({ listClientsAction: vi.fn() }));
vi.mock("@/lib/rag/extract-plan-durations", () => ({ extractPlanDurationsFromRAG: vi.fn() }));
vi.mock("@/lib/auth/bootstrap", async () => {
  const { ErrorEsperable } = await import("@/lib/server/error-esperable");
  return {
    requireOrganizationId: async () => {
      if (!sim.sesion) throw new ErrorEsperable("Sesión no válida");
      return "org-1";
    },
    getCurrentProfile: async () => ({ id: "yo", role: "founder" }),
    isMissingTableError: () => false,
  };
});
vi.mock("@/lib/sales/pagos", () => ({
  leerPagosDeLaOrganizacion: async (_supabase: unknown, organizationId: string) => {
    expect(organizationId).toBe("org-1");
    if (sim.fallaPagos) throw sim.fallaPagos;
    return sim.pagos;
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: async () => ({ data: [], error: null }),
    };
    return { from: () => builder };
  },
}));

import { getClientsTableEnrichmentAction } from "../plan-duration-actions";
import { FallaDeLaBase } from "@/lib/server/action-result";

let consola: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  sim.reportes = [];
  sim.sesion = true;
  sim.pagos = [];
  sim.fallaPagos = null;
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => consola.mockRestore());

describe("getClientsTableEnrichmentAction", () => {
  it("suma lo cobrado por cliente", async () => {
    sim.pagos = [
      { clientId: "a", amount: 100 },
      { clientId: "a", amount: 50 },
      { clientId: "b", amount: 10 },
    ];
    await expect(getClientsTableEnrichmentAction()).resolves.toEqual({
      success: true,
      data: { paidByClientId: { a: 150, b: 10 }, planDurations: [], isFounder: true },
    });
  });

  it("⭐ si los pagos no se pueden leer, texto fijo y se reporta (no \"nada cobrado\")", async () => {
    sim.fallaPagos = new FallaDeLaBase({ message: "TypeError: fetch failed" });
    await expect(getClientsTableEnrichmentAction()).resolves.toEqual({
      success: false,
      error: ERROR_INESPERADO,
    });
    expect(sim.reportes).toEqual([
      { error: sim.fallaPagos, contexto: { accion: "[getClientsTableEnrichment]" } },
    ]);
  });

  it("⭐ sin sesión devuelve el motivo", async () => {
    sim.sesion = false;
    await expect(getClientsTableEnrichmentAction()).resolves.toEqual({
      success: false,
      error: "Sesión no válida",
    });
  });
});
