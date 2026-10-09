"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  isMissingColumnError,
  isMissingTableError,
  requireOrganizationId,
} from "@/lib/auth/bootstrap";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  ErrorEsperable,
  FallaDeLaBase,
  mutacionConErroresEsperables,
  type MutationResult,
} from "@/lib/server/action-result";
import {
  isAllowedWorkboardAttachment,
  sanitizeFilename,
} from "@/lib/workboard/attachment-types";
import { WORKBOARD_ATTACHMENTS_BUCKET } from "@/lib/workboard/constants";
import {
  leerTareaConVinculos,
  TAREA_NO_ENCONTRADA,
} from "@/lib/workboard/tarea-con-vinculos";
import { firstZodError, uuidSchema } from "@/lib/validations";
import { paths } from "@/routes/paths";
import type { WorkboardTask } from "@/types/workboard";
import { assertOrgStoragePath, soloRutasDeLaOrg } from "@/lib/storage/org-path";

function revalidateWorkboard() {
  revalidatePath(paths.platform.workboard.root);
}

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

const ADJUNTO_NO_ENCONTRADO = "Adjunto no encontrado";

function validar<T>(
  resultado: { success: true; data: T } | { success: false; error: Parameters<typeof firstZodError>[0] }
): T {
  if (!resultado.success) throw new ErrorEsperable(firstZodError(resultado.error));
  return resultado.data;
}

