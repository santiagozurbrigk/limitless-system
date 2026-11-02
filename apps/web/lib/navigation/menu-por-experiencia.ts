import { paths } from "@/routes/paths";
import type { PermissionModuleId } from "@/constants/permission-modules";
import type { OrganizationExperience } from "@/lib/organization/experience";
import type { SidebarParentKey } from "./sidebar-modules";

/**
 * ⭐ El menú de cada experiencia que no es `full` (SCRUM-524). Vive acá para
 * cambiarlo sin tocar la barra: la barra, el menú del celular, la paleta, el
 * bloqueo de rutas y el destino después del login salen de esta config.
 * `full` no tiene entrada: ve el menú de siempre (`lib/navigation/sidebar-modules.ts`)
 * y abre todas las rutas.
 *
 *   - `webinar` (Limitless Webinars; PO, 19-oct y 28-oct-2026): Inicio,
 *     Lanzamientos, Leads y Equipo, en ese orden.
 *       - Inicio: SCRUM-534.
 *       - Lanzamientos: SCRUM-529 (la ruta es la de hoy, que sigue escondida
 *         para todos por `ESCONDIDO.lanzamientos`; encenderla obliga a revisar
 *         su layout).
 *       - Leads: SCRUM-537.
 *       - Equipo: ya existe (`/team`).
 *   - `limitless` (Limitless de gestión; PO, 28-oct-2026): Clientes, Tablero
 *     de trabajo, Ventas y Administración, en ese orden. Las tres primeras son
 *     las pantallas de siempre, con el mismo nombre, ícono y módulo de permisos
 *     que en el menú completo; Ventas es el mismo grupo, con sus hijos.
 *     Administración es de SCRUM-551.
 *
 * Una entrada con `lista: false` no se muestra (nada de "Próximamente") y su
 * ruta no se abre. Lo que ve quien la tipea depende de si su pantalla existe:
 * hoy `/inicio`, `/leads` y `/administracion` no tienen carpeta en
 * `app/(platform)`, así que la URL da el 404 de la app (sin la barra); cuando
 * la tarea cree la carpeta, su `layout.tsx` llama a `exigirRutaDeLaExperiencia`
 * (lo exige un test) y esa ruta redirige a la pantalla de inicio mientras la
 * entrada no esté lista, como hoy `/lanzamientos`. Cada tarea enciende la suya
 * cuando su pantalla existe.
 *
 * El bloqueo se decide por el segmento de primer nivel de `href` (`/sales` para
 * `/sales/inbox`): todo lo que cuelga de ese segmento queda abierto, y nada
 * más. Dos entradas no comparten segmento (lo exige un test). `href` es la
 * pantalla a la que lleva la entrada y la que se usa como pantalla de inicio:
 * tiene que existir cuando la entrada está lista (también lo exige un test).
 * `permissionId` es el módulo de permisos que la protege, el mismo que le da
 * `module-for-path` a su ruta. `grupo`: la entrada se dibuja como ese grupo
 * del menú completo, con sus hijos (`ventas`).
 */
export type EntradaDelMenu = {
  id: string;
  label: string;
  href: string;
  icon: string;
  permissionId: PermissionModuleId;
  grupo?: SidebarParentKey;
  lista: boolean;
};

/** Las experiencias con un menú recortado: todas menos `full`. */
export type ExperienciaConMenuPropio = Exclude<OrganizationExperience, "full">;

export const MENU_POR_EXPERIENCIA: Record<ExperienciaConMenuPropio, readonly EntradaDelMenu[]> = {
  webinar: [
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
      id: "equipo",
      label: "Equipo",
      href: paths.platform.team.root,
      icon: "users",
      permissionId: "team",
      lista: true,
    },
  ],
  limitless: [
    {
      id: "clientes",
      label: "Clientes",
      href: paths.platform.clients.root,
      icon: "briefcase",
      permissionId: "clients",
      lista: true,
    },
    {
      id: "tablero",
      label: "Tablero de trabajo",
      href: paths.platform.workboard.root,
      icon: "kanban",
      permissionId: "workboard",
      lista: true,
    },
    {
      id: "ventas",
      label: "Ventas",
      href: paths.platform.sales.inbox,
      icon: "message-square",
      permissionId: "sales",
      grupo: "ventas",
      lista: true,
    },
    {
      id: "administracion",
      label: "Administración",
      href: paths.platform.administracion,
      icon: "building-2",
      // Provisorio: el módulo de permisos de Administración lo decide SCRUM-551.
      permissionId: "finance",
      lista: false, // SCRUM-551
    },
  ],
};

/**
 * Pantallas fuera del menú que una experiencia abre igual porque una pantalla
 * de su menú enlaza a ellas (fix-pack 1 de A1, decisión de Fernando, 1-nov-2026).
 * No se muestran en la barra, en el menú del celular ni en la paleta: se llega
 * por el link o tipeando la URL. Cada valor es la pantalla a la que lleva el
 * link, con la forma de las rutas de `app/` (`[id]` para un parámetro; un test
 * exige que exista). Como con las entradas, se abre el segmento de primer
 * nivel, con todo lo que cuelga de él, y el permiso del módulo de esa ruta
 * (`module-for-path`) sigue valiendo en el layout de la plataforma.
 *
 *   - `limitless`:
 *       - Integraciones: la Bandeja de Ventas lleva a «Conectar integración»,
 *         «Conectar Zernio» y «Gestionar Zernio»; sin esto, la Bandeja no se
 *         puede conectar ni reconectar.
 *       - SOP (`/sops/<id>`) y documentos del contexto del negocio
 *         (`/business-context/<id>`): el Tablero enlaza al SOP vinculado a una
 *         tarea y a sus documentos. La biblioteca de SOP (`/operations/sops`)
 *         no se abre: es otro segmento. `/sops` y `/sops/create` tampoco, en
 *         la práctica: `next.config.ts` los manda a esa biblioteca
 *         (`lib/navigation/redirects.ts`).
 *   - `webinar`: ninguna.
 */
export const RUTAS_EXTRA_POR_EXPERIENCIA: Record<ExperienciaConMenuPropio, readonly string[]> = {
  webinar: [],
  limitless: [
    paths.platform.integrations,
    paths.platform.sops.detail("[id]"),
    paths.platform.businessContext.viewer("[id]"),
  ],
};

/**
 * Rutas de la plataforma que toda experiencia puede abrir aunque no estén en
 * su menú.
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
export const RUTAS_LIBRES: readonly string[] = [
  paths.platform.onboarding,
  paths.platform.holding,
  paths.platform.settings,
];

/**
 * Los accesos fijos de la isla derecha de la barra que llevan a pantallas
 * fuera del menú, por experiencia. Para `webinar` y `limitless` no se
 * muestran: el panel de reportes ejecutivos lee y enlaza `/executive-reports`
 * y el indicador de configuración pendiente es el checklist del Panel
 * (`/dashboard`), y ninguna de las dos está en sus menús. El resto de la isla
 * (negocio activo del holding, tema, perfil con Ajustes) es libre, e
 * Integraciones ya sale del config de la barra.
 */
export const ACCESOS_DE_LA_ISLA: Record<
  OrganizationExperience,
  { reportes: boolean; configuracionPendiente: boolean }
> = {
  full: { reportes: true, configuracionPendiente: true },
  webinar: { reportes: false, configuracionPendiente: false },
  limitless: { reportes: false, configuracionPendiente: false },
};
