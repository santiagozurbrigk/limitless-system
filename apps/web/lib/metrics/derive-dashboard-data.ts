import { diaLocal, sumarDias } from "@/lib/fechas/calendario";
import { formatMoney } from "@/lib/finance/format";
import { deriveFinanceSummary } from "@/lib/metrics/derive-finance-summary";
import { collectRevenueEvents } from "@/lib/metrics/revenue-events";
import { METRIC_SPARKLINE_COLORS } from "@/lib/metrics/sparkline-series";
import type { Client, ClientPayment } from "@/types/clients";
import type { ClosingCall } from "@/types/closing";
import type {
  DashboardAiRecommendation,
  DashboardData,
  DashboardMetric,
  DashboardWeeklyChange,
} from "@/types/dashboard";
import type { ExpensesSummary } from "@/types/expenses";
import type { FinanceSummary, PaymentPlatformConfig } from "@/types/finance";
import type { Conversation, FrequentObjectionSummary, SalesMetricsData } from "@/types/sales";

function formatPercent(value: number): string {
  return `${value.toFixed(1).replace(".", ",")}%`;
}

function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Ingresos cobrados por día (últimos 7 días) para el gráfico del panel.
 *
 * `hoy` es el de la zona de la organización (`useHoyDeLaOrganizacion`): los
 * días son fechas calendario, igual que las fechas de cobro. Con la de UTC, de
 * noche en Argentina el último punto ya era mañana y lo cobrado hoy no aparecía;
 * con la del navegador, un miembro en otra zona veía otra semana (SCRUM-493).
 */
export function deriveDashboardRevenueTrend(
  clients: Client[],
  hoy: string
): { label: string; value: number }[] {
  const events = collectRevenueEvents(clients);
  const points: { label: string; value: number }[] = [];

  for (let i = 6; i >= 0; i--) {
    const key = sumarDias(hoy, -i);
    const label = diaLocal(key).toLocaleDateString("es", { weekday: "short" });
    const total = events
      .filter((e) => e.date === key)
      .reduce((sum, e) => sum + e.amount, 0);
    points.push({ label, value: Math.round(total) });
  }

  return points;
}

function dailyCounts(
  conversations: Conversation[],
  predicate: (c: Conversation, dayKey: string) => boolean
): number[] {
  const now = new Date();
  return Array.from({ length: 7 }, (_, dayIndex) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - dayIndex));
    const key = d.toISOString().slice(0, 10);
    return conversations.filter((c) => predicate(c, key)).length;
  });
}

function attachSparkline(
  metric: DashboardMetric,
  values: number[]
): DashboardMetric {
  if (values.length < 2) return metric;
  return {
    ...metric,
    sparklineData: values,
    sparklineColor: METRIC_SPARKLINE_COLORS[metric.id],
  };
}

function isBooked(conv: Conversation): boolean {
  return (
    conv.status === "booked" ||
    conv.tag === "agendado" ||
    conv.tag === "closeado"
  );
}

