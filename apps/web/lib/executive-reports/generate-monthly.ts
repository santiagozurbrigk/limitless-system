import {
  callClaudeJson,
  getClientForOrg,
  getModelForTask,
} from "@/lib/ai/anthropic";
import { buildOrgContextText, getOrgContext } from "@/lib/ai/org-context";
import { wrapUntrustedContent } from "@/lib/ai/wrap-untrusted-content";
import { createAdminClient } from "@/lib/supabase/admin";
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

type WeeklyReportRow = {
  week_label: string;
  period_start: string;
  executive_summary: string;
  risks: unknown;
  bottlenecks: unknown;
  recommendations: unknown;
};

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((v) => String(v)) : [];
}

function fechaIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Primer y último día (YYYY-MM-DD) y nombre del mes de `date`. Las fechas se
 * arman con el día del calendario y no con `toISOString()`, que en una zona
 * al este de UTC las corría al día anterior.
 */
export function monthBounds(date: Date): {
  start: string;
  end: string;
  label: string;
} {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const label = start.toLocaleDateString("es", {
    month: "long",
    year: "numeric",
  });
  return {
    start: fechaIso(start),
    end: fechaIso(end),
    label: label.charAt(0).toUpperCase() + label.slice(1),
  };
}

/**
 * [REPORTES-MENSUAL-MES-EQUIVOCADO] (SCRUM-67): el cron mensual corre el día 1
 * (`0 13 1 * *`), así que el mes a reportar es el que acaba de terminar, no el
 * que empieza ese día. Antes usaba el mes en curso: casi nunca había semanales
 * y se salteaba en silencio, o se titulaba con el mes nuevo.
 */
export function mesAReportar(ahora: Date = new Date()): ReturnType<typeof monthBounds> {
  // El día 0 del mes en curso es el último día del mes anterior.
  return monthBounds(new Date(ahora.getFullYear(), ahora.getMonth(), 0));
}

function formatWeeklyReportsForPrompt(rows: WeeklyReportRow[]): string {
  return rows
    .map((row, index) => {
      const risks = toStringArray(row.risks);
      const bottlenecks = toStringArray(row.bottlenecks);
      const recommendations = toStringArray(row.recommendations);
      return `SEMANA ${index + 1} (${row.week_label}):
- Resumen: ${row.executive_summary}
- Riesgos: ${risks.join("; ") || "ninguno"}
- Cuellos de botella: ${bottlenecks.join("; ") || "ninguno"}
- Recomendaciones: ${recommendations.join("; ") || "ninguna"}`;
    })
    .join("\n\n");
}

export async function generateMonthlyExecutiveReport(
  organizationId: string
): Promise<ExecutiveReportRecord | null> {
  const admin = createAdminClient();
  const { start, end, label } = mesAReportar();

  const { data: weeklyRows } = await admin
    .from("executive_reports")
    .select(
      "week_label, period_start, executive_summary, risks, bottlenecks, recommendations"
    )
    .eq("organization_id", organizationId)
    .eq("period", "weekly")
    .gte("period_start", start)
    .lte("period_start", end)
    .order("period_start", { ascending: true });

  const weeklies = (weeklyRows ?? []) as WeeklyReportRow[];

  if (weeklies.length === 0) {
    console.info(
      `[executive-reports] Org ${organizationId}: sin reportes semanales en ${label}, omitiendo mensual`
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
    `[executive-reports] Org ${organizationId}: generando reporte mensual (${label}) con ${model}`
  );

  const orgContext = await getOrgContext(organizationId);
  const orgContextText = buildOrgContextText(orgContext);
  const weeklyText = formatWeeklyReportsForPrompt(weeklies);

  // El estado de cada área sale de las cargas semanales del mes reportado, no
  // de los últimos días: así da lo mismo si el cron corre el 1 o se dispara a
  // mano más tarde (SCRUM-67).
  const departments = await computeDepartmentStatuses(admin, organizationId, {
    desde: start,
    hasta: end,
  });

  const system = `Sos el COO de IA de "${orgContext.orgName}". Redactás el reporte ejecutivo MENSUAL para el founder, analizando la EVOLUCIÓN del negocio a lo largo del mes.

REGLAS ESTRICTAS:
- Te paso los ${weeklies.length} reportes semanales reales del mes. Tu trabajo NO es repetirlos, sino identificar la TENDENCIA: qué mejoró, qué empeoró y qué se mantuvo a lo largo de las semanas.
- El resumen ejecutivo debe hablar explícitamente de la evolución mes a mes, no de una sola semana.
- Basá todo ÚNICAMENTE en los reportes provistos. NO inventes datos.
- Escribí en español rioplatense profesional, directo y accionable.
- Respondé ÚNICAMENTE con JSON válido.
- Máximo 4 riesgos, 4 cuellos de botella, 4 recomendaciones.`;

  const user = `Analizá la tendencia del mes (${label}) a partir de los reportes semanales reales y generá el reporte ejecutivo mensual.

${wrapUntrustedContent("reportes_semanales", weeklyText)}

JSON exacto:
{
  "executiveSummary": "3-5 oraciones sobre la TENDENCIA del mes: qué mejoró, qué empeoró, qué se mantuvo",
  "risks": ["riesgo persistente o creciente del mes", "..."],
  "bottlenecks": ["cuello de botella recurrente del mes", "..."],
  "recommendations": ["acción recomendada para el próximo mes", "..."]
}`;

  const raw = await callClaudeJson<unknown>({
    organizationId,
    task: "weekly_report",
    feature: "executive_report_monthly",
    cachedSystemPrompt: orgContextText,
    system,
    user,
    maxTokens: 2000,
  });

  if (!raw) {
    throw new Error("La IA no devolvió respuesta para el reporte mensual");
  }

  const parsed = executiveReportAiResponseSchema.safeParse(raw);
  if (!parsed.success) {
    console.error(
      "[executive-reports] Respuesta IA mensual inválida:",
      parsed.error.flatten()
    );
    throw new Error("Respuesta de IA con formato inválido");
  }

  return {
    period: "monthly",
    weekLabel: label,
    periodStart: start,
    periodEnd: end,
    title: `Reporte ejecutivo mensual — ${label}`,
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
export async function generateAndSaveMonthlyExecutiveReport(
  organizationId: string
): Promise<"generated" | "skipped" | "failed"> {
  if (!(await organizacionSigueActiva(organizationId))) {
    console.info(`[executive-reports] Org ${organizationId}: no está activa, se omite el reporte mensual`);
    return "skipped";
  }

  try {
    const report = await generateMonthlyExecutiveReport(organizationId);
    if (!report) return "skipped";

    await saveExecutiveReport(createAdminClient(), organizationId, report);
    return "generated";
  } catch (err) {
    console.error(
      `[executive-reports] Error generando reporte mensual para org ${organizationId}:`,
      err
    );
    return "failed";
  }
}

export async function generateAllMonthlyExecutiveReports(): Promise<{
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
    const result = await generateAndSaveMonthlyExecutiveReport(orgId).catch((err: unknown) => {
      console.error(`[executive-reports] Error comprobando la org ${orgId}:`, err);
      return "failed" as const;
    });
    if (result === "generated") generated += 1;
    else if (result === "skipped") skipped += 1;
    else failed += 1;
  }

  return { orgs: orgIds.length, generated, skipped, failed };
}
