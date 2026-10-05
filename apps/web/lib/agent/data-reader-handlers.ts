/**
 * Handlers for data reader agent tools.
 * Each handler queries Supabase directly for efficiency and returns
 * an AI-optimized summary (not raw rows).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { fechaDeHoyDeLaOrganizacion } from "@/lib/fechas/organizacion";
import { getCurrentWeekStart } from "@/lib/operations/weekly-utils";
import {
  SIN_METRICAS,
  engagementDe,
  resumirEngagement,
  tieneMetricas,
} from "@/lib/marketing/metricas-medidas";

/*
 * Nombres de columna reales (ver supabase/migrations). Las consultas de este
 * archivo pedían columnas que no existen —`paid_at`, `call_summary`,
 * `weaknesses`, `main_objection`, `base_salary`, `snapshot_date`…— y PostgREST
 * respondía 42703: las herramientas del agente devolvían vacío o error. Se
 * usan alias (`paid_at:payment_date`) para no tocar el resto del código.
 */

function firstObjection(objections: unknown): string | null {
  if (!Array.isArray(objections) || objections.length === 0) return null;
  const first = objections[0] as Record<string, unknown> | string;
  if (typeof first === "string") return first;
  const text = first?.objection ?? first?.text ?? first?.label;
  return typeof text === "string" ? text : null;
}

function summarizeInsights(insights: unknown): string | null {
  if (!Array.isArray(insights) || insights.length === 0) return null;
  return insights
    .map((i) => (i && typeof i === "object" ? (i as { title?: unknown }).title : null))
    .filter((t): t is string => typeof t === "string")
    .join(" · ")
    .slice(0, 500) || null;
}


