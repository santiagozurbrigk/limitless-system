/**
 * D · El worker que convierte un video en un SOP.
 *
 * Corre fuera del request del usuario porque bajar el video, sacarle el audio,
 * transcribirlo y generar el SOP lleva minutos. La pantalla escucha el job por
 * realtime.
 *
 * pending → transcribing → generating → ready | failed
 */
import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyQueueRequest } from "@/lib/queue/verify-queue-request";
import { callClaudeJson } from "@/lib/ai/anthropic";
import {
  computeAudioChunks,
  joinTranscriptChunks,
  type AudioChunk,
} from "@/lib/sops/audio-chunks";
import { trackTranscriptionUsage } from "@/lib/sops/transcription-usage";
import {
  VIDEO_SOP_SYSTEM_PROMPT,
  buildVideoSopPrompt,
  parseVideoSopResponse,
} from "@/lib/sops/video-sop-prompt";
import { validateAttachmentMarkers } from "@/lib/sops/attachment-markers";
import { SOP_VIDEOS_BUCKET } from "@/lib/sops/constants";
import { assertOrgStoragePath } from "@/lib/storage/org-path";

export const runtime = "nodejs";
/** Un Loom largo puede tardar: el máximo que permite el plan de Vercel. */
export const maxDuration = 800;

