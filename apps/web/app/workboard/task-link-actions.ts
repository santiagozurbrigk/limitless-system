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
import { runMutation, type MutationResult } from "@/lib/server/action-result";
import {
  isAllowedWorkboardAttachment,
  sanitizeFilename,
} from "@/lib/workboard/attachment-types";
import { WORKBOARD_ATTACHMENTS_BUCKET } from "@/lib/workboard/constants";
import { rowToMember, rowToTask, type WorkboardTaskRow } from "@/lib/workboard/mapper";
import {
  emptyTaskLinks,
  rowToLinkedDocument,
  rowToTaskAttachment,
  type TaskLinksByTaskId,
} from "@/lib/workboard/task-links";
import { firstZodError, uuidSchema } from "@/lib/validations";
import { paths } from "@/routes/paths";
import type { WorkboardTask, WorkboardTaskLinkedDocument } from "@/types/workboard";
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

function unwrapEmbed<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function loadTaskLinksBundle(
  organizationId: string
): Promise<TaskLinksByTaskId> {
  const links = emptyTaskLinks();
  const supabase = await createClient();

  const attachmentsRes = await supabase
    .from("workboard_task_attachments")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (!attachmentsRes.error) {
    for (const row of attachmentsRes.data ?? []) {
      const taskId = row.task_id as string;
      const list = links.attachments.get(taskId) ?? [];
      list.push(rowToTaskAttachment(row));
      links.attachments.set(taskId, list);
    }
  } else if (!isMissingTableError(attachmentsRes.error.message)) {
    console.error("[Workboard] attachments:", attachmentsRes.error.message);
  }

  const docsRes = await supabase
    .from("workboard_task_documents")
    .select(
      "task_id, document_id, business_context_documents(id, title, category)"
    )
    .eq("organization_id", organizationId);

  if (!docsRes.error) {
    for (const row of docsRes.data ?? []) {
      const doc = unwrapEmbed(
        row.business_context_documents as
          | { id: string; title: string; category: string }
          | { id: string; title: string; category: string }[]
          | null
      );
      if (!doc) continue;
      const linked: WorkboardTaskLinkedDocument = {
        id: doc.id,
        title: doc.title,
        category: doc.category,
      };
      const taskId = row.task_id as string;
      const list = links.documents.get(taskId) ?? [];
      list.push(linked);
      links.documents.set(taskId, list);
    }
  } else if (!isMissingTableError(docsRes.error.message)) {
    console.error("[Workboard] task documents:", docsRes.error.message);
  }

  const sopsRes = await supabase
    .from("workboard_tasks")
    .select("id, sop_id, sops(id, title)")
    .eq("organization_id", organizationId)
    .not("sop_id", "is", null);

  if (!sopsRes.error) {
    for (const row of sopsRes.data ?? []) {
      const sop = unwrapEmbed(
        row.sops as { id: string; title: string } | { id: string; title: string }[] | null
      );
      if (sop) {
        links.sops.set(row.id as string, { id: sop.id, title: sop.title });
      }
    }
  } else if (
    !isMissingColumnError(sopsRes.error.message, "sop_id") &&
    !isMissingTableError(sopsRes.error.message)
  ) {
    console.error("[Workboard] task sops:", sopsRes.error.message);
  }

  return links;
}

async function fetchTaskRow(
  taskId: string,
  organizationId: string
): Promise<WorkboardTask> {
  const supabase = await createClient();

  const { data: membersData } = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("organization_id", organizationId);

  const memberMap = new Map(
    (membersData ?? []).map((row) => [
      row.id as string,
      rowToMember({
        id: row.id as string,
        full_name: row.full_name as string | null,
        email: row.email as string,
        role: row.role as string,
      }),
    ])
  );

  const links = await loadTaskLinksBundle(organizationId);

  const { data, error } = await supabase
    .from("workboard_tasks")
    .select("*, sops(id, title)")
    .eq("id", taskId)
    .eq("organization_id", organizationId)
    .single();

  if (error) {
    if (isMissingColumnError(error.message, "sop_id")) {
      const fallback = await supabase
        .from("workboard_tasks")
        .select("*")
        .eq("id", taskId)
        .eq("organization_id", organizationId)
        .single();
      if (fallback.error) throw new Error(fallback.error.message);
      return rowToTask(fallback.data as WorkboardTaskRow, memberMap, links);
    }
    throw new Error(error.message);
  }

  return rowToTask(data as WorkboardTaskRow, memberMap, links);
}

