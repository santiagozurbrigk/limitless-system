import { describe, expect, it } from "vitest";
import { engagementDe, resumirEngagement, tieneMetricas } from "../metricas-medidas";

/**
 * SCRUM-172: una pieza con `metrics` en null no se midió. Los promedios y
 * totales se calculan sólo con las piezas medidas.
 */

describe("tieneMetricas", () => {
  it("un objeto de métricas cuenta, aunque traiga ceros medidos", () => {
    expect(tieneMetricas({ likes: 0, views: 0 })).toBe(true);
  });

  it("null, undefined, un array o un texto no son métricas", () => {
    expect(tieneMetricas(null)).toBe(false);
    expect(tieneMetricas(undefined)).toBe(false);
    expect(tieneMetricas([])).toBe(false);
    expect(tieneMetricas("12")).toBe(false);
  });
});

describe("resumirEngagement", () => {
  it("⭐ promedia sólo sobre las piezas medidas e informa cuántas no tienen dato", () => {
    const r = resumirEngagement([
      { metrics: { likes: 100, comments: 20 } },
      { metrics: { likes: 40, saves: 8 } },
      { metrics: null },
      { metrics: null },
      { metrics: { likes: 0, views: 0 } },
    ]);
    expect(r).toEqual({ total: 168, promedio: 56, conMetricas: 3, sinMetricas: 2 });
  });

  it("sin ninguna pieza medida no hay promedio (null, no cero)", () => {
    expect(resumirEngagement([{ metrics: null }])).toEqual({
      total: 0,
      promedio: null,
      conMetricas: 0,
      sinMetricas: 1,
    });
  });

  it("engagementDe suma likes, comentarios, compartidos y guardados", () => {
    expect(engagementDe({ likes: 1, comments: 2, shares: 3, saves: 4, views: 1000 })).toBe(10);
  });
});
