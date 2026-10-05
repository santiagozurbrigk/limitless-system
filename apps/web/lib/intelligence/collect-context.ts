import type { SupabaseClient } from "@supabase/supabase-js";
import { rowToClient } from "@/lib/clients/mapper";
import { rowToClosingCall, type ClosingCallRow } from "@/lib/closing/mapper";
import {
  rowToFixedExpense,
  rowToSubscription,
  rowToTeamCompensation,
  rowToPaymentPlatform,
  type PaymentPlatformRow,
} from "@/lib/expenses/mapper";
import { computeExpensesSummary } from "@/lib/metrics/compute-expenses-summary";
import { deriveFinanceSummary } from "@/lib/metrics/derive-finance-summary";
import { fechaDeHoyDeLaOrganizacion } from "@/lib/fechas/organizacion";
import type { FrequentObjectionSummary, ObjectionCategory } from "@/types/sales";

const PERIOD_DAYS = 14;
const OBJECTION_CATEGORIES: ObjectionCategory[] = [
  "closing",
  "setting",
  "marketing",
];

export type IntelligenceCollectedData = {
  periodDays: number;
  hasMeaningfulData: boolean;
  sales: {
    frequentObjections: FrequentObjectionSummary[];
    conversationsTotal: number;
    ghostingRate: number;
    hotLeads: number;
    warmLeads: number;
    unansweredActive: number;
    highGhostingRisk: number;
  };
  operations: {
    weeklyInputs: Array<{
      weekStart: string;
      department: string;
      content: string | null;
      rating: number | null;
    }>;
    weeklyReports: Array<{
      weekStart: string;
      executiveSummary: string | null;
      bottlenecks: unknown;
      recommendations: unknown;
    }>;
  };
  marketing: {
    contentCount: number;
    topContent: Array<{
      title: string;
      platform: string;
      views: number;
      bookingsInfluenced: number;
      revenueInfluenced: number;
    }>;
    utmLinksCount: number;
    utmBookings: number;
  };
  finance: {
    activeClients: number;
    facturacion: number;
    margenPercent: number;
    gastosMensuales: number;
    porCobrar: number;
  };
  calls: {
    analysisCount: number;
    avgOverallScore: number | null;
    recentSummaries: string[];
    topImprovements: string[];
  };
};

function periodStartIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function isObjectionCategory(value: string): value is ObjectionCategory {
  return OBJECTION_CATEGORIES.includes(value as ObjectionCategory);
}

async function collectObjections(
  admin: SupabaseClient,
  organizationId: string
): Promise<FrequentObjectionSummary[]> {
  const since = periodStartIso(30);

  const { data: analyses } = await admin
    .from("call_analyses")
    .select("objections, created_at")
    .eq("organization_id", organizationId)
    .gte("created_at", since);

  const byCategory: Partial<
    Record<ObjectionCategory, { count: number; examples: string[] }>
  > = {};

  for (const row of analyses ?? []) {
    const objections =
      (row.objections as Array<{ text?: string; category?: string }> | null) ??
      [];
    for (const obj of objections) {
      if (!obj.category || !isObjectionCategory(obj.category)) continue;
      if (!byCategory[obj.category]) {
        byCategory[obj.category] = { count: 0, examples: [] };
      }
      const bucket = byCategory[obj.category]!;
      bucket.count += 1;
      if (obj.text && bucket.examples.length < 3) {
        bucket.examples.push(obj.text);
      }
    }
  }

  if (Object.keys(byCategory).length > 0) {
    return OBJECTION_CATEGORIES.filter((c) => byCategory[c]).map((category) => ({
      category,
      count: byCategory[category]!.count,
      resolutionRate: 0,
      topExamples: byCategory[category]!.examples,
      trend: "stable" as const,
      trendPct: 0,
    }));
  }

  const { data: conversations } = await admin
    .from("conversations")
    .select("ai_detected_objections")
    .eq("organization_id", organizationId)
    .not("ai_detected_objections", "eq", "[]")
    .gte("created_at", since);

  for (const conv of conversations ?? []) {
    const objections =
      (conv.ai_detected_objections as Array<{
        text?: string;
        category?: string;
      }> | null) ?? [];
    for (const obj of objections) {
      if (!obj.category || !isObjectionCategory(obj.category)) continue;
      if (!byCategory[obj.category]) {
        byCategory[obj.category] = { count: 0, examples: [] };
      }
      const bucket = byCategory[obj.category]!;
      bucket.count += 1;
      if (obj.text && bucket.examples.length < 3) {
        bucket.examples.push(obj.text);
      }
    }
  }

  return OBJECTION_CATEGORIES.filter((c) => byCategory[c]).map((category) => ({
    category,
    count: byCategory[category]!.count,
    resolutionRate: 0,
    topExamples: byCategory[category]!.examples,
    trend: "stable" as const,
    trendPct: 0,
  }));
}

