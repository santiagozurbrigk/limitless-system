import { notFound, unstable_rethrow } from "next/navigation";
import { getContentPieceAction, getContentPiecesAction } from "@/app/marketing/content/actions";
import { listReelVariationJobsForPieceAction } from "@/app/marketing/content/reel-variation-actions";

// Las Server Actions llamadas desde esta ruta pueden tardar hasta 5 minutos
// (descarga de video desde Drive + subida a Supabase Storage en archivos grandes).
export const maxDuration = 300;
import { MarketingContentDetailPageClient } from "@/components/marketing/marketing-content-detail-page-client";
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

  let data: Awaited<ReturnType<typeof getContentPieceAction>>;
  try {
    data = await getContentPieceAction(id);
  } catch (error) {
    // El error con el que Next marca la ruta como dinámica (y los de redirect o
    // notFound) no es una falla: se relanza para que Next lo maneje.
    unstable_rethrow(error);
    notFound();
  }

  // Fetch org pieces y reel jobs en paralelo (no bloqueantes)
  const [allPieces, initialReelJobs] = await Promise.all([
    getContentPiecesAction({ limit: 50 }).catch((error: unknown) => {
      unstable_rethrow(error);
      return [];
    }),
    listReelVariationJobsForPieceAction(id).catch((error: unknown) => {
      unstable_rethrow(error);
      return [];
    }),
  ]);
  const orgAvg = computeOrgAvgMetrics(allPieces);

  return (
    <MarketingContentDetailPageClient
      piece={data}
      variants={data.variants ?? []}
      orgAvg={orgAvg}
      initialReelJobs={initialReelJobs}
    />
  );
}
