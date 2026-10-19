import { paths } from "@/routes/paths";
import type { PermissionModuleId } from "@/constants/permission-modules";

/**
 * ⭐ El menú de una organización de Limitless Webinars (SCRUM-524).
 *
 * Decisión del PO (19-oct-2026): Inicio, Lanzamientos, Leads, Llamadas y
 * Equipo, en ese orden. Vive acá para cambiarlo sin tocar la barra.
 *
 * Una entrada con `lista: false` no se muestra (nada de "Próximamente") y su
 * ruta redirige a la pantalla de inicio, igual que cualquier otra ruta de la
 * plataforma que no esté en este menú. Cada tarea enciende la suya cuando su
 * pantalla existe:
 *   - Inicio: SCRUM-534.
 *   - Lanzamientos: SCRUM-529 (la ruta es la de hoy, que sigue escondida para
 *     todos por `ESCONDIDO.lanzamientos`; encenderla obliga a revisar su layout).
 *   - Leads y Llamadas: SCRUM-537.
 *   - Equipo: ya existe (`/team`).
 *
 * La ruta de cada entrada es un solo segmento (`/team`, no `/team/roles`): el
 * bloqueo se decide en el layout del segmento de primer nivel, y un test lo
 * exige. `permissionId` es el módulo de permisos que la protege, el mismo que
 * le da `module-for-path` a esa ruta (también lo exige un test).
 */
export type EntradaDelMenuWebinar = {
  id: "inicio" | "lanzamientos" | "leads" | "llamadas" | "equipo";
  label: string;
  href: string;
  icon: string;
  permissionId: PermissionModuleId;
  lista: boolean;
};

export const MENU_WEBINAR: readonly EntradaDelMenuWebinar[] = [
  {
    id: "inicio",
    label: "Inicio",
    href: paths.platform.inicio,
    icon: "layout-dashboard",
    permissionId: "dashboard",
    lista: false, // SCRUM-534
  },
  {
    id: "lanzamientos",
    label: "Lanzamientos",
    href: paths.platform.lanzamientos,
    icon: "rocket",
    permissionId: "funnels",
    lista: false, // SCRUM-529
  },
  {
    id: "leads",
    label: "Leads",
    href: paths.platform.webinars.leads,
    icon: "user-round",
    permissionId: "sales",
    lista: false, // SCRUM-537
  },
  {
    id: "llamadas",
    label: "Llamadas",
    href: paths.platform.webinars.llamadas,
    icon: "calendar-check",
    permissionId: "sales",
    lista: false, // SCRUM-537
  },
  {
    id: "equipo",
    label: "Equipo",
    href: paths.platform.team.root,
    icon: "users",
    permissionId: "team",
    lista: true,
  },
];

/**
 * Rutas de la plataforma que una organización webinar puede abrir aunque no
 * estén en su menú.
 *
 *   - `/onboarding`: el middleware manda ahí al founder que no completó el
 *     onboarding; bloquearla armaría un bucle de redirecciones.
 *   - `/holding`: la vista del holding y su selector de negocios.
 *   - `/settings`: los ajustes de la cuenta (contraseña, tema, cerrar sesión),
 *     a los que se llega desde el menú de perfil y no desde la barra.
 *
 * Todo lo que está fuera de `app/(platform)` (login, `auth/*`, invitaciones,
 * `api/*`, super admin, páginas públicas) no pasa por este bloqueo.
 */
export const RUTAS_LIBRES_WEBINAR: readonly string[] = [
  paths.platform.onboarding,
  paths.platform.holding,
  paths.platform.settings,
];
