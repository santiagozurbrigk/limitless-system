import crypto from "crypto";

/**
 * [OAUTH-ESTADO-SIN-FIRMA] (SCRUM-10): reglas comunes de los callbacks OAuth.
 *
 * Cada `<proveedor>/oauth/start` o `<proveedor>/connect` guarda en una cookie `{ organizationId,
 * state }` y el callback comparaba sólo el `state`. La cookie no está firmada:
 * quien la armara a mano con el `organizationId` de otra org (los UUID de org
 * circulan en URLs de webhooks y en el snippet UTM) conectaba su propia cuenta
 * del proveedor en esa organización, sin sesión.
 *
 * La regla ahora:
 *   - el `state` de la cookie tiene que coincidir con el de la URL (en tiempo
 *     constante): ata la vuelta del proveedor al inicio en este navegador;
 *   - la organización (o el usuario) donde se escribe sale de la **sesión**,
 *     nunca de la cookie. El `organizationId` de la cookie se ignora.
 * Ver `lib/integrations/oauth-sesion.ts` para la parte que lee la sesión.
 */

/** `state` de la cookie contra el de la URL. Falta cualquiera de los dos → false. */
export function stateCoincide(
  esperado: unknown,
  recibido: string | null | undefined
): boolean {
  if (typeof esperado !== "string" || !esperado || !recibido) return false;
  const a = Buffer.from(esperado, "utf8");
  const b = Buffer.from(recibido, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * ⭐ El usuario que vuelve del proveedor tiene que ser el mismo que empezó la
 * conexión (Calendly de un closer, Drive del super admin): la cuenta se guarda
 * a nombre de ese usuario.
 */
export function mismoUsuario(
  esperado: unknown,
  deLaSesion: string | null | undefined
): boolean {
  return typeof esperado === "string" && Boolean(esperado) && esperado === deLaSesion;
}
