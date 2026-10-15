"use server";

import { getCurrentProfile } from "@/lib/auth/bootstrap";
import { esErrorDeAcceso } from "@/lib/marketing/cola-de-metricas";
import {
  ErrorEsperable,
  FallaDeLaBase,
  mutacionConErroresEsperables,
  registrarFallaDeAccion,
  type MutationResult,
} from "@/lib/server/action-result";
import { createClient } from "@/lib/supabase/server";
import {
  createZernioClient,
  ZernioHttpError,
  type ZernioClient,
  type ZernioPost,
} from "@/lib/zernio/client";
import { getZernioApiKeyForOrganization, getZernioIntegrationForOrg } from "@/lib/zernio/integration";
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

/*
 * Errores como valor (SCRUM-519): las dos acciones devuelven `MutationResult`.
 * Sin sesión, sin Zernio conectado, sin cuentas de contenido o con la clave de
 * Zernio rechazada, el motivo; una falla de la base o de Zernio va a la
 * consola y a Sentry y vuelve con el texto fijo. Antes, si Zernio no respondía
 * ninguna lectura, la sincronización terminaba "bien" con 0 piezas.
 */
const SESION_NO_VALIDA = "Sesión no válida";
const ZERNIO_NO_CONECTADO = "Zernio no está conectado";
const SIN_CUENTAS_DE_CONTENIDO = "No hay cuentas de Instagram o YouTube conectadas en Zernio";
/** 401 o 403 de Zernio: la clave de la org está revocada o sin plan (`esErrorDeAcceso`). */
const ZERNIO_RECHAZO_LA_CLAVE =
  "Zernio rechazó la conexión de tu organización. Volvé a conectarlo desde Integraciones.";

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

/**
 * La organización del perfil, como antes (`[MKT-HOLDING-ORG]`). Si la lectura
 * del perfil falla, `getCurrentProfile` devuelve `null` y se ve como sesión no
 * válida (`[PERFIL-Y-ADDONS-FALLA-COMO-RECHAZO]`).
 */
async function organizacionDelPerfil(): Promise<string> {
  const profile = await getCurrentProfile();
  if (!profile?.organization_id) {
    throw new ErrorEsperable(SESION_NO_VALIDA);
  }
  return profile.organization_id;
}

/**
 * Si ninguna lectura de posts de Zernio (`syncExternalPosts` y
 * `listPublishedPosts`, de todas las cuentas) respondió, la sincronización no
 * trajo nada y no puede terminar como si no hubiera piezas nuevas. Con la
 * clave rechazada (401 o 403), el motivo para reconectar; si no, una falla con
 * el status y sin el cuerpo de la respuesta. Que falle una parte (una cuenta,
 * las historias) sigue siendo un aviso en el log, como antes.
 */
function errorSiZernioNoRespondio(
  resultados: PromiseSettledResult<ZernioPost[]>[]
): Error | null {
  if (resultados.length === 0) return null;
  const motivos: unknown[] = [];
  for (const resultado of resultados) {
    if (resultado.status === "fulfilled") return null;
    motivos.push(resultado.reason);
  }
  if (motivos.some(esErrorDeAcceso)) return new ErrorEsperable(ZERNIO_RECHAZO_LA_CLAVE);
  const primero = motivos[0];
  const detalle =
    primero instanceof ZernioHttpError
      ? `HTTP ${primero.status}`
      : primero instanceof Error
        ? primero.name
        : "sin detalle";
  return new Error(`Zernio no respondió ninguna lectura de posts (${detalle})`);
}

async function fetchExternalPostsViaSync(
  client: ZernioClient,
  accountIds: string[]
): Promise<ZernioPost[]> {
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

  const sinRespuesta = errorSiZernioNoRespondio([...syncResults, ...listResults]);
  if (sinRespuesta) throw sinRespuesta;

  return dedupeExternalPosts(allPosts);
}

