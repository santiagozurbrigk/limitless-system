/**
 * Identidad del lead de Limitless Webinars (SCRUM-528).
 *
 * La persona es la unidad de dato (P8): un lead por organización y email
 * normalizado (`leads_org_email_normalized_key`). Este módulo decide cuándo
 * dos registros son la misma persona y cómo se guarda su teléfono. Es puro:
 * no lee la base ni el reloj.
 *
 * El email y el teléfono son datos personales: nada de acá los manda a un log
 * ni a Sentry, y quien llama tampoco tiene que hacerlo.
 */

/** Largos que acepta la base (checks de `leads`). */
export const LARGO_MINIMO_DEL_EMAIL = 3;
export const LARGO_MAXIMO_DEL_EMAIL = 320;

/** Una arroba, algo antes, y un dominio con al menos un punto. */
const FORMA_DE_EMAIL = /^[^@]+@[^@]+\.[^@]+$/;

/**
 * Email normalizado: en minúsculas y sin ningún espacio (ni al principio, ni
 * al final, ni en el medio, donde lo deja un autocompletado o un copiar y
 * pegar). Es lo que va a `leads.email_normalized` y la llave del lead.
 */
export function normalizarEmail(email: string): string {
  return email.replace(/\s+/g, "").toLowerCase();
}

/** Si el email, ya normalizado, tiene forma de email y el largo que acepta la base. */
export function esEmailValido(email: string): boolean {
  const normalizado = normalizarEmail(email);
  return (
    normalizado.length >= LARGO_MINIMO_DEL_EMAIL &&
    normalizado.length <= LARGO_MAXIMO_DEL_EMAIL &&
    FORMA_DE_EMAIL.test(normalizado)
  );
}

/** E.164: `+`, un primer dígito de 1 a 9 y en total de 7 a 15 dígitos (check de `leads.phone_e164`). */
const FORMA_E164 = /^\+[1-9][0-9]{6,14}$/;

/** Separadores habituales de un teléfono escrito a mano. */
const SEPARADORES = /[\s().\-/]/g;

/**
 * El teléfono en E.164 si se puede saber sin adivinar; si no, `null`.
 *
 * Sólo se convierte un número que ya trae el código de país, con `+` o con el
 * prefijo internacional `00`. Uno sin código de país (`11 5555 1234`) queda
 * en `null`: completarlo con un país sería inventar un dato, y la landing
 * puede recibir gente de cualquier país. No hay una dependencia para esto a
 * propósito (la regla de SCRUM-528 es no sumar dependencias).
 */
export function telefonoE164(telefono: string | null | undefined): string | null {
  if (typeof telefono !== "string") return null;
  let limpio = telefono.trim().replace(SEPARADORES, "");
  if (limpio.startsWith("00")) limpio = `+${limpio.slice(2)}`;
  return FORMA_E164.test(limpio) ? limpio : null;
}
