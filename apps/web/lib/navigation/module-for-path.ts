import type { PermissionModuleId } from "@/constants/permission-modules";

/**
 * ⭐ Qué módulo protege cada pantalla.
 *
 * Hasta ahora los permisos sólo **escondían botones**: un `viewer` sin acceso a
 * Finanzas no veía el link, pero si tipeaba `/finance` en la barra del
 * navegador entraba igual y veía la facturación completa. Un permiso que se
 * puede saltear escribiendo una URL no es un permiso, es una sugerencia.
 *
 * Esta tabla es la que usa el layout de la plataforma —en el servidor, antes de
 * renderizar nada— para decidir si la pantalla se muestra.
 *
 * Se eligió una tabla explícita y no derivarla del sidebar porque hay pantallas
 * que no están en el menú (`/sops/[id]`, `/comentarios`, los detalles de
 * cliente) y son justamente las que se olvidan. El test recorre `app/` entero
 * en disco y falla si aparece una ruta nueva que no está acá ni en la lista de
 * libres, o si una ruta de esta tabla vive fuera de un layout que haga el
 * chequeo (como pasaba con `/founder` en su propio grupo, SCRUM-18): agregar
 * una pantalla obliga a decidir quién la ve.
 */
const MODULE_BY_PREFIX: { prefix: string; moduleId: PermissionModuleId }[] = [
  { prefix: "/dashboard", moduleId: "dashboard" },
  { prefix: "/workboard", moduleId: "workboard" },

  { prefix: "/agent", moduleId: "agent" },
  { prefix: "/business-context", moduleId: "knowledge_base" },

  { prefix: "/clients", moduleId: "clients" },
  { prefix: "/funnels", moduleId: "funnels" },
  { prefix: "/lanzamientos", moduleId: "funnels" },

  { prefix: "/sales", moduleId: "sales" },
  { prefix: "/marketing", moduleId: "marketing" },
  { prefix: "/comentarios", moduleId: "marketing" },

  { prefix: "/operations", moduleId: "operations" },
  { prefix: "/sops", moduleId: "operations" },
  { prefix: "/intelligence", moduleId: "operations" },
  { prefix: "/executive-reports", moduleId: "operations" },
  { prefix: "/founder", moduleId: "operations" },
  // Producto no tiene módulo propio en la grilla de permisos: es la definición
  // de la oferta, y quien la edita es quien maneja Operaciones.
  { prefix: "/product", moduleId: "operations" },

  { prefix: "/finance", moduleId: "finance" },
  { prefix: "/integrations", moduleId: "integrations" },
  { prefix: "/team", moduleId: "team" },
  { prefix: "/settings", moduleId: "settings" },
];

/**
 * Pantallas sin permiso asociado, a propósito.
 *
 * `/onboarding` y `/holding` son anteriores a que exista un rol: bloquearlas
 * por permiso dejaría a una cuenta nueva sin ningún lado adonde ir.
 * `/redesign-preview` es una pantalla interna de diseño, sin datos.
 */
const RUTAS_LIBRES = ["/onboarding", "/holding", "/redesign-preview"];

function coincide(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isRutaLibre(pathname: string): boolean {
  return RUTAS_LIBRES.some((prefix) => coincide(pathname, prefix));
}

/**
 * El módulo que protege una ruta, o `null` si es libre o no se reconoce.
 *
 * Gana el prefijo **más largo**: `/clients/wins` y `/clients` caen en el mismo
 * módulo hoy, pero si mañana uno se separa, la tabla ya soporta la excepción
 * sin reordenarla a mano.
 */
export function permissionModuleForPath(
  pathname: string
): PermissionModuleId | null {
  if (isRutaLibre(pathname)) return null;

  let mejor: { prefix: string; moduleId: PermissionModuleId } | null = null;
  for (const fila of MODULE_BY_PREFIX) {
    if (!coincide(pathname, fila.prefix)) continue;
    if (!mejor || fila.prefix.length > mejor.prefix.length) mejor = fila;
  }
  return mejor?.moduleId ?? null;
}

/** Los prefijos declarados, para el test que recorre el disco. */
export const PREFIJOS_CON_MODULO = MODULE_BY_PREFIX.map((f) => f.prefix);
export const PREFIJOS_LIBRES = RUTAS_LIBRES;
