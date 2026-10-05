import {
  callClaudeJson,
  getClientForOrg,
  getModelForTask,
} from "@/lib/ai/anthropic";
import { buildOrgContextText, getOrgContext } from "@/lib/ai/org-context";
import { wrapUntrustedContent } from "@/lib/ai/wrap-untrusted-content";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  collectIntelligenceData,
  formatCollectedDataForPrompt,
} from "@/lib/intelligence/collect-context";
import {
  listActiveOrganizationIds,
  organizacionSigueActiva,
} from "@/lib/intelligence/organizaciones-activas";
import {
  getCurrentWeekStart,
  getWeekEndLabel,
  getWeekStartLabel,
} from "@/lib/operations/weekly-utils";
import { computeDepartmentStatuses } from "./compute-departments";
import {
  executiveReportAiResponseSchema,
  saveExecutiveReport,
  type ExecutiveReportRecord,
} from "./shared";

export async function generateWeeklyExecutiveReport(
  organizationId: string
): Promise<ExecutiveReportRecord | null> {
  const admin = createAdminClient();
  const collected = await collectIntelligenceData(admin, organizationId);

  if (!collected.hasMeaningfulData) {
    console.info(
      `[executive-reports] Org ${organizationId}: sin datos suficientes, omitiendo semanal`
    );
    return null;
  }

  const client = await getClientForOrg(organizationId);
  if (!client) {
    console.warn(
      `[executive-reports] Org ${organizationId}: sin API key de Anthropic`
    );
    return null;
  }

  const model = getModelForTask("weekly_report");
  console.info(
    `[executive-reports] Org ${organizationId}: generando reporte semanal con ${model}`
  );

  const orgContext = await getOrgContext(organizationId);
  const orgContextText = buildOrgContextText(orgContext);
  const dataText = formatCollectedDataForPrompt(collected);

  const departments = await computeDepartmentStatuses(admin, organizationId, {
    sinceDays: 7,
    frequentObjections: collected.sales.frequentObjections,
  });

  const system = `Sos el COO de IA de "${orgContext.orgName}". Redactás el reporte ejecutivo SEMANAL para el founder, sobre datos operativos reales de ventas, marketing, operaciones y finanzas.

REGLAS ESTRICTAS:
- Basá el resumen, riesgos, cuellos de botella y recomendaciones ÚNICAMENTE en los datos provistos.
- NO inventes números, porcentajes ni situaciones que no estén respaldados por el contexto.
- Si los datos son escasos en un área, decilo con honestidad en vez de exagerar.
- Escribí en español rioplatense profesional, directo y accionable.
- Respondé ÚNICAMENTE con JSON válido.
- Máximo 4 riesgos, 4 cuellos de botella, 4 recomendaciones.`;

  const user = `Generá el reporte ejecutivo de la semana en curso para el founder.

${wrapUntrustedContent("datos_operativos", dataText)}

JSON exacto:
{
  "executiveSummary": "2-4 oraciones con el estado general de la semana",
  "risks": ["riesgo concreto", "..."],
  "bottlenecks": ["cuello de botella concreto", "..."],
  "recommendations": ["acción recomendada concreta", "..."]
}`;

  const raw = await callClaudeJson<unknown>({
    organizationId,
    task: "weekly_report",
    feature: "executive_report_weekly",
    cachedSystemPrompt: orgContextText,
    system,
    user,
    maxTokens: 2000,
  });

  if (!raw) {
    throw new Error("La IA no devolvió respuesta para el reporte semanal");
  }

  const parsed = executiveReportAiResponseSchema.safeParse(raw);
  if (!parsed.success) {
    console.error(
      "[executive-reports] Respuesta IA semanal inválida:",
      parsed.error.flatten()
    );
    throw new Error("Respuesta de IA con formato inválido");
  }

  const weekStart = getCurrentWeekStart();
  const periodEndDate = new Date(`${weekStart}T12:00:00`);
  periodEndDate.setDate(periodEndDate.getDate() + 6);
  const periodEnd = periodEndDate.toISOString().slice(0, 10);
  const weekLabel = `${getWeekStartLabel(weekStart)} – ${getWeekEndLabel(weekStart)}`;

  return {
    period: "weekly",
    weekLabel,
    periodStart: weekStart,
    periodEnd,
    title: `Reporte ejecutivo semanal — ${weekLabel}`,
    executiveSummary: parsed.data.executiveSummary,
    risks: parsed.data.risks,
    bottlenecks: parsed.data.bottlenecks,
    recommendations: parsed.data.recommendations,
    departments,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Genera y guarda para una org. Antes de tocar la IA comprueba que la org siga
 * activa (SCRUM-210): una pausada o dada de baja devuelve `"skipped"`. Ese
 * chequeo va fuera del `try` a propósito: si la base falla, el error sube, no
 * se procesa la org y el worker responde 500 para que QStash reintente.
 */
export async function generateAndSaveWeeklyExecutiveReport(
  organizationId: string
): Promise<"generated" | "skipped" | "failed"> {
  if (!(await organizacionSigueActiva(organizationId))) {
    console.info(`[executive-reports] Org ${organizationId}: no está activa, se omite el reporte semanal`);
    return "skipped";
  }

  try {
    const report = await generateWeeklyExecutiveReport(organizationId);
    if (!report) return "skipped";

    await saveExecutiveReport(createAdminClient(), organizationId, report);
    return "generated";
  } catch (err) {
    console.error(
      `[executive-reports] Error generando reporte semanal para org ${organizationId}:`,
      err
    );
    return "failed";
  }
}

export async function generateAllWeeklyExecutiveReports(): Promise<{
  orgs: number;
  generated: number;
  skipped: number;
  failed: number;
}> {
  const orgIds = await listActiveOrganizationIds();
  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const orgId of orgIds) {
    // El chequeo de org activa puede lanzar si la base falla: en serie se
    // cuenta como fallida y se sigue con la próxima, como antes.
    const result = await generateAndSaveWeeklyExecutiveReport(orgId).catch((err: unknown) => {
      console.error(`[executive-reports] Error comprobando la org ${orgId}:`, err);
      return "failed" as const;
    });
    if (result === "generated") generated += 1;
    else if (result === "skipped") skipped += 1;
    else failed += 1;
  }

  return { orgs: orgIds.length, generated, skipped, failed };
}
