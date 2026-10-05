/**
 * La fecha de un hito (`client_checkpoint_events.reached_at`, `timestamptz`).
 *
 * ⭐ Una sola convención para ese campo (SCRUM-493). `reached_at` es un instante
 * y su día se lee en una zona: la de la organización en el servidor (revisión
 * semanal) y la del navegador en pantalla. Lo escriben:
 *
 * - el diálogo de registrar hito, con `instanteDelHito`: el día elegido a las
 *   12:00 locales, que cualquier zona entre UTC-11 y UTC+11 lee con el mismo
 *   día; si es hoy y todavía no son las 12, un poco antes de ahora (la action
 *   rechaza un hito en el futuro);
 * - la action sin fecha y las propuestas aceptadas, con un instante real.
 *
 * Hasta SCRUM-493 el diálogo guardaba el día elegido a las 12:00:00.000 UTC
 * exactas, y en UTC+12 o más ese instante ya es el día siguiente. Esas filas se
 * reconocen por esa hora exacta (un instante real casi nunca cae ahí al
 * milisegundo) y se leen con su fecha de UTC, que es la que se eligió.
 *
 * Lógica pura: no toca base ni red.
 */
import { diaLocal, fechaEnZona, fechaLocal } from "@/lib/fechas/calendario";

/** Margen para que el reloj del navegador, un poco adelantado, no deje el hito en el futuro. */
const MARGEN_MS = 5 * 60 * 1000;

function dosDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

/** Lo que guardaba el diálogo antes de SCRUM-493: el día elegido a las 12:00:00.000 UTC. */
function esFechaDelDialogoViejo(instante: Date): boolean {
  return (
    instante.getUTCHours() === 12 &&
    instante.getUTCMinutes() === 0 &&
    instante.getUTCSeconds() === 0 &&
    instante.getUTCMilliseconds() === 0
  );
}

function leerHito(reachedAt: string | null | undefined, fechaDelInstante: (i: Date) => string): string {
  if (!reachedAt) return "";
  const instante = new Date(reachedAt);
  if (Number.isNaN(instante.getTime())) return "";
  if (esFechaDelDialogoViejo(instante)) {
    return `${instante.getUTCFullYear()}-${dosDigitos(instante.getUTCMonth() + 1)}-${dosDigitos(instante.getUTCDate())}`;
  }
  return fechaDelInstante(instante);
}

/**
 * El día de un hito en una zona (la de la organización; null o inválida = la de
 * por defecto). `""` si no hay valor o no se entiende.
 */
export function fechaDelHitoEnZona(
  reachedAt: string | null | undefined,
  zona: string | null | undefined
): string {
  return leerHito(reachedAt, (instante) => fechaEnZona(instante, zona));
}

/** El día de un hito en la zona del navegador, para mostrarlo o editarlo. */
export function fechaDelHitoLocal(reachedAt: string | null | undefined): string {
  return leerHito(reachedAt, fechaLocal);
}

/**
 * Lo que se guarda en `reached_at` para el día que se eligió en el diálogo.
 * `fecha` es `YYYY-MM-DD` y no puede ser futura (el campo tiene `max` y la
 * action lo rechaza).
 */
export function instanteDelHito(fecha: string, ahora: Date = new Date()): string {
  const mediodia = diaLocal(fecha);
  if (fecha !== fechaLocal(ahora)) return mediodia.toISOString();
  // Hoy: el mediodía, salvo que todavía no haya llegado; nunca antes de que
  // empiece el día local.
  const inicioDelDia = new Date(mediodia.getFullYear(), mediodia.getMonth(), mediodia.getDate());
  const instante = Math.max(
    inicioDelDia.getTime(),
    Math.min(mediodia.getTime(), ahora.getTime() - MARGEN_MS)
  );
  return new Date(instante).toISOString();
}

/**
 * La fecha del último hito de cada cliente, en el día de la organización (la
 * "última señal de vida" de la revisión semanal). Recibe todos los hitos de la
 * organización de una vez: nada por cliente.
 */
export function ultimoHitoPorCliente(
  rows: readonly { client_id: string; reached_at: string | null }[],
  zona: string | null
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const row of rows) {
    const fecha = fechaDelHitoEnZona(row.reached_at, zona);
    if (!fecha) continue;
    if (!result[row.client_id] || fecha > result[row.client_id]!) {
      result[row.client_id] = fecha;
    }
  }
  return result;
}
