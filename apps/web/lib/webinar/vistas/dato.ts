/**
 * ⭐ Un número de una pantalla de Limitless Webinars (SCRUM-542).
 *
 * Cada número viaja con su valor, su estado, su fuente y el motivo del estado
 * (requerimientos técnicos del sprint 2, §6): la pantalla nunca muestra un cero
 * que nadie midió. Es la regla de ADR-010 ("nunca inventar un valor") y de
 * `lib/funnels/source-signal.ts` (sin fuente no es cero) llevada al contrato.
 *
 * Los cinco estados:
 *
 * | Estado             | `value`             | Qué significa                                   |
 * |--------------------|---------------------|-------------------------------------------------|
 * | `medido`           | el valor            | La fuente respondió y el dato está al día       |
 * | `desactualizado`   | el último conocido  | Hay valor, pero la última lectura es vieja      |
 * | `sin_fuente`       | `null`              | La integración que lo mide no está conectada    |
 * | `falta_configurar` | `null`              | La fuente está, pero falta un dato del lanzamiento para medirlo |
 * | `error`            | `null`              | La última lectura de la fuente falló            |
 *
 * `reason` es el texto para el usuario (voseo, es-AR) que explica el estado y
 * qué hacer; en `medido` es `null`. `measuredAt` es cuándo se leyó el valor
 * (ISO 8601), `null` si nunca se leyó.
 *
 * El tipo es una unión discriminada por `state`: TypeScript no deja leer
 * `value` como número sin antes mirar el estado, y no deja armar un `sin_fuente`
 * con valor. Las pantallas usan `tieneValor()` o un `switch (dato.state)`.
 */

/** Los cinco estados de un número. */
export const ESTADOS_DEL_DATO = [
  "medido",
  "sin_fuente",
  "falta_configurar",
  "desactualizado",
  "error",
] as const;

export type EstadoDelDato = (typeof ESTADOS_DEL_DATO)[number];

/** Cómo se llama cada estado en la interfaz. */
export const ETIQUETA_DEL_ESTADO: Record<EstadoDelDato, string> = {
  medido: "Medido",
  sin_fuente: "Sin fuente",
  falta_configurar: "Falta configurar",
  desactualizado: "Desactualizado",
  error: "Error",
};

/**
 * De dónde sale un dato. Las fuentes de eventos son las de
 * `lead_events.source` del modelo propuesto (SCRUM-526); se suman `meta_ads`
 * (inversión en anuncios), `configuracion` (lo que carga el dueño en el
 * lanzamiento) y `calculado` (un número que sale de otros, como una tasa).
 */
export const FUENTES_DEL_DATO = [
  "landing",
  "zoom",
  "ghl",
  "calendly",
  "whop",
  "fanbasis",
  "commas",
  "manual",
  "meta_ads",
  "configuracion",
  "calculado",
] as const;

export type FuenteDelDato = (typeof FUENTES_DEL_DATO)[number];

/** Cómo se llama cada fuente en la interfaz. `manual` es lo que carga el equipo. */
export const ETIQUETA_DE_FUENTE: Record<FuenteDelDato, string> = {
  landing: "Landing",
  zoom: "Zoom",
  ghl: "GoHighLevel",
  calendly: "Calendly",
  whop: "Whop",
  fanbasis: "Fanbasis",
  commas: "Commas",
  manual: "Equipo",
  meta_ads: "Meta Ads",
  configuracion: "Configuración del lanzamiento",
  calculado: "Calculado",
};

type ConValor<T, S extends EstadoDelDato> = {
  state: S;
  value: T;
  source: FuenteDelDato;
  measuredAt: string;
};

type SinValor<S extends EstadoDelDato> = {
  state: S;
  value: null;
  source: FuenteDelDato;
  reason: string;
  measuredAt: string | null;
};

export type DatoMedido<T> = ConValor<T, "medido"> & { reason: null };
export type DatoDesactualizado<T> = ConValor<T, "desactualizado"> & { reason: string };
export type DatoSinFuente = SinValor<"sin_fuente">;
export type DatoFaltaConfigurar = SinValor<"falta_configurar">;
export type DatoConError = SinValor<"error">;

/** Un número (o una lista) de una pantalla, con su estado, fuente y motivo. */
export type Dato<T> =
  | DatoMedido<T>
  | DatoDesactualizado<T>
  | DatoSinFuente
  | DatoFaltaConfigurar
  | DatoConError;

export function medido<T>(value: T, source: FuenteDelDato, measuredAt: string): DatoMedido<T> {
  return { state: "medido", value, source, reason: null, measuredAt };
}