/** La tarea de la organización, o el rechazo esperable si ya no está. */
async function exigirTarea(
  supabase: Awaited<ReturnType<typeof createClient>>,
  taskId: string,
  organizationId: string
): Promise<void> {
  const { data: task, error } = await supabase
    .from("workboard_tasks")
    .select("id")
    .eq("id", taskId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw new FallaDeLaBase(error);
  if (!task) throw new ErrorEsperable(TAREA_NO_ENCONTRADA);
}

/*
 * SCRUM-503: los vínculos de las tareas del Tablero (adjuntos, documentos,
 * SOP) siguen el mismo contrato que `actions.ts`. Antes corrían con
 * `runMutation`, que devolvía el mensaje de cualquier excepción: un error de
 * la base o de Storage le llegaba crudo al usuario, en inglés. Ahora sólo un
 * `ErrorEsperable` vuelve con su mensaje (validación, sesión, tarea, adjunto,
 * SOP o documento que no está, formato o tamaño no permitido, tabla o columna
 * que falta); lo demás se registra, va a Sentry y vuelve con el texto fijo.
 * Una ruta de Storage ajena (`assertOrgStoragePath`) también: es una señal de
 * manipulación, no un error del usuario.
 */

const prepareAttachmentSchema = z.object({
  taskId: uuidSchema,
  fileName: z.string().trim().min(1).max(255),
  fileSize: z.number().int().nonnegative(),
  mimeType: z.string().trim().min(1).max(200),
});

export async function prepareTaskAttachmentUploadAction(
  input: unknown
): Promise<
  MutationResult<{ storagePath: string; signedUrl: string; contentType: string }>
> {
  return mutacionConErroresEsperables("[prepareTaskAttachmentUpload]", async () => {
    const { taskId, fileName, fileSize, mimeType } = validar(
      prepareAttachmentSchema.safeParse(input)
    );
    const organizationId = await requireOrganizationId();

    const allowed = isAllowedWorkboardAttachment(fileName, mimeType, fileSize);
    if (!allowed.ok) throw new ErrorEsperable(allowed.error);

    const supabase = await createClient();
    await exigirTarea(supabase, taskId, organizationId);

    const attachmentId = crypto.randomUUID();
    const safeName = sanitizeFilename(fileName);
    const storagePath = `${organizationId}/${taskId}/${attachmentId}-${safeName}`;

    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(WORKBOARD_ATTACHMENTS_BUCKET)
      .createSignedUploadUrl(storagePath);

    if (error) throw error;
    if (!data?.signedUrl) {
      throw new FallaDeLaBase({
        message: `Storage no devolvió la URL de subida (bucket "${WORKBOARD_ATTACHMENTS_BUCKET}")`,
      });
    }

    return {
      storagePath,
      signedUrl: data.signedUrl,
      contentType: allowed.mimeType,
    };
  });
}

const finalizeAttachmentSchema = z.object({
  taskId: uuidSchema,
  storagePath: z.string().trim().min(1),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(200),
  fileSize: z.number().int().nonnegative().optional(),
});

export async function finalizeTaskAttachmentAction(
  input: unknown
): Promise<MutationResult<WorkboardTask>> {
  return mutacionConErroresEsperables("[finalizeTaskAttachment]", async () => {
    const datos = validar(finalizeAttachmentSchema.safeParse(input));
    const organizationId = await requireOrganizationId();
    const uploadedBy = await currentUserId();
    const { taskId, fileName, mimeType, fileSize } = datos;
    const storagePath = assertOrgStoragePath(datos.storagePath, organizationId);

    const allowed = isAllowedWorkboardAttachment(fileName, mimeType, fileSize);
    if (!allowed.ok) throw new ErrorEsperable(allowed.error);

    const supabase = await createClient();
    await exigirTarea(supabase, taskId, organizationId);

    const { error } = await supabase.from("workboard_task_attachments").insert({
      organization_id: organizationId,
      task_id: taskId,
      file_name: fileName,
      storage_path: storagePath,
      mime_type: allowed.mimeType,
      file_size: fileSize ?? null,
      uploaded_by: uploadedBy,
    });

    if (error) {
      if (isMissingTableError(error.message)) {
        throw new ErrorEsperable(
          "Falta la tabla workboard_task_attachments. Aplicá la migración 20260714100000_workboard_task_links.sql."
        );
      }
      throw new FallaDeLaBase(error);
    }

    revalidateWorkboard();
    return leerTareaConVinculos(taskId, organizationId);
  });
}

export async function deleteTaskAttachmentAction(
  attachmentId: unknown
): Promise<MutationResult<WorkboardTask>> {
  return mutacionConErroresEsperables("[deleteTaskAttachment]", async () => {
    const id = validar(uuidSchema.safeParse(attachmentId));
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const admin = createAdminClient();

    const { data: row, error: lecturaError } = await supabase
      .from("workboard_task_attachments")
      .select("id, task_id, storage_path")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (lecturaError) throw new FallaDeLaBase(lecturaError);
    if (!row) throw new ErrorEsperable(ADJUNTO_NO_ENCONTRADO);

    const rutas = soloRutasDeLaOrg([row.storage_path as string | null], organizationId, "workboard");
    if (rutas.length > 0) {
      await admin.storage.from(WORKBOARD_ATTACHMENTS_BUCKET).remove(rutas);
    }

    const { error } = await supabase
      .from("workboard_task_attachments")
      .delete()
      .eq("id", id)
      .eq("organization_id", organizationId);

    if (error) throw new FallaDeLaBase(error);

    revalidateWorkboard();
    return leerTareaConVinculos(row.task_id as string, organizationId);
  });
}

export async function getTaskAttachmentUrlAction(
  attachmentId: unknown
): Promise<MutationResult<{ url: string; fileName: string; mimeType: string | null }>> {
  return mutacionConErroresEsperables("[getTaskAttachmentUrl]", async () => {
    const id = validar(uuidSchema.safeParse(attachmentId));
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const admin = createAdminClient();

    const { data: row, error: lecturaError } = await supabase
      .from("workboard_task_attachments")
      .select("storage_path, file_name, mime_type")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (lecturaError) throw new FallaDeLaBase(lecturaError);
    if (!row?.storage_path) throw new ErrorEsperable(ADJUNTO_NO_ENCONTRADO);

    const { data, error } = await admin.storage
      .from(WORKBOARD_ATTACHMENTS_BUCKET)
      .createSignedUrl(assertOrgStoragePath(row.storage_path, organizationId), 3600);

    if (error) throw error;
    if (!data?.signedUrl) {
      throw new FallaDeLaBase({ message: "Storage no devolvió la URL firmada del adjunto" });
    }

    return {
      url: data.signedUrl,
      fileName: row.file_name as string,
      mimeType: (row.mime_type as string | null) ?? null,
    };
  });
}

const taskSopSchema = z.object({
  taskId: uuidSchema,
  sopId: z.union([uuidSchema, z.null()]),
});

export async function setTaskLinkedSopAction(
  input: unknown
): Promise<MutationResult<WorkboardTask>> {
  return mutacionConErroresEsperables("[setTaskLinkedSop]", async () => {
    const { taskId, sopId } = validar(taskSopSchema.safeParse(input));
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    if (sopId) {
      const { data: sop, error: sopError } = await supabase
        .from("sops")
        .select("id")
        .eq("id", sopId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (sopError) throw new FallaDeLaBase(sopError);
      if (!sop) throw new ErrorEsperable("SOP no encontrado");
    }

    const { error } = await supabase
      .from("workboard_tasks")
      .update({
        sop_id: sopId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId)
      .eq("organization_id", organizationId);

    if (error) {
      if (isMissingColumnError(error.message, "sop_id")) {
        throw new ErrorEsperable(
          "Falta la columna workboard_tasks.sop_id. Aplicá la migración 20260714100000_workboard_task_links.sql."
        );
      }
      throw new FallaDeLaBase(error);
    }

    revalidateWorkboard();
    return leerTareaConVinculos(taskId, organizationId);
  });
}

const taskDocumentSchema = z.object({
  taskId: uuidSchema,
  documentId: uuidSchema,
});

export async function linkTaskDocumentAction(
  input: unknown
): Promise<MutationResult<WorkboardTask>> {
  return mutacionConErroresEsperables("[linkTaskDocument]", async () => {
    const { taskId, documentId } = validar(taskDocumentSchema.safeParse(input));
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const [tareaRes, docRes] = await Promise.all([
      supabase
        .from("workboard_tasks")
        .select("id")
        .eq("id", taskId)
        .eq("organization_id", organizationId)
        .maybeSingle(),
      supabase
        .from("business_context_documents")
        .select("id")
        .eq("id", documentId)
        .eq("organization_id", organizationId)
        .maybeSingle(),
    ]);

    if (tareaRes.error) throw new FallaDeLaBase(tareaRes.error);
    if (docRes.error) throw new FallaDeLaBase(docRes.error);
    if (!tareaRes.data) throw new ErrorEsperable(TAREA_NO_ENCONTRADA);
    if (!docRes.data) throw new ErrorEsperable("Documento no encontrado");

    const { error } = await supabase.from("workboard_task_documents").insert({
      task_id: taskId,
      document_id: documentId,
      organization_id: organizationId,
    });

    if (error) {
      if (error.code === "23505") return leerTareaConVinculos(taskId, organizationId);
      if (isMissingTableError(error.message)) {
        throw new ErrorEsperable(
          "Falta la tabla workboard_task_documents. Aplicá la migración 20260714100000_workboard_task_links.sql."
        );
      }
      throw new FallaDeLaBase(error);
    }

    revalidateWorkboard();
    return leerTareaConVinculos(taskId, organizationId);
  });
}

export async function unlinkTaskDocumentAction(
  input: unknown
): Promise<MutationResult<WorkboardTask>> {
  return mutacionConErroresEsperables("[unlinkTaskDocument]", async () => {
    const { taskId, documentId } = validar(taskDocumentSchema.safeParse(input));
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { error } = await supabase
      .from("workboard_task_documents")
      .delete()
      .eq("task_id", taskId)
      .eq("document_id", documentId)
      .eq("organization_id", organizationId);

    if (error) throw new FallaDeLaBase(error);

    revalidateWorkboard();
    return leerTareaConVinculos(taskId, organizationId);
  });
}

export type WorkboardLinkPickerOption = {
  id: string;
  title: string;
  subtitle?: string;
};

export async function listWorkboardLinkOptionsAction(): Promise<
  MutationResult<{
    sops: WorkboardLinkPickerOption[];
    documents: WorkboardLinkPickerOption[];
  }>
> {
  return mutacionConErroresEsperables("[listWorkboardLinkOptions]", async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const [sopsRes, docsRes] = await Promise.all([
      supabase
        .from("sops")
        .select("id, title, department")
        .eq("organization_id", organizationId)
        .order("updated_at", { ascending: false }),
      supabase
        .from("business_context_documents")
        .select("id, title, category")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
    ]);

    // Una tabla que falta se lee como vacía, como antes; otro error es una falla.
    for (const res of [sopsRes, docsRes]) {
      if (res.error && !isMissingTableError(res.error.message)) {
        throw new FallaDeLaBase(res.error);
      }
    }

    return {
      sops: (sopsRes.data ?? []).map((row) => ({
        id: row.id as string,
        title: row.title as string,
        subtitle: row.department as string | undefined,
      })),
      documents: (docsRes.data ?? []).map((row) => ({
        id: row.id as string,
        title: row.title as string,
        subtitle: row.category as string | undefined,
      })),
    };
  });
}

export async function getWorkboardTaskByIdAction(
  taskId: string
): Promise<MutationResult<WorkboardTask>> {
  return mutacionConErroresEsperables("[getWorkboardTaskById]", async () => {
    const id = validar(uuidSchema.safeParse(taskId));
    const organizationId = await requireOrganizationId();
    return leerTareaConVinculos(id, organizationId);
  });
}
