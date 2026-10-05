import type { ContentMetrics } from "@/types/content";
import { resolvePostAnalytics } from "./resolve-analytics";

export type MetricasParaGuardar = {
  metrics: ContentMetrics | null;
  metrics_updated_at: string | null;
};

/**
 * Las métricas de un post de Zernio tal como se guardan en `content_pieces`.
 *
 * Si Zernio no mandó números reconocibles, devuelve `null` en vez de ceros:
 * un cero que nadie midió no es un dato (SCRUM-172).
 */
export function metricasParaGuardar(analytics: unknown, ahora: string): MetricasParaGuardar {
  const { metrics, lastUpdated, recognized } = resolvePostAnalytics(analytics);
  if (!recognized) return { metrics: null, metrics_updated_at: null };
  return { metrics, metrics_updated_at: lastUpdated ?? ahora };
}

/**
 * Los campos de métricas para actualizar una pieza que ya existe: si no hay
 * métricas reconocidas no se tocan, así no se pisan las que ya estaban.
 */
export function camposDeMetricasParaActualizar(
  fila: MetricasParaGuardar
): Partial<{ metrics: ContentMetrics; metrics_updated_at: string }> {
  if (!fila.metrics || !fila.metrics_updated_at) return {};
  return { metrics: fila.metrics, metrics_updated_at: fila.metrics_updated_at };
}
