/**
 * Qué es una "última 1-1" y cuán confiable es su vínculo.
 *
 * ⭐ Vive en su propio módulo, sin importar nada, porque **la tabla de clientes
 * también lo necesita** y es un componente cliente. Importarlo de
 * `one-on-ones.ts` arrastraría al bundle del navegador el módulo que crea el
 * cliente admin de Supabase — el que bypassea RLS y lleva la service role key.
 * Es el mismo motivo por el que `lib/discord/limits.ts` existe aparte.
 */

export type LastOneOnOne = {
  /** Fecha de la llamada (`YYYY-MM-DD`). */
  date: string;
  /** Cómo se resolvió que era con este cliente. Sirve para avisar si es candidato. */
  resolutionMethod: string | null;
  title: string | null;
  fathomUrl: string | null;
  /** Cuántas 1-1 lleva el cliente en total. */
  totalCalls: number;
  /** Cada cuántos días, en promedio. `null` con menos de dos llamadas. */
  everyDays: number | null;
};

/** Lo que dice el contador de 1-1 en la ficha de un cliente. */
export type OneOnOneStats = {
  totalCalls: number;
  /** `YYYY-MM-DD` de la primera y la última. */
  firstDate: string | null;
  lastDate: string | null;
  /** Cada cuántos días, en promedio. `null` con menos de dos llamadas. */
  everyDays: number | null;
  /** Cuántos días pasaron desde la última. `null` si no hay ninguna. */
  daysSinceLast: number | null;
};

const MS_POR_DIA = 86_400_000;

function aFecha(valor: string): number | null {
  // Mediodía UTC: un `YYYY-MM-DD` a medianoche cae en el día anterior en
  // cualquier huso al oeste de Greenwich, que es donde está todo el mercado.
  const ms = Date.parse(`${valor.slice(0, 10)}T12:00:00Z`);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * El contador de 1-1 a partir de las fechas de las llamadas.
 *
 * ⭐ El ritmo se calcula como **el largo del período dividido los intervalos**,
 * no como el promedio de los huecos. Con llamadas los días 1, 2 y 30, el
 * promedio de huecos daría 14,5 días y el período real son 29 días entre la
 * primera y la última, repartidos en dos intervalos: 14,5. Dan igual acá, pero
 * el primer método es el que no se rompe cuando hay dos llamadas el mismo día.
 *
 * ⭐ Con **una sola** llamada el ritmo es `null`, no cero ni "cada 0 días": con
 * un solo punto no hay ritmo que medir, y cualquier número ahí sería inventado.
 *
 * `hoy` es la fecha calendario (`YYYY-MM-DD`) de la organización, para
 * `daysSinceLast`. Sin default a propósito: el servidor corre en UTC y de noche
 * en Argentina su día ya es mañana (SCRUM-493).
 *
 * Lógica pura: no toca base ni red.
 */
export function computeOneOnOneStats(
  dates: readonly string[],
  hoy: string
): OneOnOneStats {
  const ritmo = computeOneOnOneRhythm(dates);
  const ultima = ritmo.lastDate ? aFecha(ritmo.lastDate) : null;
  // Misma escala que `aFecha`: el mediodía UTC de cada fecha.
  const hoyMs = Date.parse(`${hoy}T12:00:00Z`);
  return {
    ...ritmo,
    daysSinceLast:
      ultima === null ? null : Math.max(0, Math.round((hoyMs - ultima) / MS_POR_DIA)),
  };
}

/**
 * Lo que no depende de hoy: total, primera, última y ritmo. Es lo que usa la
 * tabla de clientes, que no muestra "hace cuántos días".
 */
export function computeOneOnOneRhythm(
  dates: readonly string[]
): Omit<OneOnOneStats, "daysSinceLast"> {
  const ordenadas = dates
    .map(aFecha)
    .filter((ms): ms is number => ms != null)
    .sort((a, b) => a - b);

  if (ordenadas.length === 0) {
    return { totalCalls: 0, firstDate: null, lastDate: null, everyDays: null };
  }

  const primera = ordenadas[0];
  const ultima = ordenadas[ordenadas.length - 1];

  const everyDays =
    ordenadas.length > 1
      ? Math.max(1, Math.round((ultima - primera) / MS_POR_DIA / (ordenadas.length - 1)))
      : null;

  return {
    totalCalls: ordenadas.length,
    firstDate: new Date(primera).toISOString().slice(0, 10),
    lastDate: new Date(ultima).toISOString().slice(0, 10),
    everyDays,
  };
}

/**
 * ¿Este vínculo se resolvió de forma determinista, o es un candidato?
 *
 * ⭐ La tabla muestra la fecha igual, pero avisa cuando es un candidato: un
 * nombre repetido alcanza para que la llamada sea de otra persona. Ocultarla
 * hasta que alguien confirme dejaría la columna vacía durante semanas; mostrarla
 * sin avisar diría una fecha que puede no ser de este cliente.
 */
export function isConfirmedResolution(method: string | null): boolean {
  return (
    method === "invitee_email" || method === "speaker_alias" || method === "manual"
  );
}
