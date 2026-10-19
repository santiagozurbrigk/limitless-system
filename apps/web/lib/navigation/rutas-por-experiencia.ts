import { paths } from "@/routes/paths";
import type { OrganizationExperience } from "@/lib/organization/experience";
import type { UserPermissions } from "@/lib/auth/get-current-permissions";
import {
  MENU_WEBINAR,
  RUTAS_LIBRES_WEBINAR,
  type EntradaDelMenuWebinar,
} from "./menu-webinar";

/**
 * ⭐ Qué rutas de la plataforma abre cada experiencia y adónde va el que entra
 * a una que no le toca (SCRUM-524). Lógica pura: la experiencia la lee
 * `getOrganizationExperience()` y la decisión se aplica en el layout de cada
 * segmento (`lib/organization/ruta-de-la-experiencia.ts`).
 *
 *   - `full`: todo igual que antes. Ninguna ruta se redirige por experiencia y
 *     la pantalla de inicio es el Panel General.
 *   - `webinar`: sólo las entradas listas de `MENU_WEBINAR` y las rutas libres.
 *     Cualquier otra ruta de la plataforma redirige a la pantalla de inicio.
 *
 * Esto no reemplaza a los permisos: una ruta permitida acá sigue pasando por
 * `moduloBloqueadoParaRuta` en el layout de la plataforma.
 */

function coincide(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Lo que hace falta de los permisos para saber qué entradas ve alguien. */
export type PermisosDeLaBarra = Pick<UserPermissions, "isFounder" | "modules">;

/**
 * Si alguien ve una entrada del menú: la misma regla que la barra y la paleta
 * (`canSeeNavItem` con el `permissionId` de la entrada). El founder ve todo;
 * el resto, lo que su rol no tiene en `none`.
 */
export function puedeVerEntrada(
  permisos: PermisosDeLaBarra,
  entrada: Pick<EntradaDelMenuWebinar, "permissionId">
): boolean {
  return permisos.isFounder || (permisos.modules[entrada.permissionId] ?? "none") !== "none";
}

/** Las entradas del menú webinar que ya tienen pantalla, en su orden. */
export function entradasListas(
  menu: readonly EntradaDelMenuWebinar[] = MENU_WEBINAR
): EntradaDelMenuWebinar[] {
  return menu.filter((entrada) => entrada.lista);
}

/** Las entradas listas que esta persona ve por sus permisos, en su orden. */
export function entradasVisibles(
  permisos: PermisosDeLaBarra,
  menu: readonly EntradaDelMenuWebinar[] = MENU_WEBINAR
): EntradaDelMenuWebinar[] {
  return entradasListas(menu).filter((entrada) => puedeVerEntrada(permisos, entrada));
}

/**
 * La pantalla a la que va la persona después del login y cuando abre una ruta
 * que no es de su experiencia.
 *
 * Para `webinar`: de las entradas listas que puede ver por sus permisos,
 * Inicio si está; si no, la primera en el orden del menú. Si no ve ninguna,
 * Ajustes, que es libre: no hay bucle (Ajustes tiene su propio módulo de
 * permisos, `settings`).
 */
export function pantallaDeInicio(
  experiencia: OrganizationExperience,
  permisos: PermisosDeLaBarra,
  menu: readonly EntradaDelMenuWebinar[] = MENU_WEBINAR
): string {
  if (experiencia === "full") return paths.platform.dashboard;
  const visibles = entradasVisibles(permisos, menu);
  const inicio = visibles.find((entrada) => entrada.id === "inicio");
  return (inicio ?? visibles[0])?.href ?? paths.platform.settings;
}

/** Si la experiencia abre `pathname`. `full` abre todo. */
export function rutaPermitidaParaLaExperiencia(
  experiencia: OrganizationExperience,
  pathname: string,
  menu: readonly EntradaDelMenuWebinar[] = MENU_WEBINAR
): boolean {
  if (experiencia === "full") return true;
  if (RUTAS_LIBRES_WEBINAR.some((libre) => coincide(pathname, libre))) return true;
  return entradasListas(menu).some((entrada) => coincide(pathname, entrada.href));
}

/**
 * Adónde mandar a quien abre `pathname`, o `null` si la puede abrir. El destino
 * es siempre la pantalla de inicio de la experiencia, que es una ruta
 * permitida: no hay bucle. La ruta se abre o no por la experiencia sola; los
 * permisos sólo eligen el destino.
 */
export function redireccionPorExperiencia(
  experiencia: OrganizationExperience,
  pathname: string,
  permisos: PermisosDeLaBarra,
  menu: readonly EntradaDelMenuWebinar[] = MENU_WEBINAR
): string | null {
  if (rutaPermitidaParaLaExperiencia(experiencia, pathname, menu)) return null;
  return pantallaDeInicio(experiencia, permisos, menu);
}
