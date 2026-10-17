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
 * contrato se ignoran (el crudo las guarda igual). `occurred_at`, si viene,
 * es una fecha ISO 8601 con zona; si no viene, vale la hora en que llegó.
 *
 * Los largos máximos son los de la base: un valor que la base rechazaría se
 * rechaza acá con 400, en vez de guardarse y fallar siempre al normalizarlo.
 */

/** Cuerpo máximo que acepta el endpoint: 16 KB. */
export const LIMITE_DEL_CUERPO_BYTES = 16 * 1024;

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

/**
 * El evento validado, o `null` si no cumple el contrato. No devuelve el
 * motivo a propósito: los mensajes de Zod repiten valores del payload (datos
 * personales), y la respuesta del endpoint es un motivo genérico.
 */
export function validarEventoDeLanding(json: unknown): EventoDeLanding | null {
  const resultado = esquemaDelEventoDeLanding.safeParse(json);
  return resultado.success ? resultado.data : null;
}
