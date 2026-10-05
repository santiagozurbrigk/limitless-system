import { createClient } from "@/lib/supabase/server";
import { permissionsFromRow } from "@/lib/team/mapper";
import { emptyPermissions } from "@/constants/permission-modules";
import type { PermissionModuleId } from "@/constants/permission-modules";
import type { PermissionLevel } from "@/types/team";
import { ADD_ON_IDS, type AddOnId } from "@/lib/auth/add-on-ids";
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

export async function getCurrentUserPermissions(): Promise<UserPermissions> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      role: "viewer",
      isFounder: false,
      modules: emptyPermissions(),
      enabledAddOns: [],
      hasRoleConfigured: false,
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, custom_role_id, organization_id")
    .eq("id", user.id)
    .maybeSingle();

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
    const { data: orgRow } = await supabase
      .from("organizations")
      .select("enabled_add_ons")
      .eq("id", profile.organization_id as string)
      .maybeSingle();
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
    const { data: roleRow } = await supabase
      .from("team_roles")
      .select("permissions")
      .eq("id", profile.custom_role_id)
      .maybeSingle();
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
