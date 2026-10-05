import { AVISO_ORG_NO_ACTIVA } from "@/lib/intelligence/organizaciones-activas";

type Paso = "generated" | "skipped" | "failed";

export type ResultadoDelPipeline = {
  operationsReport: Paso;
  executiveReport: Paso;
  intelligence: Paso;
  errors: string[];
};

export type MensajeDelPipeline = {
  title: string;
  description: string;
  variant: "success" | "default";
};

/**
 * Qué le dice el botón "Generar reporte ahora" al founder según lo que
 * devolvió `triggerWeeklyPipelineAction`.
 *
 * El aviso de org no activa (SCRUM-210) se muestra siempre que venga, aunque
 * se haya generado algo: si no, el founder no sabría por qué faltan reportes.
 */
export function mensajeDelPipeline(result: ResultadoDelPipeline): MensajeDelPipeline {
  const generated = [
    result.operationsReport === "generated" && "Operaciones",
    result.executiveReport === "generated" && "Reporte ejecutivo",
    result.intelligence === "generated" && "Inteligencia",
  ].filter((x): x is string => Boolean(x));

  if (result.errors.includes(AVISO_ORG_NO_ACTIVA)) {
    return {
      title: "Organización no activa",
      description:
        generated.length > 0
          ? `Listo: ${generated.join(", ")}. ${AVISO_ORG_NO_ACTIVA}`
          : AVISO_ORG_NO_ACTIVA,
      variant: "default",
    };
  }

  if (generated.length > 0) {
    return {
      title: "Reportes generados",
      description: `Listo: ${generated.join(", ")}.`,
      variant: "success",
    };
  }

  if (result.errors.length > 0) {
    return { title: "Generación parcial", description: result.errors[0], variant: "default" };
  }

  return {
    title: "Sin datos suficientes",
    description:
      "Completa al menos 2 inputs semanales y asegúrate de tener actividad en ventas u operaciones.",
    variant: "default",
  };
}
