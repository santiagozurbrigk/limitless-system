/**
 * [EQUIPO-DESACTIVAR-NO-BLOQUEA] (SCRUM-8): un perfil con `is_active = false`
 * no entra a la plataforma.
 *
 * Tres capas, porque cada una cubre lo que la otra no:
 *   - la base (`20260929110000`): `get_my_organization_id()` devuelve null para
 *     un perfil desactivado y las policies que no pasan por ella exigen
 *     `is_active`; con su JWT sólo lee su propia fila de profiles;
 *   - la app: el middleware cierra la sesión y `requireOrganizationId()` corta
 *     las actions, que resuelven la org con el service role;
 *   - Auth: desactivar banea el usuario (no puede volver a iniciar sesión ni
 *     renovar el token) y reactivar lo desbanea.
 */

export const CUENTA_DESACTIVADA_QUERY = "cuenta_desactivada";

export const CUENTA_DESACTIVADA_MESSAGE =
  "Tu cuenta está desactivada. Si crees que es un error, habla con el founder de tu organización.";

/** Ban "permanente" de Supabase Auth (el mismo que usa el panel de super admin). */
export const BAN_CUENTA_DESACTIVADA = "876000h";

/**
 * ⭐ Sólo `false` explícito es "desactivado". Un perfil que todavía no existe
 * (bootstrap) o una lectura que no trajo la columna no cortan el acceso.
 */
export function estaDesactivado(isActive: boolean | null | undefined): boolean {
  return isActive === false;
}

/**
 * Marca en `app_metadata` del usuario de Auth que dice que el ban lo puso la
 * baja del miembro. Reactivar sólo desbanea si la marca está: un ban del
 * super admin (por otro motivo) no se levanta desde Equipo.
 */
export const MOTIVO_BAN_DESACTIVADO = "desactivado_por_founder";

/**
 * ⭐ Qué hace el middleware con la sesión de un perfil. Separada del IO para
 * poder testearla, como `shouldRedirectToGate`.
 *   - "seguir": el perfil está activo (o todavía no existe).
 *   - "cerrar": desactivado en una server action; se cierra la sesión sin
 *     redirect (un redirect devuelve HTML y rompe al cliente) y la action
 *     corta sola en `requireOrganizationId()`.
 *   - "cerrar_y_redirigir": desactivado navegando; al login con el aviso.
 */
export function accionSesion(
  isActive: boolean | null | undefined,
  esServerAction: boolean
): "seguir" | "cerrar" | "cerrar_y_redirigir" {
  if (!estaDesactivado(isActive)) return "seguir";
  return esServerAction ? "cerrar" : "cerrar_y_redirigir";
}

/** `ban_duration` para Supabase Auth según el estado nuevo del perfil. */
export function banParaEstado(activo: boolean): string {
  return activo ? "none" : BAN_CUENTA_DESACTIVADA;
}
