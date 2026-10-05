import type { ContentPiece } from "@/types/content";
import { tieneMetricas } from "./metricas-medidas";

/**
 * Cálculos del reporte de patrones de contenido
 * (`app/marketing/content/pattern-report-actions.ts`). Viven acá porque un
 * archivo "use server" sólo puede exportar funciones async.
 *
 * ⭐ Una pieza sin métricas (`metrics` null, SCRUM-172) cuenta para la
 * frecuencia de un formato o hook, pero no para sus promedios: no se midió, no
 * es un cero. Y a la IA se le dice "sin métricas todavía", nunca "0 views".
 */

export type PatternRankedItem = {
  value: string;
  label: string;
  count: number;
  /** Cuántas de las `count` piezas tienen métricas; los promedios salen de éstas. */
  con_metricas?: number;
  /** Sin dato si ninguna pieza del ítem tiene métricas. */
  avg_views?: number;
  avg_saves?: number;
};

export function rankItems<T extends string>(
  pieces: ContentPiece[],
  field: keyof ContentPiece,
  labels: Record<T, string>
): PatternRankedItem[] {
  const counts = new Map<T, { count: number; medidas: number; views: number; saves: number }>();

  for (const piece of pieces) {
    const val = piece[field] as T | undefined;
    if (!val) continue;
    const existing = counts.get(val) ?? { count: 0, medidas: 0, views: 0, saves: 0 };
    existing.count += 1;
    if (tieneMetricas(piece.metrics)) {
      existing.medidas += 1;
      existing.views += piece.metrics.views ?? piece.metrics.reach ?? 0;
      existing.saves += piece.metrics.saves ?? 0;
    }
    counts.set(val, existing);
  }

  return Array.from(counts.entries())
    .sort(([, a], [, b]) => b.count - a.count)
    .map(([value, stats]) => ({
      value,
      label: labels[value] ?? value,
      count: stats.count,
      con_metricas: stats.medidas,
      ...(stats.medidas > 0
        ? {
            avg_views: Math.round(stats.views / stats.medidas),
            avg_saves: Math.round(stats.saves / stats.medidas),
          }
        : {}),
    }));
}

function resumenDeFormato(f: PatternRankedItem): string {
  if (f.avg_views === undefined) {
    return `  - ${f.label}: ${f.count} piezas, sin métricas todavía`;
  }
  const medidas =
    f.con_metricas !== undefined && f.con_metricas < f.count
      ? ` (promedio de ${f.con_metricas} con métricas)`
      : "";
  return `  - ${f.label}: ${f.count} piezas, ${f.avg_views.toLocaleString("es-AR")} views promedio${medidas}`;
}

function lineaDePiezaAnalizada(p: ContentPiece): string {
  const encabezado = `- "${p.analysis?.dolor?.name ?? "—"}" / "${p.analysis?.angulo?.name ?? "—"}" →`;
  if (!tieneMetricas(p.metrics)) return `${encabezado} sin métricas todavía`;
  return `${encabezado} ${(p.metrics.views ?? 0).toLocaleString("es-AR")} views, ${p.metrics.saves ?? 0} guardados, ${p.metrics.likes ?? 0} likes`;
}

export function buildPatternPrompt(
  pieces: ContentPiece[],
  topFormats: PatternRankedItem[],
  topHooks: PatternRankedItem[],
  rangeDescription: string
): string {
  const withAnalysis = pieces.filter((p) => p.analysis);
  const withFormatType = pieces.filter((p) => p.format_type);
  const withMetrics = pieces.filter((p) => tieneMetricas(p.metrics));

  const formatSummary = topFormats.slice(0, 5).map(resumenDeFormato).join("\n");

  const hookSummary = topHooks
    .slice(0, 5)
    .map((h) => `  - ${h.label}: ${h.count} piezas`)
    .join("\n");

  // El top se ordena sólo entre las piezas medidas; las que no tienen métricas
  // van después, marcadas, si sobra lugar.
  const puntaje = (p: ContentPiece) =>
    tieneMetricas(p.metrics) ? (p.metrics.views ?? 0) + (p.metrics.saves ?? 0) : 0;
  const analizadasMedidas = withAnalysis
    .filter((p) => tieneMetricas(p.metrics))
    .sort((a, b) => puntaje(b) - puntaje(a));
  const analizadasSinMetricas = withAnalysis.filter((p) => !tieneMetricas(p.metrics));
  const topAnalyzed = [...analizadasMedidas, ...analizadasSinMetricas]
    .slice(0, 8)
    .map(lineaDePiezaAnalizada)
    .join("\n");

  return `Sos un estratega de contenido senior. Analizá los patrones del contenido publicado en el rango ${rangeDescription}.

DATOS DEL RANGO:
- Piezas analizadas: ${pieces.length} publicadas, ${withAnalysis.length} con análisis IA, ${withFormatType.length} con formato clasificado
- Piezas con métricas: ${withMetrics.length} de ${pieces.length} (las demás todavía no se midieron: no las tomes como piezas con cero)

FORMATOS MÁS USADOS:
${formatSummary || "  (sin clasificación disponible)"}

HOOKS MÁS USADOS:
${hookSummary || "  (sin clasificación disponible)"}

TOP CONTENIDOS POR ENGAGEMENT (dolor / ángulo → métricas):
${topAnalyzed || "  (sin análisis disponibles aún)"}

INSTRUCCIONES:
1. Escribí un RESUMEN de 2-3 párrafos con observaciones sobre los patrones: qué formatos dominan, qué dolores resuenan más, qué combinaciones generan más engagement. Usá lenguaje de hipótesis: "parecería que", "los datos sugieren", "podría indicar".
2. Escribí SUGERENCIAS concretas para el próximo período. Usá siempre lenguaje de recomendación suave: "convendría probar", "vale la pena explorar", "podría funcionar bien". NUNCA usés "tenés que", "hacé", "es obligatorio" ni lenguaje imperativo.
3. Escribí NOTAS DE MUESTRA con advertencias de calidad de datos si aplica (poca muestra, bajo porcentaje con análisis IA, etc.).

Respondé en JSON exactamente así:
{
  "summary": "2-3 párrafos de observaciones",
  "suggestions": "sugerencias en 3-5 puntos, con viñetas usando guión",
  "sample_size_notes": "advertencias sobre la calidad de la muestra (o cadena vacía si no hay advertencias)"
}`;
}
