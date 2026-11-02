import "server-only";

import { requireOrganizationId } from "@/lib/auth/bootstrap";
import type { Lectura } from "@/lib/client/correr-accion";
import { zonaDeLaOrganizacionActiva } from "@/lib/fechas/organizacion-activa";
import { lecturaDegradable } from "@/lib/server/lectura-degradable";
import {
  calcularConfiguracionDelLanzamiento,
  calcularDetalleDelLanzamiento,
  calcularFichaDelLead,
  calcularInicio,
  calcularLeads,
  calcularListaDeLanzamientos,
} from "./calcular";
import type {
  ParametrosDeLeads,
  VistaConfiguracionDelLanzamiento,
  VistaDetalleDelLanzamiento,
  VistaFichaDelLead,
  VistaInicio,
  VistaLeads,
  VistaListaDeLanzamientos,
} from "./contratos";
import { escenarioDeEjemplo } from "./escenario-de-ejemplo";
import { esOrgDeDemo } from "./org-de-demo";
import {
  inicioSinLecturaReal,
  leadsSinLecturaReal,
  listaSinLecturaReal,
} from "./sin-lectura-real";

/**
 * ⭐ Las seis funciones de lectura de Limitless Webinars (SCRUM-542). Una por
 * pantalla; la pantalla (Server Component) llama sólo a la suya y renderiza lo
 * que devuelve.
 *
 * Todas resuelven la organización con `requireOrganizationId()` (la org
 * efectiva, incluido el negocio activo del holding). Sin sesión lanzan su
 * `ErrorEsperable`, como cualquier lectura de la plataforma. No lanzan por una
 * falla de lectura (B4):
 *   - Inicio, Lista y Leads: una fuente o una consulta caída viaja como estado
 *     `error` del número o de la lista que no se pudo leer;
 *   - Detalle, Ficha y Configuración dependen de una fila (el lanzamiento o el
 *     lead): devuelven `Lectura` (`lib/client/correr-accion.ts`, SCRUM-504).
 *     `{ ok: false, motivo }` = no se pudo leer (la pantalla muestra el motivo);
 *     `{ ok: true, data: null }` = no existe o es de otra organización
 *     (`notFound()`); `{ ok: true, data }` = la vista.
 *
 * Hoy:
 *   - la organización de demo (`WEBINAR_DEMO_ORGANIZATION_ID`) recibe el
 *     escenario de ejemplo, con `esEjemplo: true`;
 *   - cualquier otra recibe el estado honesto "sin fuente" (`sin-lectura-real.ts`),
 *     con `esEjemplo: false`, y "no existe" en las pantallas de un lanzamiento
 *     o de un lead (la página responde `notFound()`).
 * En B4 la rama de "cualquier otra" lee las filas de la base y las pasa por
 * las mismas funciones de `calcular.ts`. La firma de estas funciones no cambia.
 */

async function organizacionQueLee(): Promise<{ ahora: Date; demo: boolean }> {
  const organizationId = await requireOrganizationId();
  return { ahora: new Date(), demo: esOrgDeDemo(organizationId) };
}

/**
 * La zona de la organización: define el hoy de las fechas de calendario del
 * escenario y de los días al cierre. Si no se puede leer, la de por defecto
 * (y la falla queda en Sentry).
 */
function zonaDeLaOrg(): Promise<string | null> {
  return lecturaDegradable("webinar:zona-de-la-org", zonaDeLaOrganizacionActiva, null);
}

/** El escenario de ejemplo con las fechas de calendario en la zona de la org. */
async function escenario(ahora: Date) {
  const zona = await zonaDeLaOrg();
  return { filas: escenarioDeEjemplo(ahora, zona), zona };
}

/** Inicio del lanzamiento activo (`/inicio`, SCRUM-543). */
export async function leerInicio(): Promise<VistaInicio> {
  const { ahora, demo } = await organizacionQueLee();
  if (!demo) return inicioSinLecturaReal();
  const { filas, zona } = await escenario(ahora);
  return calcularInicio(filas, ahora, true, zona);
}

/** Lista de lanzamientos (`/lanzamientos`, SCRUM-544). */
export async function leerListaDeLanzamientos(): Promise<VistaListaDeLanzamientos> {
  const { ahora, demo } = await organizacionQueLee();
  if (!demo) return listaSinLecturaReal();
  return calcularListaDeLanzamientos((await escenario(ahora)).filas, ahora, true);
}

/** Detalle de un lanzamiento (SCRUM-544). */
export async function leerDetalleDelLanzamiento(
  launchId: string
): Promise<Lectura<VistaDetalleDelLanzamiento | null>> {
  const { ahora, demo } = await organizacionQueLee();
  if (!demo) return { ok: true, data: null };
  return {
    ok: true,
    data: calcularDetalleDelLanzamiento((await escenario(ahora)).filas, launchId, ahora, true),
  };
}

/** Leads de un lanzamiento (`/leads`, SCRUM-545), con filtro, búsqueda y página de la URL. */
export async function leerLeads(parametros: ParametrosDeLeads = {}): Promise<VistaLeads> {
  const { ahora, demo } = await organizacionQueLee();
  if (!demo) return leadsSinLecturaReal(parametros);
  return calcularLeads((await escenario(ahora)).filas, parametros, ahora, true);
}

/**
 * Ficha de un lead (`/leads/[id]`, SCRUM-545). `launchId` elige el lanzamiento
 * del estado de venta (por defecto, el del registro más nuevo).
 */
export async function leerFichaDelLead(
  leadId: string,
  launchId?: string | null
): Promise<Lectura<VistaFichaDelLead | null>> {
  const { ahora, demo } = await organizacionQueLee();
  if (!demo) return { ok: true, data: null };
  return {
    ok: true,
    data: calcularFichaDelLead((await escenario(ahora)).filas, leadId, launchId, ahora, true),
  };
}

/** Configuración de un lanzamiento. */
export async function leerConfiguracionDelLanzamiento(
  launchId: string
): Promise<Lectura<VistaConfiguracionDelLanzamiento | null>> {
  const { ahora, demo } = await organizacionQueLee();
  if (!demo) return { ok: true, data: null };
  return {
    ok: true,
    data: calcularConfiguracionDelLanzamiento((await escenario(ahora)).filas, launchId, true),
  };
}
