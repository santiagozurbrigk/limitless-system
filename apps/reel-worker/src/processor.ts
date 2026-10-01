/**
 * Lógica principal de procesamiento de un job de Trial Reels.
 *
 * Flujo por variante:
 *   1. Descargar video fuente de Supabase Storage
 *   2. Aplicar transformación FFmpeg
 *   3. Subir resultado a Supabase Storage
 *   4. Generar URL firmada de preview
 *   5. Actualizar variante en DB
 *
 * Al final: generar captions con Haiku y marcar job como preview_ready.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import { VARIANT_SPECS, runFfmpeg } from "./ffmpeg-variants";
import { generateVariantCaptions } from "./captions";
import type { ReelVariationJobPayload, ReelVariation } from "./types";
import { isOrgStoragePath } from "./org-path";

// ─── Supabase admin client ────────────────────────────────────────────────────

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY requeridos");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const STORAGE_BUCKET = "trial-reels";
const SIGNED_URL_TTL = 7 * 24 * 3600; // 7 días — suficiente para que el usuario revise
const LUTS_DIR = path.join(process.cwd(), "luts");

// ─── Helpers de Storage ───────────────────────────────────────────────────────


async function downloadFromStorage(
  storagePath: string,
  destPath: string
): Promise<void> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.storage
    .from(STORAGE_BUCKET)
    .download(storagePath);

  if (error) throw new Error(`Storage download failed: ${error.message}`);
  if (!data) throw new Error("Storage download: no data returned");

  const buffer = Buffer.from(await data.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
}

/**
 * Descarga un archivo de Google Drive usando el access token proporcionado
 * y lo guarda en destPath.
 * @returns El tamaño en bytes del archivo descargado.
 */
async function downloadFromDrive(
  driveFileId: string,
  accessToken: string,
  destPath: string
): Promise<number> {
  const url = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}`
  );
  url.searchParams.set("alt", "media");
  url.searchParams.set("supportsAllDrives", "true");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Google Drive download failed: ${res.status} ${res.statusText}`);
  }

  if (!res.body) {
    throw new Error("Google Drive download: empty response body");
  }

  // Escribir en streaming para evitar acumular el video entero en memoria
  const { Writable } = await import("stream");
  const { pipeline } = await import("stream/promises");
  const { createWriteStream } = await import("fs");

  const writer = createWriteStream(destPath);

  // Convertir el ReadableStream web a Node.js Readable
  // Node.js ≥18 soporta Readable.fromWeb()
  const { Readable } = await import("stream");
  const nodeReadable = Readable.fromWeb(
    res.body as import("stream/web").ReadableStream<Uint8Array>
  );

  await pipeline(nodeReadable, writer);

  const stat = fs.statSync(destPath);
  return stat.size;
}

async function uploadToStorage(
  localPath: string,
  storagePath: string,
  mimeType = "video/mp4"
): Promise<string> {
  const admin = getSupabaseAdmin();
  const buffer = fs.readFileSync(localPath);

  const { error } = await admin.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, { contentType: mimeType, upsert: true });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data: signed } = await admin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL);

  return signed?.signedUrl ?? "";
}

// ─── Actualización de DB ──────────────────────────────────────────────────────

async function updateJobVariations(
  jobId: string,
  variations: ReelVariation[],
  status?: string
): Promise<void> {
  const admin = getSupabaseAdmin();
  const patch: Record<string, unknown> = { variations };
  if (status) patch.status = status;
  const { error } = await admin
    .from("reel_variation_jobs")
    .update(patch)
    .eq("id", jobId);
  if (error) {
    console.error("[DB] updateJobVariations error", error.message);
  }
}

async function markJobFailed(jobId: string, message: string): Promise<void> {
  const admin = getSupabaseAdmin();
  await admin
    .from("reel_variation_jobs")
    .update({ status: "failed", error_message: message })
    .eq("id", jobId);
}

// ─── Procesador principal ─────────────────────────────────────────────────────

