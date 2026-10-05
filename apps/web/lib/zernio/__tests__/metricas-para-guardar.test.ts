import { describe, expect, it } from "vitest";
import { camposDeMetricasParaActualizar, metricasParaGuardar } from "../metricas-para-guardar";

/**
 * SCRUM-172 · [AUDITORIA §3 confiabilidad 11]: si Zernio no manda números
 * reconocibles, la sync de contenido no guarda ceros ni pisa las métricas que
 * ya tenía la pieza.
 */

const AHORA = "2026-10-04T12:00:00.000Z";

describe("metricasParaGuardar", () => {
  it("⭐ sin analytics reconocibles no hay métricas: null, no ceros", () => {
    for (const analytics of [undefined, null, {}, { algo: "raro" }, { instagram: {} }]) {
      expect(metricasParaGuardar(analytics, AHORA)).toEqual({ metrics: null, metrics_updated_at: null });
    }
  });

  it("con analytics reconocibles guarda las métricas y la fecha de Zernio", () => {
    const r = metricasParaGuardar({ likes: 10, views: 200, lastUpdated: "2026-10-03T08:00:00Z" }, AHORA);
    expect(r.metrics).toMatchObject({ likes: 10, views: 200 });
    expect(r.metrics_updated_at).toBe("2026-10-03T08:00:00Z");
  });

  it("un cero medido sí se guarda, con la hora de la sync si Zernio no manda fecha", () => {
    const r = metricasParaGuardar({ likes: 0, views: 0 }, AHORA);
    expect(r.metrics).toMatchObject({ likes: 0, views: 0 });
    expect(r.metrics_updated_at).toBe(AHORA);
  });
});

describe("camposDeMetricasParaActualizar", () => {
  it("⭐ sin métricas reconocidas no toca las guardadas", () => {
    expect(camposDeMetricasParaActualizar(metricasParaGuardar({}, AHORA))).toEqual({});
  });

  it("con métricas reconocidas las actualiza", () => {
    const campos = camposDeMetricasParaActualizar(metricasParaGuardar({ likes: 3 }, AHORA));
    expect(campos).toMatchObject({ metrics: expect.objectContaining({ likes: 3 }), metrics_updated_at: AHORA });
  });
});
