"use client";

import { useState, useTransition } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from "@ai-coo/ui";
import { createSprintAction } from "@/app/workboard/actions";
import { SPRINT_AREA_FOCUS_OPTIONS } from "@/lib/workboard/constants";
import { CampoFecha } from "@/components/shared/campo-fecha";
import { fechaDeHoyEnZona, sumarDias } from "@/lib/fechas/calendario";
import { useZonaDeLaOrganizacion } from "@/providers/zona-de-la-organizacion-provider";
import type { SprintAreaFocus, WorkboardSprint } from "@/types/workboard";

/** Un sprint dura dos semanas por defecto: termina 14 días después de hoy (en la org). */
function defaultEndDate(zona: string | null): string {
  return sumarDias(fechaDeHoyEnZona(zona), 14);
}

export function CreateSprintModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (sprint: WorkboardSprint) => void;
}) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [areaFocus, setAreaFocus] = useState<SprintAreaFocus>("general");
  const zonaDeLaOrganizacion = useZonaDeLaOrganizacion();
  const [startDate, setStartDate] = useState(() => fechaDeHoyEnZona(zonaDeLaOrganizacion));
  const [endDate, setEndDate] = useState(() => defaultEndDate(zonaDeLaOrganizacion));
  const [pending, startTransition] = useTransition();

  function resetForm() {
    setName("");
    setGoal("");
    setAreaFocus("general");
    setStartDate(fechaDeHoyEnZona(zonaDeLaOrganizacion));
    setEndDate(defaultEndDate(zonaDeLaOrganizacion));
  }

  function handleCreate() {
    if (!name.trim()) return;
    startTransition(async () => {
      const sprint = await createSprintAction({
        name: name.trim(),
        goal: goal.trim() || undefined,
        areaFocus,
        startDate,
        endDate,
      });
      resetForm();
      onCreated(sprint);
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo sprint</DialogTitle>
          <DialogDescription>
            Definí el objetivo y el período del próximo ciclo de trabajo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="sprint-name">Nombre</Label>
            <Input
              id="sprint-name"
              placeholder="Sprint 3 · Junio"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sprint-goal">Objetivo</Label>
            <Textarea
              id="sprint-goal"
              placeholder="¿Qué querés lograr este sprint?"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sprint-area">Área de foco</Label>
            <select
              id="sprint-area"
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              value={areaFocus}
              onChange={(e) => setAreaFocus(e.target.value as SprintAreaFocus)}
            >
              {SPRINT_AREA_FOCUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sprint-start">Fecha inicio</Label>
              <CampoFecha
                id="sprint-start"
                value={startDate}
                onChange={(fecha) => setStartDate(fecha ?? "")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sprint-end">Fecha fin</Label>
              <CampoFecha
                id="sprint-end"
                value={endDate}
                onChange={(fecha) => setEndDate(fecha ?? "")}
              />
            </div>
          </div>
          <p className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            Al crear un nuevo sprint, el sprint activo actual se marcará como
            completado automáticamente.
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={pending || !name.trim()} onClick={handleCreate}>
            {pending ? "Creando…" : "Crear sprint"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
