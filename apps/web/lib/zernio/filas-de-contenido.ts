import type { ZernioPost } from "@/lib/zernio/client";
import {
  camposDeMetricasParaActualizar,
  metricasParaGuardar,
} from "@/lib/zernio/metricas-para-guardar";
import type {
  ContentMetrics,
  ContentPieceSource,
  ContentPieceStatus,
  ContentPieceType,
} from "@/types/content";

/**
 * Cómo un post de Zernio se convierte en una fila de `content_pieces` (insert)
 * y qué campos se actualizan en una pieza que ya existe. Sale de
 * `app/marketing/content/sync-actions.ts` para poder testearlo (SCRUM-172).
 */

export type ContentPieceSyncRow = {
  organization_id: string;
  type: ContentPieceType;
  source: ContentPieceSource;
  platform: string;
  platform_post_id: string;
  platform_post_url: string | null;
  title: string | null;
  caption: string | null;
  hashtags: string[];
  thumbnail_url: string | null;
  published_at: string | null;
  status: ContentPieceStatus;
  metrics: ContentMetrics | null;
  metrics_updated_at: string | null;
};

export function mapZernioType(
  platform: string,
  postType?: string,
  mediaType?: string
): ContentPieceType {
  if (platform === "youtube") return "youtube";
  const resolvedType = postType ?? mediaType;
  if (resolvedType === "reel" || resolvedType === "video") return "reel";
  if (resolvedType === "story") return "story";
  if (resolvedType === "carousel" || resolvedType === "album") return "carousel";
  return "post";
}

function isZernioInternalId(id: string): boolean {
  return /^[a-f0-9]{24}$/i.test(id);
}

export function externalPlatformPostId(post: ZernioPost): string | null {
  const platformPostId = post.platformPostId?.trim();
  if (platformPostId) return platformPostId;

  const fallback = post.id ?? post._id;
  if (!fallback) return null;

  const id = String(fallback).trim();
  if (!id) return null;

  // Para posts/reels/carousels descartamos IDs internos de Zernio (MongoDB ObjectID)
  // ya que siempre deben tener un platformPostId de Instagram/YouTube.
  // Para historias (stories) Instagram asigna IDs numéricos que Zernio puede guardar
  // solo en `id`/`_id`; si es MongoDB-shaped lo prefijamos para no confundirlo con
  // IDs reales de Instagram pero aun así lo persistimos.
  const postType = (post.postType ?? post.mediaType ?? "").toLowerCase();
  if (postType === "story" && isZernioInternalId(id)) {
    return `zstory_${id}`;
  }

  if (isZernioInternalId(id)) return null;

  return id;
}

export function mapExternalPostToRow(
  post: ZernioPost,
  organizationId: string,
  metricsUpdatedAt: string
): ContentPieceSyncRow | null {
  const platform = post.platform?.trim().toLowerCase();
  if (!platform || (platform !== "instagram" && platform !== "youtube")) {
    return null;
  }

  const platformPostId = externalPlatformPostId(post);
  if (!platformPostId) return null;

  const postType = post.postType?.trim();
  const mediaType = post.mediaType?.trim();
  // Sin números reconocibles quedan en null: no se inventa un cero (SCRUM-172).
  const { metrics, metrics_updated_at } = metricasParaGuardar(post.analytics, metricsUpdatedAt);

  return {
    organization_id: organizationId,
    type: mapZernioType(platform, postType, mediaType),
    source: "zernio",
    platform,
    platform_post_id: platformPostId,
    platform_post_url: post.platformPostUrl?.trim() || null,
    title: post.title?.trim() || null,
    caption: post.content?.trim() || null,
    hashtags: Array.isArray(post.hashtags) ? post.hashtags : [],
    thumbnail_url: post.thumbnailUrl?.trim() || null,
    published_at: post.publishedAt ?? post.createdAt ?? null,
    status: "published",
    metrics,
    metrics_updated_at,
  };
}

/** Los campos que la sync actualiza en una pieza existente. */
export function cambiosParaActualizar(row: ContentPieceSyncRow, thumbnailUrl: string | null) {
  return {
    type: row.type,
    platform: row.platform,
    platform_post_url: row.platform_post_url,
    title: row.title,
    caption: row.caption,
    hashtags: row.hashtags,
    thumbnail_url: thumbnailUrl,
    published_at: row.published_at,
    status: row.status,
    // Si Zernio no mandó números reconocibles, las métricas guardadas no se tocan.
    ...camposDeMetricasParaActualizar(row),
  };
}
