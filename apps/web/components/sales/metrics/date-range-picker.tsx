"use client";

import { CalendarDays } from "lucide-react";
import { cn } from "@ai-coo/ui";
import { CampoFecha } from "@/components/shared/campo-fecha";
import { fechaLocal } from "@/lib/fechas/calendario";
import { useHoyDeLaOrganizacion } from "@/providers/zona-de-la-organizacion-provider";

/** Las clases para que `CampoFecha` quede sin caja propia dentro del recuadro del rango. */
const CLASE_CAMPO =
  "h-auto w-auto rounded-none border-0 bg-transparent p-0 text-sm tabular-nums shadow-none outline-none focus-visible:ring-0 dark:bg-transparent";

export interface DateRange {
  from: Date;
  to: Date;
}

/** Retorna el rango "este mes" (día 1 hasta hoy) como valor inicial */
export function getDefaultDateRange(): DateRange {
  const from = new Date();
  from.setDate(1);
  from.setHours(0, 0, 0, 0);
  return { from, to: new Date() };
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
  // El rango son instantes locales (el "hasta" es a las 23:59:59): se muestran
  // con su fecha local. Con `toISOString` el "hasta" salía corrido al día
  // siguiente en Argentina (SCRUM-493).
  const handleFrom = (fecha: string | null) => {
    if (!fecha) return;
    const from = new Date(fecha + "T00:00:00");
    if (!Number.isNaN(from.getTime()) && from <= value.to) {
      onChange({ ...value, from });
    }
  };

  const handleTo = (fecha: string | null) => {
    if (!fecha) return;
    const to = new Date(fecha + "T23:59:59");
    if (!Number.isNaN(to.getTime()) && to >= value.from) {
      onChange({ ...value, to });
    }
  };

  // `null` en el render del servidor (UTC): el tope se pone con el día local.
  const today = useHoyDeLaOrganizacion() ?? undefined;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 shadow-sm">
        <CalendarDays size={13} className="shrink-0 text-muted-foreground" />
        <CampoFecha
          value={fechaLocal(value.from)}
          max={today}
          onChange={handleFrom}
          className={CLASE_CAMPO}
        />
        <span className="text-muted-foreground">—</span>
        <CampoFecha
          value={fechaLocal(value.to)}
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

const PRESETS = [
  {
    label: "Este mes",
    range: (): DateRange => {
      const from = new Date();
      from.setDate(1);
      from.setHours(0, 0, 0, 0);
      return { from, to: new Date() };
    },
  },
  {
    label: "Últimos 30 d",
    range: (): DateRange => {
      const from = new Date();
      from.setDate(from.getDate() - 30);
      from.setHours(0, 0, 0, 0);
      return { from, to: new Date() };
    },
  },
  {
    label: "Últimos 90 d",
    range: (): DateRange => {
      const from = new Date();
      from.setDate(from.getDate() - 90);
      from.setHours(0, 0, 0, 0);
      return { from, to: new Date() };
    },
  },
] as const;

function QuickPresets({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (r: DateRange) => void;
}) {
  const isActive = (preset: (typeof PRESETS)[number]) => {
    const r = preset.range();
    return (
      r.from.toDateString() === value.from.toDateString() &&
      r.to.toDateString() === value.to.toDateString()
    );
  };

  return (
    <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-0.5">
      {PRESETS.map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={() => onChange(p.range())}
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
