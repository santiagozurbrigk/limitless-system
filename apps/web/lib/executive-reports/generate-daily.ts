/**
 * lib/executive-reports/generate-daily.ts
 *
 * El **pulso diario**, la tercera cadencia del documento fuente (§06).
 *
 * ⭐ NO es el reporte semanal con otra frecuencia. El documento le da un
 * propósito distinto y una advertencia explícita:
 *
 *   Diario · "Pulse" — spend, leads, CPL, bookings, roturas obvias.
 *   *"Lectura de 5 minutos. No se toman decisiones con un solo día de datos."*
 *
 * De ahí salen las tres diferencias con el semanal, que son deliberadas:
 *
 * 1. **Sin recomendaciones.** Recomendar una acción sobre un día de datos es
 *    justamente lo que el documento desaconseja. El campo se guarda vacío.
 * 2. **Menos ítems y más cortos.** Máximo 3 riesgos y 3 cuellos de botella,
 *    de una línea: es una lectura de cinco minutos.
 * 3. **Ventana de un día** en los estados por departamento, no de siete.
 *
 * Si el pulso diario terminara sugiriendo cambiar la estrategia por un mal
 * martes, sería peor que no tenerlo.
 */

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
import { computeDepartmentStatuses } from "./compute-departments";
import {
  executiveReportAiResponseSchema,
  saveExecutiveReport,
  type ExecutiveReportRecord,
} from "./shared";

/** Etiqueta legible del día, en la zona horaria de reporte. */
export function dailyLabel(date: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

export async function generateDailyExecutiveReport(
  organizationId: string
): Promise<ExecutiveReportRecord | null> {
  const admin = createAdminClient();
  const collected = await collectIntelligenceData(admin, organizationId);

  if (!collected.hasMeaningfulData) {
    console.info(
      `[executive-reports] Org ${organizationId}: sin datos suficientes, omitiendo pulso diario`
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
    `[executive-reports] Org ${organizationId}: generando pulso diario con ${model}`
  );

  const orgContext = await getOrgContext(organizationId);
  const orgContextText = buildOrgContextText(orgContext);
  const dataText = formatCollectedDataForPrompt(collected);

  // Ventana de un día, no de siete: el pulso mira lo que pasó hoy.
  const departments = await computeDepartmentStatuses(admin, organizationId, {
    sinceDays: 1,
    frequentObjections: collected.sales.frequentObjections,
  });

  const system = `Sos el COO de IA de "${orgContext.orgName}". Escribís el PULSO DIARIO para el founder: una lectura de cinco minutos sobre lo que pasó hoy.

QUÉ ES ESTE REPORTE:
- Sirve para detectar roturas obvias: una campaña que se cayó, leads que dejaron de entrar, llamadas que nadie atendió.
- NO sirve para decidir estrategia. Un solo día tiene demasiado ruido.

REGLAS ESTRICTAS:
- Basate ÚNICAMENTE en los datos provistos. NO inventes números ni situaciones.
- Si el día fue normal, decilo en una oración y no infles el reporte. Un día sin novedades es una respuesta válida y útil.
- NO propongas cambios de estrategia, de presupuesto ni de creativos: eso es del reporte semanal.
- Máximo 3 riesgos y 3 cuellos de botella, de una línea cada uno.
- El array "recommendations" va SIEMPRE vacío.
- Español rioplatense, directo.
- Respondé ÚNICAMENTE con JSON válido.`;

  const user = `Generá el pulso de hoy para el founder.

${wrapUntrustedContent("datos_operativos", dataText)}

JSON exacto:
{
  "executiveSummary": "1-2 oraciones sobre cómo viene el día",
  "risks": ["rotura concreta que conviene mirar hoy", "..."],
  "bottlenecks": ["algo trabado hoy", "..."],
  "recommendations": []
}`;

  const raw = await callClaudeJson<unknown>({
    organizationId,
    task: "weekly_report",
    feature: "executive_report_daily",
    cachedSystemPrompt: orgContextText,
    system,
    user,
    // La mitad que el semanal: es una lectura corta por diseño.
    maxTokens: 1000,
  });

  if (!raw) {
    throw new Error("La IA no devolvió respuesta para el pulso diario");
  }

  const parsed = executiveReportAiResponseSchema.safeParse(raw);
  if (!parsed.success) {
    console.error(
      "[executive-reports] Respuesta IA diaria inválida:",
      parsed.error.flatten()
    );
    throw new Error("Respuesta de IA con formato inválido");
  }

  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const label = dailyLabel(now);

  return {
    period: "daily",
    weekLabel: label,
    periodStart: day,
    periodEnd: day,
    title: `Pulso diario — ${label}`,
    executiveSummary: parsed.data.executiveSummary,
    risks: parsed.data.risks.slice(0, 3),
    bottlenecks: parsed.data.bottlenecks.slice(0, 3),
    // Se descarta lo que venga: el pulso no recomienda acciones, por diseño.
    // Dejarlo pasar convertiría el reporte en lo que el documento desaconseja.
    recommendations: [],
    departments,
    generatedAt: now.toISOString(),
  };
}

/**
 * Genera y guarda para una org. Antes de tocar la IA comprueba que la org siga
 * activa (SCRUM-210): una pausada o dada de baja devuelve `"skipped"`. Ese
 * chequeo va fuera del `try` a propósito: si la base falla, el error sube, no
 * se procesa la org y el worker responde 500 para que QStash reintente.
 */
export async function generateAndSaveDailyExecutiveReport(
  organizationId: string
): Promise<"generated" | "skipped" | "failed"> {
  if (!(await organizacionSigueActiva(organizationId))) {
    console.info(`[executive-reports] Org ${organizationId}: no está activa, se omite el pulso diario`);
    return "skipped";
  }

  try {
    const report = await generateDailyExecutiveReport(organizationId);
    if (!report) return "skipped";

    await saveExecutiveReport(createAdminClient(), organizationId, report);
    return "generated";
  } catch (err) {
    console.error(
      `[executive-reports] Error generando pulso diario para org ${organizationId}:`,
      err
    );
    return "failed";
  }
}

export async function generateAllDailyExecutiveReports(): Promise<{
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
    const result = await generateAndSaveDailyExecutiveReport(orgId).catch((err: unknown) => {
      console.error(`[executive-reports] Error comprobando la org ${orgId}:`, err);
      return "failed" as const;
    });
    if (result === "generated") generated += 1;
    else if (result === "skipped") skipped += 1;
    else failed += 1;
  }

  return { orgs: orgIds.length, generated, skipped, failed };
}
