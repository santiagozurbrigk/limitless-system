/**
 * ⭐ Hasta dónde avanza la sincronización de Fathom después de una corrida
 * (SCRUM-36, `[FATHOM-SYNC-CURSOR]`).
 *
 * El cursor es `last_sync_at`: la corrida siguiente le pide a Fathom las
 * reuniones con `created_at` posterior. Antes se escribía la hora del servidor
 * apenas se guardaba una sola llamada, aunque otras hubieran fallado o la
 * lectura se hubiera cortado en el tope de páginas: lo que quedaba atrás no se
 * volvía a pedir nunca.
 *
 * La regla de ahora: el cursor sólo avanza sobre lo que se leyó y se guardó de
 * verdad, medido con el `created_at` que manda Fathom, nunca con el reloj del
 * servidor.
 *
 * Lógica pura: no toca base ni red. La lectura por tramos que la alimenta vive
 * en `lib/fathom/leer-ventana.ts`.
 */
import type { FathomMeetingRecord } from "@/lib/fathom/api";

const MINUTO_MS = 60 * 1000;
const HORA_MS = 60 * MINUTO_MS;

/**
 * Cuánto se retrocede desde la última reunión leída. Cubre reuniones con la
 * misma hora y las que Fathom lista unos minutos después de su `created_at`.
 * Volver a leerlas no cuesta trabajo caro: el guardado no las vuelve a analizar
 * (`debeReasociarAlSincronizar` en `lib/fathom/sync.ts`).
 */
export const SOLAPE_MS = 30 * MINUTO_MS;

/**
 * Mientras una reunión que no se pudo guardar tenga menos de esto, frena el
 * cursor y se reintenta en cada corrida (el cron es horario: unos 24 intentos).
 */
export const PLAZO_DE_REINTENTOS_MS = 24 * HORA_MS;

/**
 * Tamaño de cada tramo cuando la sincronización viene atrasada. Ver
 * `siguienteTramo`.
 */
export const TRAMO_MS = 6 * HORA_MS;

/** Los tramos se pisan un segundo para que ninguna reunión caiga en el borde. */
const SOLAPE_ENTRE_TRAMOS_MS = 1000;

