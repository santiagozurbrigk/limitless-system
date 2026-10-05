import {
  getCurrentUserPermissions,
  type UserPermissions,
} from "@/lib/auth/get-current-permissions";
import {
  getPermissionModuleLabel,
  type PermissionModuleId,
} from "@/constants/permission-modules";
import { permissionModuleForPath } from "@/lib/navigation/module-for-path";

type PermisosDeModulo = Pick<
  UserPermissions,
  "isFounder" | "hasRoleConfigured" | "modules"
>;

/**
 * ⭐ La regla de acceso a un módulo, en un solo lugar (SCRUM-18).
 *
 * La usan el layout de la plataforma, que decide si una pantalla se muestra, y
 * las lecturas que se exponen como Server Action, que se pueden llamar a mano
 * sin pasar por ninguna pantalla. Si cada uno tuviera su copia, alcanzaría con
 * que una se desactualice para que la pantalla diga "no" y la action diga "sí".
 *
 *   - El founder pasa siempre: `getCurrentUserPermissions` le da todo en `full`.
 *   - Sin rol cargado no hay nada que hacer cumplir (ver `hasRoleConfigured`):
 *     un invitado sin rol tiene el mapa entero en `none` y bloquearlo lo dejaría
 *     sin ninguna pantalla.
 *   - Con rol, entra si el módulo no está en `none`.
 */
export function puedeEntrarAlModulo(
  permisos: PermisosDeModulo,
  moduleId: PermissionModuleId
): boolean {
  if (permisos.isFounder) return true;
  if (!permisos.hasRoleConfigured) return true;
  return (permisos.modules[moduleId] ?? "none") !== "none";
}

/**
 * El módulo que le falta a esta persona para ver `pathname`, o `null` si puede
 * verla. Las rutas sin módulo (onboarding, holding) y las que no se reconocen
 * devuelven `null`, igual que un `pathname` vacío: sin `x-pathname` no hay
 * ruta que mapear.
 */
export function moduloBloqueadoParaRuta(
  pathname: string,
  permisos: PermisosDeModulo
): PermissionModuleId | null {
  const moduleId = pathname ? permissionModuleForPath(pathname) : null;
  if (moduleId === null) return null;
  return puedeEntrarAlModulo(permisos, moduleId) ? null : moduleId;
}

export function mensajeSinAccesoAlModulo(moduleId: PermissionModuleId): string {
  return `No tenés acceso a ${getPermissionModuleLabel(moduleId)}.`;
}

/**
 * Corta una Server Action si quien la llama no puede entrar a `moduleId`.
 *
 * Esconder la pantalla no alcanza: una action exportada se puede invocar a mano
 * aunque la pantalla muestre «No tenés acceso».
 */
export async function exigirAccesoAlModulo(
  moduleId: PermissionModuleId
): Promise<void> {
  const permisos = await getCurrentUserPermissions();
  if (!puedeEntrarAlModulo(permisos, moduleId)) {
    throw new Error(mensajeSinAccesoAlModulo(moduleId));
  }
}
