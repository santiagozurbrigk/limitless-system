/**
 * Fechas calendario (`YYYY-MM-DD`): la única fuente para "hoy", "dentro de N
 * días", "vencida" y el valor de un `<input type="date">`.
 *
 * ⭐ Una fecha calendario no es un instante. `new Date().toISOString().slice(0, 10)`
 * da la fecha de **UTC**: después de las 21:00 en Argentina, UTC ya está en el
 * día siguiente, y con eso una fecha propuesta salía corrida un día y una tarea
 * que vence hoy aparecía vencida (SCRUM-104, SCRUM-493). Por eso acá:
 *
 * - "hoy" es el de la zona de la organización, en el servidor y en el
 *   navegador (`fechaDeHoyEnZona`, con `Intl.DateTimeFormat`; en el cliente,
 *   `useHoyDeLaOrganizacion`): un miembro en otra zona ve el mismo día que la
 *   organización;
 * - sumar días se hace sobre el calendario, sin pasar por ningún huso, así que
 *   un cambio de horario de verano no corre el resultado;
 * - "vencida" compara dos fechas calendario como texto.
 *
 * Lógica pura: no toca base ni red. Sirve en el navegador y en el servidor.
 */

/**
 * La zona que se usa cuando la organización no eligió una (la columna
 * `organizations.timezone` no tiene default y puede ser null) o la que tiene no
 * existe. Es la misma que muestran Ajustes y el panel de super admin.
 */
export const ZONA_HORARIA_POR_DEFECTO = "America/Argentina/Buenos_Aires";

const FECHA_CALENDARIO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Una fecha calendario que existe (el 2026-02-31 no). */
export function esFechaCalendario(valor: string): boolean {
  const partes = FECHA_CALENDARIO.exec(valor);
  if (!partes) return false;
  const [, y, m, d] = partes;
  const fecha = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return (
    fecha.getUTCFullYear() === Number(y) &&
    fecha.getUTCMonth() === Number(m) - 1 &&
    fecha.getUTCDate() === Number(d)
  );
}

function dosDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Suma (o resta) días a una fecha calendario.
 *
 * Se cuenta sobre el calendario, no sobre milisegundos: un día en que se
 * adelanta o atrasa el reloj dura 23 o 25 horas, y sumar `24 * 60 * 60 * 1000`
 * ahí cae en otra fecha. La cuenta usa `Date.UTC` sólo como calendario (UTC no
 * tiene horario de verano), nunca para leer la hora de nadie.
 */
export function sumarDias(fecha: string, dias: number): string {
  if (!esFechaCalendario(fecha)) {
    throw new RangeError(`"${fecha}" no es una fecha calendario (YYYY-MM-DD).`);
  }
  if (!Number.isInteger(dias)) {
    throw new RangeError(`Sólo se suman días enteros (llegó ${dias}).`);
  }
  const [y, m, d] = fecha.split("-").map(Number) as [number, number, number];
  const resultado = new Date(Date.UTC(y, m - 1, d + dias));
  return `${resultado.getUTCFullYear()}-${dosDigitos(resultado.getUTCMonth() + 1)}-${dosDigitos(resultado.getUTCDate())}`;
}

const formateadores = new Map<string, Intl.DateTimeFormat>();

