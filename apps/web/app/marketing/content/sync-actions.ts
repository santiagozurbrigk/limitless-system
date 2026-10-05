"use server";

import { getCurrentProfile } from "@/lib/auth/bootstrap";
import { createClient } from "@/lib/supabase/server";
import {
  type ZernioPost,
} from "@/lib/zernio/client";
import { getZernioClientForOrganization, getZernioIntegrationForOrg } from "@/lib/zernio/integration";
import { resolvePostAnalytics } from "@/lib/zernio/resolve-analytics";
import {
  cambiosParaActualizar,
  externalPlatformPostId,
  mapExternalPostToRow,
  type ContentPieceSyncRow,
} from "@/lib/zernio/filas-de-contenido";
import { syncContentMetricsForOrg } from "@/lib/marketing/sync-content-metrics";
import {
  persistContentThumbnail,
  isInstagramCdnUrl,
} from "@/lib/marketing/story-thumbnail-storage";

const SYNC_INTERVAL_MS = 30 * 60 * 1000;

function dedupeExternalPosts(posts: ZernioPost[]): ZernioPost[] {
  const seen = new Set<string>();
  const result: ZernioPost[] = [];

  for (const post of posts) {
    const id = externalPlatformPostId(post);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(post);
  }

  return result;
}

async function requireOrganizationId(): Promise<string> {
  const profile = await getCurrentProfile();
  if (!profile?.organization_id) {
    throw new Error("Sesión no válida");
  }
  return profile.organization_id;
}

async function fetchExternalPostsViaSync(
  organizationId: string,
  accountIds: string[]
): Promise<ZernioPost[]> {
  const client = await getZernioClientForOrganization(organizationId);

  // El orden de inserción en allPosts importa: dedupeExternalPosts conserva la
  // PRIMERA ocurrencia de cada ID. Las historias deben entrar ANTES que los posts
  // del listado general para que sus versiones con postType="story" ganen el dedup.
  const allPosts: ZernioPost[] = [];

  // 1) Sincronizar historias PRIMERO con el endpoint dedicado de Zernio:
  //    GET /v1/accounts/{accountId}/instagram/stories
  //    (documentado en docs.zernio.com/instagram/list-instagram-stories)
  //
  //    IMPORTANTE — NO usar GET /posts?type=story como fuente de tipado:
  //    En producción ese filtro devuelve los mismos posts/reels/carruseles del
  //    listado general (el filtro ?type=story de Zernio no filtra correctamente).
  //    Usarlo para etiquetar con postType="story" convertiría todos los reels
  //    en historias. El único endpoint confiable para detectar historias reales
  //    es el dedicado de arriba (filtrado por Meta, ventana de 24 h).
  const storiesResults = await Promise.allSettled(
    accountIds.map(async (accountId) => {
      // Dos fuentes para historias (ambas confiables):
      // a) GET /v1/accounts/{id}/instagram/stories — endpoint oficial (24h window)
      // b) POST /posts/sync-stories — endpoint legacy (retorna 405 en prod → [])
      const [dedicatedResult, syncResult] = await Promise.allSettled([
        client.listInstagramStories(accountId),
        client.syncExternalStories(accountId),
      ]);

      const storiesFromDedicated =
        dedicatedResult.status === "fulfilled" ? (dedicatedResult.value.posts ?? []) : [];
      const storiesFromSync =
        syncResult.status === "fulfilled" ? (syncResult.value.posts ?? []) : [];

      const combined = [
        ...storiesFromDedicated, // mapea con postType="story" garantizado
        ...storiesFromSync,
      ];

      console.info("[syncZernioContent] stories sync", {
        accountId,
        fromDedicatedEndpoint: storiesFromDedicated.length,
        fromLegacySyncEndpoint: storiesFromSync.length,
        combined: combined.length,
      });
      return combined;
    })
  );

  for (const result of storiesResults) {
    if (result.status === "fulfilled") {
      allPosts.push(...result.value);
      continue;
    }
    console.warn("[syncZernioContent] stories sync failed for account", {
      error:
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason),
    });
  }

  // 2) Triggerear sync desde Instagram /me/media (posts, reels, carousels).
  const syncResults = await Promise.allSettled(
    accountIds.map(async (accountId) => {
      const { posts, synced } = await client.syncExternalPosts(accountId);
      console.info("[syncZernioContent] syncExternalPosts", {
        accountId,
        postsFound: synced?.postsFound ?? posts.length,
        postsSynced: synced?.postsSynced ?? posts.length,
        types: posts.map((p) => p.postType ?? p.mediaType ?? "?").slice(0, 10),
      });
      return posts;
    })
  );

  for (const result of syncResults) {
    if (result.status === "fulfilled") {
      allPosts.push(...result.value);
      continue;
    }
    console.warn("[syncZernioContent] syncExternalPosts failed for account", {
      error:
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason),
    });
  }

  // 3) Traer TODOS los posts externos conocidos por Zernio (complementa syncExternalPosts,
  //    que solo toca /me/media de Instagram). Los duplicados de historias ya en allPosts
  //    serán descartados por dedup, preservando sus versiones tipeadas del paso 1.
  const listResults = await Promise.allSettled(
    accountIds.map(async (accountId) => {
      const { posts: listed } = await client.listPublishedPosts({
        source: "external",
        accountId,
        limit: 200,
      });
      const safeList = listed ?? [];
      console.info("[syncZernioContent] listPublishedPosts external", {
        accountId,
        total: safeList.length,
        types: safeList.map((p) => p.postType ?? p.mediaType ?? "?").slice(0, 10),
        storyCount: safeList.filter(
          (p) => (p.postType ?? p.mediaType ?? "").toLowerCase() === "story"
        ).length,
      });
      return safeList;
    })
  );

  for (const result of listResults) {
    if (result.status === "fulfilled") {
      allPosts.push(...result.value);
      continue;
    }
    console.warn("[syncZernioContent] listPublishedPosts failed for account", {
      error:
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason),
    });
  }

  return dedupeExternalPosts(allPosts);
}

