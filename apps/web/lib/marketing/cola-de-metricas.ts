/**
 * Reglas de la cola del cron de métricas de contenido (SCRUM-172, reabierta).
 *
 * Prioridades del lote diario de cada org:
 * 1. Piezas nuevas (`metrics_checked_at` null): se miden primero.
 * 2. Piezas con métricas: se refrescan, la que hace más tiempo que no se intenta primero.
 * 3. Piezas ya intentadas que siguen sin dato: sólo cuando venció su espera
 *    (`metrics_reintentar_desde`), y con un cupo: no pueden ocupar el lugar de las
 *    piezas con métricas, pero tampoco se quedan sin turno si sobran.
 *
 * ⭐ Una pieza sin dato no vuelve a la cola al día siguiente: espera 1, 2, 4, 8 y
 * después 16 días entre intentos. Y una historia sin métricas con más de 48 h de
 * publicada no se reintenta más (`NUNCA`): Meta sólo expone las historias vigentes,
 * 24 h, y Zernio guarda sus métricas con el webhook `story_insights` al vencer
 * (`lib/zernio/client.ts`: `ZernioInstagramStory`, `listInstagramStories` y
 * `syncExternalStories`). Si a las 48 h no llegaron, no van a llegar.
 */

export const TAMANO_DEL_LOTE = 50;

/**
 * Lugares del lote para reintentos de piezas sin dato cuando hay piezas con
 * métricas esperando: deja 40 para refrescar las medidas. Con la espera creciente
 * la demanda de reintentos es chica (50 piezas muertas en la espera máxima son
 * unos 3 pedidos por día).
 */
export const CUPO_DE_REINTENTOS = 10;

/**
 * Espera máxima entre intentos de una pieza sin dato. 16 días: una pieza que
 * nunca va a tener analytics (post borrado, formato que Zernio no mide) cuesta
 * 2 pedidos por mes, y una que se recupera (analytics que tardan en aparecer)
 * se vuelve a medir en no más de 16 días.
 */
export const ESPERA_MAXIMA_DIAS = 16;

/** Vida de una historia: 24 h vigente + margen para el webhook `story_insights`. */
export const VIDA_DE_HISTORIA_HORAS = 48;

/** Fecha de reintento de una pieza que no se vuelve a intentar sola. */
export const NUNCA = "infinity";

const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;

type PiezaParaReintento = {
  type?: string | null;
  published_at?: string | null;
};

/** Una historia con más de 48 h de publicada (o sin fecha): ya no va a tener métricas. */
export function esHistoriaVencida(pieza: PiezaParaReintento, ahora: Date): boolean {
  if (pieza.type !== "story") return false;
  if (!pieza.published_at) return true;
  return ahora.getTime() - new Date(pieza.published_at).getTime() >= VIDA_DE_HISTORIA_HORAS * HORA_MS;
}

/** Días de espera después del intento sin dato número `intentosSinDato` (1, 2, 4, 8, 16, 16…). */
export function diasDeEspera(intentosSinDato: number): number {
  const n = Math.max(1, Math.floor(intentosSinDato));
  return Math.min(2 ** (n - 1), ESPERA_MAXIMA_DIAS);
}

/**
 * Desde cuándo se puede volver a intentar una pieza que acaba de quedar sin dato
 * por `intentosSinDato`-ésima vez. Una historia joven se reintenta, a más tardar,
 * cuando cumple 48 h; una historia vencida, nunca.
 */
export function proximoIntento(
  pieza: PiezaParaReintento,
  intentosSinDato: number,
  ahora: Date
): string {
  if (esHistoriaVencida(pieza, ahora)) return NUNCA;
  let proximo = ahora.getTime() + diasDeEspera(intentosSinDato) * DIA_MS;
  if (pieza.type === "story" && pieza.published_at) {
    proximo = Math.min(proximo, new Date(pieza.published_at).getTime() + VIDA_DE_HISTORIA_HORAS * HORA_MS);
  }
  return new Date(proximo).toISOString();
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
