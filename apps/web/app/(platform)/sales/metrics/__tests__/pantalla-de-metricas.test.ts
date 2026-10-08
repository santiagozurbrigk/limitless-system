/**
 * SCRUM-504: `/sales/metrics` se dibuja igual cuando la lectura de las
 * métricas importadas vuelve con error, y le pasa el motivo a la pantalla
 * para que lo avise. Antes el error se tragaba en silencio (y en producción
 * una lectura que lanza sólo trae un digest).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sim = vi.hoisted(() => ({
  resultado: null as unknown,
}));

vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/auth/bootstrap", () => ({ requireOrganizationId: async () => "org-1" }));
vi.mock("@/lib/metrics/frequent-objections", () => ({
  getFrequentObjections: async () => ({ objections: [], dataSource: "live" }),
  mockFrequentObjectionSummaries: () => [],
}));
vi.mock("@/app/sales/metrics-actions", () => ({
  getSalesMetricsSnapshotsAction: async () => sim.resultado,
}));
// La pantalla real usa hooks de cliente; acá alcanza con ver qué recibe.
vi.mock("@/components/sales/sales-metrics-redesign", () => ({
  SalesMetricsRedesign: (props: {
    importedSnapshots: Array<{ id: string }>;
    importedSnapshotsError: string | null;
  }) =>
    `importadas:${props.importedSnapshots.map((s) => s.id).join(",")}|error:${props.importedSnapshotsError ?? "-"}`,
}));

import SalesMetricsPage from "../page";

beforeEach(() => {
  sim.resultado = null;
});

describe("SalesMetricsPage", () => {
  it("⭐ con la lectura rechazada se dibuja y le pasa el motivo a la pantalla", async () => {
    sim.resultado = { success: false, error: "Sesión no válida" };
    const html = renderToStaticMarkup(await SalesMetricsPage());
    expect(html).toBe("importadas:|error:Sesión no válida");
  });

  it("con éxito pasa las métricas importadas, sin error", async () => {
    sim.resultado = {
      success: true,
      data: [{ id: "s1", periodStart: "2026-09-01", periodLabel: "Septiembre", metrics: {} }],
    };
    const html = renderToStaticMarkup(await SalesMetricsPage());
    expect(html).toBe("importadas:s1|error:-");
  });
});