export async function syncZernioContentAction(): Promise<{ synced: number }> {
  console.log("[syncZernioContent] throttle check", { reason: "running" });

  const organizationId = await requireOrganizationId();
  const integration = await getZernioIntegrationForOrg(organizationId);

  if (!integration || integration.connected_accounts.length === 0) {
    throw new Error("Zernio no está conectado");
  }

  const contentAccountIds = integration.connected_accounts
    .filter((account) => {
      const platform = account.platform.toLowerCase();
      return platform === "instagram" || platform === "youtube";
    })
    .map((account) => account.accountId);

  if (contentAccountIds.length === 0) {
    throw new Error("No hay cuentas de Instagram o YouTube conectadas en Zernio");
  }

  let posts: ZernioPost[];
  try {
    posts = await fetchExternalPostsViaSync(organizationId, contentAccountIds);
  } catch (error) {
    console.error("[syncZernioContent] fetchExternalPostsViaSync failed", {
      accountIds: contentAccountIds,
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  }

  console.info("[syncZernioContent] synced external posts", {
    total: posts.length,
    accountIds: contentAccountIds,
  });

  if (posts.length > 0) {
    const sample = posts[0];
    const { metrics: sampleMetrics } = resolvePostAnalytics(sample.analytics);
    console.info("[syncZernioContent] post analytics sample", {
      platformPostId: externalPlatformPostId(sample),
      likes: sampleMetrics.likes,
      views: sampleMetrics.views,
      reach: sampleMetrics.reach,
    });
  }

  const metricsUpdatedAt = new Date().toISOString();
  const upsertRows = posts
    .map((post) => mapExternalPostToRow(post, organizationId, metricsUpdatedAt))
    .filter(
      (row): row is ContentPieceSyncRow =>
        row !== null && Boolean(row.platform_post_id?.trim())
    );

  if (upsertRows.length === 0) {
    console.info("[syncZernioContent] no rows to upsert after filtering", {
      fetched: posts.length,
    });
    return { synced: 0 };
  }

  const supabase = await createClient();
  const platformPostIds = upsertRows.map((row) => row.platform_post_id);

  const { data: existingRows, error: existingError } = await supabase
    .from("content_pieces")
    .select("id, platform_post_id")
    .eq("organization_id", organizationId)
    .in("platform_post_id", platformPostIds);

  if (existingError) throw new Error(existingError.message);

  const existingByPlatformId = new Map(
    (existingRows ?? []).map((row) => [row.platform_post_id as string, row.id as string])
  );

  const toInsert = upsertRows.filter(
    (row) =>
      Boolean(row.platform_post_id.trim()) &&
      !existingByPlatformId.has(row.platform_post_id)
  );
  const toUpdate = upsertRows.filter((row) =>
    existingByPlatformId.has(row.platform_post_id)
  );

  /**
   * Persiste la thumbnail de una fila en Supabase Storage si la URL es efímera.
   * Aplica a todos los tipos (posts, reels, carousels, stories).
   */
  async function resolveThumbnailUrl(row: ContentPieceSyncRow): Promise<string | null> {
    const url = row.thumbnail_url;
    if (!url) return null;
    // Si la URL ya está persistida (no es CDN de Instagram), la usamos tal cual
    if (!isInstagramCdnUrl(url)) return url;
    return persistContentThumbnail(
      row.organization_id,
      row.platform_post_id,
      url,
      row.type
    );
  }

  if (toInsert.length > 0) {
    // Persistir thumbnails de todos los tipos antes de insertar.
    // Si la persistencia falla, guardar null en lugar de la URL efímera del CDN de
    // Instagram (que expira en ~1-2hs y generaría errores 403 en el navegador).
    const withPersistedThumbnails = await Promise.all(
      toInsert.map(async (row) => {
        const persistedUrl = await resolveThumbnailUrl(row);
        return { ...row, thumbnail_url: persistedUrl ?? null };
      })
    );

    const { error: insertError } = await supabase
      .from("content_pieces")
      .insert(withPersistedThumbnails);

    if (insertError) throw new Error(insertError.message);
  }

  await Promise.all(
    toUpdate.map(async (row) => {
      const id = existingByPlatformId.get(row.platform_post_id);
      if (!id) return;

      // Si la URL en el sync es efímera (CDN Instagram), persistirla ahora
      // (repara filas existentes que tenían URL expirada)
      const thumbnailUrl = await resolveThumbnailUrl(row);

      const { error } = await supabase
        .from("content_pieces")
        .update(cambiosParaActualizar(row, thumbnailUrl))
        .eq("id", id)
        .eq("organization_id", organizationId);

      if (error) throw new Error(error.message);
    })
  );

  // Refrescar métricas en background por si algún post quedó sin analytics completos.
  void syncContentMetricsForOrg(organizationId).catch((err) => {
    console.error("[syncZernioContent] metrics sync failed", {
      organizationId,
      error: err instanceof Error ? err.message : err,
    });
  });

  return { synced: upsertRows.length };
}

/**
 * Limpia URLs efímeras del CDN de Instagram que quedaron almacenadas en rows existentes.
 * Las URLs CDN de Instagram expiran en ~1-2hs, causando errores 403 en el navegador.
 * Se nulifican en DB → el próximo sync trae URLs frescas y las persiste en Supabase Storage.
 */
async function repairExpiredCdnThumbnails(organizationId: string): Promise<void> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("content_pieces")
    .select("id, thumbnail_url")
    .eq("organization_id", organizationId)
    .not("thumbnail_url", "is", null);

  if (error) {
    console.warn("[repairExpiredCdnThumbnails] error fetching rows", { error: error.message });
    return;
  }

  const expiredIds = (data ?? [])
    .filter((row) => row.thumbnail_url && isInstagramCdnUrl(row.thumbnail_url as string))
    .map((row) => row.id as string);

  if (expiredIds.length === 0) return;

  const { error: updateError } = await supabase
    .from("content_pieces")
    .update({ thumbnail_url: null })
    .in("id", expiredIds)
    .eq("organization_id", organizationId);

  if (updateError) {
    console.warn("[repairExpiredCdnThumbnails] error nulling CDN URLs", { error: updateError.message });
    return;
  }

  console.log("[repairExpiredCdnThumbnails] cleaned up expired CDN URLs", {
    organizationId,
    count: expiredIds.length,
  });
}

export async function maybeSyncZernioContentAction(): Promise<void> {
  const organizationId = await requireOrganizationId();
  const supabase = await createClient();

  // Reparar URLs CDN efímeras vencidas en rows existentes (en background, no bloquea el throttle check)
  void repairExpiredCdnThumbnails(organizationId).catch((err) => {
    console.warn("[maybeSyncZernioContent] repair thumbnails failed", {
      error: err instanceof Error ? err.message : err,
    });
  });

  const { count, error: countError } = await supabase
    .from("content_pieces")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("source", "zernio");

  if (countError) throw new Error(countError.message);

  const { data: latestRow, error: latestError } = await supabase
    .from("content_pieces")
    .select("updated_at")
    .eq("organization_id", organizationId)
    .eq("source", "zernio")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) throw new Error(latestError.message);

  const hasNoData = (count ?? 0) === 0;
  const lastSyncAt = latestRow?.updated_at
    ? new Date(latestRow.updated_at as string).getTime()
    : null;
  const isStale =
    lastSyncAt === null || Date.now() - lastSyncAt > SYNC_INTERVAL_MS;
  const shouldSkip = !hasNoData && !isStale;

  console.log("[syncZernioContent] throttle check", {
    reason: shouldSkip ? "skipped" : "running",
    hasNoData,
    isStale,
    count: count ?? 0,
    latestUpdatedAt: latestRow?.updated_at ?? null,
    lastSyncAtMs: lastSyncAt,
    ageMs: lastSyncAt !== null ? Date.now() - lastSyncAt : null,
    syncIntervalMs: SYNC_INTERVAL_MS,
  });

  if (shouldSkip) return;

  await syncZernioContentAction();
}
