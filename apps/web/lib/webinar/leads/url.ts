import { paths } from "@/routes/paths";
import type { ParametrosDeLeads } from "@/lib/webinar/vistas/contratos";

/**
 * ⭐ La URL de Leads y de la ficha (SCRUM-545). Filtro, búsqueda, lanzamiento
 * y cursor viven en la URL (AC-2): un filtro se comparte y se abre con
 * `/leads?filtro=<id>` (AC-3).
 *
 * Parámetros de `/leads`: `filtro`, `busqueda`, `lanzamiento`, `cursor`.
 * De `/leads/[id]`: `lanzamiento`.
 */

/** Los `searchParams` que Next le pasa a una página. */
export type ParametrosDeLaUrl = Record<string, string | string[] | undefined>;

/** El primer valor de un parámetro (la URL puede repetirlo), o `null`. */
function primero(valor: string | string[] | undefined): string | null {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  return texto ? texto : null;
}

/** Lo que `leerLeads` necesita, desde la URL de `/leads`. */
export function parametrosDesdeUrl(params: ParametrosDeLaUrl): ParametrosDeLeads {
  return {
    filtro: primero(params.filtro),
    busqueda: primero(params.busqueda),
    launchId: primero(params.lanzamiento),
    cursor: primero(params.cursor),
  };
}

/**
 * La URL de `/leads` con `actual` y los `cambios`. Un cambio de filtro, de
 * búsqueda o de lanzamiento vuelve a la primera página (borra el cursor) y
 * conserva lo demás; el cursor sólo se mueve si viene en `cambios`.
 */
export function urlDeLeads(
  actual: ParametrosDeLeads,
  cambios: ParametrosDeLeads = {}
): string {
  const sinCambios = Object.keys(cambios).length === 0;
  const cursor = "cursor" in cambios ? cambios.cursor : sinCambios ? actual.cursor : null;
  const valores = { ...actual, ...cambios, cursor };
  const query = new URLSearchParams();
  if (valores.filtro) query.set("filtro", valores.filtro);
  if (valores.busqueda) query.set("busqueda", valores.busqueda);
  if (valores.launchId) query.set("lanzamiento", valores.launchId);
  if (valores.cursor) query.set("cursor", valores.cursor);
  const texto = query.toString();
  return texto ? `${paths.platform.webinars.leads}?${texto}` : paths.platform.webinars.leads;
}

/** La ficha de un lead; con lanzamiento, el del estado de venta (DT-15). */
export function urlDeLaFicha(leadId: string, launchId?: string | null): string {
  const ficha = paths.platform.webinars.lead(encodeURIComponent(leadId));
  if (!launchId) return ficha;
  return `${ficha}?${new URLSearchParams({ lanzamiento: launchId }).toString()}`;
}

/** El `?lanzamiento=` de la ficha, o `null`. */
export function lanzamientoDesdeUrl(params: ParametrosDeLaUrl): string | null {
  return primero(params.lanzamiento);
}
