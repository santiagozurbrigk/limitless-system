import type { MutationResult } from "@/lib/server/action-result";

/**
 * Por qué no se generó el reporte semanal de Operaciones.
 * - `org-no-activa`: la org está pausada o dada de baja (SCRUM-210).
 * - `sin-inputs`: todavía no hay inputs de esta semana.
 * - `falla`: algo salió mal (base, IA, configuración).
 */
export type MotivoSinReporteSemanal = "org-no-activa" | "sin-inputs" | "falla";

/**
 * Resultado de `generateWeeklyReportAction`. Los errores esperables vuelven
 * como valor y no como excepción: en producción Next no le manda al cliente el
 * mensaje de un error lanzado por una server action (sólo un digest), así que
 * el founder vería un error genérico en vez del motivo.
 */
export type ResultadoReporteSemanal =
  | Extract<MutationResult, { success: true }>
  | { success: false; error: string; motivo: MotivoSinReporteSemanal };

export type MensajeReporteSemanal = {
  title: string;
  description: string;
  variant: "success" | "default";
};

/** Qué le muestra al founder el botón de Inputs semanales. */
export function mensajeDelReporteSemanal(
  resultado: ResultadoReporteSemanal
): MensajeReporteSemanal {
  if (resultado.success) {
    return {
      title: "Reporte generado",
      description: "El reporte ejecutivo está listo en Operaciones.",
      variant: "success",
    };
  }
  return {
    title: "No se pudo generar el reporte",
    description: resultado.error,
    variant: "default",
  };
}

/** Cómo cuenta el botón "Generar reporte ahora" el paso de Operaciones. */
export function pasoDeOperaciones(
  resultado: ResultadoReporteSemanal
): "generated" | "skipped" | "failed" {
  if (resultado.success) return "generated";
  return resultado.motivo === "falla" ? "failed" : "skipped";
}
