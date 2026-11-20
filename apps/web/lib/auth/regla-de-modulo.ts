/**
 * ⭐ La regla de acceso a un módulo, sin dependencias de servidor (SCRUM-18,
 * separada en SCRUM-540 para que la usen también los providers del cliente).
 *
 * `lib/auth/acceso-a-modulo.ts` la reexporta y la aplica en el servidor: el
 * layout de la plataforma, el guardia de las páginas y las Server Actions.
 */
import type { UserPermissions } from "@/lib/auth/get-current-permissions";
import type { PermissionModuleId } from "@/constants/permission-modules";

export type PermisosDeModulo = Pick<
  UserPermissions,
  "isFounder" | "hasRoleConfigured" | "modules"
>;

/**
 * La regla, en un solo lugar (SCRUM-18).
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
 * Si un valor que devolvió una action es el rechazo por módulo. Sirve para las
 * lecturas que devuelven el dato directo (un arreglo, un objeto): el rechazo
 * llega en lugar del dato y se distingue por `motivo`.
 */
export function esRechazoPorModulo(valor: unknown): valor is RechazoPorModulo {
  return (
    typeof valor === "object" &&
    valor !== null &&
    (valor as { motivo?: unknown }).motivo === "sin-acceso" &&
    (valor as { success?: unknown }).success === false
  );
}

/**
 * El dato, o `vacio` si vino el rechazo. Para quien compone una lectura del
 * marco dentro de otra que ya chequeó su propio módulo (la de Wins usa la
 * lista de clientes): ahí el rechazo no tiene pantalla propia.
 */
export function sinRechazo<T>(valor: T | RechazoPorModulo, vacio: T): T {
  return esRechazoPorModulo(valor) ? vacio : valor;
}
