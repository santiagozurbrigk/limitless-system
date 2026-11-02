"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, FilePlus, Trash2 } from "lucide-react";
import { Button } from "@ai-coo/ui";
import { Panel } from "@/components/shared/panel";
import {
  deleteDocumentAction,
  getDocumentOriginalFileUrlAction,
} from "@/app/business-context/actions";
import { paths } from "@/routes";
import { rutaPermitidaParaLaExperiencia } from "@/lib/navigation/rutas-por-experiencia";
import { useExperiencia } from "@/providers/experiencia-provider";
import { useToast } from "@/providers/toast-provider";
import type { ContextDocument } from "@/types/business-context";
import { SuggestedCallTasksPanel } from "./suggested-call-tasks-panel";

export function DocumentViewerSidebar({
  document,
}: {
  document: ContextDocument;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  // «Generar SOP» lleva a la biblioteca de SOP: sólo si la experiencia la abre
  // (en `limitless` está cerrada y el link rebotaría a Clientes; SCRUM-524).
  const puedeGenerarSop = rutaPermitidaParaLaExperiencia(
    useExperiencia(),
    paths.platform.operations.sops
  );

  useEffect(() => {
    setConfirmDelete(false);
  }, [document.id]);

  const hasOriginalFile = Boolean(document.storagePath);

  function handleOpenOriginal() {
    startTransition(async () => {
      const res = await getDocumentOriginalFileUrlAction(document.id);
      if (!res.success) {
        push({ title: "No se pudo abrir el archivo", description: res.error });
        return;
      }
      window.open(res.data.url, "_blank", "noopener,noreferrer");
    });
  }

  function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    startTransition(async () => {
      const res = await deleteDocumentAction(document.id);
      if (!res.success) {
        push({ title: "No se pudo eliminar", description: res.error });
        setConfirmDelete(false);
        return;
      }
      push({
        title: "Documento eliminado",
        description: "Se quitó de la base de conocimiento y del índice RAG.",
        variant: "success",
      });
      router.push(paths.platform.businessContext.documents);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <SuggestedCallTasksPanel document={document} />

      <Panel title="Acciones">
        <div className="flex flex-col gap-2">
          {hasOriginalFile ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="justify-start gap-2"
              disabled={pending}
              onClick={handleOpenOriginal}
            >
              <ExternalLink className="h-4 w-4" />
              Abrir archivo original
            </Button>
          ) : null}
          <Button
            type="button"
            variant={confirmDelete ? "destructive" : "outline"}
            size="sm"
            className="justify-start gap-2"
            disabled={pending}
            onClick={handleDelete}
          >
            <Trash2 className="h-4 w-4" />
            {pending
              ? "Eliminando…"
              : confirmDelete
                ? "Confirmar eliminación"
                : "Eliminar documento"}
          </Button>
          {puedeGenerarSop ? (
            <Button
              asChild
              size="sm"
              className="justify-start gap-2 bg-brand-600 hover:bg-brand-700"
            >
              <Link href={`${paths.platform.operations.sops}#crear`}>
                <FilePlus className="h-4 w-4" />
                Generar SOP
              </Link>
            </Button>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
