"use client";

import { useState, useTransition } from "react";
import { Button, Input } from "@ai-coo/ui";
import { updateCTAMinuteAction } from "@/app/marketing/actions";
import { leerConMotivo } from "@/lib/client/correr-accion";

export function CTAMinuteInput({
  assetId,
  initialCtaSecond,
  onSaved,
}: {
  assetId: string;
  initialCtaSecond?: number | null;
  onSaved?: (ctaSecond: number, retentionPct: number) => void;
}) {
  const initialMinutes =
    initialCtaSecond != null ? Math.floor(initialCtaSecond / 60) : 0;
  const initialSeconds =
    initialCtaSecond != null ? initialCtaSecond % 60 : 0;

  const [minutes, setMinutes] = useState(String(initialMinutes));
  const [seconds, setSeconds] = useState(String(initialSeconds));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSave = () => {
    const totalSeconds =
      Math.max(0, parseInt(minutes || "0", 10)) * 60 +
      Math.max(0, Math.min(59, parseInt(seconds || "0", 10)));

    if (totalSeconds <= 0) {
      setError("Indicá en qué segundo ocurre el CTA.");
      return;
    }

    setError(null);
    startTransition(async () => {
      // Si la acción lanza, el texto fijo (SCRUM-519); antes el error quedaba
      // sin atender dentro de la transición.
      const result = await leerConMotivo(
        () => updateCTAMinuteAction(assetId, totalSeconds),
        "[CTAMinuteInput] guardar"
      );
      if (!result.ok) {
        setError(result.motivo);
        return;
      }
      onSaved?.(totalSeconds, result.data.retentionAtCtaPct);
    });
  };

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-border/60 bg-muted/20 p-3">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Minuto del CTA
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          ¿En qué momento del video hacés el llamado a la acción?
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1">
          <span className="text-[10px] text-muted-foreground">Minutos</span>
          <Input
            type="number"
            min={0}
            className="h-8 w-20 text-xs"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] text-muted-foreground">Segundos</span>
          <Input
            type="number"
            min={0}
            max={59}
            className="h-8 w-20 text-xs"
            value={seconds}
            onChange={(e) => setSeconds(e.target.value)}
          />
        </label>
        <Button size="sm" type="button" disabled={pending} onClick={handleSave}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
      </div>
      {error ? <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
