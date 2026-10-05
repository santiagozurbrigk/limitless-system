"use client";

/**
 * C2 · Registrar (o editar) que un cliente alcanzó un checkpoint.
 *
 * ⭐ El formulario de métricas se genera desde lo que el checkpoint pide en C1:
 * cada campo con el control correcto para su tipo, reusando el FieldValueInput
 * de C0. No hay un formulario escrito a mano por checkpoint.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
} from "@ai-coo/ui";
import { AlertTriangle } from "lucide-react";
import type {
  Checkpoint,
  CheckpointEvent,
} from "@/types/checkpoints";
import type { FieldDefinition } from "@/types/custom-fields";
import { resolveMetricSchema } from "@/lib/checkpoints";
import { FieldValueInput } from "@/components/clients/custom-fields/field-value-input";
import { CampoFecha } from "@/components/shared/campo-fecha";
import { fechaDeHoyLocal } from "@/lib/fechas/calendario";
import { fechaDelHitoLocal, instanteDelHito } from "@/lib/checkpoints/fecha-del-hito";

export function RecordCheckpointDialog({
  open,
  checkpoint,
  checkpointFields,
  existingEvent,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  checkpoint: Checkpoint | null;
  checkpointFields: FieldDefinition[];
  /** El evento ya registrado, si se está editando. */
  existingEvent: CheckpointEvent | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: { reachedAt: string; metrics: Record<string, unknown>; note: string | null }) => void;
}) {
  const [date, setDate] = useState(fechaDeHoyLocal);
  const [note, setNote] = useState("");
  const [metrics, setMetrics] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!open) return;
    setDate(existingEvent ? fechaDelHitoLocal(existingEvent.reachedAt) : fechaDeHoyLocal());
    setNote(existingEvent?.note ?? "");
    setMetrics(existingEvent?.metrics ?? {});
  }, [open, existingEvent]);

  // Sólo las métricas que este checkpoint pide y que todavía existen en C0. Una
  // referencia rota se cuenta aparte para avisar, no se pide.
  const resolved = useMemo(
    () => (checkpoint ? resolveMetricSchema(checkpoint.metricSchema, checkpointFields) : []),
    [checkpoint, checkpointFields]
  );
  const askedFields = resolved
    .filter((entry) => entry.field !== null)
    .map((entry) => ({ field: entry.field!, required: entry.required }));
  const brokenCount = resolved.filter((entry) => entry.field === null).length;

  if (!checkpoint) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {existingEvent ? "Editar registro" : "Registrar checkpoint"}
          </DialogTitle>
          <DialogDescription>
            <strong>{checkpoint.name}</strong>. Cuándo lo alcanzó el cliente y, si
            corresponde, con qué números.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reached-at">Fecha</Label>
            <CampoFecha
              id="reached-at"
              max={fechaDeHoyLocal()}
              value={date}
              onChange={(fecha) => setDate(fecha ?? "")}
            />
          </div>

          {askedFields.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm font-medium">Métricas</p>
              {askedFields.map(({ field, required }) => (
                <FieldValueInput
                  key={field.key}
                  field={{ ...field, isRequired: required }}
                  value={metrics[field.key] ?? null}
                  onChange={(value) =>
                    setMetrics((current) => ({ ...current, [field.key]: value }))
                  }
                />
              ))}
            </div>
          ) : null}

          {brokenCount > 0 ? (
            <p className="flex items-center gap-1.5 rounded-lg border border-warning/40 p-2 text-xs text-warning">
              <AlertTriangle className="h-3.5 w-3.5" />
              {brokenCount} métrica{brokenCount > 1 ? "s" : ""} de este checkpoint
              apunta{brokenCount > 1 ? "n" : ""} a una columna que ya no existe. No se
              piden.
            </p>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="checkpoint-note">Nota (opcional)</Label>
            <Textarea
              id="checkpoint-note"
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={saving}
            onClick={() =>
              onSubmit({
                // El input date da yyyy-mm-dd; `instanteDelHito` lo guarda con la
                // convención del campo (ver `lib/checkpoints/fecha-del-hito.ts`).
                reachedAt: instanteDelHito(date),
                metrics,
                note: note.trim() || null,
              })
            }
          >
            {saving ? "Guardando…" : existingEvent ? "Guardar" : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
