"use server";

import { revalidatePath } from "next/cache";
import { requireAuthContext } from "@/lib/auth/require-auth";
import { generateAndSaveIntelligenceSnapshot } from "@/lib/intelligence/generate-snapshot";
import { generateAndSaveWeeklyExecutiveReport } from "@/lib/executive-reports/generate-weekly";
import {
  AVISO_ORG_NO_ACTIVA,
  organizacionSigueActiva,
} from "@/lib/intelligence/organizaciones-activas";
import { generateWeeklyReportAction } from "@/app/operations/actions";
import { paths } from "@/routes";

export type PipelineStepResult = "generated" | "skipped" | "failed";

export type WeeklyPipelineResult = {
  operationsReport: PipelineStepResult;
  executiveReport: PipelineStepResult;
  intelligence: PipelineStepResult;
  errors: string[];
};

function revalidateReportSurfaces() {
  revalidatePath(paths.platform.operations.overview);
  revalidatePath(paths.platform.operations.weeklyInputs);
  revalidatePath(paths.platform.dashboard);
  revalidatePath(paths.platform.intelligence.root);
  revalidatePath(paths.founder.root);
  revalidatePath(paths.platform.executiveReports.history);
}

/**
 * Dispara el mismo pipeline que los crons semanales, bajo demanda.
 * Reutiliza generateAndSaveWeeklyExecutiveReport y generateAndSaveIntelligenceSnapshot,
 * más el reporte de Operaciones desde weekly_inputs (generateWeeklyReportAction).
 */
export async function triggerWeeklyPipelineAction(): Promise<WeeklyPipelineResult> {
  const { orgId, role } = await requireAuthContext();

  if (role !== "founder") {
    throw new Error("Solo el fundador puede generar reportes manualmente.");
  }

  const errors: string[] = [];
  let operationsReport: PipelineStepResult = "skipped";
  let executiveReport: PipelineStepResult = "skipped";
  let intelligence: PipelineStepResult = "skipped";

  // Una org pausada o dada de baja no gasta IA a pedido en ningún reporte del
  // botón (SCRUM-210): ni Operaciones, ni el ejecutivo, ni la inteligencia. Se
  // corta aquí y se avisa, para que el founder no vea "Sin datos suficientes".
  // Si la consulta falla, se sigue: cada generador vuelve a consultar y, si la
  // base sigue caída, queda "failed" sin llamar a la IA.
  const orgActiva = await organizacionSigueActiva(orgId).catch(() => true);
  if (!orgActiva) {
    return {
      operationsReport,
      executiveReport,
      intelligence,
      errors: [AVISO_ORG_NO_ACTIVA],
    };
  }

  try {
    await generateWeeklyReportAction();
    operationsReport = "generated";
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error en reporte de operaciones";
    errors.push(msg);
    operationsReport = msg.includes("No hay inputs") ? "skipped" : "failed";
  }

  try {
    const execResult = await generateAndSaveWeeklyExecutiveReport(orgId);
    executiveReport = execResult;
    if (execResult === "failed") {
      errors.push("No se pudo generar el reporte ejecutivo semanal.");
    }
  } catch (err) {
    executiveReport = "failed";
    errors.push(
      err instanceof Error ? err.message : "Error en reporte ejecutivo"
    );
  }

  try {
    const intelResult = await generateAndSaveIntelligenceSnapshot(orgId);
    intelligence = intelResult;
    if (intelResult === "failed") {
      errors.push("No se pudo generar el snapshot de inteligencia.");
    }
  } catch (err) {
    intelligence = "failed";
    errors.push(
      err instanceof Error ? err.message : "Error en inteligencia"
    );
  }

  revalidateReportSurfaces();

  return { operationsReport, executiveReport, intelligence, errors };
}
