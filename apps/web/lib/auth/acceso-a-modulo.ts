import { createElement, type ReactElement } from "react";
import { getCurrentUserPermissions } from "@/lib/auth/get-current-permissions";
import {
  getPermissionModuleLabel,
  type PermissionModuleId,
} from "@/constants/permission-modules";
import { permissionModuleForPath } from "@/lib/navigation/module-for-path";
import { SinAcceso } from "@/components/platform/sin-acceso";
import {
  puedeEntrarAlModulo,
  type PermisosDeModulo,
  type RechazoPorModulo,
} from "@/lib/auth/regla-de-modulo";
import {
  MODULOS_DE_LAS_LECTURAS_DEL_MARCO,
  puedeLeerDelMarco,
  type LecturaDelMarco,
} from "@/lib/auth/lecturas-del-marco";

export {
  puedeEntrarAlModulo,
  esRechazoPorModulo,
  type RechazoPorModulo,
} from "@/lib/auth/regla-de-modulo";

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

/**
 * ⭐ El chequeo de las lecturas del marco de la plataforma (SCRUM-540).
 *
 * Los providers de `AppProviders` y la barra se montan en toda pantalla y piden
 * datos que usan pantallas de varios módulos (los clientes los usan Clientes,
 * Ventas, Finanzas y el Panel). Cada lectura pasa si quien llama puede entrar a
 * **alguno** de sus módulos (`MODULOS_DE_LAS_LECTURAS_DEL_MARCO`), con la regla
 * de siempre; si no, el rechazo como valor, con el primero de la lista. Una
 * falla al leer los permisos lanza, como en `rechazoPorModulo`.
 *
 * Va primero en la action, como `rechazoPorModulo`:
 *     const rechazo = await rechazoDeLecturaDelMarco("clientes");
 *     if (rechazo) return rechazo;
 * y del lado del cliente el provider no la pide (`leerDelMarco`).
 */
export async function rechazoDeLecturaDelMarco(
  lectura: LecturaDelMarco
): Promise<RechazoPorModulo | null> {
  const permisos = await getCurrentUserPermissions();
  if (puedeLeerDelMarco(permisos, lectura)) return null;
  const moduleId = MODULOS_DE_LAS_LECTURAS_DEL_MARCO[lectura][0];
  return {
    success: false,
    error: mensajeSinAccesoAlModulo(moduleId),
    motivo: "sin-acceso",
    moduleId,
  };
}

/** Si quien llama puede leer `lectura`, para una action que arma su respuesta por partes. */
export async function puedeLeerDelMarcoEnElServidor(lectura: LecturaDelMarco): Promise<boolean> {
  return puedeLeerDelMarco(await getCurrentUserPermissions(), lectura);
}