export function desactualizado<T>(
  value: T,
  source: FuenteDelDato,
  measuredAt: string,
  reason: string
): DatoDesactualizado<T> {
  return { state: "desactualizado", value, source, reason, measuredAt };
}

export function sinFuente(source: FuenteDelDato, reason: string): DatoSinFuente {
  return { state: "sin_fuente", value: null, source, reason, measuredAt: null };
}

export function faltaConfigurar(
  source: FuenteDelDato,
  reason: string,
  measuredAt: string | null = null
): DatoFaltaConfigurar {
  return { state: "falta_configurar", value: null, source, reason, measuredAt };
}

export function conError(
  source: FuenteDelDato,
  reason: string,
  measuredAt: string | null = null
): DatoConError {
  return { state: "error", value: null, source, reason, measuredAt };
}

/** ¿El dato trae un valor para mostrar? (`medido` o `desactualizado`). */
export function tieneValor<T>(dato: Dato<T>): dato is DatoMedido<T> | DatoDesactualizado<T> {
  return dato.state === "medido" || dato.state === "desactualizado";
}

/**
 * Cuál de los estados sin valor manda cuando un número sale de varios: un
 * error tapa a todo (no se puede afirmar nada), después lo que el usuario
 * tiene que configurar y después la integración que falta. `desactualizado`
 * y `medido` no tapan a nadie.
 */
const PRIORIDAD: Record<EstadoDelDato, number> = {
  error: 4,
  falta_configurar: 3,
  sin_fuente: 2,
  desactualizado: 1,
  medido: 0,
};

/**
 * Un número que sale de otros (una suma de sesiones, una tasa, un costo por
 * registro). Reglas:
 *   - si alguno no tiene valor, el resultado tampoco: toma el estado, la fuente
 *     y el motivo del peor (`PRIORIDAD`);
 *   - si todos tienen valor y alguno está desactualizado, el resultado se
 *     calcula y queda desactualizado, con el motivo y la fecha del más viejo;
 *   - si todos están medidos, queda medido con la fecha más vieja.
 * La fuente es la de las entradas si todas comparten una, y `calculado` si no.
 * `calcular` puede devolver `null` (por ejemplo, una tasa con cero en el
 * denominador): es un valor medido que la pantalla muestra como "—".
 */
export function derivar<V extends readonly Dato<unknown>[], R>(
  entradas: V,
  calcular: (valores: { [K in keyof V]: V[K] extends Dato<infer T> ? T : never }) => R
): Dato<R> {
  if (entradas.length === 0) {
    throw new Error("derivar necesita al menos un dato");
  }
  const peor = entradas.reduce((a, b) => (PRIORIDAD[b.state] > PRIORIDAD[a.state] ? b : a));
  const fuentes = new Set(entradas.map((d) => d.source));
  const source: FuenteDelDato = fuentes.size === 1 ? entradas[0].source : "calculado";

  if (!tieneValor(peor)) {
    return { ...peor, source: peor.source };
  }

  const valores = entradas.map((d) => d.value) as {
    [K in keyof V]: V[K] extends Dato<infer T> ? T : never;
  };
  const value = calcular(valores);
  // Todas tienen valor, así que todas tienen fecha.
  const masViejo = <D extends Dato<unknown>>(a: D, b: D): D =>
    (b.measuredAt as string) < (a.measuredAt as string) ? b : a;
  const measuredAt = entradas.reduce(masViejo).measuredAt as string;

  const viejas = entradas.filter(
    (d): d is DatoDesactualizado<unknown> => d.state === "desactualizado"
  );
  if (viejas.length > 0) {
    const laMasVieja = viejas.reduce(masViejo);
    return desactualizado(value, source, measuredAt, laMasVieja.reason);
  }
  return medido(value, source, measuredAt);
}

/** Suma de varios números (por ejemplo, la asistencia de cada sesión). */
export function sumar(datos: readonly Dato<number>[]): Dato<number> {
  return derivar(datos, (valores) => valores.reduce((a, b) => a + b, 0));
}

/** `parte / total` entre 0 y 1; `null` si el total es cero. */
export function tasa(parte: Dato<number>, total: Dato<number>): Dato<number | null> {
  const resultado = derivar([parte, total] as const, ([p, t]) => (t === 0 ? null : p / t));
  return resultado.state === "medido" || resultado.state === "desactualizado"
    ? { ...resultado, source: "calculado" }
    : resultado;
}

/** `monto / cantidad` (costo por registro, por venta); `null` si la cantidad es cero. */
export function cociente(monto: Dato<number>, cantidad: Dato<number>): Dato<number | null> {
  return tasa(monto, cantidad);
}
