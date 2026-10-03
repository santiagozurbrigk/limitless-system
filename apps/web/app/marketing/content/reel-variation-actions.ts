"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth/bootstrap";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getGoogleAccessTokenForOrganization } from "@/lib/google/get-access-token";
import {
  getQStashClient,
  getPublicAppUrl,
  getQueueFailureCallbackUrl,
  getReelVariationPublishUrl,
} from "@/lib/queue/qstash-client";
import { callClaudeJson } from "@/lib/ai/anthropic";
import type { ReelVariationJob, ReelVariation, ReelVariationType } from "@/types/reel-variations";
import type { ContentPiece } from "@/types/content";
import { paths } from "@/routes";
import { isOrgStoragePath, soloRutasDeLaOrg } from "@/lib/storage/org-path";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function requireOrgId(): Promise<string> {
  const profile = await getCurrentProfile();
  if (!profile?.organization_id) throw new Error("Sesión no válida");
  return profile.organization_id;
}

// El video ya NO se descarga en Vercel — el worker lo descarga directamente de Drive.
// Solo se usa MAX_VIDEO_BYTES para validar el tamaño reportado por la API de Drive.
const MAX_VIDEO_BYTES = 500 * 1024 * 1024; // 500 MB
const STORAGE_BUCKET = "trial-reels"; // usado en publicación y refresh de URLs

// ─── Crear job ────────────────────────────────────────────────────────────────

export type CreateTrialReelsResult =
  | { ok: true; jobId: string }
  | { ok: false; errorCode: string; message: string };