export function deriveDashboardData(
  clients: Client[],
  conversations: Conversation[],
  closingCalls: ClosingCall[],
  expenses: ExpensesSummary,
  paymentPlatforms: PaymentPlatformConfig[],
  salesMetrics: SalesMetricsData,
  /** Hoy en la zona de la organización (`YYYY-MM-DD`), para el gráfico de 7 días. */
  hoy: string,
  frequentObjections: FrequentObjectionSummary[] = [],
  payments?: ClientPayment[],
  /** Pre-computed finance summary (con baseline ya aplicado) del provider. Si se pasa y
   *  tiene facturación > 0, se usa directamente en lugar de recalcular desde live data. */
  precomputedFinance?: FinanceSummary
): DashboardData {
  const liveFiance = deriveFinanceSummary(
    clients,
    closingCalls,
    expenses,
    paymentPlatforms,
    undefined,
    payments
  );
  // Usar el pre-computed (con baseline) si el live no tiene datos todavía
  const finance =
    precomputedFinance && precomputedFinance.facturacion > 0 && liveFiance.facturacion === 0
      ? precomputedFinance
      : liveFiance;

  const closedDeals = closingCalls.filter((c) => c.status === "closed").length;
  const scheduledCalls = closingCalls.filter(
    (c) => c.status === "scheduled"
  ).length;
  const activeClients = clients.filter((c) => c.status === "active").length;
  const newClientsThisMonth = clients.filter((c) => {
    if (!c.joinDate) return false;
    // Comparar YYYY-MM como string evita el bug UTC-midnight de new Date("YYYY-MM-DD")
    // que en zonas UTC-N reporta el mes anterior para fechas al inicio del mes.
    const joinYearMonth = c.joinDate.slice(0, 7);
    const now = new Date();
    const nowYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return joinYearMonth === nowYearMonth;
  }).length;

  const revenueMetrics: DashboardMetric[] = [
    attachSparkline(
      {
        id: "m1",
        label: "MRR",
        value: formatMoney(finance.facturacion),
        trend: finance.facturacion > 0 ? "up" : "neutral",
      },
      deriveDashboardRevenueTrend(clients, hoy).map((p) => p.value)
    ),
    {
      id: "m2",
      label: "Nuevos clientes",
      value: String(newClientsThisMonth),
      trend: newClientsThisMonth > 0 ? "up" : "neutral",
    },
    {
      id: "m3",
      label: "Churn del mes",
      value: activeClients > 0 ? "—" : "0%",
      trend: "neutral",
    },
  ];

  const bookingDaily = dailyCounts(conversations, (c, key) =>
    isBooked(c) && c.lastMessageAt.slice(0, 10) === key
  );
  const activeDaily = dailyCounts(
    conversations,
    (c, key) =>
      c.status === "active" && c.lastMessageAt.slice(0, 10) === key
  );
  const ghostDaily = dailyCounts(
    conversations,
    (c, key) =>
      c.status === "ghosted" && c.lastMessageAt.slice(0, 10) === key
  );

  const salesMetricsCards: DashboardMetric[] = [
    attachSparkline(
      {
        id: "s-booking",
        label: "Tasa de agendamiento",
        value: formatPercent(salesMetrics.bookingRate),
        trend: salesMetrics.bookingRate >= 25 ? "up" : "neutral",
      },
      bookingDaily
    ),
    attachSparkline(
      {
        id: "s-active",
        label: "Conversaciones activas",
        value: String(salesMetrics.activeConversations),
        trend: salesMetrics.activeConversations > 0 ? "up" : "neutral",
      },
      activeDaily
    ),
    attachSparkline(
      {
        id: "s-ghost",
        label: "Tasa de fantasma",
        value: formatPercent(salesMetrics.ghostingRate),
        trend: salesMetrics.ghostingRate <= 20 ? "down" : "up",
      },
      ghostDaily
    ),
  ];

  const operationalMetrics: DashboardMetric[] = [
    {
      id: "o1",
      label: "Carga del equipo",
      value: `${Math.min(100, Math.round((salesMetrics.unansweredConversations / Math.max(salesMetrics.totalConversations, 1)) * 100))}%`,
      trend: "neutral",
    },
    {
      id: "o2",
      label: "Cuellos de botella",
      value: String(
        (salesMetrics.ghostingRate >= 25 ? 1 : 0) +
          (salesMetrics.unansweredConversations > 5 ? 1 : 0) +
          (finance.porCobrar > finance.facturacion && finance.facturacion > 0
            ? 1
            : 0)
      ),
      trend: "neutral",
    },
  ];

  const dashboardOperationalMetrics: DashboardMetric[] = [
    {
      id: "dop1",
      label: "Tasks completadas",
      value: `${closedDeals}/${Math.max(scheduledCalls + closedDeals, 1)}`,
      progress:
        scheduledCalls + closedDeals > 0
          ? Math.round((closedDeals / (scheduledCalls + closedDeals)) * 100)
          : 0,
      trend: closedDeals > 0 ? "up" : "neutral",
    },
    {
      id: "dop2",
      label: "Inputs semanales recibidos",
      value: `${Math.min(16, conversations.length > 0 ? 4 : 0)}/16`,
      progress: conversations.length > 0 ? 25 : 0,
      trend: "neutral",
      trendValue: conversations.length > 0 ? "En progreso" : "Sin inputs",
    },
  ];

  const executiveSummary = [
    salesMetrics.activeConversations > 0
      ? `Esta semana tuviste ${salesMetrics.activeConversations} conversaciones activas`
      : "Aún no hay conversaciones activas en la bandeja",
    salesMetrics.bookingRate > 0
      ? `tu tasa de booking es ${formatPercent(salesMetrics.bookingRate)}`
      : "conectá ManyChat para ver métricas de ventas",
    closedDeals > 0
      ? `y ${closedDeals} deal${closedDeals === 1 ? "" : "s"} cerrado${closedDeals === 1 ? "" : "s"} en Closing.`
      : "Sincronizá Calendly para importar llamadas de cierre.",
    finance.facturacion > 0
      ? `Facturación del mes: ${formatMoney(finance.facturacion)}.`
      : "",
  ]
    .filter(Boolean)
    .join(", ")
    .replace(", y", " y");

  const risks = [];
  if (salesMetrics.unansweredConversations > 0) {
    risks.push({
      id: "r-unanswered",
      title: `${salesMetrics.unansweredConversations} conversaciones sin responder`,
      description:
        "Leads en bandeja esperando respuesta. Riesgo de ghosting y pérdida de oportunidades.",
      suggestedAction: "Revisar bandeja de ventas y asignar prioridades",
      severity:
        salesMetrics.unansweredConversations > 5
          ? ("high" as const)
          : ("medium" as const),
      department: "Ventas",
    });
  }
  if (salesMetrics.ghostingRate >= 25) {
    risks.push({
      id: "r-ghost",
      title: `Tasa de fantasma elevada (${formatPercent(salesMetrics.ghostingRate)})`,
      description:
        "Conversaciones que dejaron de responder tras mencionar precio o agendar.",
      suggestedAction: "Revisar guiones y follow-up del equipo",
      severity: "high" as const,
      department: "Ventas",
    });
  }
  if (finance.porCobrar > finance.facturacion && finance.facturacion > 0) {
    risks.push({
      id: "r-pending",
      title: `Por cobrar (${formatMoney(finance.porCobrar)}) supera la facturación`,
      description: "Hay ingresos pendientes de cobro que superan lo facturado.",
      suggestedAction: "Revisar Finanzas y registrar pagos pendientes",
      severity: "medium" as const,
      department: "Finanzas",
    });
  }

  const objectionCategoryLabel: Record<
    FrequentObjectionSummary["category"],
    string
  > = {
    closing: "precio/tiempo",
    setting: "setting",
    marketing: "marketing",
  };

  for (const objection of frequentObjections) {
    if (!objection.alert) continue;

    risks.push({
      id: `r-objection-${objection.category}`,
      title: `Objeciones de ${objectionCategoryLabel[objection.category]} en aumento (+${objection.trendPct}%)`,
      description: objection.alert,
      suggestedAction: "Ver objeciones en métricas de ventas",
      severity: "high" as const,
      department: "Ventas",
    });
  }

  if (risks.length === 0) {
    risks.push({
      id: "r-none",
      title: "Sin alertas críticas detectadas",
      description: "Los datos actuales no muestran riesgos operacionales urgentes.",
      suggestedAction: "Mantener el ritmo y revisar el panel semanalmente",
      severity: "low" as const,
      department: "Operaciones",
    });
  }

  const opportunities = [];
  if (salesMetrics.bookingRate >= 30) {
    opportunities.push({
      id: "o-booking",
      title: `Booking rate al ${formatPercent(salesMetrics.bookingRate)}`,
      description: "La tasa de agendamiento está por encima del umbral saludable.",
      impact: "Refuerza el guión que está funcionando en la bandeja de ventas",
    });
  }
  if (closedDeals > 0) {
    opportunities.push({
      id: "o-closed",
      title: `${closedDeals} cierre${closedDeals === 1 ? "" : "s"} registrados`,
      description: "Deals marcados como cerrados en el calendario de Closing.",
      impact: "Validá cobros y comisiones del equipo en Finanzas",
    });
  }
  if (opportunities.length === 0) {
    opportunities.push({
      id: "o-grow",
      title: "Embudo con margen de crecimiento",
      description: "Hay espacio para mejorar conversión y volumen de conversaciones.",
      impact: "Sincronizá Calendly y conectá el inbox para llenar el pipeline",
    });
  }

  const weeklyChanges: DashboardWeeklyChange[] = [
    {
      id: "wc-conv",
      label: `${conversations.length} conversaciones en inbox`,
      direction: conversations.length > 0 ? "up" : "neutral",
    },
    {
      id: "wc-clients",
      label: `${activeClients} clientes activos`,
      direction: activeClients > 0 ? "up" : "neutral",
    },
    {
      id: "wc-booking",
      label: `Booking rate ${formatPercent(salesMetrics.bookingRate)}`,
      direction:
        salesMetrics.bookingRate >= 25
          ? "up"
          : salesMetrics.bookingRate > 0
            ? "neutral"
            : "down",
    },
    {
      id: "wc-response",
      label: `Response time ${formatMinutes(salesMetrics.avgResponseMin)}`,
      direction: salesMetrics.avgResponseMin <= 30 ? "down" : "up",
    },
    {
      id: "wc-expenses",
      label: `Gastos fijos ${formatMoney(expenses.totalMonthly)}/mes`,
      direction: "neutral",
    },
  ];

  const aiRecommendations: DashboardAiRecommendation[] = [];
  if (salesMetrics.unansweredConversations > 0) {
    aiRecommendations.push({
      id: "rec-inbox",
      text: `Priorizá ${salesMetrics.unansweredConversations} conversación${salesMetrics.unansweredConversations === 1 ? "" : "es"} sin responder antes de escalar campañas.`,
      category: "Ventas",
    });
  }
  if (
    finance.cashCollected < finance.facturacion * 0.5 &&
    finance.facturacion > 0
  ) {
    aiRecommendations.push({
      id: "rec-finance",
      text: "El cash collected del mes está muy por debajo de la facturación — revisá Gastos y cobros pendientes.",
      category: "Finanzas",
    });
  }
  if (scheduledCalls > 0) {
    aiRecommendations.push({
      id: "rec-closing",
      text: `Tenés ${scheduledCalls} llamada${scheduledCalls === 1 ? "" : "s"} agendada${scheduledCalls === 1 ? "" : "s"} — prepará guiones de closing para la semana.`,
      category: "Closing",
    });
  }
  if (aiRecommendations.length === 0) {
    aiRecommendations.push({
      id: "rec-default",
      text: "Mantené el ritmo: sincronizá Calendly y registrá pagos al cerrar deals para métricas precisas.",
      category: "Operaciones",
    });
  }

  while (aiRecommendations.length < 3) {
    aiRecommendations.push({
      id: `rec-fill-${aiRecommendations.length}`,
      text: "Conectá más integraciones para desbloquear recomendaciones personalizadas de IA.",
      category: "Integraciones",
    });
  }

  return {
    executiveSummary,
    risks: risks.slice(0, 3),
    opportunities: opportunities.slice(0, 3),
    weeklyChanges,
    revenueMetrics,
    salesMetrics: salesMetricsCards,
    operationalMetrics,
    dashboardOperationalMetrics,
    aiRecommendations: aiRecommendations.slice(0, 3),
  };
}
