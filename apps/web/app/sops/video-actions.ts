"use server";

/**
 * D · Crear y seguir un SOP generado desde un video.
 *
 * La subida del video la hace el navegador contra una signed URL —igual que las
 * capturas de SOPs— para no pasar cientos de MB por un Server Action.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  getCurrentProfile,
  isMissingTableError,
  requireOrganizationId,
} from "@/lib/auth/bootstrap";
import { runMutation, type MutationResult } from "@/lib/server/action-result";
import { firstZodError } from "@/lib/validations";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SOP_ATTACHMENTS_BUCKET,
  SOP_VIDEOS_BUCKET,
  SOP_VIDEO_MAX_BYTES,
  formatearLimiteDeVideo,
} from "@/lib/sops/constants";
import { sanitizeFilename } from "@/lib/sops/attachment-types";
import { enqueueSopVideoJob } from "@/lib/sops/enqueue-video-job";
import { paths } from "@/routes";
import { assertOrgStoragePath, soloRutasDeLaOrg } from "@/lib/storage/org-path";

export type SopVideoJob = {
  id: string;
  status: "pending" | "transcribing" | "generating" | "ready" | "failed";
  title: string | null;
  department: string | null;
  transcript: string | null;
  transcriptSeconds: number | null;
  generatedMarkdown: string | null;
  openQuestions: string[];
  error: string | null;
  createdAt: string;
};

type JobRow = {
  id: string;
  status: string;
  title: string | null;
  department: string | null;
  transcript: string | null;
  transcript_seconds: number | null;
  generated_markdown: string | null;
  open_questions: unknown;
  error: string | null;
  created_at: string;
};

function rowToJob(row: JobRow): SopVideoJob {
  return {
    id: row.id,
    status: (row.status as SopVideoJob["status"]) ?? "pending",
    title: row.title,
    department: row.department,
    transcript: row.transcript,
    transcriptSeconds: row.transcript_seconds,
    generatedMarkdown: row.generated_markdown,
    openQuestions: Array.isArray(row.open_questions)
      ? (row.open_questions as unknown[]).filter(
          (entry): entry is string => typeof entry === "string"
        )
      : [],
    error: row.error,
    createdAt: row.created_at,
  };
}

/** Paso 1: pedir dónde subir el video. */
export async function prepareSopVideoUploadAction(input: {
  fileName: string;
  fileSize: number;
  mimeType: string;
}): Promise<MutationResult<{ videoPath: string; signedUrl: string }>> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();

    if (!input.mimeType.startsWith("video/")) {
      throw new Error("El archivo tiene que ser un video (mp4, mov, webm).");
    }
    if (input.fileSize > SOP_VIDEO_MAX_BYTES) {
      throw new Error(
        `El video pesa ${Math.round(input.fileSize / (1024 * 1024))} MB y el máximo es ${formatearLimiteDeVideo()}. Bajá la resolución o cortalo en partes.`
      );
    }

    const videoPath = `${organizationId}/${crypto.randomUUID()}-${sanitizeFilename(input.fileName)}`;

    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(SOP_VIDEOS_BUCKET)
      .createSignedUploadUrl(videoPath);

    if (error || !data?.signedUrl) {
      throw new Error(
        error?.message ?? `No se pudo preparar la subida. ¿Existe el bucket "${SOP_VIDEOS_BUCKET}"?`
      );
    }

    return { videoPath, signedUrl: data.signedUrl };
  });
}

const createJobSchema = z.object({
  videoPath: z.string().min(1),
  fileName: z.string().trim().max(300).nullable().default(null),
  fileSize: z.number().int().nonnegative().nullable().default(null),
  title: z.string().trim().max(200).nullable().default(null),
  department: z.string().trim().max(100).nullable().default(null),
  context: z.string().trim().max(2000).nullable().default(null),
});