export async function getWorkboardTaskByIdAction(
  taskId: string
): Promise<WorkboardTask | null> {
  const parsed = uuidSchema.safeParse(taskId);
  if (!parsed.success) return null;
  const organizationId = await requireOrganizationId();
  try {
    return await fetchTaskRow(parsed.data, organizationId);
  } catch {
    return null;
  }
}

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
  const parsed = prepareAttachmentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const { taskId, fileName, fileSize, mimeType } = parsed.data;

    const allowed = isAllowedWorkboardAttachment(fileName, mimeType, fileSize);
    if (!allowed.ok) throw new Error(allowed.error);

    const supabase = await createClient();
    const { data: task } = await supabase
      .from("workboard_tasks")
      .select("id")
      .eq("id", taskId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (!task) throw new Error("Tarea no encontrada");

    const attachmentId = crypto.randomUUID();
    const safeName = sanitizeFilename(fileName);
    const storagePath = `${organizationId}/${taskId}/${attachmentId}-${safeName}`;

    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(WORKBOARD_ATTACHMENTS_BUCKET)
      .createSignedUploadUrl(storagePath);

    if (error || !data?.signedUrl) {
      throw new Error(
        error?.message ??
          `No se pudo preparar la subida. ¿Existe el bucket "${WORKBOARD_ATTACHMENTS_BUCKET}"?`
      );
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
  const parsed = finalizeAttachmentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const uploadedBy = await currentUserId();
    const { taskId, fileName, mimeType, fileSize } = parsed.data;
    const storagePath = assertOrgStoragePath(parsed.data.storagePath, organizationId);

    const allowed = isAllowedWorkboardAttachment(fileName, mimeType, fileSize);
    if (!allowed.ok) throw new Error(allowed.error);

    const supabase = await createClient();
    const { data: task } = await supabase
      .from("workboard_tasks")
      .select("id")
      .eq("id", taskId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (!task) throw new Error("Tarea no encontrada");

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
        throw new Error(
          "Falta la tabla workboard_task_attachments. Aplicá la migración 20260714100000_workboard_task_links.sql."
        );
      }
      throw new Error(error.message);
    }

    revalidateWorkboard();
    return fetchTaskRow(taskId, organizationId);
  });
}

export async function deleteTaskAttachmentAction(
  attachmentId: unknown
): Promise<MutationResult<WorkboardTask>> {
  const parsed = uuidSchema.safeParse(attachmentId);
  if (!parsed.success) {
    return { success: false, error: firstZodError(parsed.error) };
  }

  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const admin = createAdminClient();

    const { data: row } = await supabase
      .from("workboard_task_attachments")
      .select("id, task_id, storage_path")
      .eq("id", parsed.data)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (!row) throw new Error("Adjunto no encontrado");

    const rutas = soloRutasDeLaOrg([row.storage_path as string | null], organizationId, "workboard");
    if (rutas.length > 0) {
      await admin.storage.from(WORKBOARD_ATTACHMENTS_BUCKET).remove(rutas);
    }

    const { error } = await supabase
      .from("workboard_task_attachments")
      .delete()
      .eq("id", parsed.data)
      .eq("organization_id", organizationId);

    if (error) throw new Error(error.message);

    revalidateWorkboard();
    return fetchTaskRow(row.task_id as string, organizationId);
  });
}

