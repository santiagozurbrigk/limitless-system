"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { BookOpen, ExternalLink, FileText, Paperclip, Trash2, X } from "lucide-react";
import { Button, Label, cn } from "@ai-coo/ui";
import {
  deleteTaskAttachmentAction,
  finalizeTaskAttachmentAction,
  getTaskAttachmentUrlAction,
  getWorkboardTaskByIdAction,
  linkTaskDocumentAction,
  listWorkboardLinkOptionsAction,
  prepareTaskAttachmentUploadAction,
  setTaskLinkedSopAction,
  unlinkTaskDocumentAction,
  type WorkboardLinkPickerOption,
} from "@/app/workboard/task-link-actions";
import { WORKBOARD_ATTACHMENTS_ACCEPT } from "@/lib/workboard/constants";
import { isNextRouterError } from "next/dist/client/components/is-next-router-error";
import { correrMutacion, ERROR_INESPERADO } from "@/lib/client/correr-accion";
import { paths } from "@/routes";
import { useToast } from "@/providers/toast-provider";
import type { WorkboardTask } from "@/types/workboard";

export type WorkboardTaskResourcesDraft = {
  pendingFiles: File[];
  sopId: string | null;
  documentIds: string[];
};

const EMPTY_DRAFT: WorkboardTaskResourcesDraft = {
  pendingFiles: [],
  sopId: null,
  documentIds: [],
};

/**
 * Lo que devuelven `uploadTaskAttachmentFile` y `applyDraftTaskResources`
 * cuando algo lanza (la red, la subida a Storage, una acción): se registra en
 * la consola y el motivo es el texto fijo. Nunca rechazan (SCRUM-503). Un
 * redirect de Next se relanza para que navegue.
 */
function falloInesperado(etiqueta: string, error: unknown): string {
  if (isNextRouterError(error)) throw error;
  console.error(etiqueta, error);
  return ERROR_INESPERADO;
}

export async function uploadTaskAttachmentFile(
  taskId: string,
  file: File
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    return await subirAdjunto(taskId, file);
  } catch (error) {
    return { ok: false, error: falloInesperado("[Workboard] subir adjunto", error) };
  }
}

async function subirAdjunto(
  taskId: string,
  file: File
): Promise<{ ok: true } | { ok: false; error: string }> {
  const prepared = await prepareTaskAttachmentUploadAction({
    taskId,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || "application/octet-stream",
  });

  if (!prepared.success) {
    return { ok: false, error: prepared.error };
  }

  const upload = await fetch(prepared.data.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": prepared.data.contentType },
    body: file,
  });

  if (!upload.ok) {
    return { ok: false, error: "No se pudo subir el archivo a Storage." };
  }

  const finalized = await finalizeTaskAttachmentAction({
    taskId,
    storagePath: prepared.data.storagePath,
    fileName: file.name,
    mimeType: prepared.data.contentType,
    fileSize: file.size,
  });

  if (!finalized.success) {
    return { ok: false, error: finalized.error };
  }

  return { ok: true };
}

export async function applyDraftTaskResources(
  taskId: string,
  draft: WorkboardTaskResourcesDraft
): Promise<string | null> {
  try {
    return await aplicarRecursos(taskId, draft);
  } catch (error) {
    return falloInesperado("[Workboard] recursos de la tarea nueva", error);
  }
}

async function aplicarRecursos(
  taskId: string,
  draft: WorkboardTaskResourcesDraft
): Promise<string | null> {
  if (draft.sopId) {
    const res = await setTaskLinkedSopAction({ taskId, sopId: draft.sopId });
    if (!res.success) return res.error;
  }

  for (const documentId of draft.documentIds) {
    const res = await linkTaskDocumentAction({ taskId, documentId });
    if (!res.success) return res.error;
  }

  for (const file of draft.pendingFiles) {
    const res = await uploadTaskAttachmentFile(taskId, file);
    if (!res.ok) return res.error;
  }

  return null;
}