export async function createTrialReelsJobAction(
  contentPieceId: string
): Promise<CreateTrialReelsResult> {
  try {
    const organizationId = await requireOrgId();
    const supabase = await createClient();

    // 1. Leer la pieza de contenido
    const { data: piece, error: pieceError } = await supabase
      .from("content_pieces")
      .select("id, drive_file_id, title, caption, status, type")
      .eq("id", contentPieceId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (pieceError) throw new Error(pieceError.message);
    if (!piece) throw new Error("Pieza de contenido no encontrada");
    if (!piece.drive_file_id) {
      return {
        ok: false,
        errorCode: "NO_DRIVE_FILE",
        message:
          "Esta pieza no tiene un archivo de Drive vinculado. Vinculá el video original primero.",
      };
    }

    // 2. Obtener token de Google
    const accessToken = await getGoogleAccessTokenForOrganization(organizationId);
    if (!accessToken) {
      return {
        ok: false,
        errorCode: "GOOGLE_NOT_CONNECTED",
        message: "Conectá Google Drive en Integraciones para usar esta función.",
      };
    }

    // 3. Obtener solo metadatos del archivo de Drive (sin descargar el video)
    //    El worker descarga directamente usando el access token.
    let driveMimeType: string;
    let driveFileName: string;

    try {
      const metaUrl = new URL(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(piece.drive_file_id)}`
      );
      metaUrl.searchParams.set("fields", "id,name,mimeType,size");
      metaUrl.searchParams.set("supportsAllDrives", "true");

      const metaRes = await fetch(metaUrl.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!metaRes.ok) {
        const code = metaRes.status;
        throw new Error(
          code === 401 || code === 403 ? "GOOGLE_INSUFFICIENT_PERMISSIONS" : `Error metadatos Drive (${code})`
        );
      }
      const meta = (await metaRes.json()) as { name: string; mimeType: string; size?: string };
      driveMimeType = meta.mimeType;
      driveFileName = meta.name;

      const fileSize = meta.size ? Number.parseInt(meta.size, 10) : 0;
      if (fileSize > MAX_VIDEO_BYTES) {
        return { ok: false, errorCode: "FILE_TOO_LARGE", message: "El video supera el límite de 500 MB" };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al leer metadatos";
      if (msg === "GOOGLE_NOT_CONNECTED" || msg === "GOOGLE_INSUFFICIENT_PERMISSIONS") {
        return { ok: false, errorCode: msg, message: "Sin acceso a Google Drive" };
      }
      return { ok: false, errorCode: "DRIVE_META_FAILED", message: msg };
    }

    // 4. Leer reel_music_path de la org (música personalizada para la variante "music")
    const admin = createAdminClient();
    const { data: orgRow } = await admin
      .from("organizations")
      .select("reel_music_path")
      .eq("id", organizationId)
      .maybeSingle();
    // SCRUM-81: sólo una música de la propia org; si no, la del worker por defecto.
    const reelMusicPath: string | null =
      soloRutasDeLaOrg([orgRow?.reel_music_path as string | null | undefined], organizationId, "reel-music")[0] ??
      null;

    // 5. Crear el job en DB
    //    El video fuente lo descarga el worker directamente de Drive.
    const jobId = crypto.randomUUID();

    const { error: insertError } = await admin
      .from("reel_variation_jobs")
      .insert({
        id: jobId,
        organization_id: organizationId,
        source_piece_id: contentPieceId,
        status: "pending",
        delay_hours: 2,
        variations: [],
      });

    if (insertError) {
      throw new Error(`Error al crear job: ${insertError.message}`);
    }

    // 6. Publicar en QStash → worker de Fly.io
    const client = getQStashClient();
    if (client) {
      const workerBaseUrl = getReelWorkerUrl();
      const workerAuthSecret = process.env.WORKER_AUTH_SECRET?.trim();

      // Incluir el secret en la URL como query param — QStash nunca stripea query params,
      // a diferencia del header Authorization que algunos proxies pueden bloquear.
      const workerUrl = workerAuthSecret
        ? `${workerBaseUrl}?workerSecret=${encodeURIComponent(workerAuthSecret)}`
        : workerBaseUrl;

      console.log("[TrialReels] publishing to QStash", {
        jobId,
        workerUrl: workerBaseUrl, // No loggear el secret completo en la URL
        hasWorkerAuthSecret: Boolean(workerAuthSecret),
      });
      try {
        const qstashResult = await client.publishJSON({
          url: workerUrl,
          body: {
            jobId,
            organizationId,
            sourcePieceId: contentPieceId,
            driveFileId: piece.drive_file_id,
            driveAccessToken: accessToken,
            driveMimeType: driveMimeType,
            sourceFileName: driveFileName,
            originalCaption: (piece as ContentPiece & { caption?: string }).caption ?? piece.title ?? null,
            reelMusicPath,
          },
          // Pasar el secret también en headers (múltiples métodos para robustez).
          // X-Worker-Secret: nunca stripped por proxies.
          // Authorization: método original como fallback.
          headers: workerAuthSecret
            ? {
                "X-Worker-Secret": workerAuthSecret,
                Authorization: `Bearer ${workerAuthSecret}`,
              }
            : undefined,
          retries: 2,
          timeout: 900, // 15 min — FFmpeg puede tardar
          failureCallback: getQueueFailureCallbackUrl(),
        });
        console.log("[TrialReels] QStash published OK", { jobId, messageId: qstashResult.messageId, workerUrl });
      } catch (qstashErr) {
        // Si QStash falla al publicar, marcar el job como failed en DB
        // para que el usuario vea el error en vez de quedar en "pending" indefinidamente.
        const qstashMsg = qstashErr instanceof Error ? qstashErr.message : String(qstashErr);
        console.error("[TrialReels] QStash publish failed", { jobId, workerUrl, error: qstashMsg });
        await admin
          .from("reel_variation_jobs")
          .update({
            status: "failed",
            error_message: `Error al enviar al worker: ${qstashMsg}`,
          })
          .eq("id", jobId);
        return { ok: false, errorCode: "QSTASH_FAILED", message: `Error al enviar al worker: ${qstashMsg}` };
      }
    } else {
      // Sin QStash en dev: marcar como fallido con mensaje amigable
      console.warn("[TrialReels] QSTASH_TOKEN no configurado — job marcado como failed", { jobId });
      await admin
        .from("reel_variation_jobs")
        .update({
          status: "failed",
          error_message: "QStash no está configurado (modo desarrollo)",
        })
        .eq("id", jobId);
    }

    revalidatePath(paths.platform.marketing.content);

    return { ok: true, jobId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    console.error("[TrialReels] createTrialReelsJobAction error", { message });
    return { ok: false, errorCode: "UNKNOWN", message };
  }
}

function getReelWorkerUrl(): string {
  const fromEnv = process.env.REEL_WORKER_URL?.trim();
  if (fromEnv) return fromEnv;
  // Fallback: endpoint en la propia app Next.js (útil en dev sin Fly.io)
  return `${getPublicAppUrl()}/api/queue/process-reel-variations`;
}

// ─── Leer job ─────────────────────────────────────────────────────────────────

export async function getReelVariationJobAction(
  jobId: string
): Promise<ReelVariationJob | null> {
  const organizationId = await requireOrgId();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("reel_variation_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as ReelVariationJob | null;
}

export async function listReelVariationJobsForPieceAction(
  contentPieceId: string
): Promise<ReelVariationJob[]> {
  const organizationId = await requireOrgId();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("reel_variation_jobs")
    .select("*")
    .eq("source_piece_id", contentPieceId)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) throw new Error(error.message);
  return (data ?? []) as ReelVariationJob[];
}

// ─── Editar variante ──────────────────────────────────────────────────────────

export async function updateReelVariationAction(
  jobId: string,
  variationIndex: number,
  patch: Partial<Pick<ReelVariation, "description" | "hashtags" | "included">>
): Promise<void> {
  const organizationId = await requireOrgId();
  const supabase = await createClient();

  // Leer variantes actuales
  const { data: job, error: readErr } = await supabase
    .from("reel_variation_jobs")
    .select("variations")
    .eq("id", jobId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (readErr) throw new Error(readErr.message);
  if (!job) throw new Error("Job no encontrado");

  const variations = (job.variations ?? []) as ReelVariation[];
  if (variationIndex < 0 || variationIndex >= variations.length) {
    throw new Error("Índice de variante inválido");
  }

  // Sólo los campos editables: el patch llega del cliente y, esparcido entero,
  // podía pisar `storage_path` con un archivo de otra org que después se firma
  // con service role.
  const safePatch: Partial<Pick<ReelVariation, "description" | "hashtags" | "included">> = {};
  if (typeof patch?.description === "string") safePatch.description = patch.description.slice(0, 5000);
  if (Array.isArray(patch?.hashtags)) {
    safePatch.hashtags = patch.hashtags.filter((h): h is string => typeof h === "string").slice(0, 60);
  }
  if (typeof patch?.included === "boolean") safePatch.included = patch.included;

  variations[variationIndex] = { ...variations[variationIndex], ...safePatch };

  const { error: updateErr } = await supabase
    .from("reel_variation_jobs")
    .update({ variations })
    .eq("id", jobId)
    .eq("organization_id", organizationId);

  if (updateErr) throw new Error(updateErr.message);
}

export async function setReelVariationDelayAction(
  jobId: string,
  delayHours: number
): Promise<void> {
  const organizationId = await requireOrgId();
  const supabase = await createClient();

  const { error } = await supabase
    .from("reel_variation_jobs")
    .update({ delay_hours: delayHours })
    .eq("id", jobId)
    .eq("organization_id", organizationId)
    .eq("status", "preview_ready"); // Solo si aún no se publicó

  if (error) throw new Error(error.message);
}

// ─── Publicar variantes ───────────────────────────────────────────────────────

export type PublishVariationsResult =
  | { ok: true; scheduled: number }
  | { ok: false; message: string };

/**
 * Encola cada variante incluida en QStash con el delay real configurado.
 * - Variante en posición 0 → delay 0 (inmediata)
 * - Variante en posición 1 → delay delay_hours * 3600 segundos
 * - Variante en posición N → delay N * delay_hours * 3600 segundos
 *
 * El endpoint /api/queue/publish-reel-variation procesa cada una y actualiza la DB.
 * Esta acción retorna inmediatamente sin esperar a que se publiquen.
 */
export async function publishVariationsAction(
  jobId: string
): Promise<PublishVariationsResult> {
  try {
    const organizationId = await requireOrgId();
    const admin = createAdminClient();

    // 1. Leer job con admin
    const { data: job, error: jobErr } = await admin
      .from("reel_variation_jobs")
      .select("*")
      .eq("id", jobId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (jobErr) throw new Error(jobErr.message);
    if (!job) throw new Error("Job no encontrado");
    if (job.status !== "preview_ready") {
      return {
        ok: false,
        message: `El job está en estado '${job.status}', esperado 'preview_ready'`,
      };
    }

    const variations = (job.variations ?? []) as ReelVariation[];
    const delayHours = (job.delay_hours as number) ?? 0;

    // 2. Marcar las variantes incluidas como "scheduled" y el job como "publishing"
    const updatedVariations = variations.map((v) =>
      v.included && v.status === "ready"
        ? { ...v, status: "scheduled" as const }
        : v
    );

    await admin
      .from("reel_variation_jobs")
      .update({ status: "publishing", variations: updatedVariations })
      .eq("id", jobId);

    // 3. Publicar mensajes en QStash con delay real por posición
    const qstashClient = getQStashClient();
    const publishUrl = getReelVariationPublishUrl();
    const workerAuthSecret = process.env.WORKER_AUTH_SECRET?.trim();

    // URL con secret en query param (QStash nunca stripea query params)
    const urlWithSecret = workerAuthSecret
      ? `${publishUrl}?workerSecret=${encodeURIComponent(workerAuthSecret)}`
      : publishUrl;

    let scheduled = 0;
    let position = 0; // posición entre las variantes incluidas (para el delay)

    for (let i = 0; i < variations.length; i++) {
      const variation = variations[i];
      if (!variation.included || variation.status !== "ready") continue;

      const delaySecs = position * delayHours * 3600; // 0 para la primera
      position++;

      if (qstashClient) {
        try {
          const publishResult = await qstashClient.publishJSON({
            url: urlWithSecret,
            body: { jobId, variationIndex: i, organizationId },
            headers: workerAuthSecret
              ? {
                  "X-Worker-Secret": workerAuthSecret,
                  Authorization: `Bearer ${workerAuthSecret}`,
                }
              : undefined,
            delay: delaySecs > 0 ? delaySecs : undefined,
            retries: 2,
            failureCallback: getQueueFailureCallbackUrl(),
          });
          console.log("[TrialReels] variation enqueued", {
            jobId,
            variationIndex: i,
            type: variation.type,
            delaySecs,
            messageId: publishResult.messageId,
          });
          scheduled++;
        } catch (qErr) {
          const msg = qErr instanceof Error ? qErr.message : String(qErr);
          console.error("[TrialReels] failed to enqueue variation", {
            jobId,
            variationIndex: i,
            error: msg,
          });
          // Marcar esta variante como fallida directamente en DB
          const fresh = await admin
            .from("reel_variation_jobs")
            .select("variations")
            .eq("id", jobId)
            .maybeSingle();
          if (fresh.data) {
            const vars = [...((fresh.data.variations ?? []) as ReelVariation[])];
            vars[i] = { ...vars[i], status: "failed", error: `Error al encolar: ${msg}` };
            await admin
              .from("reel_variation_jobs")
              .update({ variations: vars })
              .eq("id", jobId);
          }
        }
      } else {
        // Sin QStash configurado (dev): marcar directamente como failed con mensaje claro
        console.warn("[TrialReels] QSTASH_TOKEN no configurado — variante sin publicar", {
          jobId,
          variationIndex: i,
        });
        const fresh = await admin
          .from("reel_variation_jobs")
          .select("variations")
          .eq("id", jobId)
          .maybeSingle();
        if (fresh.data) {
          const vars = [...((fresh.data.variations ?? []) as ReelVariation[])];
          vars[i] = {
            ...vars[i],
            status: "failed",
            error: "QStash no está configurado (modo desarrollo)",
          };
          await admin
            .from("reel_variation_jobs")
            .update({ variations: vars })
            .eq("id", jobId);
        }
      }
    }

    revalidatePath(paths.platform.marketing.content);

    return { ok: true, scheduled };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    console.error("[TrialReels] publishVariationsAction error", { jobId, message });
    return { ok: false, message };
  }
}

// ─── Regenerar URL firmadas de preview ────────────────────────────────────────

/**
 * Renueva las signed URLs de preview para todas las variantes de un job.
 * Llamar cuando el usuario abre el panel de preview (las URLs expiran en 1h).
 */
export async function refreshVariationPreviewUrlsAction(
  jobId: string
): Promise<ReelVariationJob | null> {
  const organizationId = await requireOrgId();
  const admin = createAdminClient();

  const { data: job, error } = await admin
    .from("reel_variation_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!job) return null;

  const variations = (job.variations ?? []) as ReelVariation[];
  let changed = false;

  const updated = await Promise.all(
    variations.map(async (v) => {
      if (!v.storage_path || !isOrgStoragePath(v.storage_path, organizationId)) return v;
      const { data } = await admin.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(v.storage_path, 3600);
      if (data?.signedUrl && data.signedUrl !== v.preview_url) {
        changed = true;
        return { ...v, preview_url: data.signedUrl };
      }
      return v;
    })
  );

  if (changed) {
    await admin
      .from("reel_variation_jobs")
      .update({ variations: updated })
      .eq("id", jobId);
  }

  return { ...job, variations: updated } as ReelVariationJob;
}

// ─── Reintentar variante fallida ──────────────────────────────────────────────

export type RetryVariationResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Reencola en QStash una variante que quedó en estado "failed".
 * Idempotente: si ya está en "scheduled" o "published", devuelve ok sin hacer nada.
 */
export async function retryVariationAction(
  jobId: string,
  variationIndex: number
): Promise<RetryVariationResult> {
  try {
    const organizationId = await requireOrgId();
    const admin = createAdminClient();

    const { data: job, error: jobErr } = await admin
      .from("reel_variation_jobs")
      .select("*")
      .eq("id", jobId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (jobErr) throw new Error(jobErr.message);
    if (!job) throw new Error("Job no encontrado");

    const variations = (job.variations ?? []) as ReelVariation[];
    const variation = variations[variationIndex];
    if (!variation) throw new Error("Índice de variante inválido");

    // Idempotencia: solo reintentar si está fallida
    if (variation.status !== "failed") {
      return { ok: true }; // ya está en otro estado, no hacer nada
    }

    // Marcar como "scheduled" y limpiar error previo
    const updatedVariations = [...variations];
    updatedVariations[variationIndex] = {
      ...variation,
      status: "scheduled",
      error: null,
    };

    await admin
      .from("reel_variation_jobs")
      .update({
        variations: updatedVariations,
        status: "publishing", // reactivar el job si estaba en "done"
      })
      .eq("id", jobId);

    // Encolar en QStash
    const qstashClient = getQStashClient();
    const publishUrl = getReelVariationPublishUrl();
    const workerAuthSecret = process.env.WORKER_AUTH_SECRET?.trim();
    const urlWithSecret = workerAuthSecret
      ? `${publishUrl}?workerSecret=${encodeURIComponent(workerAuthSecret)}`
      : publishUrl;

    if (qstashClient) {
      await qstashClient.publishJSON({
        url: urlWithSecret,
        body: { jobId, variationIndex, organizationId },
        headers: workerAuthSecret
          ? {
              "X-Worker-Secret": workerAuthSecret,
              Authorization: `Bearer ${workerAuthSecret}`,
            }
          : undefined,
        retries: 2,
        failureCallback: getQueueFailureCallbackUrl(),
      });
      console.log("[TrialReels] variation retry enqueued", { jobId, variationIndex });
    } else {
      // Sin QStash: volver a marcar como failed
      updatedVariations[variationIndex] = {
        ...updatedVariations[variationIndex],
        status: "failed",
        error: "QStash no está configurado (modo desarrollo)",
      };
      await admin
        .from("reel_variation_jobs")
        .update({ variations: updatedVariations })
        .eq("id", jobId);
      return { ok: false, message: "QStash no está configurado" };
    }

    revalidatePath(paths.platform.marketing.content);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    console.error("[TrialReels] retryVariationAction error", { jobId, variationIndex, message });
    return { ok: false, message };
  }
}

// ─── Regenerar caption con IA ─────────────────────────────────────────────────

const VARIANT_TONE: Record<ReelVariationType, string> = {
  speed_up:   "energético y rápido, con frases cortas y dinámicas",
  speed_down: "contemplativo y profundo, con más espacio para reflexionar",
  music:      "emotivo y evocador, conectando con la música de fondo",
  subtitles:  "directo y claro, ideal para quienes ven sin sonido",
  color:      "cálido y cercano, con tono de conversación informal",
};

export type RegenerateCaptionResult =
  | { ok: true; description: string; hashtags: string[] }
  | { ok: false; message: string };

/**
 * Regenera el caption y hashtags de una variante usando Claude Haiku.
 * Mantiene el mensaje original pero adapta el tono al tipo de variante.
 */
export async function regenerateCaptionAction(
  jobId: string,
  variationIndex: number
): Promise<RegenerateCaptionResult> {
  try {
    const organizationId = await requireOrgId();
    const admin = createAdminClient();

    const { data: job, error: jobErr } = await admin
      .from("reel_variation_jobs")
      .select("variations, content_piece_id:source_piece_id")
      .eq("id", jobId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (jobErr) throw new Error(jobErr.message);
    if (!job) throw new Error("Job no encontrado");

    const variations = (job.variations ?? []) as ReelVariation[];
    const variation = variations[variationIndex];
    if (!variation) throw new Error("Índice de variante inválido");

    // Obtener caption original de la pieza de contenido
    const supabase = await createClient();
    const { data: piece } = await supabase
      .from("content_pieces")
      .select("caption, title")
      .eq("id", job.content_piece_id as string)
      .maybeSingle();

    const originalCaption = piece?.caption ?? piece?.title ?? variation.description ?? "Contenido de valor sobre negocio.";
    const tone = VARIANT_TONE[variation.type];

    const result = await callClaudeJson<{ description: string; hashtags: string[] }>({
      organizationId,
      task: "content_labeling",
      feature: "reel_caption_regeneration",
      system: "Sos experto en marketing de contenido para Instagram. Respondé solo JSON, sin texto extra.",
      user: `Tenés este caption original de un reel de Instagram:
<caption>
${originalCaption}
</caption>

Generá una variación del caption para una versión del video con tono: ${tone}.
Mantené el mensaje principal pero adaptá el tono completamente.

Reglas:
- Máximo 150 palabras en description
- Entre 3 y 8 hashtags relevantes
- En español (es-AR), sin emojis en exceso (máximo 2-3)

Respondé con este JSON exacto:
{"description":"El caption completo aquí...","hashtags":["#hashtag1","#hashtag2"]}`,
      maxTokens: 600,
    });

    if (!result?.description) {
      return { ok: false, message: "La IA no devolvió un caption válido" };
    }

    // Guardar en DB
    const updatedVariations = [...variations];
    updatedVariations[variationIndex] = {
      ...variation,
      description: result.description,
      hashtags: result.hashtags ?? [],
    };

    await admin
      .from("reel_variation_jobs")
      .update({ variations: updatedVariations })
      .eq("id", jobId);

    revalidatePath(paths.platform.marketing.content);

    return { ok: true, description: result.description, hashtags: result.hashtags ?? [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    console.error("[TrialReels] regenerateCaptionAction error", { jobId, variationIndex, message });
    return { ok: false, message };
  }
}
