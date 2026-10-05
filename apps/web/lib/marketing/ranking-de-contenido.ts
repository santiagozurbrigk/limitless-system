import type { ContentMetrics, ContentSalesAttributed } from "@/types/content";
import { tieneMetricas } from "./metricas-medidas";

/**
 * Ranking de piezas de contenido por una métrica (tool `get_top_performing_content`).
 *
 * ⭐ Las piezas sin métricas (`metrics` null, SCRUM-172) no entran a un ranking
 * por métrica: no se midieron, no son un cero. El ranking dice cuántas quedaron
 * afuera para que nadie concluya sobre piezas que no se midieron. Por `sales`
 * entran todas: esa métrica sale de `sales_attributed`, no de `metrics`.
 */

function salesScore(attribution?: ContentSalesAttributed | null): number {
  if (!attribution) return 0;
  return attribution.total_revenue || attribution.closed_count * 1000;
}

function engagementTotalScore(metrics: ContentMetrics): number {
  return (
    (metrics.likes ?? 0) +
    (metrics.comments ?? 0) * 2 +
    (metrics.saves ?? 0) * 3 +
    (metrics.shares ?? 0) * 2
  );
}

export function metricScore(
  metric: string,
  metrics: ContentMetrics,
  salesAttributed?: ContentSalesAttributed | null
): number {
  if (metric === "engagement_total") {
    return engagementTotalScore(metrics);
  }
  if (metric === "sales") {
    return salesScore(salesAttributed);
  }
  return metrics[metric as keyof ContentMetrics] ?? 0;
}

export type PiezaParaRanking = {
  id: string;
  metrics?: ContentMetrics | null;
  sales_attributed?: ContentSalesAttributed | null;
};

/**
 * Ordena las piezas por la métrica, de mayor a menor, y devuelve las primeras
 * `limit`. Con empate se respeta el orden de entrada.
 */
export function rankearPiezas<T extends PiezaParaRanking>(
  piezas: T[],
  metric: string,
  limit: number
): { piezas: T[]; sinMetricas: number } {
  const porVentas = metric === "sales";
  const candidatas = porVentas ? piezas : piezas.filter((p) => tieneMetricas(p.metrics));
  const ordenadas = candidatas
    .map((pieza, indice) => ({
      pieza,
      indice,
      score: metricScore(metric, pieza.metrics ?? {}, pieza.sales_attributed),
    }))
    .sort((a, b) => b.score - a.score || a.indice - b.indice)
    .map(({ pieza }) => pieza);

  return {
    piezas: ordenadas.slice(0, limit),
    sinMetricas: piezas.length - candidatas.length,
  };
}

/**
 * Lo que se suma a la respuesta de la tool del agente cuando hay piezas sin
 * métricas: el conteo y una nota para que no saque conclusiones sobre ellas.
 */
export function avisoDePiezasSinMetricas(
  sinMetricas: number
): { piezas_sin_metricas: number; nota_sin_metricas: string } | Record<string, never> {
  if (sinMetricas <= 0) return {};
  return {
    piezas_sin_metricas: sinMetricas,
    nota_sin_metricas:
      `${sinMetricas} pieza(s) no tienen métricas todavía y quedaron fuera del ranking. ` +
      "No saques conclusiones sobre ellas ni las trates como piezas con cero.",
  };
}