export function WorkboardTaskResources({
  taskId,
  task,
  draft,
  onDraftChange,
  onTaskUpdated,
  disabled = false,
}: {
  taskId: string | null;
  task?: WorkboardTask | null;
  draft?: WorkboardTaskResourcesDraft;
  onDraftChange?: (draft: WorkboardTaskResourcesDraft) => void;
  onTaskUpdated?: (task: WorkboardTask) => void;
  disabled?: boolean;
}) {
  const { push } = useToast();
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [options, setOptions] = useState<{
    sops: WorkboardLinkPickerOption[];
    documents: WorkboardLinkPickerOption[];
  }>({ sops: [], documents: [] });
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  const isDraft = !taskId;
  const currentDraft = draft ?? EMPTY_DRAFT;

  useEffect(() => {
    let cancelled = false;
    void correrMutacion({
      accion: () => listWorkboardLinkOptionsAction(),
      alExito: (data) => {
        if (!cancelled) setOptions(data);
      },
      avisar: (aviso) => {
        if (!cancelled) push(aviso);
      },
      tituloError: "No se pudieron cargar los SOPs y documentos",
      etiqueta: "[Workboard] opciones de vínculos",
    });
    return () => {
      cancelled = true;
    };
  }, [push]);

  function updateDraft(patch: Partial<WorkboardTaskResourcesDraft>) {
    onDraftChange?.({ ...currentDraft, ...patch });
  }

  function handleFilesSelected(files: FileList | null) {
    if (!files?.length) return;
    const next = [...currentDraft.pendingFiles, ...Array.from(files)];
    if (isDraft) {
      updateDraft({ pendingFiles: next });
      return;
    }
    if (!taskId) return;

    startTransition(async () => {
      for (const file of Array.from(files)) {
        const res = await uploadTaskAttachmentFile(taskId, file);
        if (!res.ok) {
          push({ title: "No se pudo adjuntar", description: res.error });
          return;
        }
      }
      await correrMutacion({
        accion: () => getWorkboardTaskByIdAction(taskId),
        alExito: (tarea) => onTaskUpdated?.(tarea),
        avisar: push,
        tituloError: "El archivo se adjuntó, pero no se pudo recargar la tarea",
        etiqueta: "[Workboard] recargar tarea",
      });
    });
  }

  function handleSopChange(value: string) {
    const sopId = value || null;
    if (isDraft) {
      updateDraft({ sopId });
      return;
    }
    if (!taskId) return;

    startTransition(async () => {
      await correrMutacion({
        accion: () => setTaskLinkedSopAction({ taskId, sopId }),
        alExito: (tarea) => onTaskUpdated?.(tarea),
        avisar: push,
        tituloError: "No se pudo vincular el SOP",
        etiqueta: "[Workboard] vincular SOP",
      });
    });
  }

  function handleDocumentToggle(documentId: string) {
    if (isDraft) {
      const exists = currentDraft.documentIds.includes(documentId);
      const documentIds = exists
        ? currentDraft.documentIds.filter((id) => id !== documentId)
        : [...currentDraft.documentIds, documentId];
      updateDraft({ documentIds });
      return;
    }
    if (!taskId) return;

    const linked = task?.linkedDocuments.some((d) => d.id === documentId);
    startTransition(async () => {
      await correrMutacion({
        accion: () =>
          linked
            ? unlinkTaskDocumentAction({ taskId, documentId })
            : linkTaskDocumentAction({ taskId, documentId }),
        alExito: (tarea) => onTaskUpdated?.(tarea),
        avisar: push,
        tituloError: "No se pudo actualizar el vínculo",
        etiqueta: "[Workboard] vincular documento",
      });
    });
  }

  function handleOpenAttachment(attachmentId: string) {
    startTransition(async () => {
      await correrMutacion({
        accion: () => getTaskAttachmentUrlAction(attachmentId),
        alExito: (adjunto) => {
          window.open(adjunto.url, "_blank", "noopener,noreferrer");
        },
        avisar: push,
        tituloError: "No se pudo abrir",
        etiqueta: "[Workboard] abrir adjunto",
      });
    });
  }

  function handleDeleteAttachment(attachmentId: string) {
    if (confirmRemoveId !== attachmentId) {
      setConfirmRemoveId(attachmentId);
      return;
    }

    startTransition(async () => {
      await correrMutacion({
        accion: () => deleteTaskAttachmentAction(attachmentId),
        alExito: (tarea) => onTaskUpdated?.(tarea),
        avisar: push,
        tituloError: "No se pudo eliminar",
        etiqueta: "[Workboard] eliminar adjunto",
      });
      setConfirmRemoveId(null);
    });
  }

  const attachments = isDraft
    ? currentDraft.pendingFiles.map((file, index) => ({
        id: `draft-${index}`,
        fileName: file.name,
        draftFile: file,
      }))
    : (task?.attachments ?? []).map((item) => ({
        id: item.id,
        fileName: item.fileName,
        draftFile: null as File | null,
      }));

  const linkedSopId = isDraft ? currentDraft.sopId : (task?.linkedSop?.id ?? "");
  const linkedDocumentIds = isDraft
    ? currentDraft.documentIds
    : (task?.linkedDocuments.map((d) => d.id) ?? []);

  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-muted/10 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">Recursos vinculados</p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept={WORKBOARD_ATTACHMENTS_ACCEPT}
          onChange={(e) => {
            handleFilesSelected(e.target.files);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={disabled || pending}
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className="h-3.5 w-3.5" />
          Adjuntar archivo
        </Button>
      </div>

      {attachments.length > 0 ? (
        <ul className="space-y-1.5">
          {attachments.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-2 rounded-md border border-border/50 bg-background px-2 py-1.5 text-xs"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{item.fileName}</span>
              {item.draftFile ? (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    updateDraft({
                      pendingFiles: currentDraft.pendingFiles.filter(
                        (f) => f !== item.draftFile
                      ),
                    })
                  }
                  aria-label="Quitar archivo"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => handleOpenAttachment(item.id)}
                    aria-label="Abrir archivo"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "text-muted-foreground hover:text-destructive",
                      confirmRemoveId === item.id && "text-destructive"
                    )}
                    onClick={() => handleDeleteAttachment(item.id)}
                    aria-label="Eliminar adjunto"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Sin archivos adjuntos.</p>
      )}

      <div className="space-y-2">
        <Label htmlFor="wb-task-sop">SOP vinculado</Label>
        <select
          id="wb-task-sop"
          className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
          value={linkedSopId ?? ""}
          disabled={disabled || pending}
          onChange={(e) => handleSopChange(e.target.value)}
        >
          <option value="">Sin SOP</option>
          {options.sops.map((sop) => (
            <option key={sop.id} value={sop.id}>
              {sop.title}
            </option>
          ))}
        </select>
        {!isDraft && task?.linkedSop ? (
          <Button variant="link" size="sm" className="h-auto px-0" asChild>
            <Link href={paths.platform.sops.detail(task.linkedSop.id)}>
              <BookOpen className="mr-1 h-3.5 w-3.5" />
              Ver SOP
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label>Documentos de base de conocimiento</Label>
        {options.documents.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No hay documentos en la base de conocimiento.
          </p>
        ) : (
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border/50 p-2">
            {options.documents.map((doc) => {
              const checked = linkedDocumentIds.includes(doc.id);
              return (
                <label
                  key={doc.id}
                  className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-xs hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={checked}
                    disabled={disabled || pending}
                    onChange={() => handleDocumentToggle(doc.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{doc.title}</span>
                    {doc.subtitle ? (
                      <span className="text-muted-foreground">{doc.subtitle}</span>
                    ) : null}
                  </span>
                  {!isDraft && checked ? (
                    <Link
                      href={paths.platform.businessContext.viewer(doc.id)}
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  ) : null}
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
