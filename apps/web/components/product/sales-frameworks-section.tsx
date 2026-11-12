"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Input,
  Textarea,
} from "@ai-coo/ui";
import {
  deleteSalesFrameworkAction,
  getSalesFrameworksAction,
  saveSalesFrameworkAction,
} from "@/app/product/actions";
import type { SalesFrameworkRow } from "@/lib/product/mapper";
import { useToast } from "@/providers/toast-provider";
import { esRechazoPorModulo, type RechazoPorModulo } from "@/lib/auth/regla-de-modulo";
import { SinAcceso } from "@/components/platform/sin-acceso";
import { getPermissionModuleLabel } from "@/constants/permission-modules";

const FRAMEWORK_TYPES = [
  { value: "script", label: "Script" },
  { value: "objeciones", label: "Objeciones" },
  { value: "followup", label: "Follow-up" },
  { value: "onboarding", label: "Onboarding" },
  { value: "otro", label: "Otro" },
] as const;

export function SalesFrameworksSection({
  canEdit,
}: {
  canEdit: boolean;
}) {
  const { push } = useToast();
  const [frameworks, setFrameworks] = useState<SalesFrameworkRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SalesFrameworkRow | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState<string>("otro");
  const [rechazo, setRechazo] = useState<RechazoPorModulo | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const rows = await getSalesFrameworksAction();
      if (esRechazoPorModulo(rows)) setRechazo(rows);
      else setFrameworks(rows);
      setLoaded(true);
    });
  }, []);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setContent("");
    setType("otro");
    setOpen(true);
  };

  const openEdit = (row: SalesFrameworkRow) => {
    setEditing(row);
    setName(row.name);
    setDescription(row.description ?? "");
    setContent(row.content);
    setType(row.type ?? "otro");
    setOpen(true);
  };

  const handleSave = () => {
    startTransition(async () => {
      const result = await saveSalesFrameworkAction({
        id: editing?.id,
        name,
        description: description || undefined,
        content,
        type,
      });
      if (!result.success) {
        push({ title: "No se pudo guardar", description: result.error });
        return;
      }
      const recargados = await getSalesFrameworksAction();
      if (esRechazoPorModulo(recargados)) setRechazo(recargados);
      else setFrameworks(recargados);
      setOpen(false);
      push({ title: "Framework guardado", variant: "success" });
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const result = await deleteSalesFrameworkAction(id);
      if (!result.success) {
        push({ title: "No se pudo eliminar", description: result.error });
        return;
      }
      const recargados = await getSalesFrameworksAction();
      if (esRechazoPorModulo(recargados)) setRechazo(recargados);
      else setFrameworks(recargados);
      push({ title: "Framework archivado", variant: "success" });
    });
  };

  const selectClass =
    "flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

  // Sin Operaciones la recarga vuelve rechazada: pasa si los permisos cambian
  // con la pantalla abierta (SCRUM-541).
  if (rechazo) {
    return <SinAcceso moduleLabel={getPermissionModuleLabel(rechazo.moduleId)} />;
  }

  return (
    <section id="frameworks" className="scroll-mt-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">Frameworks de ventas</h2>
        {canEdit ? (
          <Button
            type="button"
            size="sm"
            className="bg-brand-600 hover:bg-brand-700"
            onClick={openCreate}
          >
            Nuevo framework
          </Button>
        ) : null}
      </div>

      {frameworks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {loaded
            ? "Todavía no hay frameworks. Creá uno manualmente o usá la sugerencia RAG."
            : "Cargando frameworks…"}
        </p>
      ) : (
        <div className="space-y-3">
          {frameworks.map((fw) => (
            <div
              key={fw.id}
              className="rounded-xl border border-border bg-card/50 p-4 dark:border-white/8"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground">{fw.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {fw.type ?? "otro"}
                  </p>
                </div>
                {canEdit ? (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => openEdit(fw)}
                    >
                      Editar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={pending}
                      onClick={() => handleDelete(fw.id)}
                    >
                      Archivar
                    </Button>
                  </div>
                ) : null}
              </div>
              {fw.description ? (
                <p className="mt-2 text-xs text-muted-foreground">{fw.description}</p>
              ) : null}
              <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs text-foreground/80">
                {fw.content}
              </p>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[min(90vh,720px)] max-w-lg flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0">
            <DialogTitle>
              {editing ? "Editar framework" : "Nuevo framework"}
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
            <FormField label="Nombre" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
            <FormField label="Tipo">
              <select
                className={selectClass}
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                {FRAMEWORK_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Descripción">
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </FormField>
            <FormField label="Contenido" required>
              <Textarea
                className="min-h-[200px]"
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </FormField>
          </div>
          <DialogFooter className="shrink-0">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={pending || !name.trim() || !content.trim()} onClick={handleSave}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
