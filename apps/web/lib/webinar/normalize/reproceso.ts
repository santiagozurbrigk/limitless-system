/**
 * Textos de `landing_events.error_message` y el tope de reprocesos
 * (SCRUM-528). Puro.
 *
 * Desde la AR pasada 1 el estado del reproceso vive en columnas propias
 * (migración `20261016130000_landing_events_reprocesos`):
 *   - `reprocess_attempts`: cuántos reprocesos arrancó el cron (el intento del
 *     endpoint no cuenta). Se suma al reclamar, así un proceso que se corta a
 *     la mitad igual gasta su intento;
 *   - `status = 'failed'`: el error definitivo, después del reproceso número
 *     `MAXIMO_DE_REPROCESOS`. El cron no lo lee nunca.
 * `error_message` es sólo un texto fijo que describe la última falla (el paso
 * y el SQLSTATE), el motivo de un `unmapped` o la nota de un `processed`.
 * Nunca datos personales ni el texto de la base, y nada lo interpreta.
 */

/** Cuántas veces reprocesa el cron un evento que falló (además del intento del endpoint). */
export const MAXIMO_DE_REPROCESOS = 5;

/** Paso de la normalización que falló. Va en el texto del error, nunca un dato. */
export type PasoDeNormalizacion =
  | "lanzamiento"
  | "lead"
  | "registro"
  | "evento"
  | "visita"
  /** Una excepción que no vino de una consulta (por ejemplo, la red caída). */
  | "desconocido";

/** Sólo un SQLSTATE (5 caracteres) o un código de PostgREST: nada más entra al texto. */
const FORMA_DE_CODIGO = /^(?:[0-9A-Z]{5}|PGRST\d{3})$/;

export function codigoSeguro(codigo: unknown): string | null {
  return typeof codigo === "string" && FORMA_DE_CODIGO.test(codigo) ? codigo : null;
}

/** El texto de una falla de normalización: el paso y, si es seguro, el código. */
export function mensajeDeFalla(paso: PasoDeNormalizacion, codigo: string | null): string {
  const conCodigo = codigoSeguro(codigo);
  return `Falló la normalización en ${paso}${conCodigo ? ` (código ${conCodigo})` : ""}.`;
}

/** Un evento cuyo último reproceso se cortó sin cerrarse: pasa a `failed` sin procesarlo otra vez. */
export const MENSAJE_REPROCESO_SIN_TERMINAR =
  "El último reproceso no terminó y no quedan reprocesos.";
