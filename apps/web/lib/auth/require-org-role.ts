import { createClient } from "@/lib/supabase/server";
import { ErrorEsperable } from "@/lib/server/error-esperable";
import { FallaDeLaBase } from "@/lib/server/action-result";

/**
 * Roles que pueden hacer cada cosa sensible en la organización activa.
 *
 * Son los mismos que exigen las policies de
 * `20260929100000_roles_equipo_y_config_en_la_base.sql`: equipo y
 * configuración de la org, sólo founder (como `canManageTeam` en
 * app/team/actions.ts); borrar clientes, founder o admin.
 */
export const ROLES_CONFIG_ORG = ["founder"] as const;
export const ROLES_BORRAR_CLIENTES = ["founder", "admin"] as const;

export const SIN_PERMISO_CONFIG_ORG = "Sólo el founder puede cambiar la configuración de la organización.";
export const SIN_PERMISO_BORRAR_CLIENTES = "Sólo el founder o un admin pueden eliminar clientes.";

/**
 * ⭐ Traduce la respuesta de `current_user_has_org_role` a "pasa" o "no pasa".
 *
 * Un error de la consulta cuenta como "no pasa": ante la duda, no se deja
 * cambiar nada. Separada del IO para poder testearla.
 */
export function evaluarPermiso(respuesta: {
  data: unknown;
  error: { message: string } | null;
}): "permitido" | "sin_permiso" | "error" {
  if (respuesta.error) return "error";
  return respuesta.data === true ? "permitido" : "sin_permiso";
}

/**
 * Corta la action si quien la llama no tiene alguno de `roles` en la
 * organización activa (incluye al founder de un holding operando uno de sus
 * negocios, y deja afuera a un perfil desactivado).
 *
 * Hace falta además de la RLS porque:
 *   - lo que se escribe con el service role (clave de Claude, desconectar
 *     integraciones) no pasa por la RLS;
 *   - lo que sí pasa, cuando la RLS lo rechaza, afecta 0 filas sin error, y la
 *     action diría "guardado" sin haber guardado nada.
 */
export async function requireOrgRole(
  roles: readonly string[],
  mensajeSinPermiso: string
): Promise<void> {
  const supabase = await createClient();
  const respuesta = await supabase.rpc("current_user_has_org_role", {
    roles: [...roles],
  });

  const resultado = evaluarPermiso(respuesta);
  if (resultado === "error") {
    // Mismo texto que antes para los módulos que lo muestran, pero como falla
    // de la base: se registra y va a Sentry.
    console.error("[requireOrgRole] current_user_has_org_role:", respuesta.error?.message);
    throw new FallaDeLaBase({
      message: "No se pudo verificar el permiso.",
      code: respuesta.error?.code,
    });
  }
  // Sin el rol es un rechazo esperable; no poder verificarlo es una falla
  // (SCRUM-497): se registra y el usuario ve el texto fijo.
  if (resultado === "sin_permiso") {
    throw new ErrorEsperable(mensajeSinPermiso);
  }
}