type HandlerContext = {
  organizationId: string;
  supabase: SupabaseClient;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function periodStart(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function fmt(n: number): string {
  return n.toLocaleString("es-AR");
}

function fmtMoney(n: number): string {
  return `$${n.toLocaleString("es-AR")}`;
}

function notConfigured(module: string): string {
  return JSON.stringify({
    success: false,
    error: `Supabase no configurado — datos de ${module} no disponibles`,
  });
}

// ─── get_business_snapshot ────────────────────────────────────────────────────

export async function handleGetBusinessSnapshot(
  { organizationId, supabase }: HandlerContext,
  toolInput: Record<string, unknown>
): Promise<string> {
  if (!isSupabaseConfigured()) return notConfigured("business_snapshot");

  const days = Math.min(Math.max(Number(toolInput.period_days ?? 30), 1), 365);
  const since = periodStart(days);

  try {
    const [clientsRes, paymentsRes, callsRes, contentRes, lmsRes, leadsRes] =
      await Promise.all([
        supabase
          .from("clients")
          .select("id, status, total_amount, created_at")
          .eq("organization_id", organizationId),
        supabase
          .from("client_payments")
          .select("amount, paid_at:payment_date")
          .eq("organization_id", organizationId)
          .gte("payment_date", since),
        supabase
          .from("call_analyses")
          .select("sold, booked, overall_score, call_date, closer_name")
          .eq("organization_id", organizationId)
          .gte("call_date", since),
        supabase
          .from("content_pieces")
          .select("id, metrics")
          .eq("organization_id", organizationId)
          .gte("created_at", since),
        supabase
          .from("lead_magnets")
          .select("id, name, status")
          .eq("organization_id", organizationId)
          .neq("status", "archived"),
        supabase
          .from("lead_magnet_leads")
          .select("lead_magnet_id, attributed_client_id")
          .eq("organization_id", organizationId)
          .gte("captured_at", since),
      ]);

    // Clientes
    const clients = clientsRes.data ?? [];
    const activeClients = clients.filter((c) => c.status === "active").length;
    const newClientsThisPeriod = clients.filter(
      (c) => c.created_at >= since
    ).length;
    const totalClientRevenue = clients.reduce(
      (sum, c) => sum + (c.total_amount ?? 0),
      0
    );

    // Ingresos del período
    const payments = paymentsRes.data ?? [];
    const periodRevenue = payments.reduce(
      (sum, p) => sum + (p.amount ?? 0),
      0
    );

    // Ventas/Cierre
    const calls = callsRes.data ?? [];
    const totalCalls = calls.length;
    const soldCalls = calls.filter((c) => c.sold).length;
    const bookedCalls = calls.filter((c) => c.booked).length;
    const closingRate =
      totalCalls > 0 ? Math.round((soldCalls / totalCalls) * 100) : 0;
    const avgScore =
      calls.length > 0
        ? Math.round(
            calls.reduce((s, c) => s + (c.overall_score ?? 0), 0) / calls.length
          )
        : null;

    // Contenido: el engagement sale sólo de las piezas medidas (SCRUM-172).
    const contentPieces = contentRes.data ?? [];
    const engagement = resumirEngagement(contentPieces);

    // Lead Magnets
    const lms = lmsRes.data ?? [];
    const leads = leadsRes.data ?? [];
    const attributedLeads = leads.filter((l) => l.attributed_client_id).length;
    const lmConvRate =
      leads.length > 0
        ? Math.round((attributedLeads / leads.length) * 100)
        : 0;

    return JSON.stringify({
      success: true,
      period_days: days,
      clientes: {
        total: clients.length,
        activos: activeClients,
        nuevos_en_periodo: newClientsThisPeriod,
        revenue_acumulado: fmtMoney(totalClientRevenue),
      },
      ingresos_periodo: {
        pagos_cobrados: payments.length,
        revenue: fmtMoney(periodRevenue),
      },
      ventas_cierre: {
        llamadas_en_periodo: totalCalls,
        llamadas_vendidas: soldCalls,
        tasa_cierre: `${closingRate}%`,
        llamadas_agendadas: bookedCalls,
        score_promedio_fathom: avgScore ?? "sin datos",
      },
      marketing: {
        piezas_de_contenido_periodo: contentPieces.length,
        engagement_total:
          engagement.conMetricas > 0 ? fmt(engagement.total) : SIN_METRICAS,
        piezas_sin_metricas: engagement.sinMetricas,
      },
      lead_magnets: {
        activos: lms.filter((l) => l.status === "active").length,
        leads_periodo: leads.length,
        leads_convertidos: attributedLeads,
        tasa_conversion: `${lmConvRate}%`,
      },
    });
  } catch (err) {
    return JSON.stringify({
      success: false,
      error: err instanceof Error ? err.message : "Error obteniendo snapshot",
    });
  }
}

// ─── get_clients_data ─────────────────────────────────────────────────────────

export async function handleGetClientsData(
  { organizationId, supabase }: HandlerContext,
  toolInput: Record<string, unknown>
): Promise<string> {
  if (!isSupabaseConfigured()) return notConfigured("clientes");

  const statusFilter = String(toolInput.status_filter ?? "all");
  const limit = Math.min(Math.max(Number(toolInput.limit ?? 20), 1), 50);

  try {
    let query = supabase
      .from("clients")
      .select("id, name, status, total_amount, created_at, notes")
      .eq("organization_id", organizationId)
      .order("total_amount", { ascending: false })
      .limit(limit);

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    const { data: clients, error } = await query;
    if (error) throw new Error(error.message);

    const all = clients ?? [];

    // Stats por estado
    const byStatus: Record<string, number> = {};
    for (const c of all) {
      byStatus[c.status ?? "unknown"] = (byStatus[c.status ?? "unknown"] ?? 0) + 1;
    }

    // Top 5 por revenue
    const top5 = all.slice(0, 5).map((c) => ({
      nombre: c.name,
      estado: c.status,
      revenue: fmtMoney(c.total_amount ?? 0),
    }));

    // Revenue stats
    const revenues = all.map((c) => c.total_amount ?? 0).filter((r) => r > 0);
    const avgRevenue =
      revenues.length > 0
        ? Math.round(revenues.reduce((a, b) => a + b, 0) / revenues.length)
        : 0;
    const totalRevenue = revenues.reduce((a, b) => a + b, 0);

    // Últimos 5 incorporados
    const recent = [...all]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 5)
      .map((c) => ({
        nombre: c.name,
        estado: c.status,
        fecha: c.created_at.slice(0, 10),
      }));

    return JSON.stringify({
      success: true,
      total_mostrados: all.length,
      distribucion_por_estado: byStatus,
      revenue_acumulado_total: fmtMoney(totalRevenue),
      ticket_promedio: fmtMoney(avgRevenue),
      top_clientes_por_revenue: top5,
      ultimos_clientes: recent,
    });
  } catch (err) {
    return JSON.stringify({
      success: false,
      error: err instanceof Error ? err.message : "Error obteniendo clientes",
    });
  }
}

// ─── get_sales_metrics ────────────────────────────────────────────────────────

export async function handleGetSalesMetrics(
  { organizationId, supabase }: HandlerContext,
  toolInput: Record<string, unknown>
): Promise<string> {
  if (!isSupabaseConfigured()) return notConfigured("ventas");

  const days = Math.min(Math.max(Number(toolInput.period_days ?? 30), 1), 365);
  const since = periodStart(days);

  try {
    const [callsRes, paymentsRes] = await Promise.all([
      supabase
        .from("call_analyses")
        .select(
          "closer_id, closer_name, overall_score, booked, sold, call_date, strengths, weaknesses:improvements, call_summary:summary"
        )
        .eq("organization_id", organizationId)
        .gte("call_date", since)
        .order("call_date", { ascending: false }),
      supabase
        .from("client_payments")
        .select("amount, paid_at:payment_date")
        .eq("organization_id", organizationId)
        .gte("payment_date", since),
    ]);

    const calls = callsRes.data ?? [];
    const payments = paymentsRes.data ?? [];

    if (calls.length === 0) {
      return JSON.stringify({
        success: true,
        periodo_dias: days,
        mensaje: "No hay llamadas registradas en este período.",
        sugerencia:
          "Integrá Fathom en /integrations para que las llamadas se analicen automáticamente.",
      });
    }

    // Métricas globales
    const soldCount = calls.filter((c) => c.sold).length;
    const bookedCount = calls.filter((c) => c.booked).length;
    const closingRate = Math.round((soldCount / calls.length) * 100);
    const bookingRate = Math.round((bookedCount / calls.length) * 100);

    // Revenue período
    const periodRevenue = payments.reduce((s, p) => s + (p.amount ?? 0), 0);
    const avgTicket =
      soldCount > 0 ? Math.round(periodRevenue / soldCount) : 0;

    // Score promedio
    const scoresWithValue = calls.filter((c) => c.overall_score != null);
    const avgScore =
      scoresWithValue.length > 0
        ? Math.round(
            scoresWithValue.reduce((s, c) => s + (c.overall_score ?? 0), 0) /
              scoresWithValue.length
          )
        : null;

    // Ranking por closer
    const byCloser: Record<
      string,
      { name: string; calls: number; sold: number; scores: number[] }
    > = {};
    for (const c of calls) {
      const key = c.closer_id ?? c.closer_name ?? "sin_nombre";
      if (!byCloser[key]) {
        byCloser[key] = {
          name: c.closer_name ?? "Sin nombre",
          calls: 0,
          sold: 0,
          scores: [],
        };
      }
      byCloser[key].calls += 1;
      if (c.sold) byCloser[key].sold += 1;
      if (c.overall_score != null) byCloser[key].scores.push(c.overall_score);
    }

    const ranking = Object.values(byCloser)
      .map((closer) => ({
        nombre: closer.name,
        llamadas: closer.calls,
        cierres: closer.sold,
        tasa_cierre: `${Math.round((closer.sold / closer.calls) * 100)}%`,
        score_promedio:
          closer.scores.length > 0
            ? Math.round(
                closer.scores.reduce((a, b) => a + b, 0) / closer.scores.length
              )
            : null,
      }))
      .sort((a, b) => b.cierres - a.cierres);

    return JSON.stringify({
      success: true,
      periodo_dias: days,
      resumen: {
        total_llamadas: calls.length,
        cierres: soldCount,
        tasa_cierre: `${closingRate}%`,
        agendamientos: bookedCount,
        tasa_agendamiento: `${bookingRate}%`,
        revenue_periodo: fmtMoney(periodRevenue),
        ticket_promedio_estimado: fmtMoney(avgTicket),
        score_promedio_fathom: avgScore ?? "sin datos Fathom",
      },
      ranking_closers: ranking,
    });
  } catch (err) {
    return JSON.stringify({
      success: false,
      error:
        err instanceof Error ? err.message : "Error obteniendo métricas de ventas",
    });
  }
}

// ─── get_closing_calls ────────────────────────────────────────────────────────

export async function handleGetClosingCalls(
  { organizationId, supabase }: HandlerContext,
  toolInput: Record<string, unknown>
): Promise<string> {
  if (!isSupabaseConfigured()) return notConfigured("llamadas");

  const limit = Math.min(Math.max(Number(toolInput.limit ?? 10), 1), 30);
  const resultFilter = String(toolInput.result_filter ?? "all");

  try {
    let query = supabase
      .from("call_analyses")
      .select(
        "id, closer_name, call_date, sold, booked, overall_score, call_summary:summary, strengths, weaknesses:improvements, objections"
      )
      .eq("organization_id", organizationId)
      .order("call_date", { ascending: false })
      .limit(limit);

    if (resultFilter === "won") query = query.eq("sold", true);
    else if (resultFilter === "lost")
      query = query.eq("sold", false).eq("booked", false);
    else if (resultFilter === "pending")
      query = query.eq("sold", false).eq("booked", true);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const calls = data ?? [];
    if (calls.length === 0) {
      return JSON.stringify({
        success: true,
        llamadas: [],
        mensaje: "No hay llamadas con esos filtros en el sistema.",
        sugerencia:
          "Integrá Fathom en /integrations para que las llamadas de cierre se analicen automáticamente.",
      });
    }

    return JSON.stringify({
      success: true,
      total: calls.length,
      llamadas: calls.map((c) => ({
        fecha: c.call_date?.slice(0, 10) ?? "sin fecha",
        closer: c.closer_name ?? "Desconocido",
        resultado: c.sold ? "GANADA" : c.booked ? "AGENDADO" : "PERDIDA",
        score_fathom: c.overall_score ?? "sin análisis",
        resumen:
          typeof c.call_summary === "string" && c.call_summary
            ? c.call_summary.slice(0, 300)
            : null,
        fortalezas:
          Array.isArray(c.strengths) ? (c.strengths as string[]).slice(0, 3) : [],
        debilidades:
          Array.isArray(c.weaknesses) ? (c.weaknesses as string[]).slice(0, 3) : [],
        objecion_principal: firstObjection(c.objections),
      })),
    });
  } catch (err) {
    return JSON.stringify({
      success: false,
      error: err instanceof Error ? err.message : "Error obteniendo llamadas",
    });
  }
}

// ─── get_finance_summary ──────────────────────────────────────────────────────

export async function handleGetFinanceSummary(
  { organizationId, supabase }: HandlerContext,
  toolInput: Record<string, unknown>
): Promise<string> {
  if (!isSupabaseConfigured()) return notConfigured("finanzas");

  const days = Math.min(Math.max(Number(toolInput.period_days ?? 30), 1), 365);
  const since = periodStart(days);

  try {
    const [paymentsRes, fixedRes, subsRes, teamRes] = await Promise.all([
      supabase
        .from("client_payments")
        .select("amount, paid_at:payment_date, client_id")
        .eq("organization_id", organizationId)
        .gte("payment_date", since),
      supabase
        .from("fixed_expenses")
        .select("name, amount, frequency")
        .eq("organization_id", organizationId),
      supabase
        .from("subscriptions")
        .select("name, amount, billing_cycle")
        .eq("organization_id", organizationId)
        .eq("status", "active"),
      supabase
        .from("team_compensation")
        .select("member_name, base_salary:fixed_amount, commission_rate:commission_percentage")
        .eq("organization_id", organizationId),
    ]);

    // Ingresos
    const payments = paymentsRes.data ?? [];
    const totalIncome = payments.reduce((s, p) => s + (p.amount ?? 0), 0);
    const uniqueClients = new Set(payments.map((p) => p.client_id)).size;

    // Gastos fijos mensuales (normalizado a mensual)
    const fixed = fixedRes.data ?? [];
    const monthlyFixed = fixed.reduce((s, e) => {
      const amt = e.amount ?? 0;
      if (e.frequency === "annual") return s + amt / 12;
      return s + amt; // asume mensual por defecto
    }, 0);

    // Suscripciones mensuales
    const subs = subsRes.data ?? [];
    const monthlySubs = subs.reduce((s, sub) => {
      const amt = sub.amount ?? 0;
      if (sub.billing_cycle === "annual") return s + amt / 12;
      return s + amt;
    }, 0);

    // Compensación equipo (mensual)
    const team = teamRes.data ?? [];
    const monthlyTeam = team.reduce(
      (s, m) => s + (m.base_salary ?? 0),
      0
    );

    const totalMonthlyExpenses = monthlyFixed + monthlySubs + monthlyTeam;

    // Resultado estimado del período (normalizando gastos al período)
    const periodExpenses = totalMonthlyExpenses * (days / 30);
    const estimatedNet = totalIncome - periodExpenses;

    return JSON.stringify({
      success: true,
      periodo_dias: days,
      ingresos: {
        total_cobrado: fmtMoney(totalIncome),
        cantidad_pagos: payments.length,
        clientes_pagaron: uniqueClients,
        promedio_por_pago:
          payments.length > 0
            ? fmtMoney(Math.round(totalIncome / payments.length))
            : "$0",
      },
      gastos_mensuales_configurados: {
        gastos_fijos: fmtMoney(Math.round(monthlyFixed)),
        suscripciones: fmtMoney(Math.round(monthlySubs)),
        equipo: fmtMoney(Math.round(monthlyTeam)),
        total_mensual: fmtMoney(Math.round(totalMonthlyExpenses)),
      },
      resultado_estimado_periodo: {
        ingresos: fmtMoney(totalIncome),
        gastos_estimados: fmtMoney(Math.round(periodExpenses)),
        neto_estimado: fmtMoney(Math.round(estimatedNet)),
        nota: "El resultado neto es una estimación basada en los gastos mensuales configurados.",
      },
      desglose_gastos_fijos: fixed.slice(0, 10).map((e) => ({
        nombre: e.name,
        monto: fmtMoney(e.amount ?? 0),
        frecuencia: e.frequency,
      })),
      miembros_equipo: team.map((m) => ({
        nombre: m.member_name,
        salario_base: fmtMoney(m.base_salary ?? 0),
      })),
    });
  } catch (err) {
    return JSON.stringify({
      success: false,
      error: err instanceof Error ? err.message : "Error obteniendo finanzas",
    });
  }
}

// ─── get_marketing_overview ───────────────────────────────────────────────────

export async function handleGetMarketingOverview(
  { organizationId, supabase }: HandlerContext,
  toolInput: Record<string, unknown>
): Promise<string> {
  if (!isSupabaseConfigured()) return notConfigured("marketing");

  const days = Math.min(Math.max(Number(toolInput.period_days ?? 30), 1), 365);
  const since = periodStart(days);

  try {
    const [contentRes, lmsRes, leadsRes] = await Promise.all([
      supabase
        .from("content_pieces")
        .select(
          "id, title, type, source, metrics, status, created_at, platform_post_url"
        )
        .eq("organization_id", organizationId)
        .gte("created_at", since)
        .neq("status", "archived")
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("lead_magnets")
        .select("id, name, type, channel, status")
        .eq("organization_id", organizationId)
        .neq("status", "archived"),
      supabase
        .from("lead_magnet_leads")
        .select("lead_magnet_id, attributed_client_id, captured_at")
        .eq("organization_id", organizationId)
        .gte("captured_at", since),
    ]);

    const content = contentRes.data ?? [];
    const lms = lmsRes.data ?? [];
    const leads = leadsRes.data ?? [];

    // Métricas de contenido: el top y los promedios salen sólo de las piezas
    // medidas; una pieza sin métricas no es un cero (SCRUM-172).
    const engagement = resumirEngagement(content);
    const piezasMedidas = content
      .flatMap((p) => (tieneMetricas(p.metrics) ? [{ pieza: p, m: p.metrics }] : []))
      .map(({ pieza, m }) => ({
        titulo: pieza.title ?? "(sin título)",
        tipo: pieza.type,
        engagement: engagementDe(m),
        likes: m.likes ?? 0,
        comentarios: m.comments ?? 0,
        alcance: m.reach ?? 0,
        url: pieza.platform_post_url ?? null,
      }))
      .sort((a, b) => b.engagement - a.engagement);
    const piezasSinMedir = content
      .filter((p) => !tieneMetricas(p.metrics))
      .map((p) => ({
        titulo: p.title ?? "(sin título)",
        tipo: p.type,
        metricas: SIN_METRICAS,
        url: p.platform_post_url ?? null,
      }));
    const topContent = [...piezasMedidas, ...piezasSinMedir].slice(0, 5);

    // Lead magnets
    const leadsByLm: Record<string, number> = {};
    const convertedByLm: Record<string, number> = {};
    for (const lead of leads) {
      const lmId = lead.lead_magnet_id;
      leadsByLm[lmId] = (leadsByLm[lmId] ?? 0) + 1;
      if (lead.attributed_client_id) {
        convertedByLm[lmId] = (convertedByLm[lmId] ?? 0) + 1;
      }
    }

    const lmStats = lms.map((lm) => {
      const totalLeads = leadsByLm[lm.id] ?? 0;
      const converted = convertedByLm[lm.id] ?? 0;
      return {
        nombre: lm.name,
        tipo: lm.type,
        canal: lm.channel,
        estado: lm.status,
        leads_periodo: totalLeads,
        convertidos: converted,
        tasa_conversion:
          totalLeads > 0 ? `${Math.round((converted / totalLeads) * 100)}%` : "0%",
      };
    });

    return JSON.stringify({
      success: true,
      periodo_dias: days,
      contenido: {
        piezas_en_periodo: content.length,
        piezas_con_metricas: engagement.conMetricas,
        piezas_sin_metricas: engagement.sinMetricas,
        engagement_total:
          engagement.conMetricas > 0 ? fmt(engagement.total) : SIN_METRICAS,
        engagement_promedio:
          engagement.promedio !== null ? fmt(engagement.promedio) : SIN_METRICAS,
        top_5_piezas: topContent,
      },
      lead_magnets: {
        total_activos: lms.filter((l) => l.status === "active").length,
        leads_en_periodo: leads.length,
        leads_convertidos: leads.filter((l) => l.attributed_client_id).length,
        detalle_por_lm: lmStats,
      },
    });
  } catch (err) {
    return JSON.stringify({
      success: false,
      error:
        err instanceof Error ? err.message : "Error obteniendo overview de marketing",
    });
  }
}

// ─── get_lead_magnets_data ────────────────────────────────────────────────────

export async function handleGetLeadMagnetsData(
  { organizationId, supabase }: HandlerContext
): Promise<string> {
  if (!isSupabaseConfigured()) return notConfigured("lead_magnets");

  try {
    const [lmsRes, leadsRes] = await Promise.all([
      supabase
        .from("lead_magnets")
        .select("id, name, type, channel, status, created_at, asset_url")
        .eq("organization_id", organizationId)
        .neq("status", "archived")
        .order("created_at", { ascending: false }),
      supabase
        .from("lead_magnet_leads")
        .select("lead_magnet_id, attributed_client_id, captured_at, name, email")
        .eq("organization_id", organizationId),
    ]);

    const lms = lmsRes.data ?? [];
    const leads = leadsRes.data ?? [];

    if (lms.length === 0) {
      return JSON.stringify({
        success: true,
        mensaje:
          "No hay lead magnets configurados. Creá el primero en /marketing/lead-magnets.",
        lead_magnets: [],
      });
    }

    // Agrupar leads por LM
    const byLm: Record<
      string,
      { total: number; converted: number; lastCapture: string | null }
    > = {};
    for (const lead of leads) {
      const lmId = lead.lead_magnet_id;
      if (!byLm[lmId]) byLm[lmId] = { total: 0, converted: 0, lastCapture: null };
      byLm[lmId].total += 1;
      if (lead.attributed_client_id) byLm[lmId].converted += 1;
      if (
        !byLm[lmId].lastCapture ||
        lead.captured_at > byLm[lmId].lastCapture!
      ) {
        byLm[lmId].lastCapture = lead.captured_at;
      }
    }

    const totalLeads = leads.length;
    const totalConverted = leads.filter((l) => l.attributed_client_id).length;

    return JSON.stringify({
      success: true,
      resumen: {
        total_lms: lms.length,
        total_leads: totalLeads,
        total_convertidos: totalConverted,
        tasa_conversion_global:
          totalLeads > 0
            ? `${Math.round((totalConverted / totalLeads) * 100)}%`
            : "0%",
      },
      lead_magnets: lms.map((lm) => {
        const stats = byLm[lm.id] ?? { total: 0, converted: 0, lastCapture: null };
        return {
          id: lm.id,
          nombre: lm.name,
          tipo: lm.type,
          canal: lm.channel,
          estado: lm.status,
          leads: stats.total,
          convertidos: stats.converted,
          tasa_conversion:
            stats.total > 0
              ? `${Math.round((stats.converted / stats.total) * 100)}%`
              : "0%",
          ultimo_lead: stats.lastCapture?.slice(0, 10) ?? "nunca",
          tiene_url: !!lm.asset_url,
        };
      }),
    });
  } catch (err) {
    return JSON.stringify({
      success: false,
      error:
        err instanceof Error ? err.message : "Error obteniendo lead magnets",
    });
  }
}

// ─── get_operations_summary ───────────────────────────────────────────────────

export async function handleGetOperationsSummary(
  { organizationId, supabase }: HandlerContext
): Promise<string> {
  if (!isSupabaseConfigured()) return notConfigured("operaciones");

  try {
    // Semana actual (lunes) de la organización: la misma cuenta que usan los
    // inputs semanales, con su zona y no con el reloj del servidor (UTC).
    const weekStartStr = getCurrentWeekStart(
      await fechaDeHoyDeLaOrganizacion(supabase, organizationId)
    );

    const [weeklyRes, sopsRes, snapshotRes] = await Promise.all([
      supabase
        .from("weekly_inputs")
        .select("department, content, rating, week_start")
        .eq("organization_id", organizationId)
        .gte("week_start", weekStartStr)
        .order("department"),
      supabase
        .from("sops")
        .select("id, title, department, status, updated_at")
        .eq("organization_id", organizationId)
        .neq("status", "archived")
        .order("updated_at", { ascending: false })
        .limit(20),
      supabase
        .from("intelligence_snapshots")
        .select("snapshot_date:generated_at, insights")
        .eq("organization_id", organizationId)
        .order("generated_at", { ascending: false })
        .limit(1),
    ]);

    const weeklyInputs = weeklyRes.data ?? [];
    const sops = sopsRes.data ?? [];
    const snapshot = snapshotRes.data?.[0] ?? null;

    return JSON.stringify({
      success: true,
      semana_actual: weekStartStr,
      inputs_semanales: {
        areas_reportadas: weeklyInputs.length,
        detalle: weeklyInputs.map((w) => ({
          area: w.department,
          rating: w.rating ?? "sin calificación",
          resumen:
            typeof w.content === "string"
              ? w.content.slice(0, 200)
              : "(sin contenido)",
        })),
        areas_sin_reporte:
          weeklyInputs.length === 0
            ? "Ningún área reportó esta semana aún."
            : null,
      },
      sops: {
        total: sops.length,
        lista: sops.map((s) => ({
          titulo: s.title,
          area: s.department,
          estado: s.status,
          ultima_actualizacion: s.updated_at?.slice(0, 10),
        })),
      },
      ultimo_snapshot_inteligencia: snapshot
        ? {
            fecha: snapshot.snapshot_date,
            resumen: summarizeInsights(snapshot.insights),
          }
        : {
            nota: "No hay snapshots de inteligencia generados aún. Se generan automáticamente dos veces al día.",
          },
    });
  } catch (err) {
    return JSON.stringify({
      success: false,
      error:
        err instanceof Error ? err.message : "Error obteniendo resumen operativo",
    });
  }
}
