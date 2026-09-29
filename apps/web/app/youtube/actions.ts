"use server";

import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncYoutubeChannelAndVideos } from "@/lib/google/sync-youtube";
import {
  requireOrgRole,
  ROLES_CONFIG_ORG,
  SIN_PERMISO_CONFIG_ORG,
} from "@/lib/auth/require-org-role";

export type YouTubeApiKeyState = {
  error?: string;
  success?: string;
};

/** Validates the YouTube Data API key + channel ID, then saves it to youtube_integrations. */
export async function connectYoutubeApiKeyAction(
  _prev: YouTubeApiKeyState,
  formData: FormData
): Promise<YouTubeApiKeyState> {
  const organizationId = await requireOrganizationId();
  const apiKey = (formData.get("apiKey") as string | null)?.trim() ?? "";
  const channelId = (formData.get("channelId") as string | null)?.trim() ?? "";

  if (!apiKey) return { error: "Ingresá tu API key de YouTube Data." };
  if (!channelId) return { error: "Ingresá el ID de tu canal de YouTube." };

  // Validate by fetching channel info
  const testUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${encodeURIComponent(channelId)}&key=${encodeURIComponent(apiKey)}`;
  let channelName: string | null = null;
  let channelThumbnail: string | null = null;
  let subscriberCount: number | null = null;
  try {
    const res = await fetch(testUrl);
    if (res.status === 400 || res.status === 403) {
      return { error: "API key inválida o sin permisos para YouTube Data API v3." };
    }
    const data = (await res.json()) as { items?: { id: string; snippet?: { title?: string; thumbnails?: { default?: { url?: string } } }; statistics?: { subscriberCount?: string } }[] };
    if (!data.items || data.items.length === 0) {
      return { error: "No se encontró el canal con ese ID. Revisá que el Channel ID sea correcto." };
    }
    channelName = data.items[0].snippet?.title ?? null;
    channelThumbnail = data.items[0].snippet?.thumbnails?.default?.url ?? null;
    subscriberCount = Number(data.items[0].statistics?.subscriberCount ?? 0) || null;
  } catch {
    return { error: "Error al validar la API key. Revisá tu conexión e intentá de nuevo." };
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { error: upsertError } = await admin
    .from("youtube_integrations")
    .upsert(
      {
        organization_id: organizationId,
        auth_method: "api_key",
        youtube_api_key: apiKey,
        channel_id: channelId,
        channel_name: channelName,
        channel_thumbnail: channelThumbnail,
        subscriber_count: subscriberCount,
        status: "connected",
        last_sync_at: now,
      },
      { onConflict: "organization_id" }
    );

  if (upsertError) {
    console.error("[YouTube API key] upsert error:", upsertError);
    return { error: "Error al guardar la integración. Intentá de nuevo." };
  }

  // Kick off initial sync in background (non-blocking)
  syncYoutubeChannelAndVideos(organizationId, { type: "api_key", apiKey, channelId }).catch(
    (e) => console.error("[YouTube API key] initial sync error:", e)
  );

  return { success: `Canal "${channelName ?? channelId}" conectado correctamente.` };
}

/** Removes the YouTube integration for this org. */
export async function disconnectYoutubeAction(): Promise<{ success: boolean; error?: string }> {
  const organizationId = await requireOrganizationId();
  try {
    await requireOrgRole(ROLES_CONFIG_ORG, SIN_PERMISO_CONFIG_ORG);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : SIN_PERMISO_CONFIG_ORG };
  }
  const admin = createAdminClient();

  const { error } = await admin
    .from("youtube_integrations")
    .delete()
    .eq("organization_id", organizationId);

  if (error) {
    return { success: false, error: "Error al desconectar YouTube." };
  }
  return { success: true };
}
