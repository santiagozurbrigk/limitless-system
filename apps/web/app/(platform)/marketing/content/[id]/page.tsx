import { notFound } from "next/navigation";
import { getContentPieceAction, getContentPiecesAction } from "@/app/marketing/content/actions";
import { listReelVariationJobsForPieceAction } from "@/app/marketing/content/reel-variation-actions";

// Las Server Actions llamadas desde esta ruta pueden tardar hasta 5 minutos
// (descarga de video desde Drive + subida a Supabase Storage en archivos grandes).
export const maxDuration = 300;
import { MarketingContentDetailPageClient } from "@/components/marketing/marketing-content-detail-page-client";
import { AvisoDeLecturaFallida } from "@/components/shared/aviso-de-lectura-fallida";
import { EmptyState } from "@/components/shared/empty-state";
import type { ContentMetrics, ContentPiece } from "@/types/content";

function computeOrgAvgMetrics(pieces: ContentPiece[]): ContentMetrics | null {
  const withMetrics = pieces.filter((p) => p.metrics);
  if (withMetrics.length === 0) return null;

  const sum = withMetrics.reduce(
    (acc, p) => ({
      views: (acc.views ?? 0) + (p.metrics?.views ?? 0),
      reach: (acc.reach ?? 0) + (p.metrics?.reach ?? 0),
      impressions: (acc.impressions ?? 0) + (p.metrics?.impressions ?? 0),
      likes: (acc.likes ?? 0) + (p.metrics?.likes ?? 0),
      comments: (acc.comments ?? 0) + (p.metrics?.comments ?? 0),
      shares: (acc.shares ?? 0) + (p.metrics?.shares ?? 0),
      saves: (acc.saves ?? 0) + (p.metrics?.saves ?? 0),
    }),
    {} as ContentMetrics
  );

  const n = withMetrics.length;
  return {
    views: Math.round((sum.views ?? 0) / n),
    reach: Math.round((sum.reach ?? 0) / n),
    impressions: Math.round((sum.impressions ?? 0) / n),
    likes: Math.round((sum.likes ?? 0) / n),
    comments: Math.round((sum.comments ?? 0) / n),
    shares: Math.round((sum.shares ?? 0) / n),
    saves: Math.round((sum.saves ?? 0) / n),
  };
}

export default async function MarketingContentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Las lecturas devuelven su error como valor (SCRUM-502). Antes cualquier
  // falla de la base se mostraba como 404; ahora el 404 es sólo para una pieza
  // que no existe en la organización y una falla muestra el motivo.
  const resultado = await getContentPieceAction(id);
  if (!resultado.success) {
    return (
      <div className="p-6">
        <EmptyState title="No se pudo cargar la pieza" description={resultado.error} />
      </div>
    );
  }
  const data = resultado.data;
  if (!data) notFound();

  // Las piezas de la org (para el promedio) y los Trial Reels no bloquean el
  // detalle, pero si fallan se avisa en vez de mostrar "sin datos". Los Trial
  // Reels se buscan por el ID interno: `id` puede ser el de la plataforma.
  const [piezas, trabajos] = await Promise.all([
    getContentPiecesAction({ limit: 50 }),
    listReelVariationJobsForPieceAction(data.id),
  ]);
  const orgAvg = piezas.success ? computeOrgAvgMetrics(piezas.data) : null;

  return (
    <>
      {!piezas.success || !trabajos.success ? (
        <div className="space-y-2 px-6 pt-6">
          {!piezas.success ? (
            <AvisoDeLecturaFallida
              titulo="No se pudo calcular el promedio de la organización."
              motivo={piezas.error}
            />
          ) : null}
          {!trabajos.success ? (
            <AvisoDeLecturaFallida
              titulo="No se pudieron cargar los Trial Reels."
              motivo={trabajos.error}
            />
          ) : null}
        </div>
      ) : null}
      <MarketingContentDetailPageClient
        piece={data}
        variants={data.variants ?? []}
        orgAvg={orgAvg}
        initialReelJobs={trabajos.success ? trabajos.data : []}
      />
    </>
  );
}
