"use client";

import { createContext, useContext } from "react";
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

type PermisosDeModulo = Pick<UserPermissions, "isFounder" | "hasRoleConfigured" | "modules">;

let ultimosPermisos: { clave: string; valor: PermisosDeModulo } | null = null;

/**
 * El mismo objeto mientras no cambien el rol ni los módulos (SCRUM-540).
 *
 * El layout de la plataforma vuelve a mandar los permisos en cada
 * `router.refresh()`, como un objeto nuevo con los mismos valores. Un provider
 * del marco que dependiera de ese objeto volvería a pedir todos sus datos en
 * cada refresco. Se compara por contenido y se devuelve el último objeto si no
 * cambió (en el servidor, el caché es compartido entre pedidos, pero sólo
 * devuelve un objeto con los mismos valores).
 */
export function permisosEstables(permisos: PermisosDeModulo): PermisosDeModulo {
  const { isFounder, hasRoleConfigured, modules } = permisos;
  const clave = JSON.stringify({ isFounder, hasRoleConfigured, modules });
  if (ultimosPermisos?.clave === clave) return ultimosPermisos.valor;
  ultimosPermisos = { clave, valor: { isFounder, hasRoleConfigured, modules } };
  return ultimosPermisos.valor;
}

/** Los permisos de módulo con identidad estable, para los lectores del marco (`permisosEstables`). */
export function usePermisosDeModulo(): PermisosDeModulo {
  return permisosEstables(useContext(PermissionsCtx));
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
