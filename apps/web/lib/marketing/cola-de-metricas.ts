import { ZernioHttpError } from "@/lib/zernio/client";

/**
 * Reglas de la cola del cron de métricas de contenido (SCRUM-172, reabierta).
 *
 * Prioridades del lote diario de cada org:
 * 1. Piezas nuevas (`metrics_checked_at` null): se miden primero. Una historia
 *    nueva recién entra cuando venció (ver abajo).
 * 2. Piezas con métricas: se refrescan, la que hace más tiempo que no se intenta primero.
 * 3. Piezas ya intentadas que siguen sin dato (nunca historias): sólo cuando venció
 *    su espera (`metrics_reintentar_desde`), y con un cupo: no pueden ocupar el
 *    lugar de las piezas con métricas, pero tampoco se quedan sin turno si sobran.
 *
 * ⭐ Una pieza sin dato no vuelve a la cola al día siguiente: espera 1, 2, 4, 8 y
 * después 16 días entre intentos.
 *
 * ⭐ Las historias se miden UNA vez. Meta sólo expone las historias vigentes (24 h)
 * y Zernio guarda sus métricas con el webhook `story_insights` al vencer
 * (`lib/zernio/client.ts`: `ZernioInstagramStory`, `listInstagramStories` y
 * `syncExternalStories`): antes de vencer no hay números finales que pedir, y
 * después no cambian. Por eso una historia entra a la cola a las 30 h de publicada
 * (24 h de vida + 6 h de margen para el webhook), se pide una sola vez, y con o sin
 * dato queda cerrada (`metrics_reintentar_desde = infinity`). Al empezar cada
 * corrida se cierran sin pedirle nada a Zernio las historias que pasaron las 72 h
 * sin cerrarse (o que no tienen fecha de publicación): la ventana de 30 a 72 h
 * (42 h) alcanza para que el cron diario la tome al menos una vez.
 */

export const TAMANO_DEL_LOTE = 50;

/**
 * Lugares del lote para reintentos de piezas sin dato cuando hay piezas con
 * métricas esperando: deja 40 para refrescar las medidas. Con la espera creciente
 * la demanda de reintentos es chica (50 piezas muertas en la espera máxima son
 * unos 3 pedidos por día). Las historias no usan este cupo: no se reintentan.
 */
export const CUPO_DE_REINTENTOS = 10;

/**
 * Espera máxima entre intentos de una pieza sin dato. 16 días: una pieza que
 * nunca va a tener analytics (post borrado, formato que Zernio no mide) cuesta
 * 2 pedidos por mes, y una que se recupera (analytics que tardan en aparecer)
 * se vuelve a medir en no más de 16 días.
 */
export const ESPERA_MAXIMA_DIAS = 16;

/** Una historia entra a la cola a las 30 h: 24 h vigente + 6 h para `story_insights`. */
export const HISTORIA_LISTA_HORAS = 30;

/** A las 72 h una historia que no se cerró se cierra sin pedirla. */
export const HISTORIA_CIERRE_HORAS = 72;

/** Fecha de reintento de una pieza que no se vuelve a intentar sola. */
export const NUNCA = "infinity";

const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;

/** Las historias publicadas hasta esta fecha ya se pueden medir. */
export function historiasListasHasta(ahora: Date): string {
  return new Date(ahora.getTime() - HISTORIA_LISTA_HORAS * HORA_MS).toISOString();
}

/** Las historias publicadas hasta esta fecha que sigan abiertas se cierran sin pedirlas. */
export function historiasACerrarHasta(ahora: Date): string {
  return new Date(ahora.getTime() - HISTORIA_CIERRE_HORAS * HORA_MS).toISOString();
}

/** Días de espera después del intento sin dato número `intentosSinDato` (1, 2, 4, 8, 16, 16…). */
export function diasDeEspera(intentosSinDato: number): number {
  const n = Math.max(1, Math.floor(intentosSinDato));
  return Math.min(2 ** (n - 1), ESPERA_MAXIMA_DIAS);
}

/**
 * Desde cuándo se puede volver a intentar una pieza que acaba de quedar sin dato
 * por `intentosSinDato`-ésima vez. Una historia, nunca: se mide una sola vez.
 */
export function proximoIntento(
  pieza: { type?: string | null },
  intentosSinDato: number,
  ahora: Date
): string {
  if (pieza.type === "story") return NUNCA;
  return new Date(ahora.getTime() + diasDeEspera(intentosSinDato) * DIA_MS).toISOString();
}

/**
 * Un error de Zernio que no se arregla reintentando (4xx distinto de 408 y 429:
 * por ejemplo 404 de un post borrado o 400 de un id inválido). Cuenta como "sin
 * dato" y suma espera. 408, 429, 5xx y los errores de red no: son pasajeros.
 * El status sale de `ZernioHttpError` (`lib/zernio/client.ts`).
 */
export function esErrorPermanente(err: unknown): boolean {
  if (!(err instanceof ZernioHttpError)) return false;
  const { status } = err;
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

/**
 * Arma el resto del lote con las piezas con métricas y los reintentos vencidos.
 * Los reintentos toman a lo sumo `cupo` lugares; si no hay suficientes piezas
 * con métricas, ocupan lo que sobra.
 */
export function armarLote<T>(
  conMetricas: T[],
  reintentos: T[],
  lugares: number,
  cupo: number = CUPO_DE_REINTENTOS
): T[] {
  if (lugares <= 0) return [];
  const reservados = Math.min(cupo, reintentos.length, lugares);
  const medidas = conMetricas.slice(0, lugares - reservados);
  const sinDato = reintentos.slice(0, lugares - medidas.length);
  return [...medidas, ...sinDato];
}
