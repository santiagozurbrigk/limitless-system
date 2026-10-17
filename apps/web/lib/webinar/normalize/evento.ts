import { z } from "zod";
import { esEmailValido } from "@/lib/webinar/identity";

/**
 * El contrato de lo que manda la landing a `POST /api/ingest/landing`
 * (SCRUM-528, sección 5.1 de los requerimientos técnicos).
 *
 * ```json
 * { "type": "registration" | "visit", "launch_public_id", "client_registration_id",
 *   "name", "email", "phone",
 *   "tracking": { "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "sl" },
 *   "ab_variant", "qualification", "visitor_id", "occurred_at" }
 * ```
 *
 * Campos requeridos según el tipo:
 *   - `registration`: `launch_public_id`, `client_registration_id` y `email`.
 *   - `visit`: `launch_public_id` y `visitor_id`.
 * El resto es opcional y puede venir en `null`. Las claves que no están en el
 * contrato se ignoran para normalizar, pero el crudo las guarda (por eso pasan
 * por el mismo control de texto que el resto). `occurred_at`, si viene, es
 * una fecha ISO 8601 con zona. Se usa sólo si cae dentro de la ventana de
 * `VENTANA_HACIA_ATRAS_MS` y `VENTANA_HACIA_ADELANTE_MS` alrededor de la hora
 * en que llegó; fuera de ella (un reloj de navegador adelantado, un año 0 o
 * 10000 que no entra en un `timestamptz`, un 1900 que movería las métricas)
 * se ignora y vale la hora en que llegó, igual que si no viniera (AR pasada
 * 2: rechazarlo perdía el registro). El crudo guarda el valor original.
 *
 * Qué se rechaza antes de guardar nada (el endpoint responde 400), para que lo
 * que pasa se pueda guardar siempre como jsonb y normalizar (AR pasada 1):
 *   - cualquier texto, valor o clave, con NUL (`\u0000`, jsonb no lo acepta) o
 *     con un surrogate suelto (no es UTF-16 bien formado; Postgres lo rechaza);
 *   - estructuras de más de `PROFUNDIDAD_MAXIMA` niveles (`JSON.stringify` de
 *     supabase-js revienta con miles);
 *   - textos más largos que lo que acepta su columna;
 *   - lo que no cumple el contrato (un `occurred_at` que no es una fecha ISO
 *     con zona, por ejemplo). Un `occurred_at` bien escrito pero fuera de la
 *     ventana NO se rechaza: se ignora (ver arriba).
 */

/** Cuerpo máximo que acepta el endpoint: 16 KB. */
export const LIMITE_DEL_CUERPO_BYTES = 16 * 1024;

/** Niveles de objetos y arrays que se aceptan (el contrato usa 2). */
export const PROFUNDIDAD_MAXIMA = 10;

/** `occurred_at` puede ser hasta 30 días anterior a la llegada... */
export const VENTANA_HACIA_ATRAS_MS = 30 * 24 * 60 * 60 * 1000;
/** ...y hasta 5 minutos posterior (relojes desfasados de la landing). */
export const VENTANA_HACIA_ADELANTE_MS = 5 * 60 * 1000;

/** Un surrogate alto sin bajo detrás, o uno bajo sin alto delante. */
const SURROGATE_SUELTO = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/**
 * Si el texto se puede guardar en Postgres: sin NUL y UTF-16 bien formado
 * (lo mismo que `String.prototype.isWellFormed`, que el `lib` ES2022 del
 * proyecto no tipa).
 */
export function esTextoGuardable(texto: string): boolean {
  return !texto.includes("\u0000") && !SURROGATE_SUELTO.test(texto);
}

/**
 * Recorre el JSON ya parseado con profundidad acotada: todo texto (valor o
 * clave, también las de más) tiene que ser guardable y nada puede pasar de
 * `PROFUNDIDAD_MAXIMA` niveles. Corta en el primer problema.
 */
