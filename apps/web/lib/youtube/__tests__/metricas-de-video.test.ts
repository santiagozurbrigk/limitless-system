import { describe, expect, it } from "vitest";
import { metricasDeVideoParaGuardar } from "../video-metrics";

/**
 * SCRUM-172 (fix-pack): si YouTube no devuelve el detalle de un video (cuota
 * agotada, token vencido), la sync no pisa sus métricas con ceros.
 */

const AHORA = "2026-10-04T12:00:00.000Z";

describe("metricasDeVideoParaGuardar", () => {
  it("⭐ sin el detalle del video no hay métricas que guardar", () => {
    expect(metricasDeVideoParaGuardar(undefined, AHORA)).toEqual({});
  });

  it("con el detalle guarda vistas, likes y comentarios", () => {
    const r = metricasDeVideoParaGuardar(
      { view_count: 120, like_count: 8, comment_count: 2 } as Parameters<typeof metricasDeVideoParaGuardar>[0],
      AHORA
    );
    expect(r.metrics).toMatchObject({ views: 120, likes: 8, comments: 2 });
    expect(r.metrics_updated_at).toBe(AHORA);
  });
});
