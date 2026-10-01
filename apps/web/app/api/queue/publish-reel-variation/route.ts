/**
 * Endpoint de cola: publica UNA variante de Trial Reels en Zernio.
 *
 * Disparado por QStash con delay real (configurado en publishVariationsAction).
 * La primera variante puede enviarse con delay=0 (publicación inmediata),
 * las siguientes con delay=N*delay_hours*3600 segundos.
 *
 * Auth: WORKER_AUTH_SECRET (primario) o QStash signature (fallback).
 *
 * Payload QStash:
 *   { jobId, variationIndex, organizationId }
 *
 * Idempotente: si variation.status !== "scheduled", responde 200 sin hacer nada.
 *
 * Flujo de publicación:
 *   1. Descargar video desde Supabase Storage (URL firmada)
 *   2. Subir a Zernio via presigned URL → obtener fileUrl permanente
 *   3. Crear post en Zernio con mediaItems: [{ type: "video", url: fileUrl }]
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyQueueRequest } from "@/lib/queue/verify-queue-request";
import { sendTrialReelsDoneEmail } from "@/lib/email";
import { getPublicAppUrl } from "@/lib/queue/qstash-client";
import type { ReelVariation } from "@/types/reel-variations";
import type { ZernioClient, ZernioMediaPresignResponse } from "@/lib/zernio/client";
import { brand } from "@/lib/brand";
import { assertOrgStoragePath } from "@/lib/storage/org-path";

export const runtime = "nodejs";
// 60s: descarga de Supabase + upload a Zernio + createPost puede tardar 30-50s
export const maxDuration = 60;

// ─── Schema ───────────────────────────────────────────────────────────────────

const payloadSchema = z.object({
  jobId: z.string().uuid(),
  variationIndex: z.number().int().min(0).max(9),
  organizationId: z.string().uuid(),
});

// ─── Helper: upload de video a Zernio ────────────────────────────────────────

/**
 * Descarga el video desde Supabase Storage y lo sube al storage de Zernio
 * usando el flujo de presigned URL.
 * Retorna la fileUrl permanente para usar en mediaItems del post.
 */
