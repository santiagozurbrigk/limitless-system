"use server";

import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { createClient } from "@/lib/supabase/server";
import type { SalesPerformanceMetrics } from "@/types/sales";
import type { ClosingCallStatus } from "@/types/closing";
import { callWasAttended } from "@/lib/closing/call-status";
import {
  FallaDeLaBase,
  mutacionConErroresEsperables,
  type MutationResult,
} from "@/lib/server/action-result";

/*
 * SCRUM-504: las lecturas de métricas de Ventas devuelven sus errores como
 * valor (`MutationResult`). En producción Next no le manda al cliente el
 * mensaje de un error lanzado por una server action, y `/sales/metrics` (un
 * server component) no tiene error boundary. La sesión que falta vuelve con
 * su motivo; un error de la base o cualquier otra excepción se registra, va a
 * Sentry (tag `server_action`) y vuelve con el texto fijo de la interfaz.
 */

// ─── Snapshots de métricas importadas ─────────────────────────────────────────

export type MetricsSnapshot = {
  id: string;
  periodStart: string;    // "YYYY-MM-DD"
  periodLabel: string;    // "Enero 2025"
  metrics: Record<string, number>;
};

export async function getSalesMetricsSnapshotsAction(): Promise<
  MutationResult<MetricsSnapshot[]>
> {
  return mutacionConErroresEsperables("[getSalesMetricsSnapshots]", async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("metrics_snapshots")
      .select("id, period_start, period_label, metrics")
      .eq("organization_id", organizationId)
      .eq("category", "sales")
      .order("period_start", { ascending: false });

    if (error) throw new FallaDeLaBase(error);

    return (data ?? []).map((row) => ({
      id:          row.id,
      periodStart: row.period_start as string,
      periodLabel: (row.period_label as string | null) ?? (row.period_start as string).slice(0, 7),
      metrics:     (row.metrics as Record<string, number>) ?? {},
    }));
  });
}

export type SalesMetricsPeriod = "month" | "30d" | "custom";

export type SalesMetricsDateRange = { from: string; to: string };

function periodBounds(
  period: SalesMetricsPeriod,
  custom?: SalesMetricsDateRange
): SalesMetricsDateRange {
  if (period === "custom" && custom) {
    return custom;
  }
  const to = new Date();
  const from = new Date();
  if (period === "month") {
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
  } else {
    from.setDate(from.getDate() - 30);
    from.setHours(0, 0, 0, 0);
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

const NURTURING_STAGES = new Set([
  "primer_contacto",
  "calificando",
  "manejo_objeciones",
  "propuesta_agendamiento_enviada",
]);

export async function getSalesPerformanceMetricsAction(
  period: SalesMetricsPeriod = "month",
  dateRange?: SalesMetricsDateRange
): Promise<MutationResult<SalesPerformanceMetrics>> {
  return mutacionConErroresEsperables("[getSalesPerformanceMetrics]", () =>
    calcularMetricasDeRendimiento(period, dateRange)
  );
}

async function calcularMetricasDeRendimiento(
  period: SalesMetricsPeriod,
  dateRange: SalesMetricsDateRange | undefined
): Promise<SalesPerformanceMetrics> {
  const organizationId = await requireOrganizationId();
  const supabase = await createClient();
  const { from, to } = periodBounds(period, dateRange);

  const { data: calls, error: callsError } = await supabase
    .from("closing_calls")
    .select("id, status, scheduled_at, outcome")
    .eq("organization_id", organizationId)
    .gte("scheduled_at", from)
    .lte("scheduled_at", to);

  if (callsError) throw new FallaDeLaBase(callsError);

  const { data: conversations, error: convError } = await supabase
    .from("conversations")
    .select("id, status, tag, ai_funnel_stage, last_message_at, created_at")
    .eq("organization_id", organizationId)
    .gte("last_message_at", from)
    .lte("last_message_at", to);

  if (convError) throw new FallaDeLaBase(convError);

  const callRows = calls ?? [];
  const convRows = conversations ?? [];

  const totalAgendas = callRows.length;
  // `attended` cuenta como asistencia: es una llamada que el proveedor confirmó
  // asistida y a la que todavía no se le cargó el resultado. Dejarla afuera
  // subestimaría el denominador de la tasa de cierre.
  const asistencias = callRows.filter((call) =>
    callWasAttended(call.status as ClosingCallStatus)
  ).length;
  const cierres = callRows.filter((call) => call.status === "closed").length;
  const noShows = callRows.filter((call) => call.status === "no_show").length;
  const noCierres = callRows.filter((call) => call.status === "not_closed").length;
  const scheduledFollowUps = callRows.filter(
    (call) => call.status === "scheduled"
  ).length;

  // TODO: agregar estado "seña" al schema si se quiere distinguir depósito parcial
  const senas = callRows.filter((call) => {
    const outcome = call.outcome as { paymentType?: string } | null;
    return outcome?.paymentType === "upfront_fee";
  }).length;

  const leadsThisMonth = convRows.length;
  const agendasThisMonth = convRows.filter(
    (conv) =>
      conv.status === "booked" ||
      conv.tag === "agendado" ||
      conv.ai_funnel_stage === "agendado"
  ).length;

  const nurturingLeads = convRows.filter((conv) => {
    const stage = conv.ai_funnel_stage as string | null;
    return stage ? NURTURING_STAGES.has(stage) : false;
  }).length;

  const lostLeads = convRows.filter((conv) => {
    const stage = conv.ai_funnel_stage as string | null;
    return stage === "perdido_sin_respuesta" || conv.status === "ghosted";
  }).length;

  return {
    period,
    closer: {
      closeRate: asistencias > 0 ? (cierres / asistencias) * 100 : 0,
      showRate: totalAgendas > 0 ? (asistencias / totalAgendas) * 100 : 0,
    },
    leads: {
      leadsCount: leadsThisMonth,
      agendasCount: agendasThisMonth,
      nurturingCount: nurturingLeads,
      lostCount: lostLeads,
    },
    schedules: {
      totalAgendas,
    },
    calls: {
      cierres,
      followUpScheduled: scheduledFollowUps,
      senas: senas > 0 ? senas : null,
      asistencias,
      noShows,
      noCierres,
    },
  };
}
