/**
 * SCRUM-540 · AR pasada 2 (BLOQUEANTE-1): `getResumenFinancieroAction` calcula
 * "este mes" con el día de la organización (su zona), no con el reloj UTC del
 * servidor. Las lecturas se simulan con las filas de la AR.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { emptyPermissions } from "@/constants/permission-modules";
import { ENTRADAS } from "@/lib/dashboard/__tests__/filas-fin-de-mes";

const sim = vi.hoisted(() => ({ zona: "America/Tegucigalpa" as string | null }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/auth/bootstrap", async (o) => ({
  ...(await o<typeof import("@/lib/auth/bootstrap")>()),
  requireOrganizationId: async () => "org",
}));
vi.mock("@/lib/auth/get-current-permissions", () => ({
  getCurrentUserPermissions: async () => ({
    role: "member",
    isFounder: false,
    modules: { ...emptyPermissions(), sales: "full" },
    hasRoleConfigured: true,
    enabledAddOns: [],
  }),
}));
vi.mock("@/lib/fechas/organizacion-activa", () => ({
  zonaDeLaOrganizacionActiva: async () => sim.zona,
}));
vi.mock("@/lib/finance/leer-configuracion", async (o) => ({
  ...(await o<typeof import("@/lib/finance/leer-configuracion")>()),
  leerEntradasDelResumen: async () => ({ entradas: ENTRADAS, pagosSinLeer: false }),
}));

import { getResumenFinancieroAction } from "@/app/finance/actions";

const tzOriginal = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "UTC";
});
afterAll(() => {
  process.env.TZ = tzOriginal;
});
afterEach(() => vi.useRealTimers());

describe("getResumenFinancieroAction en el cambio de mes", () => {
  it("⭐ 1 de noviembre 03:00 UTC, org en Honduras (31 de octubre): facturación y serie de octubre", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-01T03:00:00Z"));
    const r = await getResumenFinancieroAction();
    if (!r.success) throw new Error(r.error);
    expect(r.data.financeSummary.facturacion).toBe(3000);
    expect(r.data.monthlySeries.at(-1)?.month).toBe("Oct");
    expect(r.data.expensesSummary.totalMonthly).toBe(1100);
  });

  it("con una org en UTC, el mismo instante ya es noviembre", async () => {
    sim.zona = "UTC";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-01T03:00:00Z"));
    const r = await getResumenFinancieroAction();
    if (!r.success) throw new Error(r.error);
    expect(r.data.monthlySeries.at(-1)?.month).toBe("Nov");
    sim.zona = "America/Tegucigalpa";
  });
});
