import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchYouTubeVideoDetails,
  metricasDeVideoParaGuardar,
  youtubeMetricsToAssetFields,
} from "@/lib/youtube/video-metrics";

type YouTubeAuth =
  | { type: "oauth"; accessToken: string }
  | { type: "api_key"; apiKey: string; channelId: string };

function buildYouTubeUrl(path: string, params: Record<string, string>, auth: YouTubeAuth): string {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (auth.type === "api_key") url.searchParams.set("key", auth.apiKey);
  return url.toString();
}

function authHeaders(auth: YouTubeAuth): HeadersInit {
  if (auth.type === "oauth") return { Authorization: `Bearer ${auth.accessToken}` };
  return {};
}

export async function syncYoutubeChannelAndVideos(
  organizationId: string,
  accessTokenOrAuth: string | YouTubeAuth
): Promise<void> {
  // Backwards-compat: string = OAuth access token
  const auth: YouTubeAuth =
    typeof accessTokenOrAuth === "string"
      ? { type: "oauth", accessToken: accessTokenOrAuth }
      : accessTokenOrAuth;

  const channelParams: Record<string, string> = { part: "snippet,statistics" };
  if (auth.type === "oauth") {
    channelParams.mine = "true";
  } else {
    channelParams.id = auth.channelId;
  }

  const channelRes = await fetch(
    buildYouTubeUrl("channels", channelParams, auth),
    { headers: authHeaders(auth) }
  );
  const channelData = (await channelRes.json()) as {
    items?: {
      id: string;
      snippet?: {
        title?: string;
        thumbnails?: { default?: { url?: string } };
      };
      statistics?: { subscriberCount?: string };
    }[];
  };
  const channel = channelData.items?.[0];

  const admin = createAdminClient();

  const newSubCount = Number(channel?.statistics?.subscriberCount ?? 0);
  const { data: prevYt } = await admin
    .from("youtube_integrations")
    .select("subscriber_count")
    .eq("organization_id", organizationId)
    .maybeSingle();
  const previousSubs = Number(prevYt?.subscriber_count ?? newSubCount);

  await admin
    .from("youtube_integrations")
    .update({
      channel_id: channel?.id ?? null,
      channel_name: channel?.snippet?.title ?? null,
      channel_thumbnail: channel?.snippet?.thumbnails?.default?.url ?? null,
      subscriber_count: newSubCount || null,
      subscriber_delta: Math.max(0, newSubCount - previousSubs),
      last_sync_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId);

  if (!channel?.id) return;

  const searchRes = await fetch(
    buildYouTubeUrl(
      "search",
      { part: "snippet", channelId: channel.id, maxResults: "25", order: "date", type: "video" },
      auth
    ),
    { headers: authHeaders(auth) }
  );
  const searchData = (await searchRes.json()) as {
    items?: {
      id?: { videoId?: string };
      snippet?: {
        title?: string;
        description?: string;
        publishedAt?: string;
        thumbnails?: { medium?: { url?: string } };
      };
    }[];
  };

  const searchItems = searchData.items ?? [];
  const videoIds = searchItems
    .map((item) => item.id?.videoId)
    .filter((id): id is string => Boolean(id));

  const videoDetails = await fetchYouTubeVideoDetails(
    videoIds,
    auth.type === "oauth" ? auth.accessToken : undefined,
    auth.type === "api_key" ? auth.apiKey : undefined
  );
  const now = new Date().toISOString();

  for (const item of searchItems) {
    const videoId = item.id?.videoId;
    if (!videoId) continue;
    const snippet = item.snippet;
    const title = snippet?.title ?? "Video";
    const caption = snippet?.description ?? "";
    const detalle = videoDetails.get(videoId);
    const thumbnailUrl = detalle
      ? youtubeMetricsToAssetFields(detalle).thumbnail_url
      : null;

    await admin.from("content_pieces").upsert(
      {
        organization_id: organizationId,
        type: "youtube",
        source: "google",
        platform: "youtube",
        platform_post_id: videoId,
        platform_post_url: `https://www.youtube.com/watch?v=${videoId}`,
        title,
        caption,
        hashtags: [],
        thumbnail_url: thumbnailUrl ?? snippet?.thumbnails?.medium?.url ?? null,
        published_at: detalle?.published_at ?? snippet?.publishedAt ?? null,
        status: "published",
        // Sin el detalle del video (cuota o token) no se pisan las métricas guardadas con ceros.
        ...metricasDeVideoParaGuardar(detalle, now),
      },
      { onConflict: "organization_id,platform_post_id" }
    );
  }
}
