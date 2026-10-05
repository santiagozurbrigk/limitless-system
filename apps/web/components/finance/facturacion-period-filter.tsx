"use client";

import { Button, GlassPanel, Input, cn } from "@ai-coo/ui";
import type { RevenueDateRange, RevenuePeriodPreset } from "@/lib/metrics/revenue-period";
import { CampoFecha } from "@/components/shared/campo-fecha";
import { useFechaDeHoyLocal } from "@/lib/hooks/use-fecha-de-hoy-local";

const PRESETS: { id: RevenuePeriodPreset; label: string }[] = [
  { id: "day", label: "Hoy" },
  { id: "week", label: "Semana" },
  { id: "month", label: "Mes" },
  { id: "custom", label: "Rango" },
];

type Props = {
  value: RevenueDateRange;
  onChange: (next: RevenueDateRange) => void;
  periodLabel: string;
  facturacion: number;
  formatMoney: (n: number) => string;
  eventCount: number;
};

export function FacturacionPeriodFilter({
  value,
  onChange,
  periodLabel,
  facturacion,
  formatMoney,
  eventCount,
}: Props) {
  // Sin referencia elegida, el campo muestra el día de hoy del navegador (en el
  // render del servidor todavía no se sabe cuál es: queda vacío un instante).
  const hoy = useFechaDeHoyLocal();

  const setPreset = (preset: RevenuePeriodPreset) => {
    onChange({
      preset,
      anchor: value.anchor,
      customFrom: value.customFrom,
      customTo: value.customTo,
    });
  };

  return (
    <GlassPanel className="p-5 sm:p-6 space-y-5 border-primary/20 bg-primary/[0.04]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1 min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-primary/80">
            Métrica principal
          </p>
          <h2 className="text-sm text-muted-foreground">Facturación</h2>
          <p className="text-4xl sm:text-5xl font-semibold tabular-nums tracking-tight">
            {formatMoney(facturacion)}
          </p>
          <p className="text-sm text-muted-foreground">{periodLabel}</p>
          <p className="text-xs text-muted-foreground/80">
            Ingresos por fecha de cobro real · {eventCount}{" "}
            {eventCount === 1 ? "movimiento" : "movimientos"}
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5 shrink-0">
          {PRESETS.map((p) => (
            <Button
              key={p.id}
              type="button"
              size="sm"
              variant={value.preset === p.id ? "default" : "outline"}
              className={cn(
                "min-w-[4.5rem]",
                value.preset === p.id && "shadow-[0_0_12px_hsl(var(--primary)/0.35)]"
              )}
              onClick={() => setPreset(p.id)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {value.preset !== "custom" && (
        <div className="flex flex-wrap items-center gap-3 max-w-xs">
          <label className="text-xs text-muted-foreground shrink-0">
            Referencia
          </label>
          <CampoFecha
            className="h-9 flex-1 min-w-[140px]"
            value={value.anchor ?? hoy}
            onChange={(fecha) => onChange({ ...value, anchor: fecha ?? undefined })}
          />
        </div>
      )}

      {value.preset === "custom" && (
        <div className="grid gap-3 sm:grid-cols-2 max-w-lg">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Desde</label>
            <Input
              type="date"
              className="h-9"
              value={value.customFrom ?? ""}
              onChange={(e) =>
                onChange({ ...value, customFrom: e.target.value || undefined })
              }
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Hasta</label>
            <Input
              type="date"
              className="h-9"
              value={value.customTo ?? ""}
              onChange={(e) =>
                onChange({ ...value, customTo: e.target.value || undefined })
              }
            />
          </div>
        </div>
      )}
    </GlassPanel>
  );
}
