"use client";

import React, { useState, useTransition } from "react";
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
import { Pencil, Plus, Trash2, X } from "lucide-react";
import {
  createPlanAction,
  deletePlanAction,
  updatePlanAction,
} from "@/app/clients/plan-actions";
import { useToast } from "@/providers/toast-provider";
import type { InstallmentSystem, Plan } from "@/types/plans";
import { montoACentavos } from "@/lib/clients/payment-utils";

// ── Formulario de sistema de cuotas (inline) ─────────────────────────────────

type SystemDraft = {
  id: string;
  name: string;
  count: string;
  amountPerInstallment: string;
};

function newSystemDraft(): SystemDraft {
  return {
    id: `draft-${Date.now()}`,
    name: "",
    count: "2",
    amountPerInstallment: "",
  };
}

function draftToSystem(d: SystemDraft): InstallmentSystem {
  return {
    id: d.id.startsWith("draft-") ? `sys-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` : d.id,
    name: d.name.trim() || `${d.count} cuotas`,
    count: Number(d.count) || 1,
    amountPerInstallment: Number(d.amountPerInstallment) || 0,
  };
}

// ── Estado del formulario de plan ─────────────────────────────────────────────

/**
 * El motivo por el que el plan no se puede guardar, o null. El monto por
 * cuota admite hasta dos decimales (SCRUM-504): un plan con 333.333 dejaba
 * el pago de la cuota sin registrar.
 */
export function validarPlan(form: PlanFormState): string | null {
  if (!form.name.trim()) return "El nombre del plan es obligatorio.";
  for (const s of form.systems) {
    const count = Number(s.count);
    if (!Number.isFinite(count) || count < 1)
      return `Sistema "${s.name || "sin nombre"}": el número de cuotas debe ser positivo.`;
    if (s.amountPerInstallment.trim() && montoACentavos(Number(s.amountPerInstallment)) === null)
      return `Sistema "${s.name || "sin nombre"}": el monto por cuota puede tener hasta dos decimales.`;
  }
  return null;
}

type PlanFormState = {
  name: string;
  durationDays: string;
  systems: SystemDraft[];
};

function emptyForm(): PlanFormState {
  return { name: "", durationDays: "", systems: [] };
}

function planToForm(plan: Plan): PlanFormState {
  return {
    name: plan.name,
    durationDays: plan.durationDays != null ? String(plan.durationDays) : "",
    systems: plan.installmentSystems.map((s) => ({
      id: s.id,
      name: s.name,
      count: String(s.count),
      amountPerInstallment: String(s.amountPerInstallment),
    })),
  };
}

// ── Subcomponente: formulario de plan ─────────────────────────────────────────

