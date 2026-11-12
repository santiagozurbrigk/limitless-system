import { resolverZonaHoraria } from "@/lib/fechas/calendario";
import { paths } from "@/routes/paths";
import type {
  EtapaDelLead,
  FilaDeLead,
  OrigenDelRegistro,
} from "@/lib/webinar/vistas/contratos";

/**
 * ⭐ Leads y ficha del lead de Limitless Webinars (SCRUM-545): el módulo único
 * de etiquetas, orden de columnas y mapa de avance (DT-13). Si después de la
 * sesión con el cliente cambian las etapas, el mapa o el origen, se cambia acá.
 *
 * Sin `server-only`: lo usan la acción (servidor) y el panel (cliente).
 */

/**
 * El paso de "marcar avance" de cada etapa (DT-14). Explícito a propósito: no
 * se deriva del orden de `ETAPAS_DEL_LEAD`, porque ese orden mezcla caminos
 * (calificado y descalificado, asistió y no se presentó). Una etapa que no está
 * acá no tiene botón de avance.
 */
export const SIGUIENTE_ETAPA: Partial<Record<EtapaDelLead, EtapaDelLead>> = {
  raised_hand: "contacted",
  contacted: "qualified",
};

/** El paso siguiente de `etapa`, o `null` si no tiene. */
export function siguienteEtapa(etapa: EtapaDelLead): EtapaDelLead | null {
  return SIGUIENTE_ETAPA[etapa] ?? null;
}

export const TEXTO_SIN_CONTACTAR = "Sin contactar";
export const TEXTO_SIN_TELEFONO = "No dejó teléfono";
export const TEXTO_ORIGEN_VACIO = "Directo o sin dato";
export const TEXTO_SIN_RESPONSABLE = "Sin responsable";

/** Las columnas de la tabla de Leads, en orden. */
export const COLUMNAS_DE_LEADS = [
  { id: "lead", etiqueta: "Lead" },
  { id: "etapa", etiqueta: "Etapa" },
  { id: "origen", etiqueta: "Origen" },
  { id: "responsable", etiqueta: "Responsable" },
  { id: "ultimoContacto", etiqueta: "Último contacto" },
] as const;

/** El nombre de la persona o, si la landing no lo pidió, su email. */
export function nombreVisible(lead: Pick<FilaDeLead, "nombre" | "email">): string {
  return lead.nombre ?? lead.email;
}

/** El `utm_source` del registro, o "Directo o sin dato". */
export function textoDelOrigen(origen: OrigenDelRegistro): string {
  return origen.utmSource ?? TEXTO_ORIGEN_VACIO;
}

/**
 * Un instante (ISO 8601) como `dd/mm/aaaa hh:mm` en la zona de la
 * organización (`null` o una zona que no existe: la de por defecto). Un texto
 * que no es un instante vuelve tal cual: no se inventa una fecha.
 */
export function formatearInstante(iso: string, zona: string | null | undefined): string {
  const instante = new Date(iso);
  if (Number.isNaN(instante.getTime())) return iso;
  const partes = new Intl.DateTimeFormat("es-AR", {
    timeZone: resolverZonaHoraria(zona),
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instante);
  const parte = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((p) => p.type === tipo)?.value ?? "";
  return `${parte("day")}/${parte("month")}/${parte("year")} ${parte("hour")}:${parte("minute")}`;
}

/**
 * Adónde lleva el estado vacío de Leads, Inicio y Lanzamientos para crear un
 * lanzamiento (AC-6): la pantalla de creación de SCRUM-529. Sin ruta, el
 * estado vacío no dibuja el enlace (DT-22).
 */
export const RUTA_PARA_CREAR_LANZAMIENTO: string | null = paths.platform.lanzamientosNuevo;