export async function collectIntelligenceData(
  admin: SupabaseClient,
  organizationId: string
): Promise<IntelligenceCollectedData> {
  const since = periodStartIso(PERIOD_DAYS);

  const [
    conversationsRes,
    weeklyInputsRes,
    weeklyReportsRes,
    contentRes,
    utmRes,
    clientsRes,
    fixedExpensesRes,
    subscriptionsRes,
    teamRes,
    platformsRes,
    closingCallsRes,
    callAnalysesRes,
    frequentObjections,
    baselineSnapshotRes,
    hoy,
  ] = await Promise.all([
    admin
      .from("conversations")
      .select(
        "status, ai_label, ai_ghosting_signals, unread, created_at"
      )
      .eq("organization_id", organizationId)
      .gte("created_at", since),
    admin
      .from("weekly_inputs")
      .select("week_start, department, content, rating")
      .eq("organization_id", organizationId)
      .gte("week_start", since.slice(0, 10))
      .order("week_start", { ascending: false })
      .limit(30),
    admin
      .from("weekly_reports")
      .select(
        "week_start, executive_summary, bottlenecks, recommendations, status"
      )
      .eq("organization_id", organizationId)
      .eq("status", "ready")
      .order("week_start", { ascending: false })
      .limit(4),
    admin
      .from("content_assets")
      .select(
        "title, caption, platform, views, bookings_influenced, revenue_influenced, published_at"
      )
      .eq("organization_id", organizationId)
      .order("views", { ascending: false })
      .limit(8),
    admin
      .from("utm_links")
      .select("id, bookings_attributed")
      .eq("organization_id", organizationId),
    admin.from("clients").select("*").eq("organization_id", organizationId),
    admin
      .from("fixed_expenses")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("status", "active"),
    admin
      .from("subscriptions")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("status", "active"),
    admin
      .from("team_compensation")
      .select("*")
      .eq("organization_id", organizationId),
    admin
      .from("payment_platforms")
      .select("*")
      .eq("organization_id", organizationId),
    admin
      .from("closing_calls")
      .select("*")
      .eq("organization_id", organizationId)
      .gte("scheduled_at", since),
    admin
      .from("call_analyses")
      .select("overall_score, summary, improvements, created_at")
      .eq("organization_id", organizationId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(12),
    collectObjections(admin, organizationId),
    admin
      .from("metrics_snapshots")
      .select("metrics")
      .eq("organization_id", organizationId)
      .eq("category", "sales")
      .order("period_start", { ascending: false })
      .limit(1)
      .maybeSingle(),
    fechaDeHoyDeLaOrganizacion(admin, organizationId),
  ]);

  const conversations = conversationsRes.data ?? [];
  const convTotal = conversations.length;
  const ghosted = conversations.filter((c) => c.status === "ghosted").length;
  const highGhosting = conversations.filter((c) => {
    const signals = (c.ai_ghosting_signals as string[] | null) ?? [];
    return signals.length >= 2;
  }).length;

  const clients = (clientsRes.data ?? []).map((row) =>
    rowToClient(row as Parameters<typeof rowToClient>[0])
  );
  const fixedExpenses = (fixedExpensesRes.data ?? []).map((row) =>
    rowToFixedExpense(row as Parameters<typeof rowToFixedExpense>[0])
  );
  const subscriptions = (subscriptionsRes.data ?? []).map((row) =>
    rowToSubscription(row as Parameters<typeof rowToSubscription>[0])
  );
  const teamCompensation = (teamRes.data ?? []).map((row) =>
    rowToTeamCompensation(row as Parameters<typeof rowToTeamCompensation>[0])
  );
  const paymentPlatforms = (platformsRes.data ?? []).map((row) =>
    // Este contexto no usa la última transacción; va el hoy de la organización
    // como en Finanzas, para no inventar otro valor.
    rowToPaymentPlatform(row as PaymentPlatformRow, { totalReceived: 0, lastTransactionAt: hoy })
  );
  const expenses = computeExpensesSummary(
    fixedExpenses,
    subscriptions,
    teamCompensation
  );
  const closingCalls = (closingCallsRes.data ?? []).map((row) =>
    rowToClosingCall(row as ClosingCallRow)
  );
  const periodEnd = new Date().toISOString().slice(0, 10);
  const periodStart = new Date(Date.now() - PERIOD_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const finance = deriveFinanceSummary(
    clients,
    closingCalls,
    expenses,
    paymentPlatforms,
    { preset: "custom", customFrom: periodStart, customTo: periodEnd }
  );

  // Baseline fallback: si no hay datos en vivo, usar métricas históricas importadas
  const baselineMetrics =
    (baselineSnapshotRes.data?.metrics as Record<string, number> | null) ?? null;
  const bFact = baselineMetrics?.["facturacion"] ?? 0;
  const bGastosSnapshot = baselineMetrics?.["gastos"] ?? 0;
  // Preferir gastos configurados en el módulo (finance.gastosTotales) sobre el snapshot
  const effectiveGastos = finance.gastosTotales > 0 ? finance.gastosTotales : bGastosSnapshot;
  const bMargen = bFact > 0 ? ((bFact - effectiveGastos) / bFact) * 100 : 0;
  const effectiveFacturacion = finance.facturacion > 0 ? finance.facturacion : bFact;
  const effectiveMargen = finance.facturacion > 0 ? finance.margenPercent : bMargen;

  const callAnalyses = callAnalysesRes.data ?? [];
  const scores = callAnalyses
    .map((c) => c.overall_score)
    .filter((s): s is number => typeof s === "number");
  const improvementCounts = new Map<string, number>();
  for (const row of callAnalyses) {
    for (const item of (row.improvements as string[] | null) ?? []) {
      if (!item?.trim()) continue;
      improvementCounts.set(item, (improvementCounts.get(item) ?? 0) + 1);
    }
  }
  const topImprovements = [...improvementCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([text]) => text);

  const contentRows = contentRes.data ?? [];
  const utmRows = utmRes.data ?? [];

  const hasMeaningfulData =
    convTotal > 0 ||
    (weeklyInputsRes.data?.length ?? 0) > 0 ||
    (weeklyReportsRes.data?.length ?? 0) > 0 ||
    contentRows.length > 0 ||
    clients.length > 0 ||
    callAnalyses.length > 0 ||
    frequentObjections.length > 0;

  return {
    periodDays: PERIOD_DAYS,
    hasMeaningfulData,
    sales: {
      frequentObjections,
      conversationsTotal: convTotal,
      ghostingRate: convTotal > 0 ? (ghosted / convTotal) * 100 : 0,
      hotLeads: conversations.filter((c) => c.ai_label === "hot").length,
      warmLeads: conversations.filter((c) => c.ai_label === "warm").length,
      unansweredActive: conversations.filter(
        (c) => c.unread && c.status === "active"
      ).length,
      highGhostingRisk: highGhosting,
    },
    operations: {
      weeklyInputs: (weeklyInputsRes.data ?? []).map((row) => ({
        weekStart: String(row.week_start),
        department: String(row.department),
        content: row.content,
        rating: row.rating,
      })),
      weeklyReports: (weeklyReportsRes.data ?? []).map((row) => ({
        weekStart: String(row.week_start),
        executiveSummary: row.executive_summary,
        bottlenecks: row.bottlenecks,
        recommendations: row.recommendations,
      })),
    },
    marketing: {
      contentCount: contentRows.length,
      topContent: contentRows.map((row) => ({
        title:
          (row.title as string)?.trim() ||
          (row.caption as string)?.trim().slice(0, 60) ||
          "Sin título",
        platform: String(row.platform),
        views: Number(row.views ?? 0),
        bookingsInfluenced: Number(row.bookings_influenced ?? 0),
        revenueInfluenced: Number(row.revenue_influenced ?? 0),
      })),
      utmLinksCount: utmRows.length,
      utmBookings: utmRows.reduce(
        (sum, row) => sum + Number(row.bookings_attributed ?? 0),
        0
      ),
    },
    finance: {
      activeClients: clients.filter((c) => c.status === "active").length,
      facturacion: effectiveFacturacion,
      margenPercent: effectiveMargen,
      gastosMensuales: expenses.totalMonthly,
      porCobrar: finance.porCobrar,
    },
    calls: {
      analysisCount: callAnalyses.length,
      avgOverallScore:
        scores.length > 0
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          : null,
      recentSummaries: callAnalyses
        .map((c) => c.summary)
        .filter((s): s is string => Boolean(s?.trim()))
        .slice(0, 5),
      topImprovements,
    },
  };
}

export function formatCollectedDataForPrompt(
  data: IntelligenceCollectedData
): string {
  const sections: string[] = [];

  sections.push(
    `PERÍODO ANALIZADO: últimos ${data.periodDays} días`,
    `VENTAS:
- Conversaciones: ${data.sales.conversationsTotal}
- Tasa de ghosting: ${data.sales.ghostingRate.toFixed(1)}%
- Leads hot/warm: ${data.sales.hotLeads}/${data.sales.warmLeads}
- Activas sin responder: ${data.sales.unansweredActive}
- Riesgo alto de ghosting (señales IA): ${data.sales.highGhostingRisk}
- Objeciones frecuentes: ${
      data.sales.frequentObjections.length
        ? data.sales.frequentObjections
            .map(
              (o) =>
                `[${o.category}] x${o.count}: ${o.topExamples.join("; ") || "sin ejemplos"}`
            )
            .join("\n  ")
        : "sin datos"
    }`
  );

  sections.push(
    `OPERACIONES:
- Inputs semanales recientes: ${data.operations.weeklyInputs.length}
${data.operations.weeklyInputs
  .slice(0, 8)
  .map(
    (i) =>
      `  [${i.weekStart} · ${i.department}] rating=${i.rating ?? "—"} ${(i.content ?? "").slice(0, 200)}`
  )
  .join("\n")}
- Reportes semanales listos: ${data.operations.weeklyReports.length}
${data.operations.weeklyReports
  .map(
    (r) =>
      `  Semana ${r.weekStart}: ${(r.executiveSummary ?? "").slice(0, 300)}`
  )
  .join("\n")}`
  );

  sections.push(
    `MARKETING:
- Piezas de contenido (top por vistas): ${data.marketing.contentCount}
${data.marketing.topContent
  .slice(0, 5)
  .map(
    (c) =>
      `  [${c.platform}] ${c.title}: ${c.views} vistas, ${c.bookingsInfluenced} bookings, $${c.revenueInfluenced} influenciados`
  )
  .join("\n")}
- Links UTM: ${data.marketing.utmLinksCount}, bookings atribuidos: ${data.marketing.utmBookings}`
  );

  sections.push(
    `FINANZAS (últimos ${data.periodDays}d):
- Clientes activos: ${data.finance.activeClients}
- Facturación período: $${Math.round(data.finance.facturacion)}
- Margen neto: ${data.finance.margenPercent.toFixed(1)}%
- Gastos mensuales config: $${Math.round(data.finance.gastosMensuales)}
- Por cobrar: $${Math.round(data.finance.porCobrar)}`
  );

  sections.push(
    `LLAMADAS (Fathom / análisis profundo):
- Análisis en período: ${data.calls.analysisCount}
- Score promedio: ${data.calls.avgOverallScore ?? "N/A"}
- Mejoras recurrentes: ${data.calls.topImprovements.join("; ") || "ninguna"}
- Resúmenes recientes:
${data.calls.recentSummaries.map((s) => `  · ${s.slice(0, 220)}`).join("\n") || "  (ninguno)"}`
  );

  return sections.join("\n\n");
}
