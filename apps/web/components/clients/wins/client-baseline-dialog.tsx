"use client";

/**
 * A · La ficha del cliente: nicho, de dónde salió y a dónde iba.
 *
 * Vive en el dashboard porque es donde el hueco se nota: ves "sin medir" y
 * arreglás la causa ahí mismo, sin ir a buscar otra pantalla.
 *
 * ⭐ El **objetivo** es la mitad que faltaba. Con el punto de partida solo, el
 * recorrido dice "500 → 8.500"; con el objetivo dice "500 → 8.500 de 10.000",
 * que es lo que permite cerrar un programa sabiendo si se cumplió.
 */

import { useEffect, useState } from "react";
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
} from "@ai-coo/ui";
import { CampoFecha } from "@/components/shared/campo-fecha";
import { fechaDeHoyLocal } from "@/lib/fechas/calendario";
import type { ClientBaseline } from "@/types/wins";
import type { ClientTracking } from "@/types/clients";

export type BaselineDraft = {
  niche: string;
  metricKey: string;
  metricValue: string;
  metricUnit: string;
  capturedAt: string;
  /** A dónde iba: el objetivo con el que entró. */
  goalText: string;
  goalMetricKey: string;
  goalMetricValue: string;
  goalMetricUnit: string;
  /** Cuándo termina su programa. */
  exitDate: string;
};

export function ClientBaselineDialog({
  open,
  clientName,
  niche,
  baseline,
  tracking,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  clientName: string;
  niche: string | null;
  baseline: ClientBaseline | null;
  tracking: ClientTracking | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (draft: BaselineDraft) => void;
}) {
  const [draft, setDraft] = useState<BaselineDraft>({
    niche: "",
    metricKey: "",
    metricValue: "",
    metricUnit: "",
    capturedAt: "",
    goalText: "",
    goalMetricKey: "",
    goalMetricValue: "",
    goalMetricUnit: "",
    exitDate: "",
  });

  useEffect(() => {
    if (!open) return;
    setDraft({
      niche: niche ?? "",
      metricKey: baseline?.metricKey ?? "",
      metricValue: baseline ? String(baseline.metricValue) : "",
      metricUnit: baseline?.metricUnit ?? "",
      capturedAt: baseline?.capturedAt?.slice(0, 10) ?? "",
      goalText: tracking?.goalText ?? "",
      goalMetricKey: tracking?.goalMetricKey ?? "",
      goalMetricValue:
        tracking?.goalMetricValue !== null && tracking?.goalMetricValue !== undefined
          ? String(tracking.goalMetricValue)
          : "",
      goalMetricUnit: tracking?.goalMetricUnit ?? "",
      exitDate: tracking?.exitDate?.slice(0, 10) ?? "",
    });
  }, [open, niche, baseline, tracking]);

  function patch(changes: Partial<BaselineDraft>) {
    setDraft((current) => ({ ...current, ...changes }));
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ficha del cliente</DialogTitle>
          <DialogDescription>
            De <strong>{clientName}</strong>. De dónde salió, a dónde iba y cuándo
            termina: son los tres datos que después dejan leer su recorrido completo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="client-niche">Nicho</Label>
            <Input
              id="client-niche"
              value={draft.niche}
              onChange={(event) => patch({ niche: event.target.value })}
              placeholder="coaching fitness"
            />
          </div>

          <div className="space-y-2 rounded-lg border border-border/60 p-3">
            <Label>Punto de partida (opcional)</Label>
            <p className="text-xs text-muted-foreground">
              Usá la misma clave y unidad que después vas a cargar en sus wins; si no,
              no se pueden comparar.
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              <Input
                aria-label="Clave"
                value={draft.metricKey}
                onChange={(event) => patch({ metricKey: event.target.value })}
                placeholder="facturacion"
              />
              <Input
                aria-label="Valor"
                inputMode="decimal"
                value={draft.metricValue}
                onChange={(event) => patch({ metricValue: event.target.value })}
                placeholder="500"
              />
              <Input
                aria-label="Unidad"
                value={draft.metricUnit}
                onChange={(event) => patch({ metricUnit: event.target.value })}
                placeholder="USD"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="baseline-date" className="text-xs">
                Cuándo se midió
              </Label>
              <CampoFecha
                id="baseline-date"
                max={fechaDeHoyLocal()}
                value={draft.capturedAt}
                onChange={(fecha) => patch({ capturedAt: fecha ?? "" })}
              />
              <p className="text-xs text-muted-foreground">
                Sin fecha no sirve para medir un plazo, así que no cuenta como punto.
              </p>
            </div>
          </div>

          {/* ⭐ A dónde iba. Se carga en el onboarding, no después. */}
          <div className="space-y-2 rounded-lg border border-border/60 p-3">
            <Label htmlFor="client-goal">Objetivo con el que entró</Label>
            <Input
              id="client-goal"
              value={draft.goalText}
              onChange={(event) => patch({ goalText: event.target.value })}
              placeholder="Vivir de su mentoría sin depender de clientes 1 a 1"
            />
            <p className="text-xs text-muted-foreground">
              El número es opcional; si lo cargás con la misma clave que el punto de
              partida, el recorrido pasa a leerse contra la meta.
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              <Input
                aria-label="Clave del objetivo"
                value={draft.goalMetricKey}
                onChange={(event) => patch({ goalMetricKey: event.target.value })}
                placeholder="facturacion"
              />
              <Input
                aria-label="Valor objetivo"
                inputMode="decimal"
                value={draft.goalMetricValue}
                onChange={(event) => patch({ goalMetricValue: event.target.value })}
                placeholder="10000"
              />
              <Input
                aria-label="Unidad del objetivo"
                value={draft.goalMetricUnit}
                onChange={(event) => patch({ goalMetricUnit: event.target.value })}
                placeholder="USD"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="client-exit-date">Fecha de egreso</Label>
            <Input
              id="client-exit-date"
              type="date"
              value={draft.exitDate}
              onChange={(event) => patch({ exitDate: event.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Cuándo termina su programa. Es lo que hace aparecer la conversación de
              renovación en la revisión semanal, dos meses antes.
            </p>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => onSubmit(draft)} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
