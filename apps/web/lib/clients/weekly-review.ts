/**
 * ⭐ La revisión semanal: las cuatro preguntas, con nombres y una acción.
 *
 * > *"Cuatro preguntas, quince minutos, y tiene que terminar en una lista de
 * > nombres con una acción para cada uno."*
 *
 * Limitless ya tenía los datos de tres de las cuatro y no los mostraba juntos en
 * ningún lado. Lo que faltaba no era el dato: era el ritual.
 *
 * ⭐ Ninguna de las cuatro listas inventa una señal. Cuando un dato no está
 * —un cliente sin plazo, sin fecha de egreso, sin medida— el cliente
 * simplemente **no aparece** en esa lista, en vez de aparecer con un motivo
 * fabricado. Una lista que exagera se deja de mirar a la tercera semana.
 *
 * Lógica pura: no toca base ni red.
 */

import { fechaVencida } from "@/lib/fechas/calendario";
import type { ClientInstallment } from "@/types/clients";

/** A cuántos días del egreso empieza la conversación de renovación. */
export const LEAVING_SOON_DAYS = 60;

/** Cuán reciente tiene que ser el último win para que cuente como "viene subiendo". */
export const RECENT_WIN_DAYS = 21;

/** Cuántos días sin señales de vida son silencio. */
export const SILENCE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * ¿Tiene una cuota pendiente que ya venció? Es la señal de pago atrasado.
 * Vence el día después de su fecha, contra el `hoy` de la organización.
 */
export function hasOverduePayment(
  installments: readonly ClientInstallment[] | undefined,
  hoy: string
): boolean {
  return (installments ?? []).some(
    (installment) =>
      installment.status === "pending" &&
      typeof installment.dueDate === "string" &&
      fechaVencida(installment.dueDate, hoy)
  );
}

export type WeeklyReviewInput = {
  clientId: string;
  name: string;
  /** Del recorrido (C3): su próximo hito ya venció. */
  stalled: boolean;
  overdueDays: number | null;
  /** Fecha del último win con número (`YYYY-MM-DD`). */
  lastWinAt: string | null;
  /** Cuánto se movió su medida. `null` = sin medir; no se asume cero. */
  measuredDelta: number | null;
  /** Lo último que pasó: un win o un hito. `null` = nunca pasó nada. */
  lastActivityAt: string | null;
  /** Alta del cliente. Es desde cuándo se cuenta el silencio si nunca pasó nada. */
  joinDate: string;
  /** Cuándo termina el programa (`YYYY-MM-DD`). `null` = no está cargada. */
  exitDate: string | null;
  hasOverduePayment: boolean;
};

export type WeeklyReviewRow = {
  clientId: string;
  name: string;
  /** Por qué está en esta lista. Se muestra: una lista sin motivo no se actúa. */
  detail: string;
};

export type WeeklyReview = {
  /** 1 · ¿Quién no se movió? */
  stalled: WeeklyReviewRow[];
  /** 2 · ¿Quién está por tener un resultado? */
  aboutToWin: WeeklyReviewRow[];
  /** 3 · ¿Quién está cerca del egreso? */
  leavingSoon: WeeklyReviewRow[];
  /** 4 · ¿Quién está en riesgo? */
  atRisk: WeeklyReviewRow[];
};

/**
 * `hoy` es la fecha calendario (`YYYY-MM-DD`) de la organización: el servidor
 * corre en UTC y de noche en Argentina su día ya es mañana, así que lo arma
 * quien llama con la zona de la organización (SCRUM-493). Sin default a
 * propósito.
 */
export function buildWeeklyReview(
  clients: readonly WeeklyReviewInput[],
  hoy: string
): WeeklyReview {
  const now = startOfDay(hoy);
  return {
    stalled: buildStalled(clients),
    aboutToWin: buildAboutToWin(clients, now),
    leavingSoon: buildLeavingSoon(clients, now),
    atRisk: buildAtRisk(clients, now),
  };
}

/** 1 · Trabados: el derivado de C3, tal cual. El más atrasado primero. */
function buildStalled(clients: readonly WeeklyReviewInput[]): WeeklyReviewRow[] {
  return clients
    .filter((client) => client.stalled && client.overdueDays !== null)
    .sort((a, b) => (b.overdueDays ?? 0) - (a.overdueDays ?? 0))
    .map((client) => ({
      clientId: client.clientId,
      name: client.name,
      detail: `${client.overdueDays} ${plural(client.overdueDays ?? 0, "día", "días")} de atraso en su próximo hito`,
    }));
}