export async function processReelVariationJob(
  payload: ReelVariationJobPayload
): Promise<void> {
  const { jobId, organizationId, originalCaption } = payload;
  const sourceFileName = payload.sourceFileName;
  const started = Date.now();
  console.log("[Processor] job started", {
    jobId,
    organizationId,
    source: payload.driveFileId ? "drive" : "storage",
  });

  // Verificar idempotencia — si el job ya fue procesado (retries de QStash),
  // evitar reprocesar. Solo continuar si está en estado "pending".
  const admin = getSupabaseAdmin();
  const { data: existingJob } = await admin
    .from("reel_variation_jobs")
    .select("status, organization_id")
    .eq("id", jobId)
    .single();

  // [STORAGE-RUTA-DESDE-FILA] (SCRUM-81): las rutas se validan contra el
  // `organizationId` del payload, así que el job tiene que ser de esa org. Si
  // no, un payload armado a mano leería o escribiría archivos de otra org.
  if (!existingJob || existingJob.organization_id !== organizationId) {
    console.error("[Processor] el job no existe o no es de la organización del payload: se descarta", {
      jobId,
      organizationId,
    });
    return;
  }

  if (existingJob.status !== "pending") {
    console.log("[Processor] job already in status", existingJob.status, "— skipping", { jobId });
    return;
  }

  // Directorio temporal único por job
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), `reel-job-${jobId}-`));
  const mimeType = payload.driveMimeType ?? "video/mp4";
  const ext = mimeType.includes("quicktime") ? ".mov"
            : mimeType.includes("mp4") ? ".mp4"
            : path.extname(sourceFileName) || ".mp4";
  const sourcePath = path.join(workDir, `source${ext}`);

  // Marcar como processing en DB
  await admin
    .from("reel_variation_jobs")
    .update({ status: "processing" })
    .eq("id", jobId);

  // Inicializar array de variantes (processing)
  const initialVariations: ReelVariation[] = VARIANT_SPECS.map((spec) => ({
    type: spec.type,
    storage_path: "",
    preview_url: "",
    description: "",
    hashtags: [],
    included: true,
    status: "processing",
    zernio_post_id: null,
    published_at: null,
    error: null,
  }));

  await updateJobVariations(jobId, initialVariations);

  try {
    // 1. Descargar video fuente (Drive directo o Supabase Storage legacy)
    if (payload.driveFileId && payload.driveAccessToken) {
      console.log("[Processor] downloading source video from Drive...");
      const bytes = await downloadFromDrive(payload.driveFileId, payload.driveAccessToken, sourcePath);
      console.log("[Processor] Drive download OK", { bytes });
    } else if (payload.sourceStoragePath) {
      if (!isOrgStoragePath(payload.sourceStoragePath, organizationId)) {
        throw new Error("Ruta del video fuente fuera de la organización");
      }
      console.log("[Processor] downloading source video from Storage...");
      await downloadFromStorage(payload.sourceStoragePath, sourcePath);
      console.log("[Processor] Storage download OK", { bytes: fs.statSync(sourcePath).size });
    } else {
      throw new Error("Payload inválido: se requiere driveFileId+driveAccessToken o sourceStoragePath");
    }

    // 2. Descargar track de música personalizado de la org (si existe)
    let customMusicPath: string | null = null;
    if (payload.reelMusicPath && !isOrgStoragePath(payload.reelMusicPath, organizationId)) {
      console.warn("[Processor] música fuera de la organización: se usa la de por defecto", {
        jobId,
        reelMusicPath: payload.reelMusicPath,
      });
    } else if (payload.reelMusicPath) {
      const musicDest = path.join(workDir, "org-background-music.mp3");
      try {
        await downloadFromStorage(payload.reelMusicPath, musicDest);
        customMusicPath = musicDest;
        console.log("[Processor] org music downloaded", { path: payload.reelMusicPath, size: fs.statSync(musicDest).size });
      } catch (musicErr) {
        console.warn("[Processor] org music download failed — usando música por defecto", {
          reelMusicPath: payload.reelMusicPath,
          error: musicErr instanceof Error ? musicErr.message : String(musicErr),
        });
      }
    }

    // 3. Procesar cada variante
    const processedVariations: ReelVariation[] = [...initialVariations];

    for (let i = 0; i < VARIANT_SPECS.length; i++) {
      const spec = VARIANT_SPECS[i];
      const outputPath = path.join(workDir, `${spec.outputSuffix}.mp4`);
      const storagePath = `${organizationId}/variations/${jobId}/${spec.outputSuffix}.mp4`;

      console.log(`[Processor] processing variant ${i + 1}/${VARIANT_SPECS.length}: ${spec.type}`);

      try {
        // Aplicar transformación FFmpeg
        // Para la variante "music": pasar la ruta de música personalizada si existe
        const ffmpegArgs = spec.buildFfmpegArgs(
          sourcePath,
          outputPath,
          LUTS_DIR,
          originalCaption,
          spec.type === "music" ? customMusicPath : null,
        );
        runFfmpeg(ffmpegArgs);

        // Subir a Storage y obtener URL firmada
        const previewUrl = await uploadToStorage(outputPath, storagePath);

        processedVariations[i] = {
          ...processedVariations[i],
          storage_path: storagePath,
          preview_url: previewUrl,
          status: "ready",
          error: null,
        };

        console.log(`[Processor] variant ${spec.type} ready`);
      } catch (variantErr) {
        const msg = variantErr instanceof Error ? variantErr.message : String(variantErr);
        console.error(`[Processor] variant ${spec.type} failed`, msg);
        processedVariations[i] = {
          ...processedVariations[i],
          status: "failed",
          error: msg,
        };
      }

      // Actualizar progreso en DB después de cada variante
      await updateJobVariations(jobId, processedVariations);

      // Limpiar archivo de salida temporal
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
    }

    // 4. Generar captions con Haiku para las variantes exitosas
    console.log("[Processor] generating captions with Haiku...");
    const successfulTypes = processedVariations
      .filter((v) => v.status === "ready")
      .map((v) => v.type);

    if (successfulTypes.length > 0) {
      const captions = await generateVariantCaptions(originalCaption, successfulTypes);
      for (const variation of processedVariations) {
        if (variation.status === "ready") {
          const cap = captions.get(variation.type);
          if (cap) {
            variation.description = cap.description;
            variation.hashtags = cap.hashtags;
          }
        }
      }
    }

    // 5. Marcar job como preview_ready
    await updateJobVariations(jobId, processedVariations, "preview_ready");

    const durationMs = Date.now() - started;
    const readyCount = processedVariations.filter((v) => v.status === "ready").length;
    console.log("[Processor] job completed", {
      jobId,
      durationMs,
      readyCount,
      failedCount: processedVariations.filter((v) => v.status === "failed").length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Processor] job failed", { jobId, error: msg });
    await markJobFailed(jobId, msg);
  } finally {
    // Limpiar directorio temporal
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {
      // Ignorar errores de limpieza
    }
  }
}