export async function getTaskAttachmentUrlAction(
  attachmentId: unknown
): Promise<MutationResult<{ url: string; fileName: string; mimeType: string | null }>> {
  const parsed = uuidSchema.safeParse(attachmentId);
  if (!parsed.success) {
    return { success: false, error: firstZodError(parsed.error) };
  }

  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const admin = createAdminClient();

    const { data: row } = await supabase
      .from("workboard_task_attachments")
      .select("storage_path, file_name, mime_type")
      .eq("id", parsed.data)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (!row?.storage_path) throw new Error("Adjunto no encontrado");

    const { data, error } = await admin.storage
      .from(WORKBOARD_ATTACHMENTS_BUCKET)
      .createSignedUrl(assertOrgStoragePath(row.storage_path, organizationId), 3600);

    if (error || !data?.signedUrl) {
      throw new Error(error?.message ?? "No se pudo abrir el archivo");
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
  const parsed = taskSopSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const { taskId, sopId } = parsed.data;
    const supabase = await createClient();

    if (sopId) {
      const { data: sop } = await supabase
        .from("sops")
        .select("id")
        .eq("id", sopId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (!sop) throw new Error("SOP no encontrado");
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
        throw new Error(
          "Falta la columna workboard_tasks.sop_id. Aplicá la migración 20260714100000_workboard_task_links.sql."
        );
      }
      throw new Error(error.message);
    }

    revalidateWorkboard();
    return fetchTaskRow(taskId, organizationId);
  });
}

const taskDocumentSchema = z.object({
  taskId: uuidSchema,
  documentId: uuidSchema,
});

export async function linkTaskDocumentAction(
  input: unknown
): Promise<MutationResult<WorkboardTask>> {
  const parsed = taskDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const { taskId, documentId } = parsed.data;
    const supabase = await createClient();

    const [{ data: task }, { data: doc }] = await Promise.all([
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

    if (!task) throw new Error("Tarea no encontrada");
    if (!doc) throw new Error("Documento no encontrado");

    const { error } = await supabase.from("workboard_task_documents").insert({
      task_id: taskId,
      document_id: documentId,
      organization_id: organizationId,
    });

    if (error) {
      if (error.code === "23505") return fetchTaskRow(taskId, organizationId);
      if (isMissingTableError(error.message)) {
        throw new Error(
          "Falta la tabla workboard_task_documents. Aplicá la migración 20260714100000_workboard_task_links.sql."
        );
      }
      throw new Error(error.message);
    }

    revalidateWorkboard();
    return fetchTaskRow(taskId, organizationId);
  });
}

export async function unlinkTaskDocumentAction(
  input: unknown
): Promise<MutationResult<WorkboardTask>> {
  const parsed = taskDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const { taskId, documentId } = parsed.data;
    const supabase = await createClient();

    const { error } = await supabase
      .from("workboard_task_documents")
      .delete()
      .eq("task_id", taskId)
      .eq("document_id", documentId)
      .eq("organization_id", organizationId);

    if (error) throw new Error(error.message);

    revalidateWorkboard();
    return fetchTaskRow(taskId, organizationId);
  });
}

export type WorkboardLinkPickerOption = {
  id: string;
  title: string;
  subtitle?: string;
};

export async function listWorkboardLinkOptionsAction(): Promise<{
  sops: WorkboardLinkPickerOption[];
  documents: WorkboardLinkPickerOption[];
}> {
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
}

export async function deleteTaskAttachmentsForTask(
  organizationId: string,
  taskId: string
): Promise<void> {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: rows } = await supabase
    .from("workboard_task_attachments")
    .select("storage_path")
    .eq("organization_id", organizationId)
    .eq("task_id", taskId);

  const paths = soloRutasDeLaOrg(
    (rows ?? []).map((row) => row.storage_path as string | null),
    organizationId,
    "workboard"
  );

  if (paths.length) {
    await admin.storage.from(WORKBOARD_ATTACHMENTS_BUCKET).remove(paths);
  }
}
