"use client";

import { useEffect, useMemo, useState } from "react";
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
  cn,
} from "@ai-coo/ui";

export interface LogTimeModalProps {
  taskId: string;
  taskTitle: string;
  estimatedMinutes?: number;
  /** Si devuelve `false`, no se guardó (quien llama ya avisó el motivo). */
  onConfirm: (minutes: number, note?: string) => boolean | void | Promise<boolean | void>;
  onSkip: () => void | Promise<void>;
  onCancel: () => void | Promise<void>;
  open: boolean;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} minutos`;
  if (m === 0) return `${h} ${h === 1 ? "hora" : "horas"}`;
  return `${h}h ${m}m`;
}

/**
 * Confirma el tiempo y dice si mostrar "listo": no, si quien llama devolvió
 * `false` porque no se guardó (ya avisó el motivo) (SCRUM-503).
 */
export async function confirmarTiempo(
  onConfirm: LogTimeModalProps["onConfirm"],
  minutos: number,
  nota?: string
): Promise<boolean> {
  const guardado = await onConfirm(minutos, nota);
  return guardado !== false;
}

export function LogTimeModal({
  taskTitle,
  estimatedMinutes,
  onConfirm,
  onSkip,
  onCancel,
  open,
}: LogTimeModalProps) {
  const [hours, setHours] = useState("0");
  const [minutes, setMinutes] = useState("30");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open) return;
    setHours("0");
    setMinutes("30");
    setNote("");
    setSubmitting(false);
    setSuccess(false);
  }, [open, taskTitle]);

  const totalMinutes = useMemo(() => {
    const h = Math.max(0, parseInt(hours, 10) || 0);
    const m = Math.max(0, parseInt(minutes, 10) || 0);
    return h * 60 + m;
  }, [hours, minutes]);

  const estimateDelta = useMemo(() => {
    if (!estimatedMinutes || estimatedMinutes <= 0) return null;
    const diff = totalMinutes - estimatedMinutes;
    const pct = Math.round((diff / estimatedMinutes) * 100);
    return {
      diff,
      pct,
      faster: diff < 0,
      label:
        diff === 0
          ? "Justo en lo estimado"
          : diff < 0
            ? `${Math.abs(pct)}% menos de lo estimado`
            : `${pct}% más de lo estimado`,
    };
  }, [estimatedMinutes, totalMinutes]);

  async function handleConfirm() {
    if (totalMinutes <= 0) return;
    setSubmitting(true);
    try {
      const mostrarExito = await confirmarTiempo(onConfirm, totalMinutes, note.trim() || undefined);
      if (!mostrarExito) return;
      setSuccess(true);
      setTimeout(() => setSuccess(false), 1200);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSkip() {
    setSubmitting(true);
    try {
      await onSkip();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel() {
    setSubmitting(true);
    try {
      await onCancel();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) void handleCancel();
      }}
    >
      <DialogContent className="max-w-md">
        {success ? (
          <div className="py-8 text-center text-sm font-medium text-emerald-600 dark:text-emerald-400">
            ✓ Tiempo registrado
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>¿Cuánto tiempo le dedicaste?</DialogTitle>
              {/*
                Dos líneas y no una: el título de la tarea es el único lugar
                del modal que dice **a qué** le estás cargando el tiempo, y
                cortado en "…del módulo de webinar orgánico al de web" no
                alcanza para distinguir dos tareas parecidas.

                `break-words` cubre el caso del texto sin espacios (una URL
                pegada), que sin eso sigue siendo una sola palabra imposible
                de partir.
              */}
              <DialogDescription className="line-clamp-2 break-words">
                {taskTitle}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-2">
                  <Label htmlFor="log-hours">Horas</Label>
                  <Input
                    id="log-hours"
                    type="number"
                    min={0}
                    className="w-20 tabular-nums"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                  />
                </div>
                <span className="pb-2 text-sm text-muted-foreground">horas</span>
                <div className="space-y-2">
                  <Label htmlFor="log-minutes">Minutos</Label>
                  <Input
                    id="log-minutes"
                    type="number"
                    min={0}
                    max={59}
                    className="w-20 tabular-nums"
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                  />
                </div>
                <span className="pb-2 text-sm text-muted-foreground">minutos</span>
              </div>

              <p className="text-sm text-muted-foreground">
                = <span className="font-medium text-foreground">{formatDuration(totalMinutes)}</span> total
              </p>

              {estimatedMinutes && estimatedMinutes > 0 && estimateDelta ? (
                <p
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm",
                    estimateDelta.faster
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                      : estimateDelta.diff === 0
                        ? "border-border bg-muted/30 text-muted-foreground"
                        : "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
                  )}
                >
                  Estimaste {formatDuration(estimatedMinutes)} — {estimateDelta.label}
                </p>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="log-note">Nota (opcional)</Label>
                <Textarea
                  id="log-note"
                  placeholder="Qué hiciste, bloqueos, etc."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => void handleCancel()}
              >
                Cancelar
              </Button>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={submitting}
                  onClick={() => void handleSkip()}
                >
                  Omitir
                </Button>
                <Button
                  type="button"
                  disabled={submitting || totalMinutes <= 0}
                  onClick={() => void handleConfirm()}
                >
                  {submitting ? "Registrando…" : "Registrar tiempo"}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
