import type { OrganizationExperience } from "./experience";

/**
 * SCRUM-525 · Qué experiencias corren los procesos de fondo por organización:
 * reportes ejecutivos (diario, semanal y mensual), snapshot de inteligencia,
 * análisis de tono del founder, señales diarias (Discord y llamadas de entrega)
 * y métricas de contenido de Zernio.
 *
 * Una cuenta webinar no ve ninguna de esas pantallas (SCRUM-524), así que
 * correrlos sólo gasta IA y llamadas a APIs. `limitless` sigue corriendo: tiene
 * Clientes, donde caen los hitos propuestos por las señales diarias.
 *
 * Lógica pura (sin `server-only`) para poder usarla desde los crons y testearla.
 * Un valor que no es una experiencia conocida (la columna todavía vacía en una
 * base vieja) corre, como hasta ahora: el default de la columna es `full`.
 */
export const EXPERIENCIAS_SIN_PROCESOS_DE_FONDO: readonly OrganizationExperience[] = ["webinar"];

export function correProcesosDeFondo(experiencia: unknown): boolean {
  return !(EXPERIENCIAS_SIN_PROCESOS_DE_FONDO as readonly unknown[]).includes(experiencia);
}
