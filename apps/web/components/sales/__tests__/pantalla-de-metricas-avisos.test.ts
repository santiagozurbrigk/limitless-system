import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-504: la pantalla de métricas de Ventas avisa por qué no se pudieron
 * leer las métricas de rendimiento o las importadas, en vez de quedarse en
 * cero sin explicación.
 */

const sim = vi.hoisted(() => ({ perfError: null as string | null }));

vi.mock("@/components/sales/metrics/use-sales-metrics", async () => {
  const { deriveSalesMetrics } = await import("@/lib/metrics/derive-sales-metrics");
  return {
    useSalesMetrics: () => ({
      isLoading: false,
      perfMetrics: null,
      perfError: sim.perfError,
      filteredMetrics: deriveSalesMetrics([], []),
      filteredConversations: [],
      financeSummary: { facturacion: 0, cashCollected: 0, gastosTotales: 0 },
      facturacionSparkData: [],
      cashCollectedSparkData: [],
      bookingSparkData: [],
      agendasSparkData: [],
      weeklyTrend: [],
      leadSourceSlices: [],
      convStatusSlices: [],
      funnelStages: [],
    }),
  };
});
vi.mock("@/providers/zona-de-la-organizacion-provider", () => ({
  useZonaDeLaOrganizacion: () => "America/Argentina/Buenos_Aires",
  useHoyDeLaOrganizacion: () => null,
}));
// Secciones con sus propias lecturas: no son parte de esta prueba.
vi.mock("@/components/sales/frequent-objections-section", () => ({
  FrequentObjectionsSection: () => null,
}));
vi.mock("@/components/sales/sales-team-performance-section", () => ({
  SalesTeamPerformanceSection: () => null,
}));

import { SalesMetricsRedesign } from "../sales-metrics-redesign";

beforeEach(() => {
  sim.perfError = null;
});

describe("SalesMetricsRedesign", () => {
  it("⭐ avisa el motivo cuando no se pudieron leer las métricas de rendimiento", () => {
    sim.perfError = "Sesión no válida";
    const html = renderToStaticMarkup(createElement(SalesMetricsRedesign, {}));
    expect(html).toContain("No se pudieron cargar las métricas de rendimiento.");
    expect(html).toContain("Sesión no válida");
  });

  it("⭐ avisa el motivo cuando no se pudieron leer las métricas importadas", () => {
    const html = renderToStaticMarkup(
      createElement(SalesMetricsRedesign, {
        importedSnapshotsError: "Ocurrió un error inesperado. Intentá de nuevo.",
      })
    );
    expect(html).toContain("No se pudieron cargar las métricas importadas.");
    expect(html).toContain("Ocurrió un error inesperado. Intentá de nuevo.");
  });

  it("sin errores no muestra avisos", () => {
    const html = renderToStaticMarkup(createElement(SalesMetricsRedesign, {}));
    expect(html).not.toContain("No se pudieron cargar");
  });
});
