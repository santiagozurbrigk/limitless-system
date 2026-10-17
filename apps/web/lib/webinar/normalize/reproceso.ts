/**
 * Textos de `landing_events.error_message` y la cuenta de reprocesos
 * (SCRUM-528). Puro.
 *
 * La migración de SCRUM-526 no tiene una columna de intentos, y esta tarea no
 * la cambia: la cuenta va en el propio `error_message`, que siempre es un
 * texto fijo armado acá (paso, código SQLSTATE y número de reproceso; nunca
 * datos personales ni el texto de la base).
 *
 * Ciclo de un evento que falla:
 *   - la normalización del endpoint falla: `error`, sin número (0 reprocesos);
 *   - el cron lo reclama: `pending` con "Reproceso n de 5 en curso." (el
 *     número queda guardado aunque el proceso se corte a la mitad);
 *   - el reproceso n falla: `error` con "... Reproceso n de 5.";
 *   - el reproceso 5 falla: `error` definitivo con "... no se reintenta más.",
 *     que el cron ya no lee, y aviso a Sentry.
 */

/** Cuántas veces reprocesa el cron un evento que falló (además del intento del endpoint). */
export const MAXIMO_DE_REPROCESOS = 5;

/** Marca del error definitivo. El cron filtra por ella (`not like`). */
export const MARCA_DE_ERROR_DEFINITIVO = "no se reintenta más";

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

function causa(paso: PasoDeNormalizacion, codigo: string | null): string {
  const conCodigo = codigoSeguro(codigo);
  return `Falló la normalización en ${paso}${conCodigo ? ` (código ${conCodigo})` : ""}.`;
}

/** El error del intento del endpoint (todavía sin reprocesos). */
export function mensajeDeFalla(
  paso: PasoDeNormalizacion,
  codigo: string | null,
  reproceso: number = 0,
): string {
  if (reproceso <= 0) return causa(paso, codigo);
  if (reproceso >= MAXIMO_DE_REPROCESOS) {
    return `${causa(paso, codigo)} Reproceso ${reproceso} de ${MAXIMO_DE_REPROCESOS}: ${MARCA_DE_ERROR_DEFINITIVO}.`;
  }
  return `${causa(paso, codigo)} Reproceso ${reproceso} de ${MAXIMO_DE_REPROCESOS}.`;
}

/** Lo que deja el cron al reclamar un evento, antes de procesarlo. */
export function mensajeDeReclamo(reproceso: number): string {
  return `Reproceso ${reproceso} de ${MAXIMO_DE_REPROCESOS} en curso.`;
}

/** Un evento que se cortó en su último reproceso y no llegó a cerrarse. */
export function mensajeDeCorteDefinitivo(): string {
  return `El reproceso ${MAXIMO_DE_REPROCESOS} de ${MAXIMO_DE_REPROCESOS} no terminó: ${MARCA_DE_ERROR_DEFINITIVO}.`;
}

const NUMERO_DE_REPROCESO = /Reproceso (\d+) de \d+/;

/** Cuántos reprocesos ya se hicieron (o arrancaron) según el texto guardado. */
export function reprocesosHechos(mensaje: string | null | undefined): number {
  if (!mensaje) return 0;
  const encontrado = NUMERO_DE_REPROCESO.exec(mensaje);
  return encontrado ? Number(encontrado[1]) : 0;
}

export function esErrorDefinitivo(mensaje: string | null | undefined): boolean {
  return typeof mensaje === "string" && mensaje.includes(MARCA_DE_ERROR_DEFINITIVO);
}
