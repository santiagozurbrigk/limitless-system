import {
  isMissingColumnError,
  isMissingTableError,
} from "@/lib/auth/bootstrap";
import { ErrorEsperable, FallaDeLaBase } from "@/lib/server/action-result";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { soloRutasDeLaOrg } from "@/lib/storage/org-path";
import { WORKBOARD_ATTACHMENTS_BUCKET } from "@/lib/workboard/constants";
import { rowToMember, rowToTask, type WorkboardTaskRow } from "@/lib/workboard/mapper";
import {
  emptyTaskLinks,
  rowToTaskAttachment,
  type TaskLinksByTaskId,
} from "@/lib/workboard/task-links";
import type { WorkboardTask, WorkboardTaskLinkedDocument } from "@/types/workboard";

/**
 * Lecturas y limpieza de las tareas del Tablero con sus vínculos (adjuntos,
 * documentos y SOP), del lado del servidor.
 *
 * SCRUM-503: vivían en `app/workboard/task-link-actions.ts`, un archivo
 * `"use server"`, así que cada función exportada era también una server action
 * que cualquiera podía llamar con un `organizationId` a elección (la RLS cortaba
 * las filas ajenas, pero no tenían por qué ser un endpoint). Acá son funciones
 * comunes que sólo llaman las acciones del Tablero.
 */

/** Lo que ve el usuario cuando la tarea ya no está o es de otra organización. */
export const TAREA_NO_ENCONTRADA = "No se encontró la tarea. Puede que la hayan eliminado.";

/** Código de PostgREST cuando `.single()` no encuentra la fila. */
const SIN_FILAS = "PGRST116";

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

/**
 * La tarea con sus responsables y vínculos. Si no está (o es de otra
 * organización) es un rechazo esperable; cualquier otro error de la base, una
 * `FallaDeLaBase`.
 */
export async function leerTareaConVinculos(
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

  let { data, error } = await supabase
    .from("workboard_tasks")
    .select("*, sops(id, title)")
    .eq("id", taskId)
    .eq("organization_id", organizationId)
    .single();

  if (error && isMissingColumnError(error.message, "sop_id")) {
    ({ data, error } = await supabase
      .from("workboard_tasks")
      .select("*")
      .eq("id", taskId)
      .eq("organization_id", organizationId)
      .single());
  }

  if (error) {
    if (error.code === SIN_FILAS) throw new ErrorEsperable(TAREA_NO_ENCONTRADA);
    throw new FallaDeLaBase(error);
  }

  return rowToTask(data as WorkboardTaskRow, memberMap, links);
}

/** Borra de Storage los adjuntos de una tarea de la organización (antes de borrar la tarea). */
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