function PlanForm({
  form,
  onChange,
}: {
  form: PlanFormState;
  onChange: (next: PlanFormState) => void;
}) {
  const addSystem = () =>
    onChange({ ...form, systems: [...form.systems, newSystemDraft()] });

  const removeSystem = (id: string) =>
    onChange({ ...form, systems: form.systems.filter((s) => s.id !== id) });

  const updateSystem = (id: string, patch: Partial<SystemDraft>) =>
    onChange({
      ...form,
      systems: form.systems.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });

  return (
    <div className="space-y-4">
      <FormField label="Nombre del plan *">
        <Input
          placeholder="Ej: Programa High Ticket 12 semanas"
          value={form.name}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...form, name: e.target.value })}
        />
      </FormField>

      <FormField label="Duración (días, opcional)">
        <Input
          type="number"
          min={1}
          placeholder="Ej: 84 (12 semanas)"
          value={form.durationDays}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...form, durationDays: e.target.value })}
        />
      </FormField>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Sistemas de cuotas
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1 h-7 text-xs"
            onClick={addSystem}
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar sistema
          </Button>
        </div>

        {form.systems.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            Sin sistemas de cuotas configurados. Podés agregar uno o más (ej: &quot;2 cuotas&quot;, &quot;3 cuotas VIP&quot;).
          </p>
        ) : (
          <div className="space-y-2">
            {form.systems.map((sys) => (
              <div
                key={sys.id}
                className="grid gap-2 rounded-lg border border-border/60 p-3 sm:grid-cols-[1fr_80px_100px_32px]"
              >
                <FormField label="Nombre del sistema" className="min-w-0">
                  <Input
                    placeholder="Ej: 2 cuotas"
                    value={sys.name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateSystem(sys.id, { name: e.target.value })}
                  />
                </FormField>
                <FormField label="N° cuotas">
                  <Input
                    type="number"
                    min={1}
                    value={sys.count}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateSystem(sys.id, { count: e.target.value })}
                  />
                </FormField>
                <FormField label="Monto por cuota">
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={sys.amountPerInstallment}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      updateSystem(sys.id, { amountPerInstallment: e.target.value })
                    }
                  />
                </FormField>
                <div className="flex items-end pb-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => { removeSystem(sys.id); }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function PlanManagerDialog({
  open,
  onOpenChange,
  plans,
  onUpdated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plans: Plan[];
  onUpdated: (next: Plan[]) => void;
}) {
  const { push } = useToast();
  const [pending, startTransition] = useTransition();

  // null = listado; "new" = crear; plan.id = editar
  const [mode, setMode] = useState<"list" | "new" | string>("list");
  const [form, setForm] = useState<PlanFormState>(emptyForm());

  const openNew = () => {
    setForm(emptyForm());
    setMode("new");
  };

  const openEdit = (plan: Plan) => {
    setForm(planToForm(plan));
    setMode(plan.id);
  };

  const cancelForm = () => {
    setMode("list");
    setForm(emptyForm());
  };

  const handleSave = () => {
    const err = validarPlan(form);
    if (err) {
      push({ title: err });
      return;
    }

    startTransition(async () => {
      const systems = form.systems.map(draftToSystem);
      const durationDays = form.durationDays
        ? (Number(form.durationDays) || null)
        : null;

      if (mode === "new") {
        const result = await createPlanAction({
          name: form.name,
          durationDays,
          installmentSystems: systems,
        });
        if (!result.success) {
          push({ title: "No se pudo crear el plan", description: result.error });
          return;
        }
        onUpdated([result.data!, ...plans]);
        push({ title: "Plan creado", variant: "success" });
      } else {
        // editar
        const result = await updatePlanAction(mode, {
          name: form.name,
          durationDays,
          installmentSystems: systems,
        });
        if (!result.success) {
          push({ title: "No se pudo actualizar el plan", description: result.error });
          return;
        }
        onUpdated(plans.map((p) => (p.id === mode ? result.data! : p)));
        push({ title: "Plan actualizado", variant: "success" });
      }

      cancelForm();
    });
  };

  const handleDelete = (planId: string, planName: string) => {
    startTransition(async () => {
      const result = await deletePlanAction(planId);
      if (!result.success) {
        push({ title: "No se pudo eliminar el plan", description: result.error });
        return;
      }
      onUpdated(plans.filter((p) => p.id !== planId));
      push({ title: `Plan "${planName}" eliminado`, variant: "success" });
    });
  };

  const isEditing = mode !== "list";
  const editingPlan = typeof mode === "string" && mode !== "list" && mode !== "new"
    ? plans.find((p) => p.id === mode)
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,700px)] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>
            {mode === "list"
              ? "Planes"
              : mode === "new"
                ? "Nuevo plan"
                : `Editar plan: ${editingPlan?.name ?? ""}`}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {isEditing ? (
            <PlanForm form={form} onChange={setForm} />
          ) : (
            <div className="space-y-2">
              {plans.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No hay planes creados todavía.
                </p>
              ) : (
                plans.map((plan) => (
                  <div
                    key={plan.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-border/60 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{plan.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {plan.durationDays != null
                          ? `${plan.durationDays} días · `
                          : ""}
                        {plan.installmentSystems.length === 0
                          ? "Sin sistemas de cuotas"
                          : plan.installmentSystems
                              .map(
                                (s) =>
                                  `${s.name || `${s.count} cuotas`}${s.amountPerInstallment > 0 ? ` ($${s.amountPerInstallment.toLocaleString("es-AR")} c/u)` : ""}`
                              )
                              .join(" · ")}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-1 h-8"
                        onClick={() => openEdit(plan)}
                        disabled={pending}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(plan.id, plan.name)}
                        disabled={pending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t px-6 py-4">
          {isEditing ? (
            <>
              <Button type="button" variant="outline" onClick={cancelForm} disabled={pending}>
                Cancelar
              </Button>
              <Button type="button" onClick={handleSave} disabled={pending}>
                {pending ? "Guardando…" : "Guardar plan"}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cerrar
              </Button>
              <Button type="button" onClick={openNew} className="gap-2">
                <Plus className="h-4 w-4" />
                Nuevo plan
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
