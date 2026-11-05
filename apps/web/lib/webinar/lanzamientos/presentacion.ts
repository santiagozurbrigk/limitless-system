import type { EstadoDelLanzamiento } from "@/lib/webinar/vistas/contratos";

/**
 * Lanzamientos de Limitless Webinars (SCRUM-544): textos de la lista y del
 * detalle. Lógica pura sobre el contrato de SCRUM-542, sin `server-only`.
 */

export const ETIQUETA_DEL_ESTADO_DEL_LANZAMIENTO: Record<EstadoDelLanzamiento, string> = {
  draft: "Borrador",
  active: "Activo",
  closed: "Cerrado",
};

/** `AAAA-MM-DD` como `dd/mm/aaaa`; un texto que no es una fecha vuelve tal cual. */
export function formatearFechaCalendario(fecha: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : fecha;
}

/** "Del 28/10/2026 al 08/11/2026", con lo que haya cargado. */
export function textoDeLasFechas(captaDesde: string | null, cierraEl: string | null): string {
  if (captaDesde && cierraEl) {
    return `Del ${formatearFechaCalendario(captaDesde)} al ${formatearFechaCalendario(cierraEl)}`;
  }
  if (captaDesde) return `Desde el ${formatearFechaCalendario(captaDesde)}`;
  if (cierraEl) return `Cierra el ${formatearFechaCalendario(cierraEl)}`;
  return "Sin fechas cargadas";
}

/** El ancho de una barra respecto del máximo, en %, con un mínimo visible si el valor no es cero. */
export function anchoDeBarra(valor: number, maximo: number): number {
  if (maximo <= 0 || valor <= 0) return 0;
  return Math.max(2, Math.round((valor / maximo) * 100));
}