type JobRow = {
  id: string;
  organization_id: string;
  video_path: string;
  title: string | null;
  department: string | null;
  context: string | null;
  transcript: string | null;
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  const auth = await verifyQueueRequest(request, rawBody);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { jobId } = JSON.parse(rawBody || "{}") as { jobId?: string };
  if (!jobId) {
    return NextResponse.json({ error: "jobId requerido" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("sop_generation_jobs")
    .select("id, organization_id, video_path, title, department, context, transcript")
    .eq("id", jobId)
    .maybeSingle();

  const job = data as JobRow | null;
  if (!job) return NextResponse.json({ error: "Job no encontrado" }, { status: 404 });

  let workDir: string | null = null;

  try {
    // ⭐ Si el job ya tiene transcripción, no se vuelve a transcribir. Whisper
    // cobra por minuto: reintentar la generación no debería volver a pagarla.
    let transcript = job.transcript?.trim() ?? "";
    let seconds = 0;

    if (!transcript) {
      await setStatus(admin, jobId, "transcribing");
      workDir = await mkdtemp(join(tmpdir(), "sop-video-"));

      const videoPath = join(workDir, "source");
      const { data: file, error: downloadError } = await admin.storage
        .from(SOP_VIDEOS_BUCKET)
        // SCRUM-81: la ruta sale de la fila; tiene que ser de la org del job.
        .download(assertOrgStoragePath(job.video_path, job.organization_id));

      if (downloadError || !file) {
        throw new Error(`No se pudo leer el video: ${downloadError?.message ?? "vacío"}`);
      }
      await writeFile(videoPath, Buffer.from(await file.arrayBuffer()));

      seconds = await probeDurationSeconds(videoPath);
      const audioPath = join(workDir, "audio.mp3");
      await extractAudio(videoPath, audioPath);

      // Un audio corto va en un solo pedido; uno largo se parte con solape.
      const chunks = computeAudioChunks(seconds);
      const parts: string[] = [];

      if (chunks.length <= 1) {
        parts.push(await transcribeFile(audioPath));
      } else {
        for (const chunk of chunks) {
          const chunkPath = join(workDir, `chunk-${chunk.index}.mp3`);
          await sliceAudio(audioPath, chunkPath, chunk);
          parts.push(await transcribeFile(chunkPath));
        }
      }

      transcript = joinTranscriptChunks(parts);
      if (!transcript) throw new Error("La transcripción salió vacía.");

      await trackTranscriptionUsage({
        organizationId: job.organization_id,
        seconds,
        feature: "sop_video_transcription",
      });

      // Se guarda antes de generar: es lo caro del proceso y si la generación
      // falla no hay que volver a pagarla.
      await admin
        .from("sop_generation_jobs")
        .update({ transcript, transcript_seconds: Math.round(seconds) })
        .eq("id", jobId);
    }

    // ─── Generar el SOP ───────────────────────────────────────────────────
    await setStatus(admin, jobId, "generating");

    const attachments = await loadAttachments(admin, jobId, job.organization_id);

    const response = await callClaudeJson<Record<string, unknown>>({
      organizationId: job.organization_id,
      task: "sop_generation",
      feature: "sop_from_video",
      system: VIDEO_SOP_SYSTEM_PROMPT,
      user: buildVideoSopPrompt({
        transcript,
        title: job.title,
        department: job.department,
        context: job.context,
        attachments,
      }),
      maxTokens: 8192,
    });

    const parsed = parseVideoSopResponse(response);
    if (!parsed) {
      throw new Error(
        "El modelo no devolvió un SOP utilizable. La transcripción quedó guardada: podés reintentar."
      );
    }

    // ⭐ El prompt le prohíbe inventar ids de captura, pero prohibir no es
    // garantizar: los que no existen se borran acá y se dejan registrados.
    const validated = validateAttachmentMarkers(
      parsed.markdown,
      attachments.map((attachment) => attachment.id)
    );
    if (validated.removedIds.length > 0) {
      console.warn(
        `[process-sop-video] job ${jobId}: se borraron capturas inventadas`,
        validated.removedIds
      );
    }

    await admin
      .from("sop_generation_jobs")
      .update({
        status: "ready",
        title: parsed.title ?? job.title,
        generated_markdown: validated.markdown,
        open_questions: parsed.openQuestions,
        error: null,
      })
      .eq("id", jobId);

    return NextResponse.json({ ok: true, jobId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[process-sop-video]", jobId, message);
    await admin
      .from("sop_generation_jobs")
      .update({ status: "failed", error: message })
      .eq("id", jobId);
    // 200 a propósito: el job ya quedó marcado como fallido y el usuario ve el
    // motivo. Devolver 500 haría que QStash reintente y vuelva a pagar Whisper.
    return NextResponse.json({ ok: false, error: message });
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function setStatus(
  admin: ReturnType<typeof createAdminClient>,
  jobId: string,
  status: string
) {
  await admin.from("sop_generation_jobs").update({ status }).eq("id", jobId);
}

/** Las capturas que subió el usuario para este job, con un id corto y estable. */
async function loadAttachments(
  admin: ReturnType<typeof createAdminClient>,
  jobId: string,
  organizationId: string
): Promise<{ id: string; fileName: string }[]> {
  const { data } = await admin
    .from("sop_attachments")
    .select("id, file_name")
    .eq("draft_id", jobId)
    .eq("organization_id", organizationId);

  return ((data as { id: string; file_name: string }[]) ?? []).map((row) => ({
    id: row.id,
    fileName: row.file_name,
  }));
}

// ─── ffmpeg ─────────────────────────────────────────────────────────────────

function runFfmpeg(args: string[], binary = ffmpegInstaller.path): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args);
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(stderr) : reject(new Error(`ffmpeg salió con código ${code}`))
    );
  });
}

/**
 * Duración del video en segundos.
 *
 * Se lee del stderr de ffmpeg en vez de usar ffprobe: el instalador trae ffmpeg
 * y no siempre ffprobe, y una dependencia menos es una cosa menos que falla en
 * el deploy.
 */
async function probeDurationSeconds(videoPath: string): Promise<number> {
  const output = await runFfmpeg(["-i", videoPath, "-f", "null", "-"]).catch(
    (error: unknown) => (error instanceof Error ? error.message : "")
  );

  const match = /Duration:\s*(\d+):(\d+):(\d+\.?\d*)/.exec(output);
  if (!match) return 0;

  return (
    Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
  );
}

/** mp3 mono a 16 kHz: ~1 MB por minuto, que es lo que hace que entre en Whisper. */
async function extractAudio(videoPath: string, audioPath: string): Promise<void> {
  await runFfmpeg([
    "-i", videoPath,
    "-vn",
    "-ac", "1",
    "-ar", "16000",
    "-b:a", "32k",
    "-y", audioPath,
  ]);
}

async function sliceAudio(
  audioPath: string,
  outputPath: string,
  chunk: AudioChunk
): Promise<void> {
  await runFfmpeg([
    "-i", audioPath,
    "-ss", String(chunk.startSeconds),
    "-t", String(chunk.durationSeconds),
    "-acodec", "copy",
    "-y", outputPath,
  ]);
}

// ─── Whisper ────────────────────────────────────────────────────────────────

async function transcribeFile(path: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY no configurada");

  const buffer = await readFile(path);
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)], { type: "audio/mpeg" }), "audio.mp3");
  form.append("model", "whisper-1");
  form.append("language", "es");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!response.ok) {
    throw new Error(`Whisper devolvió ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }

  const data = (await response.json()) as { text?: string };
  return data.text?.trim() ?? "";
}
