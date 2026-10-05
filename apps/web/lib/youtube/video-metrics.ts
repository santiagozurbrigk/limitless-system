import { parseDuration } from "@/lib/youtube/parse-duration";
import type { ContentMetrics } from "@/types/content";

export type YouTubePlatformMetadata = {
  view_count: number;
  like_count: number;
  comment_count: number;
  favorite_count: number;
  duration_seconds: number;
  definition: string | null;
  published_at: string | null;
  thumbnail_url: string | null;
  tags: string[];
};

type YouTubeVideoItem = {
  id?: string;
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
    favoriteCount?: string;
  };
  contentDetails?: {
    duration?: string;
    definition?: string;
  };
  snippet?: {
    publishedAt?: string;
    thumbnails?: { high?: { url?: string }; medium?: { url?: string } };
    tags?: string[];
  };
};

function toPlatformMetadata(video: YouTubeVideoItem): YouTubePlatformMetadata {
  const durationSeconds = parseDuration(video.contentDetails?.duration);
  return {
    view_count: parseInt(video.statistics?.viewCount ?? "0", 10),
    like_count: parseInt(video.statistics?.likeCount ?? "0", 10),
    comment_count: parseInt(video.statistics?.commentCount ?? "0", 10),
    favorite_count: parseInt(video.statistics?.favoriteCount ?? "0", 10),
    duration_seconds: durationSeconds,
    definition: video.contentDetails?.definition ?? null,
    published_at: video.snippet?.publishedAt ?? null,
    thumbnail_url:
      video.snippet?.thumbnails?.high?.url ??
      video.snippet?.thumbnails?.medium?.url ??
      null,
    tags: video.snippet?.tags ?? [],
  };
}

/** Obtiene statistics + contentDetails para hasta 50 videos por request. */
export async function fetchYouTubeVideoDetails(
  videoIds: string[],
  accessToken?: string,
  apiKey?: string
): Promise<Map<string, YouTubePlatformMetadata>> {
  const result = new Map<string, YouTubePlatformMetadata>();
  if (videoIds.length === 0) return result;

  const chunks: string[][] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    chunks.push(videoIds.slice(i, i + 50));
  }

  for (const chunk of chunks) {
    let url =
      `https://www.googleapis.com/youtube/v3/videos?` +
      `id=${chunk.join(",")}` +
      `&part=statistics,contentDetails,snippet`;
    if (apiKey) {
      url += `&key=${encodeURIComponent(apiKey)}`;
    } else if (accessToken) {
      url += `&access_token=${encodeURIComponent(accessToken)}`;
    }

    const res = await fetch(url);
    if (!res.ok) continue;

    const data = (await res.json()) as { items?: YouTubeVideoItem[] };
    for (const item of data.items ?? []) {
      const id = item.id;
      if (!id) continue;
      result.set(id, toPlatformMetadata(item));
    }
  }

  return result;
}

/**
 * Las métricas de un video para guardar en `content_pieces`. Si YouTube no
 * devolvió el detalle del video (cuota agotada, token vencido), no hay
 * métricas: devuelve un objeto vacío para no pisar las guardadas con ceros
 * (SCRUM-172, fix-pack).
 */
export function metricasDeVideoParaGuardar(
  metadata: YouTubePlatformMetadata | undefined,
  ahora: string
): Partial<{ metrics: ContentMetrics; metrics_updated_at: string }> {
  if (!metadata) return {};
  return {
    metrics: {
      views: metadata.view_count,
      likes: metadata.like_count,
      comments: metadata.comment_count,
      shares: 0,
      saves: 0,
      reach: 0,
      impressions: 0,
    },
    metrics_updated_at: ahora,
  };
}

export function youtubeMetricsToAssetFields(metadata: YouTubePlatformMetadata) {
  return {
    views: metadata.view_count,
    likes: metadata.like_count,
    comments: metadata.comment_count,
    duration_seconds: metadata.duration_seconds,
    thumbnail_url: metadata.thumbnail_url,
    platform_metadata: { youtube: metadata },
  };
}
