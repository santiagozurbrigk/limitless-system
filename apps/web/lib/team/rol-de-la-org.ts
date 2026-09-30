import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * [EQUIPO-CUSTOM-ROLE-ORG] (SCRUM-75): un rol custom sólo se puede asignar a
 * miembros de la misma organización.
 *
 * `profiles.custom_role_id` referencia `team_roles(id)` sin mirar la org, y la
 * app escribía el id tal cual llegaba (invitar, cambiar rol, aceptar una
 * invitación). Con el id de un rol de otra org, el miembro quedaba con un rol
 * que no puede leer por RLS: `hasRoleConfigured` en false y sin bloqueo por
 * módulo.
 */

export const ROL_DE_OTRA_ORG = "El rol elegido no es de esta organización.";

/**
 * Lanza si `roleId` no es un rol de `organizationId`. Sin rol (`null` o
 * vacío) no hay nada que validar. Recibe el cliente para poder usarse con el
 * de usuario o el de service role, y para testearse sin base.
 */
export async function assertRolDeLaOrg(
  client: Pick<SupabaseClient, "from">,
  roleId: string | null | undefined,
  organizationId: string
): Promise<void> {
  if (!roleId) return;
  const { data, error } = await client
    .from("team_roles")
    .select("id")
    .eq("id", roleId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(ROL_DE_OTRA_ORG);
}
