/**
 * Procesador inline de variaciones (usado solo en dev cuando FFmpeg está disponible).
 * En producción, el procesamiento lo hace el worker de Fly.io.
 *
 * Import dinámico desde route.ts para evitar que fluent-ffmpeg sea requerido
 * en entornos donde no está instalado.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execSync } from "child_process";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ReelVariation, ReelVariationType } from "@/types/reel-variations";
import { assertOrgStoragePath } from "@/lib/storage/org-path";

const STORAGE_BUCKET = "trial-reels";

type Payload = {
  jobId: string;
  organizationId: string;
  sourcePieceId: string;
  sourceStoragePath: string;
  sourceFileName: string;
  originalCaption?: string | null;
};

type VariantDef = {
  type: ReelVariationType;
  suffix: string;
  filterComplex?: string;
  vf?: string;
  extraArgs?: string[];
};

const VARIANTS: VariantDef[] = [
  {
    type: "speed_up",
    suffix: "v1_speed_up",
    filterComplex: "[0:v]setpts=0.8*PTS[v];[0:a]atempo=1.25[a]",
  },
  {
    type: "speed_down",
    suffix: "v2_speed_down",
    filterComplex: "[0:v]setpts=1.15*PTS[v];[0:a]atempo=0.87[a]",
  },
  {
    type: "music",
    suffix: "v3_music",
    vf: "crop=iw-1:ih-2:0:1",
    extraArgs: ["-an"], // silenciar audio original (sin música de fondo disponible en dev)
  },
  {
    type: "subtitles",
    suffix: "v4_subtitles",
    vf: "crop=iw-2:ih-1:1:0",
  },
  {
    type: "color",
    suffix: "v5_color",
    vf: "eq=saturation=1.2:contrast=1.05:brightness=0.02,crop=iw-1:ih-2:0:1",
  },
];

export async function processReelJob(payload: Payload): Promise<void> {
  const { jobId, organizationId, sourceStoragePath, sourceFileName } = payload;
  const admin = createAdminClient();
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), `reel-dev-${jobId.slice(0, 8)}-`));
  const ext = path.extname(sourceFileName) || ".mp4";
  const sourcePath = path.join(workDir, `source${ext}`);

  await admin.from("reel_variation_jobs").update({ status: "processing" }).eq("id", jobId);

  const initialVariations: ReelVariation[] = VARIANTS.map((v) => ({
    type: v.type,
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

  await admin.from("reel_variation_jobs").update({ variations: initialVariations }).eq("id", jobId);

  try {
    // Descargar fuente
    const { data: srcData, error: srcErr } = await admin.storage
      .from(STORAGE_BUCKET)
      // SCRUM-81: el video fuente tiene que ser de la org del job.
      .download(assertOrgStoragePath(sourceStoragePath, organizationId));
    if (srcErr || !srcData) throw new Error(`Source download: ${srcErr?.message}`);
    fs.writeFileSync(sourcePath, Buffer.from(await srcData.arrayBuffer()));

    const updatedVariations = [...initialVariations];

    for (let i = 0; i < VARIANTS.length; i++) {
      const v = VARIANTS[i];
      const outputPath = path.join(workDir, `${v.suffix}.mp4`);
      const storagePath = `${organizationId}/variations/${jobId}/${v.suffix}.mp4`;

      try {
        const args: string[] = ["-i", sourcePath];
        if (v.filterComplex) {
          args.push("-filter_complex", v.filterComplex, "-map", "[v]", "-map", "[a]");
        }
        if (v.vf) args.push("-vf", v.vf);
        if (v.extraArgs) args.push(...v.extraArgs);
        args.push("-c:v", "libx264", "-c:a", "aac", "-preset", "fast", "-crf", "23", "-y", outputPath);

        execSync(`ffmpeg ${args.map((a) => `"${a}"`).join(" ")}`, { stdio: "pipe" });

        const buf = fs.readFileSync(outputPath);
        const { error: upErr } = await admin.storage
          .from(STORAGE_BUCKET)
          .upload(storagePath, buf, { contentType: "video/mp4", upsert: true });
        if (upErr) throw new Error(`Upload: ${upErr.message}`);

        const { data: signed } = await admin.storage
          .from(STORAGE_BUCKET)
          .createSignedUrl(storagePath, 7 * 24 * 3600);

        updatedVariations[i] = {
          ...updatedVariations[i],
          storage_path: storagePath,
          preview_url: signed?.signedUrl ?? "",
          description: payload.originalCaption ?? `Variante ${v.type}`,
          hashtags: [],
          status: "ready",
          error: null,
        };
      } catch (varErr) {
        const msg = varErr instanceof Error ? varErr.message : String(varErr);
        updatedVariations[i] = { ...updatedVariations[i], status: "failed", error: msg };
      }

      await admin.from("reel_variation_jobs").update({ variations: updatedVariations }).eq("id", jobId);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    }

    await admin.from("reel_variation_jobs").update({ variations: updatedVariations, status: "preview_ready" }).eq("id", jobId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await admin.from("reel_variation_jobs").update({ status: "failed", error_message: msg }).eq("id", jobId);
  } finally {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}