export function esJsonGuardable(valor: unknown, nivel: number = 0): boolean {
  if (typeof valor === "string") return esTextoGuardable(valor);
  if (valor === null || typeof valor !== "object") return true;
  if (nivel >= PROFUNDIDAD_MAXIMA) return false;
  if (Array.isArray(valor)) return valor.every((item) => esJsonGuardable(item, nivel + 1));
  return Object.entries(valor).every(
    ([clave, item]) => esTextoGuardable(clave) && esJsonGuardable(item, nivel + 1),
  );
}

/** Si `occurred_at` cae dentro de la ventana alrededor de `referencia`. */
export function estaEnLaVentana(occurredAt: string, referencia: Date): boolean {
  const momento = Date.parse(occurredAt);
  if (Number.isNaN(momento)) return false;
  const base = referencia.getTime();
  return (
    momento >= base - VENTANA_HACIA_ATRAS_MS &&
    momento <= base + VENTANA_HACIA_ADELANTE_MS
  );
}

/** Texto obligatorio: sin espacios a los costados, de 1 a `maximo` caracteres. */
const obligatorio = (maximo: number) => z.string().trim().min(1).max(maximo);

/** Texto opcional: vacío o sólo espacios vale lo mismo que no mandarlo. */
const opcional = (maximo: number) =>
  z
    .string()
    .trim()
    .max(maximo)
    .nullish()
    .transform((valor) => (valor ? valor : null));

const tracking = z
  .object({
    utm_source: opcional(500),
    utm_medium: opcional(500),
    utm_campaign: opcional(500),
    utm_content: opcional(500),
    utm_term: opcional(500),
    fbclid: opcional(1000),
    sl: opcional(500),
  })
  .nullish()
  .transform((valor) => valor ?? null);

const comunes = {
  launch_public_id: obligatorio(100),
  occurred_at: z.iso
    .datetime({ offset: true })
    .nullish()
    .transform((valor) => valor ?? null),
};

const registro = z.object({
  type: z.literal("registration"),
  ...comunes,
  client_registration_id: obligatorio(200),
  email: z.string().trim().max(320).refine(esEmailValido),
  name: opcional(200),
  phone: opcional(40),
  tracking,
  ab_variant: opcional(200),
  qualification: opcional(500),
});

const visita = z.object({
  type: z.literal("visit"),
  ...comunes,
  visitor_id: obligatorio(200),
});

export const esquemaDelEventoDeLanding = z.discriminatedUnion("type", [registro, visita]);

export type EventoDeLanding = z.output<typeof esquemaDelEventoDeLanding>;
export type RegistroDeLanding = Extract<EventoDeLanding, { type: "registration" }>;
export type VisitaDeLanding = Extract<EventoDeLanding, { type: "visit" }>;

export type OpcionesDeValidacion = {
  /**
   * Contra qué hora se mide la ventana de `occurred_at`: la de llegada. La
   * normalización pasa `received_at`, así la decisión es la misma en el
   * intento del endpoint y en cualquier reproceso.
   */
  referencia: Date;
};

/**
 * El evento validado, o `null` si no se puede guardar o no cumple el
 * contrato. Un `occurred_at` fuera de la ventana vuelve en `null` (se usa la
 * hora de llegada). No devuelve el motivo a propósito: los mensajes de Zod
 * repiten valores del payload (datos personales), y la respuesta del
 * endpoint es un motivo genérico.
 */
export function validarEventoDeLanding(
  json: unknown,
  opciones: OpcionesDeValidacion,
): EventoDeLanding | null {
  if (!esJsonGuardable(json)) return null;
  const resultado = esquemaDelEventoDeLanding.safeParse(json);
  if (!resultado.success) return null;
  const { occurred_at } = resultado.data;
  if (occurred_at !== null && !estaEnLaVentana(occurred_at, opciones.referencia)) {
    return { ...resultado.data, occurred_at: null };
  }
  return resultado.data;
}
