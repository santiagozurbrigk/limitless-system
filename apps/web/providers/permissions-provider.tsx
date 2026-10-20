"use client";

import { createContext, useContext, useMemo } from "react";
import type { UserPermissions, AddOnId } from "@/lib/auth/get-current-permissions";
import { emptyPermissions } from "@/constants/permission-modules";
import type { PermissionModuleId } from "@/constants/permission-modules";
import type { PermissionLevel } from "@/types/team";

const defaultPermissions: UserPermissions = {
  role: "viewer",
  isFounder: false,
  modules: emptyPermissions(),
  enabledAddOns: [],
  hasRoleConfigured: false,
};

const PermissionsCtx = createContext<UserPermissions>(defaultPermissions);

export function PermissionsProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: UserPermissions;
}) {
  return <PermissionsCtx.Provider value={value}>{children}</PermissionsCtx.Provider>;
}

export function usePermissions() {
  return useContext(PermissionsCtx);
}

/**
 * Los permisos de módulo con una identidad estable (SCRUM-540): el mismo objeto
 * mientras no cambien el rol ni los módulos.
 *
 * El layout de la plataforma vuelve a mandar los permisos en cada
 * `router.refresh()`, como un objeto nuevo con los mismos valores. Un provider
 * del marco que dependiera de `usePermissions()` volvería a pedir todos sus
 * datos en cada refresco; con este hook sólo si de verdad cambió algo.
 */
export function usePermisosDeModulo(): Pick<
  UserPermissions,
  "isFounder" | "hasRoleConfigured" | "modules"
> {
  const { isFounder, hasRoleConfigured, modules } = useContext(PermissionsCtx);
  const clave = JSON.stringify({ isFounder, hasRoleConfigured, modules });
  return useMemo(
    () => JSON.parse(clave) as Pick<UserPermissions, "isFounder" | "hasRoleConfigured" | "modules">,
    [clave]
  );
}

export function useModuleAccess(moduleId: PermissionModuleId): PermissionLevel {
  const { modules, isFounder } = useContext(PermissionsCtx);
  if (isFounder) return "full";
  return modules[moduleId] ?? "none";
}

export function useCanAccess(moduleId: PermissionModuleId): boolean {
  const level = useModuleAccess(moduleId);
  return level !== "none";
}

export function canSeeNavItem(
  permissionId: PermissionModuleId | undefined,
  canAccess: (moduleId: PermissionModuleId) => boolean,
  isFounder: boolean
): boolean {
  if (!permissionId) return isFounder;
  return canAccess(permissionId);
}

/** Retorna los add-ons habilitados para la org activa */
export function useEnabledAddOns(): AddOnId[] {
  return useContext(PermissionsCtx).enabledAddOns;
}

/** Retorna true si el add-on especificado está habilitado para la org */
export function useHasAddOn(addOnId: AddOnId): boolean {
  return useContext(PermissionsCtx).enabledAddOns.includes(addOnId);
}
