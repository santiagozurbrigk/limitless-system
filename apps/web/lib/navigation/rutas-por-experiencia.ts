import { paths } from "@/routes/paths";
import type { OrganizationExperience } from "@/lib/organization/experience";
import type { UserPermissions } from "@/lib/auth/get-current-permissions";
import type { SidebarChildItem, SidebarParentModule } from "./sidebar-nav-config";
import {
  MENU_POR_EXPERIENCIA,
  RUTAS_EXTRA_POR_EXPERIENCIA,
  RUTAS_LIBRES,
  type EntradaDelMenu,
} from "./menu-por-experiencia";

/**
 * ⭐ Qué rutas de la plataforma abre cada experiencia y adónde va el que entra
 * a una que no le toca (SCRUM-524). Lógica pura: la experiencia la lee
 * `getOrganizationExperience()` y la decisión se aplica en el layout de cada
 * segmento (`lib/organization/ruta-de-la-experiencia.ts`).
 *
 *   - `full`: todo igual que antes. Ninguna ruta se redirige por experiencia y
 *     la pantalla de inicio es el Panel General.
 *   - `webinar` y `limitless`: sólo los segmentos de las entradas listas de su
 *     menú (`MENU_POR_EXPERIENCIA`), los de sus rutas extra
 *     (`RUTAS_EXTRA_POR_EXPERIENCIA`: pantallas fuera del menú a las que enlaza
 *     una del menú) y las rutas libres. Cualquier otra ruta de la plataforma
 *     redirige a la pantalla de inicio de la experiencia, si su segmento tiene
 *     carpeta en `app/(platform)` (si no, la URL da el 404 de la app).
 *
 * Esto no reemplaza a los permisos: una ruta permitida acá sigue pasando por
 * `moduloBloqueadoParaRuta` en el layout de la plataforma.
 *
 * Las funciones reciben el menú como último argumento para que los tests
 * prueben menús con otras entradas listas; por defecto, el de la experiencia.
 */

/** Si `pathname` es `prefix` o cuelga de él, por segmentos enteros (`/sales` no abre `/salesforce`). */
export function coincide(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** El segmento de primer nivel de una ruta: `/sales` para `/sales/inbox`. */
export function segmentoDe(href: string): string {
  return `/${href.split("/")[1] ?? ""}`;
}

/** El menú de la experiencia; `full` no tiene (vacío). */
export function menuPorDefecto(experiencia: OrganizationExperience): readonly EntradaDelMenu[] {
  return experiencia === "full" ? [] : MENU_POR_EXPERIENCIA[experiencia];
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
  entrada: Pick<EntradaDelMenu, "permissionId">
): boolean {
  return permisos.isFounder || (permisos.modules[entrada.permissionId] ?? "none") !== "none";
}

/**
 * Los hijos de un grupo de la barra que esta persona ve: los que no están
 * escondidos y cuyo módulo puede ver con `puedeVerEntrada`; un hijo sin módulo,
 * sólo el founder (como `canSeeNavItem`). La usan la barra
 * (`platform-notch-nav.tsx`) y la paleta (`itemsDeLaPaleta`).
 */
export function hijosVisiblesDelGrupo(
  permisos: PermisosDeLaBarra,
  grupo: Pick<SidebarParentModule, "children">
): SidebarChildItem[] {
  return grupo.children.filter(
    (hijo) =>
      !hijo.hidden &&
      (hijo.permissionId === undefined
        ? permisos.isFounder
        : puedeVerEntrada(permisos, { permissionId: hijo.permissionId }))
  );
}

/** Las entradas del menú que ya tienen pantalla, en su orden. */
export function entradasListas(menu: readonly EntradaDelMenu[]): EntradaDelMenu[] {
  return menu.filter((entrada) => entrada.lista);
}

/** Las entradas listas que esta persona ve por sus permisos, en su orden. */
export function entradasVisibles(
  permisos: PermisosDeLaBarra,
  menu: readonly EntradaDelMenu[]
): EntradaDelMenu[] {
  return entradasListas(menu).filter((entrada) => puedeVerEntrada(permisos, entrada));
}

/**
 * La pantalla a la que va la persona después del login y cuando abre una ruta
 * que no es de su experiencia.
 *
 * Para `webinar` y `limitless`: de las entradas listas que puede ver por sus
 * permisos, la de id `inicio` si está; si no, la primera en el orden del menú
 * (en `limitless`, Clientes). Si no ve ninguna, Ajustes, que es libre: no hay
 * bucle (Ajustes tiene su propio módulo de permisos, `settings`).
 */
export function pantallaDeInicio(
  experiencia: OrganizationExperience,
  permisos: PermisosDeLaBarra,
  menu: readonly EntradaDelMenu[] = menuPorDefecto(experiencia)
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
  menu: readonly EntradaDelMenu[] = menuPorDefecto(experiencia)
): boolean {
  if (experiencia === "full") return true;
  if (RUTAS_LIBRES.some((libre) => coincide(pathname, libre))) return true;
  if (RUTAS_EXTRA_POR_EXPERIENCIA[experiencia].some((extra) => coincide(pathname, segmentoDe(extra)))) {
    return true;
  }
  return entradasListas(menu).some((entrada) => coincide(pathname, segmentoDe(entrada.href)));
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
  menu: readonly EntradaDelMenu[] = menuPorDefecto(experiencia)
): string | null {
  if (rutaPermitidaParaLaExperiencia(experiencia, pathname, menu)) return null;
  return pantallaDeInicio(experiencia, permisos, menu);
}
