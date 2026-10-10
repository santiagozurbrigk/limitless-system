import { createClient } from "@/lib/supabase/server";
import { permissionsFromRow } from "@/lib/team/mapper";
import { emptyPermissions } from "@/constants/permission-modules";
import type { PermissionModuleId } from "@/constants/permission-modules";
import type { PermissionLevel } from "@/types/team";
import { ADD_ON_IDS, type AddOnId } from "@/lib/auth/add-on-ids";
import { FallaDeLaBase } from "@/lib/server/action-result";
export { ADD_ON_IDS } from "@/lib/auth/add-on-ids";
export type { AddOnId } from "@/lib/auth/add-on-ids";

export type UserPermissions = {
  role: string;
  isFounder: boolean;
  modules: Record<PermissionModuleId, PermissionLevel>;
  /**
   * ⭐ Si esta persona tiene un rol con permisos cargados.
   *
   * Importa porque el bloqueo por módulo del layout **sólo aplica cuando hay
   * un rol configurado**. Un miembro invitado sin rol asignado tiene el mapa
   * entero en "none", y tratarlo como "no tiene acceso a nada" lo dejaría sin
   * poder abrir una sola pantalla. Sin rol, el bloqueo no corre: se comporta
   * como antes de existir esta protección.
   */
  hasRoleConfigured: boolean;
  /** Módulos add-on activados para esta org */
  enabledAddOns: AddOnId[];
};

/**
 * Una lectura de permisos que falló (la red, un timeout, una RLS que rechaza)
 * no se puede tomar como "no hay fila": un perfil o un rol que no se leyó
 * daría `hasRoleConfigured: false`, y sin rol el bloqueo por módulo no corre,
 * así que un miembro con rol limitado entraría a todo (SCRUM-108, riesgo R1).
 * Se lanza: el layout cae en su pantalla de error, `rechazoPorModulo` rechaza
 * y nada abre el acceso.
 */
function fallaSiHayError(error: { message: string; code?: string | null } | null): void {
  if (error) throw new FallaDeLaBase(error);
}

/**
 * `auth.getUser()` devuelve `error` también cuando simplemente no hay sesión
 * (400) o el token venció (401/403): eso es "sin usuario", como siempre. Lo
 * que lanza es la caída de Auth: sin respuesta (status 0) o un 5xx.
 */
function esCaidaDeAuth(error: { status?: number } | null): boolean {
  if (!error) return false;
  const status = error.status ?? 0;
  return status === 0 || status >= 500;
}

export async function getCurrentUserPermissions(): Promise<UserPermissions> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError && esCaidaDeAuth(authError)) {
    throw new FallaDeLaBase({ message: authError.message, code: authError.code ?? null });
  }

  if (!user) {
    return {
      role: "viewer",
      isFounder: false,
      modules: emptyPermissions(),
      enabledAddOns: [],
      hasRoleConfigured: false,
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, custom_role_id, organization_id")
    .eq("id", user.id)
    .maybeSingle();
  fallaSiHayError(profileError);

  if (!profile) {
    return {
      role: "viewer",
      isFounder: false,
      modules: emptyPermissions(),
      enabledAddOns: [],
      hasRoleConfigured: false,
    };
  }

  // Leer add-ons habilitados para la org
  let enabledAddOns: AddOnId[] = [];
  if (profile.organization_id) {
    const { data: orgRow, error: orgError } = await supabase
      .from("organizations")
      .select("enabled_add_ons")
      .eq("id", profile.organization_id as string)
      .maybeSingle();
    fallaSiHayError(orgError);
    const raw = (orgRow?.enabled_add_ons as string[] | null) ?? [];
    enabledAddOns = raw.filter((id): id is AddOnId =>
      ADD_ON_IDS.includes(id as AddOnId)
    );
  }

  const isFounder = profile.role === "founder";

  if (isFounder) {
    const full = emptyPermissions();
    for (const key of Object.keys(full) as PermissionModuleId[]) {
      full[key] = "full";
    }
    return {
      role: "founder",
      isFounder: true,
      modules: full,
      enabledAddOns,
      hasRoleConfigured: true,
    };
  }

  let teamRolePermissions: Record<string, string> | null = null;
  if (profile.custom_role_id) {
    const { data: roleRow, error: roleError } = await supabase
      .from("team_roles")
      .select("permissions")
      .eq("id", profile.custom_role_id)
      .maybeSingle();
    fallaSiHayError(roleError);
    teamRolePermissions =
      (roleRow?.permissions as Record<string, string> | null) ?? null;
  }

  const modules = permissionsFromRow(teamRolePermissions);

  return {
    role: profile.role,
    isFounder: false,
    modules,
    enabledAddOns,
    hasRoleConfigured:
      teamRolePermissions !== null &&
      Object.keys(teamRolePermissions).length > 0,
  };
}
