/**
 * ⭐ El reloj del cron de Fathom (`/api/integrations/fathom/sync`, SCRUM-36).
 *
 * El cron tiene `maxDuration = 60` s y recorre en serie la conexión de cada
 * organización y la de cada miembro. Sin un plazo común, las esperas por
 * `Retry-After` y las lecturas largas de unas conexiones se comían el tiempo de
 * las demás, la función moría por timeout y las que iban últimas (siempre los
 * miembros) no se sincronizaban esa hora.
 *
 * Ahora la corrida tiene un plazo: pasado ese momento no arranca ninguna
 * conexión más, no se pide otra página ni otro tramo y no se espera un
 * `Retry-After`. Lo que no se leyó queda para la corrida siguiente, sin perder
 * nada: el cursor de cada conexión sólo avanza sobre lo leído y guardado. Y el
 * orden rota de una corrida a la otra, así que ninguna conexión queda siempre
 * última.
 *
 * Lógica pura: no toca base ni red.
 */

/**
 * Hasta cuándo se arranca trabajo nuevo, contado desde el inicio de la corrida.
 * Los 15 s que quedan hasta los 60 de `maxDuration` son para terminar la página
 * en curso, guardar lo leído y escribir los cursores.
 */
export const PLAZO_DEL_CRON_MS = 45_000;

/**
 * Lo mínimo que tiene que sobrar después de una espera por `Retry-After` antes
 * del plazo: el pedido que se reintenta y el guardado de lo leído.
 */
export const MARGEN_DESPUES_DE_ESPERAR_MS = 8_000;

const HORA_MS = 60 * 60 * 1000;

export function plazoDeLaCorrida(inicio: number): number {
  return inicio + PLAZO_DEL_CRON_MS;
}

/** Sin plazo (sincronización manual) siempre hay tiempo. */
export function quedaTiempo(plazo: number | undefined, ahora = Date.now()): boolean {
  return plazo === undefined || ahora < plazo;
}

/** ¿Cabe esperar `esperaMs` y todavía reintentar y guardar antes del plazo? */
export function cabeLaEspera(
  plazo: number | undefined,
  esperaMs: number,
  ahora = Date.now()
): boolean {
  return plazo === undefined || ahora + esperaMs + MARGEN_DESPUES_DE_ESPERAR_MS <= plazo;
}

/** Número de la corrida horaria: cambia una vez por hora. */
export function numeroDeCorrida(ahora: number): number {
  return Math.floor(ahora / HORA_MS);
}

/**
 * La lista rotada según la corrida: en cada corrida arranca un elemento
 * distinto, así que el que hoy quedó último (y quizás sin tiempo) mañana va
 * primero o cerca del principio.
 */
export function rotar<T>(items: T[], corrida: number): T[] {
  if (items.length < 2) return [...items];
  const inicio = ((corrida % items.length) + items.length) % items.length;
  return [...items.slice(inicio), ...items.slice(0, inicio)];
}

/** Los dos grupos del cron se alternan: en las corridas impares van primero los miembros. */
export function miembrosPrimero(corrida: number): boolean {
  return corrida % 2 !== 0;
}
