import { paths } from "@/routes/paths";
import type { OrganizationExperience } from "@/lib/organization/experience";
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

/** Las entradas del menú webinar que ya tienen pantalla, en su orden. */
export function entradasListas(
  menu: readonly EntradaDelMenuWebinar[] = MENU_WEBINAR
): EntradaDelMenuWebinar[] {
  return menu.filter((entrada) => entrada.lista);
}

/**
 * La pantalla a la que va la organización después del login y cuando abre una
 * ruta que no es de su experiencia.
 *
 * Para `webinar`: Inicio si está lista; si no, la primera entrada lista del
 * menú. Si el menú no tuviera ninguna lista, Ajustes, que es libre (un test
 * exige que haya al menos una).
 */
export function pantallaDeInicio(
  experiencia: OrganizationExperience,
  menu: readonly EntradaDelMenuWebinar[] = MENU_WEBINAR
): string {
  if (experiencia === "full") return paths.platform.dashboard;
  const listas = entradasListas(menu);
  const inicio = listas.find((entrada) => entrada.id === "inicio");
  return (inicio ?? listas[0])?.href ?? paths.platform.settings;
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
 * permitida: no hay bucle.
 */
export function redireccionPorExperiencia(
  experiencia: OrganizationExperience,
  pathname: string,
  menu: readonly EntradaDelMenuWebinar[] = MENU_WEBINAR
): string | null {
  if (rutaPermitidaParaLaExperiencia(experiencia, pathname, menu)) return null;
  return pantallaDeInicio(experiencia, menu);
}