/**
 * 2 · Por tener un resultado.
 *
 * Dos condiciones juntas: su medida **subió** (no "se movió": bajar no es estar
 * por tener un resultado) y el último win es **reciente**. Un cliente que subió
 * hace ocho meses no está por tener nada.
 */
function buildAboutToWin(
  clients: readonly WeeklyReviewInput[],
  now: number
): WeeklyReviewRow[] {
  return clients
    .filter((client) => {
      if (client.measuredDelta === null || client.measuredDelta <= 0) return false;
      const days = daysSince(client.lastWinAt, now);
      return days !== null && days <= RECENT_WIN_DAYS;
    })
    .sort((a, b) => (daysSince(a.lastWinAt, now) ?? 0) - (daysSince(b.lastWinAt, now) ?? 0))
    .map((client) => {
      const days = daysSince(client.lastWinAt, now) ?? 0;
      return {
        clientId: client.clientId,
        name: client.name,
        detail:
          days === 0
            ? "viene subiendo · último win hoy"
            : `viene subiendo · último win hace ${days} ${plural(days, "día", "días")}`,
      };
    });
}

/**
 * 3 · Cerca del egreso.
 *
 * Incluye a los que **ya egresaron** y siguen cargados: es exactamente el caso
 * que se pasa por alto, y el que peor queda.
 */
function buildLeavingSoon(
  clients: readonly WeeklyReviewInput[],
  now: number
): WeeklyReviewRow[] {
  return clients
    .map((client) => ({ client, days: daysUntil(client.exitDate, now) }))
    .filter(
      (entry): entry is { client: WeeklyReviewInput; days: number } =>
        entry.days !== null && entry.days <= LEAVING_SOON_DAYS
    )
    .sort((a, b) => a.days - b.days)
    .map(({ client, days }) => ({
      clientId: client.clientId,
      name: client.name,
      detail:
        days < 0
          ? `ya egresó hace ${Math.abs(days)} ${plural(Math.abs(days), "día", "días")}`
          : days === 0
            ? "egresa hoy"
            : `egresa en ${days} ${plural(days, "día", "días")}`,
    }));
}

/**
 * 4 · En riesgo.
 *
 * ⭐ Hacen falta **dos señales**, no una. Un cliente trabado una semana no está
 * en riesgo: está trabado, y para eso está la primera lista. Cuando la lista de
 * riesgo se llena de casos que no lo son, se deja de mirar — y entonces no
 * sirve para el que sí lo está.
 */
function buildAtRisk(
  clients: readonly WeeklyReviewInput[],
  now: number
): WeeklyReviewRow[] {
  return clients
    .map((client) => {
      const signals: string[] = [];
      if (client.stalled) signals.push("trabado en el recorrido");

      const silentDays = daysSince(client.lastActivityAt ?? client.joinDate, now);
      if (silentDays !== null && silentDays >= SILENCE_DAYS) {
        signals.push(`${silentDays} días sin novedades`);
      }
      if (client.hasOverduePayment) signals.push("pago atrasado");

      return { client, signals };
    })
    .filter((entry) => entry.signals.length >= 2)
    .sort((a, b) => b.signals.length - a.signals.length)
    .map(({ client, signals }) => ({
      clientId: client.clientId,
      name: client.name,
      detail: signals.join(" · "),
    }));
}

/** Días transcurridos desde una fecha. `null` si no hay fecha o no se entiende. */
function daysSince(date: string | null, now: number): number | null {
  const time = parseDate(date);
  if (time === null) return null;
  return Math.floor((now - time) / DAY_MS);
}

/** Días que faltan para una fecha. Negativo si ya pasó. */
function daysUntil(date: string | null, now: number): number | null {
  const time = parseDate(date);
  if (time === null) return null;
  return Math.floor((time - now) / DAY_MS);
}

/** Una fecha que no se entiende no es hoy: no existe. */
function parseDate(date: string | null): number | null {
  if (!date) return null;
  const time = new Date(`${date.slice(0, 10)}T00:00:00Z`).getTime();
  return Number.isNaN(time) ? null : time;
}

/**
 * El comienzo del día `hoy`, en la misma escala que `parseDate` (medianoche
 * UTC de cada fecha): la diferencia entre dos de estos es un número entero de
 * días, sin horarios de verano de por medio.
 */
function startOfDay(hoy: string): number {
  return new Date(`${hoy.slice(0, 10)}T00:00:00Z`).getTime();
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}
