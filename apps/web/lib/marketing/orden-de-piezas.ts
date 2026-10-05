import type { ContentMetrics, ContentPiece } from "@/types/content";
import { engagementDe, tieneMetricas } from "./metricas-medidas";

/**
 * Orden de la grilla de contenido (`components/marketing/content-piece-grid.tsx`).
 *
 * ⭐ Al ordenar por views o engagement, las piezas sin métricas (`metrics` null,
 * SCRUM-172) van siempre al final: no se midieron, no son un cero. Un cero
 * medido sí se ordena con las demás piezas medidas.
 */

export type OrdenDePiezas = "reciente" | "views" | "engagement";

// En la base `published_at` y `metrics` pueden llegar en null.
type PiezaOrdenable = {
  published_at?: string | null;
  created_at: ContentPiece["created_at"];
  metrics?: ContentMetrics | null;
};

function fecha(p: PiezaOrdenable): number {
  return new Date(p.published_at || p.created_at).getTime();
}

export function ordenarPiezas<T extends PiezaOrdenable>(piezas: T[], orden: OrdenDePiezas): T[] {
  if (orden === "reciente") {
    // Por published_at desc y, si no hay, por created_at desc.
    return [...piezas].sort((a, b) => fecha(b) - fecha(a));
  }

  const valor = (p: T): number | null => {
    if (!tieneMetricas(p.metrics)) return null;
    return orden === "views" ? (p.metrics.views ?? 0) : engagementDe(p.metrics);
  };

  return [...piezas].sort((a, b) => {
    const va = valor(a);
    const vb = valor(b);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return vb - va;
  });
}
