/**
 * La fecha de un hito (`client_checkpoint_events.reached_at`, `timestamptz`).
 *
 * ⭐ Una sola convención para ese campo, en la zona de la organización
 * (SCRUM-493). Un hito pertenece a la organización: su día es el mismo para
 * todos los que lo miran, estén donde estén.
 *
 * - **Escribir.** El diálogo de registrar hito guarda el día elegido a las
 *   12:00 de la zona de la org (`fechaAInstanteEnZona`). La action sin fecha y
 *   las propuestas aceptadas guardan un instante real.
 * - **Leer.** `fechaDelHitoEnZona` da el día del instante en la zona de la org:
 *   en la revisión semanal, en la ficha y al editar.
 * - **Validar.** "No futura" se decide **por día** en la zona de la org
 *   (`hitoEsFuturo`), no por instante: el mediodía de hoy todavía no llegó a la
 *   mañana, y registrar algo de hoy tiene que poder hacerse a cualquier hora.
 *
 * Hasta SCRUM-493 el diálogo guardaba el día elegido a las 12:00:00.000 UTC
 * exactas, y en UTC+12 o más ese instante ya es el día siguiente. Esas filas se
 * reconocen por esa hora exacta y se leen con su fecha de UTC, que es la que se
 * eligió. Con la convención nueva una fila cae justo ahí sólo si la zona de la
 * org está en UTC+0 en ese momento, y entonces su fecha de UTC es la elegida:
 * la regla da el mismo día.
 *
 * Lógica pura: no toca base ni red.
 */
import {
  fechaAInstanteEnZona,
  fechaDeHoyEnZona,
  fechaEnZona,
} from "@/lib/fechas/calendario";

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

/**
 * El día de un hito en la zona de la organización (null o inválida = la de por
 * defecto). `""` si no hay valor o no se entiende.
 */
export function fechaDelHitoEnZona(
  reachedAt: string | null | undefined,
  zona: string | null | undefined
): string {
  if (!reachedAt) return "";
  const instante = new Date(reachedAt);
  if (Number.isNaN(instante.getTime())) return "";
  if (esFechaDelDialogoViejo(instante)) {
    return `${instante.getUTCFullYear()}-${dosDigitos(instante.getUTCMonth() + 1)}-${dosDigitos(instante.getUTCDate())}`;
  }
  return fechaEnZona(instante, zona);
}

/** Lo que se guarda en `reached_at` para el día (`YYYY-MM-DD`) elegido en el diálogo. */
export function instanteDelHito(fecha: string, zona: string | null | undefined): string {
  return fechaAInstanteEnZona(fecha, zona);
}

/**
 * ¿El hito es de un día que todavía no llegó en la organización? Es lo que
 * rechaza la action: registrar algo que no ocurrió lo convierte en una
 * intención. Se compara por día, así que ni el mediodía de hoy ni un reloj de
 * navegador un poco adelantado hacen fallar un hito de hoy.
 */
export function hitoEsFuturo(
  reachedAt: string,
  zona: string | null | undefined,
  ahora: Date = new Date()
): boolean {
  return fechaDelHitoEnZona(reachedAt, zona) > fechaDeHoyEnZona(zona, ahora);
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
