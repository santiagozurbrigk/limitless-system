import type { ContentMetrics } from "@/types/content";

/**
 * Reglas comunes para leer `content_pieces.metrics` sin inventar ceros.
 *
 * ⭐ Desde SCRUM-172 una pieza cuyos analytics no se reconocieron queda con
 * `metrics` en null: no se midió. Un promedio, un total o un ranking se calcula
 * sólo con las piezas medidas y dice cuántas quedaron afuera; una pieza sin
 * métricas se muestra como "sin métricas", nunca como cero.
 */

export const SIN_METRICAS = "sin métricas";

/** Si la pieza tiene métricas medidas (un objeto, aunque traiga ceros medidos). */
export function tieneMetricas(metrics: unknown): metrics is ContentMetrics {
  return typeof metrics === "object" && metrics !== null && !Array.isArray(metrics);
}

/** Interacciones de una pieza medida: likes + comentarios + compartidos + guardados. */
export function engagementDe(metrics: ContentMetrics): number {
  return (
    (metrics.likes ?? 0) +
    (metrics.comments ?? 0) +
    (metrics.shares ?? 0) +
    (metrics.saves ?? 0)
  );
}

export type ResumenDeEngagement = {
  total: number;
  /** null si ninguna pieza tiene métricas: no hay promedio que dar. */
  promedio: number | null;
  conMetricas: number;
  sinMetricas: number;
};

/** Total y promedio de engagement sólo sobre las piezas medidas. */
export function resumirEngagement(piezas: Array<{ metrics?: unknown }>): ResumenDeEngagement {
  let total = 0;
  let conMetricas = 0;
  for (const pieza of piezas) {
    if (!tieneMetricas(pieza.metrics)) continue;
    conMetricas += 1;
    total += engagementDe(pieza.metrics);
  }
  return {
    total,
    promedio: conMetricas > 0 ? Math.round(total / conMetricas) : null,
    conMetricas,
    sinMetricas: piezas.length - conMetricas,
  };
}
