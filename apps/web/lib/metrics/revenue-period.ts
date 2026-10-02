export type RevenuePeriodPreset = "day" | "week" | "month" | "custom";

export type RevenueDateRange = {
  preset: RevenuePeriodPreset;
  /** Día de referencia para hoy / semana / mes (YYYY-MM-DD). Por defecto: hoy. */
  anchor?: string;
  customFrom?: string;
  customTo?: string;
};

export type ResolvedRevenuePeriod = {
  start: Date;
  end: Date;
  label: string;
  /** Días inclusivos del rango (para prorratear gastos). */
  dayCount: number;
};

export function parseDateOnly(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Días del rango, incluidos los dos extremos. Se cuenta con el calendario y no
 * con milisegundos: un día de cambio de horario dura 23 o 25 horas y la cuenta
 * por milisegundos perdía un día (SCRUM-102).
 */
function daysInclusive(start: Date, end: Date): number {
  const a = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const b = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((b - a) / 86_400_000) + 1;
}

function formatShort(d: Date): string {
  return d.toLocaleDateString("es", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function startOfWeekMonday(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const s = new Date(d);
  s.setDate(d.getDate() + diff);
  return startOfDay(s);
}

function endOfWeekMonday(d: Date): Date {
  const s = startOfWeekMonday(d);
  const e = new Date(s);
  e.setDate(s.getDate() + 6);
  return e;
}

export function resolveRevenueDateRange(
  range: RevenueDateRange,
  now: Date = new Date()
): ResolvedRevenuePeriod {
  const anchor = range.anchor
    ? parseDateOnly(range.anchor)
    : startOfDay(now);

  if (range.preset === "day") {
    return {
      start: anchor,
      end: anchor,
      label: formatShort(anchor),
      dayCount: 1,
    };
  }

  if (range.preset === "week") {
    const start = startOfWeekMonday(anchor);
    const end = endOfWeekMonday(anchor);
    return {
      start,
      end,
      label: `${formatShort(start)} – ${formatShort(end)}`,
      dayCount: daysInclusive(start, end),
    };
  }

  if (range.preset === "month") {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    const label = anchor.toLocaleDateString("es", {
      month: "long",
      year: "numeric",
    });
    return {
      start,
      end,
      label: label.charAt(0).toUpperCase() + label.slice(1),
      dayCount: daysInclusive(start, end),
    };
  }

  const from = range.customFrom
    ? parseDateOnly(range.customFrom)
    : anchor;
  const to = range.customTo ? parseDateOnly(range.customTo) : anchor;
  const start = from <= to ? from : to;
  const end = from <= to ? to : from;

  return {
    start,
    end,
    label: `${formatShort(start)} – ${formatShort(end)}`,
    dayCount: daysInclusive(start, end),
  };
}

export function isDateInRange(
  dateIso: string,
  period: ResolvedRevenuePeriod
): boolean {
  const d = parseDateOnly(dateIso);
  return d >= period.start && d <= period.end;
}

/**
 * Prorratea gastos mensuales al período seleccionado.
 *
 * Cada mes que toca el período aporta la fracción de sus días que cae dentro:
 * un mes completo aporta el gasto entero. Antes, un rango que cruzaba de mes
 * se prorrateaba con los días del primer mes (1-sep al 31-oct daba 61/30 de un
 * mes en vez de 2) (SCRUM-102).
 */
export function prorateMonthlyExpenses(
  totalMonthly: number,
  period: ResolvedRevenuePeriod
): number {
  let total = 0;
  let cursor = new Date(period.start.getFullYear(), period.start.getMonth(), 1);
  const fin = startOfDay(period.end);
  while (cursor <= fin) {
    const inicioMes = cursor;
    const finMes = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const desde = period.start > inicioMes ? startOfDay(period.start) : inicioMes;
    const hasta = fin < finMes ? fin : finMes;
    total += totalMonthly * (daysInclusive(desde, hasta) / finMes.getDate());
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return total;
}

export const DEFAULT_REVENUE_RANGE: RevenueDateRange = { preset: "month" };