async function sincronizarContenido(organizationId: string): Promise<{ synced: number }> {
  const integration = await getZernioIntegrationForOrg(organizationId);

  if (!integration || integration.connected_accounts.length === 0) {
    throw new ErrorEsperable(ZERNIO_NO_CONECTADO);
  }

  const contentAccountIds = integration.connected_accounts
    .filter((account) => {
      const platform = account.platform.toLowerCase();
      return platform === "instagram" || platform === "youtube";
    })
    .map((account) => account.accountId);

  if (contentAccountIds.length === 0) {
    throw new ErrorEsperable(SIN_CUENTAS_DE_CONTENIDO);
  }

  const apiKey = await getZernioApiKeyForOrganization(organizationId);
  if (!apiKey) {
    throw new ErrorEsperable(ZERNIO_NO_CONECTADO);
  }

  let posts: ZernioPost[];
  try {
    posts = await fetchExternalPostsViaSync(createZernioClient(apiKey), contentAccountIds);
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

  if (existingError) throw new FallaDeLaBase(existingError);

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

    if (insertError) throw new FallaDeLaBase(insertError);
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

      if (error) throw new FallaDeLaBase(error);
    })
  );

  // Refrescar métricas en background por si algún post quedó sin analytics completos.
  void syncContentMetricsForOrg(organizationId).catch((err) => {
    registrarFallaDeAccion("[syncZernioContent] métricas en segundo plano", err);
  });

  return { synced: upsertRows.length };
}

export async function syncZernioContentAction(): Promise<MutationResult<{ synced: number }>> {
  return mutacionConErroresEsperables("[syncZernioContent]", async () => {
    console.log("[syncZernioContent] throttle check", { reason: "running" });
    return sincronizarContenido(await organizacionDelPerfil());
  });
}

/**
 * Limpia URLs efímeras del CDN de Instagram que quedaron almacenadas en rows existentes.
 * Las URLs CDN de Instagram expiran en ~1-2hs, causando errores 403 en el navegador.
 * Se nulifican en DB → el próximo sync trae URLs frescas y las persiste en Supabase Storage.
 *
 * Corre en segundo plano (`maybeSyncZernioContentAction` no la espera): si la
 * lectura o la escritura fallan, lanza `FallaDeLaBase` y el `.catch` de quien la
 * llama la registra en la consola y en Sentry (SCRUM-519, AR pasada 1). La
 * sincronización sigue igual: las miniaturas vencidas se reparan en la próxima.
 */
async function repairExpiredCdnThumbnails(organizationId: string): Promise<void> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("content_pieces")
    .select("id, thumbnail_url")
    .eq("organization_id", organizationId)
    .not("thumbnail_url", "is", null);

  if (error) throw new FallaDeLaBase(error);

  const expiredIds = (data ?? [])
    .filter((row) => row.thumbnail_url && isInstagramCdnUrl(row.thumbnail_url as string))
    .map((row) => row.id as string);

  if (expiredIds.length === 0) return;

  const { error: updateError } = await supabase
    .from("content_pieces")
    .update({ thumbnail_url: null })
    .in("id", expiredIds)
    .eq("organization_id", organizationId);

  if (updateError) throw new FallaDeLaBase(updateError);

  console.log("[repairExpiredCdnThumbnails] cleaned up expired CDN URLs", {
    organizationId,
    count: expiredIds.length,
  });
}

/**
 * Sincroniza si no hay piezas de Zernio o si la última tiene más de 30
 * minutos. Devuelve si sincronizó (`false` si se salteó por el intervalo).
 */
export async function maybeSyncZernioContentAction(): Promise<
  MutationResult<{ sincronizo: boolean }>
> {
  return mutacionConErroresEsperables("[maybeSyncZernioContent]", async () => {
    const organizationId = await organizacionDelPerfil();
    const supabase = await createClient();

    // Reparar URLs CDN efímeras vencidas en rows existentes (en background, no bloquea el throttle check)
    void repairExpiredCdnThumbnails(organizationId).catch((err) => {
      registrarFallaDeAccion("[maybeSyncZernioContent] reparar miniaturas", err);
    });

    const { count, error: countError } = await supabase
      .from("content_pieces")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("source", "zernio");

    if (countError) throw new FallaDeLaBase(countError);

    const { data: latestRow, error: latestError } = await supabase
      .from("content_pieces")
      .select("updated_at")
      .eq("organization_id", organizationId)
      .eq("source", "zernio")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestError) throw new FallaDeLaBase(latestError);

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

    if (shouldSkip) return { sincronizo: false };

    await sincronizarContenido(organizationId);
    return { sincronizo: true };
  });
}
