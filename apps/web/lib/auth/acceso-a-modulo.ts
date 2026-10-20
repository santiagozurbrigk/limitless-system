import { createElement, type ReactElement } from "react";
import {
  getCurrentUserPermissions,
  type UserPermissions,
} from "@/lib/auth/get-current-permissions";
import {
  getPermissionModuleLabel,
  type PermissionModuleId,
} from "@/constants/permission-modules";
import { permissionModuleForPath } from "@/lib/navigation/module-for-path";
import { SinAcceso } from "@/components/platform/sin-acceso";

type PermisosDeModulo = Pick<
  UserPermissions,
  "isFounder" | "hasRoleConfigured" | "modules"
>;

/**
 * ⭐ La regla de acceso a un módulo, en un solo lugar (SCRUM-18).
 *
 * La usan el layout de la plataforma, que decide si una pantalla se muestra,
 * las páginas y los layouts que leen (`exigirModuloDeLaPagina`, SCRUM-540), que
 * cortan sus lecturas antes de que corran, y las Server Actions
 * (`rechazoPorModulo`), que se pueden llamar a mano sin pasar por ninguna
 * pantalla. Si cada uno tuviera su copia, alcanzaría con
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
 * Por qué una Server Action no siguió: quien la llama no puede entrar a
 * `moduleId`. Tiene la forma del caso de error de `MutationResult`, así que una
 * mutación la puede devolver tal cual, y `motivo` + `moduleId` le alcanzan a
 * una pantalla para dibujar `SinAcceso`.
 */
export type RechazoPorModulo = {
  success: false;
  error: string;
  motivo: "sin-acceso";
  moduleId: PermissionModuleId;
};

/**
 * El rechazo si quien llama no puede entrar a `moduleId`, o `null` si puede.
 *
 * Esconder la pantalla no alcanza: una action exportada se puede invocar a mano
 * aunque la pantalla muestre «No tenés acceso». Y el rechazo vuelve como valor,
 * no como excepción: es un caso esperable, y una lectura que lanza en un server
 * component termina en la pantalla de error de Next (y en Sentry) en vez de
 * `SinAcceso` (ver `[ACTIONS-ERRORES-EN-PRODUCCION]`).
 */
export async function rechazoPorModulo(
  moduleId: PermissionModuleId
): Promise<RechazoPorModulo | null> {
  const permisos = await getCurrentUserPermissions();
  if (puedeEntrarAlModulo(permisos, moduleId)) return null;
  return {
    success: false,
    error: mensajeSinAccesoAlModulo(moduleId),
    motivo: "sin-acceso",
    moduleId,
  };
}

/**
 * ⭐ El guardia de las páginas y de los layouts que leen (SCRUM-540).
 *
 * Devuelve `SinAcceso` si quien entra no puede ver `moduleId`, o `null` si
 * puede. Va en la primera línea de la página, antes de cualquier lectura:
 *
 *     const sinAcceso = await exigirModuloDeLaPagina("operations");
 *     if (sinAcceso) return sinAcceso;
 *
 * Por qué en la página y no sólo en el layout de la plataforma: en el App
 * Router la página se ejecuta en el servidor aunque un layout de arriba no
 * dibuje `children`, así que sus lecturas corren y sus datos viajan en el HTML
 * y en el payload RSC. Además ese layout no se vuelve a ejecutar en una
 * navegación del cliente; la página sí, siempre. Lo único que corta las
 * lecturas es que el chequeo corra antes que ellas en la misma función.
 *
 * No usa `x-pathname` ni el layout: recibe el módulo escrito en la página, y
 * el test `lecturas-por-modulo.test.ts` compara ese módulo con el de
 * `module-for-path` para la ruta en disco. No redirige: dibuja lo mismo que
 * el layout de la plataforma, sin riesgo de bucles.
 *
 * La regla es la de `rechazoPorModulo` (founder pasa, sin rol no se bloquea),
 * y una falla al leer los permisos lanza, igual que ahí: la página cae en su
 * boundary de error, nunca se abre.
 */
export async function exigirModuloDeLaPagina(
  moduleId: PermissionModuleId
): Promise<ReactElement | null> {
  const rechazo = await rechazoPorModulo(moduleId);
  if (!rechazo) return null;
  return createElement(SinAcceso, {
    moduleLabel: getPermissionModuleLabel(rechazo.moduleId),
  });
}