/** Paso 2: crear el job y ponerlo en la cola. */
export async function createSopVideoJobAction(
  input: z.input<typeof createJobSchema>
): Promise<MutationResult<SopVideoJob>> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const profile = await getCurrentProfile();

    const parsed = createJobSchema.safeParse(input);
    if (!parsed.success) throw new Error(firstZodError(parsed.error));
    const values = parsed.data;
    assertOrgStoragePath(values.videoPath, organizationId);

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("sop_generation_jobs")
      .insert({
        organization_id: organizationId,
        video_path: values.videoPath,
        video_file_name: values.fileName,
        video_size_bytes: values.fileSize,
        title: values.title,
        department: values.department,
        context: values.context,
        created_by: profile?.id ?? null,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    const job = rowToJob(data as JobRow);

    // Si la cola no está configurada, el job queda en `pending` y se puede
    // reintentar: es mejor que perder el video que el usuario ya subió.
    await enqueueSopVideoJob(job.id).catch((queueError: unknown) => {
      console.error(
        "[createSopVideoJob] no se pudo encolar",
        queueError instanceof Error ? queueError.message : String(queueError)
      );
    });

    revalidatePath(paths.platform.operations.sops);
    return job;
  });
}

export async function listSopVideoJobsAction(): Promise<SopVideoJob[]> {
  try {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("sop_generation_jobs")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      if (isMissingTableError(error.message)) return [];
      console.error("[listSopVideoJobs]", error.message);
      return [];
    }
    return (data as JobRow[]).map(rowToJob);
  } catch {
    return [];
  }
}

export async function getSopVideoJobAction(id: string): Promise<SopVideoJob | null> {
  try {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const { data } = await supabase
      .from("sop_generation_jobs")
      .select("*")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .maybeSingle();

    return data ? rowToJob(data as JobRow) : null;
  } catch {
    return null;
  }
}

/** Volver a intentar. Conserva la transcripción: no se vuelve a pagar Whisper. */
export async function retrySopVideoJobAction(
  id: string
): Promise<MutationResult<void>> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { error } = await supabase
      .from("sop_generation_jobs")
      .update({ status: "pending", error: null })
      .eq("id", id)
      .eq("organization_id", organizationId);

    if (error) throw new Error(error.message);
    await enqueueSopVideoJob(id);
    revalidatePath(paths.platform.operations.sops);
  });
}

// ─── S3 · Resolver los marcadores de captura para mostrar ───────────────────

/**
 * Convierte los ids de captura en URLs firmadas, para el visor.
 *
 * ⭐ Se llama **al mostrar**, nunca al guardar. El markdown guarda el marcador
 * `sop-attachment:<id>`; si guardara la URL, el SOP se vería bien hoy y roto la
 * semana que viene, cuando la firma venza.
 */
export async function resolveSopAttachmentUrlsAction(
  ids: string[]
): Promise<Record<string, string>> {
  if (ids.length === 0) return {};

  try {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data } = await supabase
      .from("sop_attachments")
      .select("id, storage_path")
      .eq("organization_id", organizationId)
      .in("id", ids);

    // SCRUM-81: sólo se firman rutas de la org.
    const rows = ((data as { id: string; storage_path: string }[]) ?? []).filter(
      (row) => soloRutasDeLaOrg([row.storage_path], organizationId, "sops").length > 0
    );
    if (rows.length === 0) return {};

    const admin = createAdminClient();
    const { data: signed } = await admin.storage
      .from(SOP_ATTACHMENTS_BUCKET)
      .createSignedUrls(
        rows.map((row) => row.storage_path),
        60 * 60
      );

    const urlByPath = new Map(
      (signed ?? []).map((entry) => [entry.path ?? "", entry.signedUrl])
    );

    const result: Record<string, string> = {};
    for (const row of rows) {
      const url = urlByPath.get(row.storage_path);
      // Una captura cuya URL no se pudo firmar queda afuera: el visor deja el
      // marcador y avisa, en vez de mostrar una imagen rota.
      if (url) result[row.id] = url;
    }
    return result;
  } catch {
    return {};
  }
}
