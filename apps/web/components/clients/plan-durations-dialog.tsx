"use client";

import { useState, useTransition } from "react";
import { Pencil, Sparkles } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Input,
} from "@ai-coo/ui";
import {
  listPlanDurationsAction,
  resolvePlanDurationsAction,
  updatePlanDurationAction,
} from "@/app/clients/plan-duration-actions";
import { useToast } from "@/providers/toast-provider";
import { correrMutacion } from "@/lib/client/correr-accion";
import type { PlanDuration } from "@/types/plan-durations";

const SOURCE_LABEL: Record<PlanDuration["source"], string> = {
  rag: "Inferido (IA)",
  manual: "Manual",
  unknown: "Sin datos",
};

export function PlanDurationsDialog({
  open,
  onOpenChange,
  planNames,
  durations,
  onUpdated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planNames: string[];
  durations: PlanDuration[];
  onUpdated: (next: PlanDuration[]) => void;
}) {
  const { push } = useToast();
  const [pending, startTransition] = useTransition();
  const [editingPlan, setEditingPlan] = useState<string | null>(null);
  const [daysInput, setDaysInput] = useState("");

  const durationByPlan = new Map(
    durations.map((d) => [d.planName.toLowerCase(), d])
  );

  const openEdit = (planName: string) => {
    const existing = durationByPlan.get(planName.toLowerCase());
    setEditingPlan(planName);
    setDaysInput(
      existing?.durationDays != null ? String(existing.durationDays) : ""
    );
  };

  const handleInfer = () => {
    startTransition(async () => {
      await correrMutacion({
        accion: () => resolvePlanDurationsAction(planNames),
        alExito: async ({ resolved }) => {
          push({
            title: "Duraciones actualizadas",
            description: `${resolved} plan(es) procesados`,
            variant: "success",
          });
          // Si la relectura falla, avisa con su motivo y la lista queda como
          // estaba (SCRUM-516): antes se reemplazaba por una vacía.
          await correrMutacion({
            accion: listPlanDurationsAction,
            alExito: onUpdated,
            avisar: push,
            tituloError: "No se pudieron recargar las duraciones",
            etiqueta: "[PlanDurationsDialog] recargar",
          });
        },
        avisar: push,
        tituloError: "No se pudo inferir",
        etiqueta: "[PlanDurationsDialog] inferir",
      });
    });
  };

  const handleSaveManual = () => {
    if (!editingPlan) return;
    const parsed = daysInput.trim() ? Number(daysInput) : null;
    if (parsed != null && (!Number.isFinite(parsed) || parsed < 1)) {
      push({ title: "Duración inválida", description: "Ingresá un número de días positivo." });
      return;
    }

    startTransition(async () => {
      await correrMutacion({
        accion: () =>
          updatePlanDurationAction({
            planName: editingPlan,
            durationDays: parsed,
          }),
        alExito: (guardada) => {
          onUpdated(
            durations.some((d) => d.planName.toLowerCase() === editingPlan.toLowerCase())
              ? durations.map((d) =>
                  d.planName.toLowerCase() === editingPlan.toLowerCase() ? guardada : d
                )
              : [...durations, guardada]
          );
          setEditingPlan(null);
          push({ title: "Duración guardada", variant: "success" });
        },
        avisar: push,
        tituloError: "No se pudo guardar",
        etiqueta: "[PlanDurationsDialog] guardar",
      });
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Duración de planes</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          La IA infiere la duración desde tu base de conocimiento. Podés corregir
          manualmente cualquier plan.
        </p>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={pending || planNames.length === 0}
          onClick={handleInfer}
        >
          <Sparkles className="h-4 w-4" />
          Inferir desde base de conocimiento
        </Button>

        <ul className="max-h-64 space-y-2 overflow-y-auto">
          {planNames.length === 0 ? (
            <li className="text-sm text-muted-foreground">
              No hay planes asignados a clientes todavía.
            </li>
          ) : (
            planNames.map((plan) => {
              const row = durationByPlan.get(plan.toLowerCase());
              return (
                <li
                  key={plan}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{plan}</p>
                    <p className="text-xs text-muted-foreground">
                      {row?.durationDays != null
                        ? `${row.durationDays} días · ${SOURCE_LABEL[row.source]}`
                        : "Sin datos de duración"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 gap-1"
                    onClick={() => openEdit(plan)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </Button>
                </li>
              );
            })
          )}
        </ul>

        {editingPlan ? (
          <FormField label={`Duración de "${editingPlan}" (días)`}>
            <Input
              type="number"
              min={1}
              placeholder="Ej: 180"
              value={daysInput}
              onChange={(e) => setDaysInput(e.target.value)}
            />
          </FormField>
        ) : null}

        <DialogFooter>
          {editingPlan ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingPlan(null)}
              >
                Cancelar
              </Button>
              <Button type="button" disabled={pending} onClick={handleSaveManual}>
                Guardar
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