/** El formateador de una zona, o `null` si la zona no existe. Se arma una vez por zona. */
function formateadorDeZona(zona: string): Intl.DateTimeFormat | null {
  const enCache = formateadores.get(zona);
  if (enCache) return enCache;
  try {
    const formateador = new Intl.DateTimeFormat("en-US", {
      timeZone: zona,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formateadores.set(zona, formateador);
    return formateador;
  } catch {
    return null;
  }
}

/**
 * La zona que se va a usar de verdad: la pedida si existe, y si no (null,
 * vacía o inventada) la de por defecto.
 */
export function resolverZonaHoraria(zona: string | null | undefined): string {
  const limpia = zona?.trim();
  if (limpia && formateadorDeZona(limpia)) return limpia;
  return ZONA_HORARIA_POR_DEFECTO;
}

/** La fecha calendario de un instante en una zona IANA (con fallback si la zona no sirve). */
export function fechaEnZona(instante: Date, zona: string | null | undefined): string {
  const formateador = formateadorDeZona(resolverZonaHoraria(zona))!;
  const partes = formateador.formatToParts(instante);
  const parte = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((p) => p.type === tipo)?.value ?? "";
  return `${parte("year")}-${parte("month")}-${parte("day")}`;
}

/**
 * La fecha de hoy en una zona IANA. Es el "hoy" del servidor: se le pasa la
 * zona de la organización (`organizations.timezone`).
 */
export function fechaDeHoyEnZona(
  zona: string | null | undefined,
  ahora: Date = new Date()
): string {
  return fechaEnZona(ahora, zona);
}

/**
 * ¿Ya venció? Vence **el día después** de su fecha: lo que vence hoy todavía
 * está a tiempo. Se compara por día, no por instante, contra un "hoy" que
 * arma quien llama (el local en el navegador, el de la organización en el
 * servidor).
 *
 * Sólo acepta fechas calendario (`YYYY-MM-DD`). Un instante no se corta a
 * mano (eso es quedarse con su día de UTC): quien tiene un `timestamptz` lo
 * convierte antes con `fechaDeValorGuardado` o `fechaDeInstanteEnZona`. Lo que no es
 * una fecha calendario no vence: una fecha que no se entiende no es una fecha.
 */
export function fechaVencida(fecha: string | null | undefined, hoy: string): boolean {
  if (!fecha || !esFechaCalendario(fecha)) return false;
  return fecha < hoy;
}

/**
 * El día de una fecha calendario como `Date`, a las 12:00 **locales**.
 *
 * El mediodía está lejos de los dos bordes del día: pasado a cualquier zona
 * entre UTC-11 y UTC+11 sigue cayendo en la misma fecha, y no lo toca un cambio
 * de horario (que se hace de madrugada). Sirve para mostrar la fecha con
 * `toLocaleDateString` sin que se corra al día anterior, cosa que sí pasa con
 * `new Date("2026-10-04")`, que se lee como medianoche de UTC.
 */
export function diaLocal(fecha: string): Date {
  // Sólo fechas calendario: un instante se convierte antes con
  // `fechaDeValorGuardado` o `fechaDeInstanteEnZona`, no cortando su texto.
  if (!esFechaCalendario(fecha)) {
    throw new RangeError(`"${fecha}" no es una fecha calendario (YYYY-MM-DD).`);
  }
  const [y, m, d] = fecha.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/**
 * Un valor guardado (columna `date` o `timestamptz` con una fecha elegida)
 * formateado para mostrar sólo la fecha, con el día que lee
 * `fechaDeValorGuardado` en `zona` (la de la organización): el mismo que
 * muestra `CampoFecha`. `null` si no hay valor o no se entiende, para que quien
 * llama elija qué mostrar en ese caso.
 */
export function formatearFechaGuardada(
  valor: string | null | undefined,
  {
    zona,
    opciones,
    idioma = "es-AR",
  }: { zona: string | null; opciones?: Intl.DateTimeFormatOptions; idioma?: string }
): string | null {
  const fecha = fechaDeValorGuardado(valor, zona);
  return fecha ? diaLocal(fecha).toLocaleDateString(idioma, opciones) : null;
}

const formateadoresConHora = new Map<string, Intl.DateTimeFormat>();

/** Desfase de una zona con UTC en un instante, en milisegundos (reloj de la zona menos UTC). */
function desfaseDeZona(instante: Date, zona: string): number {
  let formateador = formateadoresConHora.get(zona);
  if (!formateador) {
    formateador = new Intl.DateTimeFormat("en-US", {
      timeZone: zona,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formateadoresConHora.set(zona, formateador);
  }
  const partes = formateador.formatToParts(instante);
  const n = (tipo: Intl.DateTimeFormatPartTypes) =>
    Number(partes.find((p) => p.type === tipo)?.value);
  const reloj = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return reloj - Math.floor(instante.getTime() / 1000) * 1000;
}

/**
 * Lo que se guarda en una columna `timestamptz` cuando se eligió sólo una
 * fecha y el dato pertenece a la organización: ese día a las 12:00 **de la
 * zona de la organización** (null o inválida = la de por defecto), como
 * instante ISO. `fechaDeValorGuardado(…, zona)` lo vuelve a leer como el mismo
 * día, lo mire quien lo mire y desde donde sea (SCRUM-493).
 *
 * El mediodía nunca cae en un cambio de horario (se hacen de madrugada), así
 * que con dos pasadas de desfase alcanza.
 */
export function fechaAInstanteEnZona(fecha: string, zona: string | null | undefined): string {
  if (!esFechaCalendario(fecha)) {
    throw new RangeError(`"${fecha}" no es una fecha calendario (YYYY-MM-DD).`);
  }
  const zonaReal = resolverZonaHoraria(zona);
  const [y, m, d] = fecha.split("-").map(Number) as [number, number, number];
  const mediodiaComoUtc = Date.UTC(y, m - 1, d, 12, 0, 0, 0);
  let instante = mediodiaComoUtc - desfaseDeZona(new Date(mediodiaComoUtc), zonaReal);
  instante = mediodiaComoUtc - desfaseDeZona(new Date(instante), zonaReal);
  return new Date(instante).toISOString();
}

/**
 * El primer instante de una fecha en una zona (su 00:00, o la primera hora
 * que existe si ese día el reloj salta a la medianoche, como en Santiago de
 * Chile). Sirve para filtrar instantes por "el día de la organización".
 */
export function inicioDelDiaEnZona(fecha: string, zona: string | null | undefined): string {
  if (!esFechaCalendario(fecha)) {
    throw new RangeError(`"${fecha}" no es una fecha calendario (YYYY-MM-DD).`);
  }
  const zonaReal = resolverZonaHoraria(zona);
  const [y, m, d] = fecha.split("-").map(Number) as [number, number, number];
  const medianocheComoUtc = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  const primera = medianocheComoUtc - desfaseDeZona(new Date(medianocheComoUtc), zonaReal);
  const segunda = medianocheComoUtc - desfaseDeZona(new Date(primera), zonaReal);
  // La más temprana de las dos que cae en esa fecha: si la medianoche no
  // existe (salto de reloj), una de las dos pasadas queda en el día anterior.
  const validas = [primera, segunda].filter(
    (instante) => fechaEnZona(new Date(instante), zonaReal) === fecha
  );
  return new Date(Math.min(...(validas.length ? validas : [primera]))).toISOString();
}

/** Cuántos días calendario hay de `desde` a `hasta` (negativo si `hasta` es antes). */
export function diasEntre(desde: string, hasta: string): number {
  if (!esFechaCalendario(desde) || !esFechaCalendario(hasta)) {
    throw new RangeError(`"${desde}" o "${hasta}" no es una fecha calendario (YYYY-MM-DD).`);
  }
  const ms = (fecha: string) => {
    const [y, m, d] = fecha.split("-").map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(hasta) - ms(desde)) / (24 * 60 * 60 * 1000));
}

/**
 * Un valor guardado (columna `date` o `timestamptz` con una fecha **elegida**)
 * como `YYYY-MM-DD`, leído en una zona (la de la organización; null o inválida
 * = la de por defecto), sin correrlo de día. Es lo que muestra `CampoFecha` y
 * lo que usa el servidor para decidir, por ejemplo, si un próximo paso de
 * Closing (`next_action_at`) vence hoy. `""` si no hay valor o no se entiende.
 *
 * - Una fecha sin hora (`2026-10-04`, de una columna `date`) se devuelve tal cual.
 * - Un instante a las 00:00:00 UTC exactas es una fecha sin hora guardada en una
 *   columna `timestamptz` (Postgres la guarda así, y así la guardaba el
 *   seguimiento del lead): se toma su fecha de UTC, que es la que se eligió.
 * - Cualquier otro instante se lee con su fecha en la zona; lo guardado con
 *   `fechaAInstanteEnZona` en la misma zona vuelve con el mismo día.
 */
export function fechaDeValorGuardado(
  valor: string | null | undefined,
  zona: string | null | undefined
): string {
  if (!valor) return "";
  const texto = valor.trim();
  if (FECHA_CALENDARIO.test(texto)) return esFechaCalendario(texto) ? texto : "";

  const instante = new Date(texto);
  if (Number.isNaN(instante.getTime())) return "";

  const esMedianocheUtc =
    instante.getUTCHours() === 0 &&
    instante.getUTCMinutes() === 0 &&
    instante.getUTCSeconds() === 0 &&
    instante.getUTCMilliseconds() === 0;
  if (esMedianocheUtc) return fechaUtc(instante);
  return fechaEnZona(instante, zona);
}

/**
 * El día de un **instante real** (no de una fecha elegida) en una zona: una
 * llamada, un mensaje, un alta. A diferencia de `fechaDeValorGuardado`, no
 * aplica la regla de medianoche UTC: una llamada que empezó a las 00:00:00 UTC
 * en punto es una llamada de las 21:00 en Argentina, no una fecha sin hora. Un
 * `YYYY-MM-DD` se devuelve tal cual. `""` si no se entiende.
 */
export function fechaDeInstanteEnZona(
  valor: string | null | undefined,
  zona: string | null | undefined
): string {
  if (!valor) return "";
  const texto = valor.trim();
  if (FECHA_CALENDARIO.test(texto)) return esFechaCalendario(texto) ? texto : "";
  const instante = new Date(texto);
  if (Number.isNaN(instante.getTime())) return "";
  return fechaEnZona(instante, zona);
}

/** La fecha de UTC de un instante. Sólo para las reglas de lectura de valores guardados. */
function fechaUtc(instante: Date): string {
  return `${instante.getUTCFullYear()}-${dosDigitos(instante.getUTCMonth() + 1)}-${dosDigitos(instante.getUTCDate())}`;
}