async function uploadVideoToZernio(
  zernioClient: ZernioClient,
  supabaseSignedUrl: string,
  storagePath: string
): Promise<string> {
  // Extraer nombre de archivo del storage path (ej: "org-id/job-id/speed_up.mp4")
  const filename = storagePath.split("/").pop() ?? "variante.mp4";
  const contentType = "video/mp4";

  // 1. Obtener URL presignada de Zernio
  let presign: ZernioMediaPresignResponse;
  try {
    presign = await zernioClient.getMediaPresignedUrl(filename, contentType);
  } catch (err) {
    throw new Error(
      `Error al obtener URL de upload de Zernio: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!presign.uploadUrl || !presign.fileUrl) {
    throw new Error("Zernio no devolvió uploadUrl/fileUrl válidos");
  }

  // 2. Descargar el video desde Supabase Storage
  const videoRes = await fetch(supabaseSignedUrl);
  if (!videoRes.ok) {
    throw new Error(`Error al descargar video de Storage: HTTP ${videoRes.status}`);
  }

  // 3. Subir el video a Zernio vía presigned URL (PUT)
  //    Buffereamos el video en memoria para compatibilidad con Vercel
  const videoBuffer = await videoRes.arrayBuffer();

  const uploadRes = await fetch(presign.uploadUrl, {
    method: "PUT",
    body: videoBuffer,
    headers: { "Content-Type": contentType },
  });

  if (!uploadRes.ok) {
    const uploadBody = await uploadRes.text().catch(() => "");
    throw new Error(
      `Error al subir video a Zernio: HTTP ${uploadRes.status} — ${uploadBody.slice(0, 200)}`
    );
  }

  console.log("[PublishVariation] video uploaded to Zernio", {
    filename,
    fileUrl: presign.fileUrl,
    sizeBytes: videoBuffer.byteLength,
  });

  return presign.fileUrl;
}

// ─── Helper: notificar al admin de la org ────────────────────────────────────

/**
 * Busca el email del admin/founder de la org y envía el email de notificación.
 * Best-effort: si falla, solo loggea — nunca lanza.
 */
async function notifyOrgAdminDone(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  variations: ReelVariation[]
): Promise<void> {
  // Buscar el perfil admin de la org
  const { data: profile } = await admin
    .from("profiles")
    .select("email")
    .eq("organization_id", organizationId)
    .eq("role", "admin")
    .maybeSingle();

  const email = profile?.email;
  if (!email) {
    console.log("[PublishVariation] no admin email found, skipping notification", { organizationId });
    return;
  }

  const included = variations.filter((v) => v.included);
  const published = included.filter((v) => v.status === "published").length;
  const failed = included.filter((v) => v.status === "failed").length;

  let appUrl: string;
  try {
    appUrl = getPublicAppUrl();
  } catch {
    // `app.otc.com` no existe: era un marcador que mandaba links rotos por
    // mail. El dominio real es el único respaldo que sirve.
    appUrl = `https://${brand.domain}`;
  }

  const result = await sendTrialReelsDoneEmail({ to: email, published, failed, appUrl });

  if (result.ok) {
    console.log("[PublishVariation] notification sent", { email, published, failed });
  } else {
    console.warn("[PublishVariation] notification failed", { email, error: result.error });
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const rawBody = await request.text();

  // 1. Autenticar (WORKER_AUTH_SECRET o QStash signature)
  const auth = await verifyQueueRequest(request, rawBody);
  if (!auth.ok) {
    console.warn("[PublishVariation] auth failed", auth.error);
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // 2. Parsear y validar payload
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 }
    );
  }

  const { jobId, variationIndex, organizationId } = parsed.data;
  console.log("[PublishVariation] received", { jobId, variationIndex });

  const admin = createAdminClient();

  // 3. Leer el job (admin client — no hay sesión de usuario en este endpoint)
  const { data: job, error: jobError } = await admin
    .from("reel_variation_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (jobError || !job) {
    console.error("[PublishVariation] job not found", { jobId, error: jobError?.message });
    // 200 para que QStash no reintente — no tiene sentido reintentar si el job no existe
    return NextResponse.json({ ok: false, error: "Job not found" }, { status: 200 });
  }

  const variations = (job.variations ?? []) as ReelVariation[];
  const variation = variations[variationIndex];

  if (!variation) {
    return NextResponse.json({ ok: false, error: "Variation index out of range" }, { status: 200 });
  }

  // 4. Idempotencia — solo procesar si está en "scheduled"
  if (variation.status !== "scheduled") {
    console.log("[PublishVariation] already processed, skipping", {
      jobId,
      variationIndex,
      status: variation.status,
    });
    return NextResponse.json({ ok: true, skipped: true, status: variation.status });
  }

  const updatedVariations = [...variations];

  try {
    // 5. Obtener cliente Zernio e integración (para profileId y accountId)
    const { getZernioClientForOrganization, getZernioIntegrationForOrg } = await import(
      "@/lib/zernio/integration"
    );

    let zernioClient: ZernioClient;
    try {
      zernioClient = await getZernioClientForOrganization(organizationId);
    } catch {
      throw new Error("Zernio no está conectado para esta organización");
    }

    const integration = await getZernioIntegrationForOrg(organizationId);
    const igAccount = integration?.connected_accounts?.find(
      (a: { platform: string }) => a.platform === "instagram"
    );

    // 6. Crear URL firmada de Supabase Storage (TTL 2h — suficiente para el upload a Zernio)
    const { data: signedData } = await admin.storage
      .from("trial-reels")
      // SCRUM-81: la ruta sale de la fila; tiene que ser de la org del job.
      .createSignedUrl(assertOrgStoragePath(variation.storage_path, organizationId), 7200);

    if (!signedData?.signedUrl) {
      throw new Error("No se pudo generar URL firmada para el video en Storage");
    }

    // 7. Subir el video a Zernio y obtener la URL permanente
    const videoFileUrl = await uploadVideoToZernio(
      zernioClient,
      signedData.signedUrl,
      variation.storage_path
    );

    // 8. Construir caption
    const caption =
      variation.description +
      (variation.hashtags?.length ? `\n\n${variation.hashtags.join(" ")}` : "");

    // 9. Crear el post en Zernio como draft con el video adjunto
    const result = await zernioClient.createPost({
      profileId: integration?.zernio_profile_id ?? "",
      platform: "instagram",
      postType: "reel",
      status: "draft",
      content: caption,
      ...(igAccount ? { accountId: igAccount.accountId } : {}),
      mediaItems: [{ type: "video", url: videoFileUrl }],
    });

    const zernioPostId =
      (result as { id?: string; _id?: string; post?: { id?: string; _id?: string } })?.post?.id ??
      (result as { id?: string; _id?: string })?.id ??
      (result as { id?: string; _id?: string })?.id ??
      (result as { _id?: string })?._id ??
      null;

    updatedVariations[variationIndex] = {
      ...variation,
      status: "published",
      zernio_post_id: zernioPostId,
      published_at: new Date().toISOString(),
      error: null,
    };

    console.log("[PublishVariation] published", {
      jobId,
      variationIndex,
      type: variation.type,
      zernioPostId,
      videoFileUrl,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[PublishVariation] failed", { jobId, variationIndex, error: msg });

    updatedVariations[variationIndex] = {
      ...variation,
      status: "failed",
      error: msg,
    };
  }

  // 10. Verificar si todas las variantes incluidas terminaron (published | failed)
  const includedVariations = updatedVariations.filter((v) => v.included);
  const allDone = includedVariations.every(
    (v) => v.status === "published" || v.status === "failed"
  );

  await admin
    .from("reel_variation_jobs")
    .update({
      variations: updatedVariations,
      ...(allDone ? { status: "done" } : {}),
    })
    .eq("id", jobId);

  if (allDone) {
    console.log("[PublishVariation] all done, job marked as done", { jobId });

    // Notificar al founder por email (best-effort — nunca bloquea la respuesta)
    void notifyOrgAdminDone(admin, organizationId, updatedVariations).catch((e) =>
      console.warn("[PublishVariation] email notification failed", e)
    );
  }

  return NextResponse.json({
    ok: true,
    jobId,
    variationIndex,
    status: updatedVariations[variationIndex].status,
    allDone,
  });
}