function aMs(valor: string | null | undefined): number | null {
  if (!valor) return null;
  const ms = new Date(valor).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function aIso(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * La fecha con la que se ubica una reunión respecto del cursor.
 *
 * Es su `created_at`, el campo por el que filtra Fathom. Si falta o no se
 * puede leer se usa el inicio de la grabación, que nunca es posterior a la
 * creación (Fathom la crea al terminar de grabar): ubicarla antes de lo real
 * sólo hace que se vuelva a pedir, nunca que se pierda. Sin ninguna de las dos
 * devuelve `null`.
 */
export function fechaDeCreacion(
  meeting: Pick<FathomMeetingRecord, "created_at" | "recording_start_time">
): number | null {
  return aMs(meeting.created_at) ?? aMs(meeting.recording_start_time);
}

export type Tramo = {
  /** `created_after` del pedido. `null` = sin filtro. */
  desde: string | null;
  /** `created_before` del pedido. `null` = hasta el presente. */
  hasta: string | null;
};

/**
 * ⭐ Qué pedirle a Fathom a continuación.
 *
 * Si el cursor está al día, un solo pedido hasta el presente, como siempre.
 * Si viene atrasado más de dos tramos (una caída de varios días, una cuenta
 * sin reuniones), se lee de a tramos de `TRAMO_MS` **desde el más viejo**.
 * Fathom devuelve primero lo más reciente: con un pedido abierto y una ventana
 * más grande que el tope de páginas, cada corrida volvería a leer lo nuevo y
 * nunca llegaría a lo viejo. Por tramos, cada tramo cerrado es terreno ganado y
 * el cursor avanza aunque no haya traído ninguna reunión.
 *
 * Un tramo cerrado termina por lo menos `TRAMO_MS` antes de `ahora`, así que
 * para cuando se lee Fathom ya listó todo lo que se creó en él.
 */
export function siguienteTramo(desde: string | null, ahora: Date): Tramo {
  const desdeMs = aMs(desde);
  if (desdeMs === null) return { desde: null, hasta: null };
  if (desdeMs < ahora.getTime() - 2 * TRAMO_MS) {
    return { desde: aIso(desdeMs), hasta: aIso(desdeMs + TRAMO_MS) };
  }
  return { desde: aIso(desdeMs), hasta: null };
}

/** Desde dónde se pide el tramo que sigue a uno que terminaba en `hasta`. */
export function inicioDelTramoSiguiente(hasta: string): string {
  return aIso(new Date(hasta).getTime() - SOLAPE_ENTRE_TRAMOS_MS);
}

/** Cómo terminó la lectura de la ventana. */
export type LecturaDeVentana = {
  /** Todo lo leído, sin repetidas, en el orden en que llegó. */
  meetings: FathomMeetingRecord[];
  /** `true` si se cortó por el tope de páginas y quedaron reuniones sin leer. */
  cortada: boolean;
  /**
   * Fin del último tramo cerrado que se leyó entero: todo lo creado antes ya se
   * pidió. `null` si no se cerró ningún tramo.
   */
  completaHasta: string | null;
  /** Lo que llegó del tramo que se cortó, en orden de llegada. */
  tramoCortado: FathomMeetingRecord[];
};

export type ResultadoDeReunion = {
  meeting: FathomMeetingRecord;
  guardada: boolean;
};

export type OrdenDeLlegada = "ascendente" | "descendente" | "desconocido";

/**
 * En qué orden llegaron las reuniones. La doc de Fathom no lo fija (su ejemplo
 * habla de "las más recientes"), así que se mira lo que llegó: con menos de
 * dos fechas distintas, o con fechas mezcladas, es desconocido.
 */
export function ordenDeLlegada(meetings: FathomMeetingRecord[]): OrdenDeLlegada {
  let sube = 0;
  let baja = 0;
  let anterior: number | null = null;
  for (const meeting of meetings) {
    const fecha = fechaDeCreacion(meeting);
    if (fecha === null) continue;
    if (anterior !== null) {
      if (fecha > anterior) sube++;
      else if (fecha < anterior) baja++;
    }
    anterior = fecha;
  }
  if (sube > 0 && baja === 0) return "ascendente";
  if (baja > 0 && sube === 0) return "descendente";
  return "desconocido";
}

export type DecisionDeCursor = {
  /** El valor para `last_sync_at`. Igual al anterior si no avanza. */
  cursor: string | null;
  avanza: boolean;
  /**
   * Fallaron y ya no frenan el cursor: superaron el plazo de reintentos y ya lo
   * venían frenando. Se reportan a Sentry.
   */
  descartadas: FathomMeetingRecord[];
  /** Fallaron y no tienen fecha: no hay dónde frenar el cursor. Se reportan. */
  sinFecha: FathomMeetingRecord[];
  /**
   * La lectura se cortó y el cursor no se pudo mover: la próxima corrida pide lo
   * mismo. Se reporta, porque si se repite la sync está trabada.
   */
  trabada: boolean;
  /** Para el log. */
  motivo: string;
};

function maximo(fechas: Array<number | null>): number | null {
  let max: number | null = null;
  for (const fecha of fechas) {
    if (fecha !== null && (max === null || fecha > max)) max = fecha;
  }
  return max;
}

/**
 * ⭐ El cursor nuevo.
 *
 * 1. **Techo**: hasta dónde se leyó todo.
 *    - Lectura completa: la reunión más nueva que llegó (o el fin del último
 *      tramo cerrado, si es posterior).
 *    - Lectura cortada: el fin del último tramo cerrado. Si el tramo cortado
 *      llegó en orden ascendente, lo leído antes del corte también cuenta; si
 *      llegó descendente o en un orden que no se puede saber, lo que falta es
 *      más viejo que lo leído y no se cuenta.
 * 2. **Fallas**: una reunión que no se guardó frena el cursor en su fecha.
 *    Deja de frenarlo (y se reporta) cuando tiene más de
 *    `PLAZO_DE_REINTENTOS_MS` **y** ya lo venía frenando (el cursor anterior
 *    quedó a la altura de esa reunión, menos el solape). Así un dato corrupto
 *    no traba la sync para siempre, y una caída de la base durante una puesta
 *    al día no descarta de un saque las reuniones viejas que fallaron por
 *    primera vez: esas frenan el cursor y se reintentan en la corrida
 *    siguiente.
 * 3. Al menor de los dos se le resta `SOLAPE_MS`.
 * 4. **Nunca retrocede.** Si no se guardó ni falló nada, no hay techo y el
 *    cursor queda donde estaba; la ventana no crece sin límite porque, cuando
 *    queda atrasada más de dos tramos, la lectura pasa a ser por tramos y cada
 *    tramo cerrado lo hace avanzar.
 */
export function calcularNuevoCursor(params: {
  cursorAnterior: string | null;
  lectura: Pick<LecturaDeVentana, "cortada" | "completaHasta" | "tramoCortado">;
  resultados: ResultadoDeReunion[];
  ahora: Date;
}): DecisionDeCursor {
  const { lectura, resultados } = params;
  const anterior = aMs(params.cursorAnterior);
  const ahora = params.ahora.getTime();
  const completaHasta = aMs(lectura.completaHasta);

  let techo: number | null;
  let motivo: string;
  if (!lectura.cortada) {
    techo = maximo([completaHasta, ...resultados.map((r) => fechaDeCreacion(r.meeting))]);
    motivo = "lectura completa";
  } else if (ordenDeLlegada(lectura.tramoCortado) === "ascendente") {
    techo = maximo([completaHasta, ...lectura.tramoCortado.map(fechaDeCreacion)]);
    motivo = "lectura cortada (orden ascendente): hasta lo último leído";
  } else {
    techo = completaHasta;
    motivo = "lectura cortada: hasta el último tramo completo";
  }

  const descartadas: FathomMeetingRecord[] = [];
  const sinFecha: FathomMeetingRecord[] = [];
  let limiteDeFallas: number | null = null;
  for (const { meeting, guardada } of resultados) {
    if (guardada) continue;
    const fecha = fechaDeCreacion(meeting);
    if (fecha === null) {
      sinFecha.push(meeting);
      continue;
    }
    const vencida = ahora - fecha > PLAZO_DE_REINTENTOS_MS;
    const yaFrenaba = anterior !== null && anterior >= fecha - SOLAPE_MS;
    if (vencida && yaFrenaba) {
      descartadas.push(meeting);
      continue;
    }
    if (limiteDeFallas === null || fecha < limiteDeFallas) limiteDeFallas = fecha;
  }

  let candidato: number | null = null;
  if (techo !== null) {
    const tope = limiteDeFallas === null ? techo : Math.min(techo, limiteDeFallas);
    candidato = tope - SOLAPE_MS;
    if (limiteDeFallas !== null && limiteDeFallas <= techo) {
      motivo += "; frenado por una reunión que no se guardó";
    }
  } else {
    motivo += "; nada leído que permita avanzar";
  }

  const avanza = candidato !== null && (anterior === null || candidato > anterior);
  const cursor = avanza
    ? aIso(candidato as number)
    : anterior === null
      ? null
      : aIso(anterior);

  return {
    cursor,
    avanza,
    descartadas,
    sinFecha,
    trabada: lectura.cortada && !avanza,
    motivo,
  };
}
