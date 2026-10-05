"use client";

import { useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button, Textarea } from "@ai-coo/ui";
import {
  deleteWeeklyInputAction,
  updateWeeklyInputAction,
} from "@/app/operations/actions";
import { correrMutacion } from "@/lib/client/correr-accion";
import { useToast } from "@/providers/toast-provider";
import type { Department } from "@/types/operations";

export function WeeklyInputRowActions({
  inputId,
  department,
  content,
  rating,
  onChanged,
}: {
  inputId: string;
  department: Department;
  content: string;
  rating?: number;
  onChanged?: () => void;
}) {
  const { push } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!window.confirm("¿Eliminar este input semanal?")) return;
    startTransition(async () => {
      await correrMutacion({
        accion: () => deleteWeeklyInputAction(inputId),
        avisar: push,
        tituloError: "No se pudo eliminar",
        etiqueta: "[WeeklyInputRowActions] eliminar",
        alExito: () => {
          push({ title: "Input eliminado", variant: "success" });
          onChanged?.();
        },
      });
    });
  }

  function handleSave() {
    startTransition(async () => {
      await correrMutacion({
        accion: () =>
          updateWeeklyInputAction(inputId, {
            department,
            content: draft.trim() || undefined,
            rating,
          }),
        avisar: push,
        tituloError: "No se pudo guardar",
        etiqueta: "[WeeklyInputRowActions] editar",
        alExito: () => {
          push({ title: "Input actualizado", variant: "success" });
          setEditing(false);
          onChanged?.();
        },
      });
    });
  }

  if (editing) {
    return (
      <div className="mt-2 space-y-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          disabled={pending}
        />
        <div className="flex gap-2">
          <Button type="button" size="sm" disabled={pending} onClick={handleSave}>
            Guardar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => {
              setDraft(content);
              setEditing(false);
            }}
          >
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 flex gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2"
        disabled={pending}
        onClick={() => setEditing(true)}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-destructive hover:text-destructive"
        disabled={pending}
        onClick={handleDelete}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
