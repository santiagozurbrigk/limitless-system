"use client";

import { CalendarDays } from "lucide-react";
import { cn } from "@ai-coo/ui";
import { CampoFecha } from "@/components/shared/campo-fecha";
import {
  diasDelRango,
  PRESETS_DE_RANGO,
  rangoDeDias,
  rangoDelPreset,
  rangoPorDefecto,
  type DateRange,
} from "@/lib/sales/rango-de-metricas";
import {
  useHoyDeLaOrganizacion,
  useZonaDeLaOrganizacion,
} from "@/providers/zona-de-la-organizacion-provider";

/** Las clases para que `CampoFecha` quede sin caja propia dentro del recuadro del rango. */
const CLASE_CAMPO =
  "h-auto w-auto rounded-none border-0 bg-transparent p-0 text-sm tabular-nums shadow-none outline-none focus-visible:ring-0 dark:bg-transparent";

export type { DateRange };

/** El rango "este mes" (del día 1 a hoy) en la zona de la organización, como valor inicial. */
export function getDefaultDateRange(zona: string | null): DateRange {
  return rangoPorDefecto(zona);
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}

/**
 * Selector de rango de fechas nativo.
 * Dos inputs tipo date + preset rápido "Este mes".
 * Usa inputs nativos del browser — sin dependencias externas.
 */
export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  // El rango se elige, se muestra y se filtra en días de la zona de la
  // organización (`lib/sales/rango-de-metricas.ts`): "desde" empieza a las
  // 00:00 de la org y "hasta" termina a las 23:59:59.999 de la org (SCRUM-493).
  const zona = useZonaDeLaOrganizacion();
  const { desde, hasta } = diasDelRango(value, zona);

  const handleFrom = (fecha: string | null) => {
    if (!fecha || fecha > hasta) return;
    onChange(rangoDeDias(fecha, hasta, zona));
  };

  const handleTo = (fecha: string | null) => {
    if (!fecha || fecha < desde) return;
    onChange(rangoDeDias(desde, fecha, zona));
  };

  // El tope es el hoy de la org; `null` en el render del servidor (sin tope).
  const today = useHoyDeLaOrganizacion() ?? undefined;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 shadow-sm">
        <CalendarDays size={13} className="shrink-0 text-muted-foreground" />
        <CampoFecha
          value={desde}
          max={today}
          onChange={handleFrom}
          className={CLASE_CAMPO}
        />
        <span className="text-muted-foreground">—</span>
        <CampoFecha
          value={hasta}
          max={today}
          onChange={handleTo}
          className={CLASE_CAMPO}
        />
      </div>

      {/* Presets rápidos */}
      <QuickPresets value={value} onChange={onChange} />
    </div>
  );
}

// ─── Presets rápidos ─────────────────────────────────────────────────────────

function QuickPresets({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (r: DateRange) => void;
}) {
  const zona = useZonaDeLaOrganizacion();
  const actual = diasDelRango(value, zona);
  const isActive = (preset: (typeof PRESETS_DE_RANGO)[number]) => {
    const r = diasDelRango(rangoDelPreset(preset, zona), zona);
    return r.desde === actual.desde && r.hasta === actual.hasta;
  };

  return (
    <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-0.5">
      {PRESETS_DE_RANGO.map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={() => onChange(rangoDelPreset(p, zona))}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap",
            isActive(p)
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
