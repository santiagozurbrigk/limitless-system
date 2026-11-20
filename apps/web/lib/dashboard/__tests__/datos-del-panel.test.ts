import { describe, expect, it } from "vitest";
import { mockClients } from "@/mocks/clients";
import { mockClosingCalls } from "@/mocks/closing";
import { mockConversations } from "@/mocks/sales";
import { computeExpensesSummary } from "@/lib/metrics/compute-expenses-summary";
import { enrichTeamCompensationWithCommissions } from "@/lib/metrics/enrich-team-compensation";
import { deriveFinanceSummary } from "@/lib/metrics/derive-finance-summary";
import { deriveDashboardData } from "@/lib/metrics/derive-dashboard-data";
import { deriveSalesMetrics } from "@/lib/metrics/derive-sales-metrics";
import { buildSalesFunnel } from "@/lib/metrics/build-sales-funnel-stages";
import { calcularDatosDelPanel, type EntradasDelPanel } from "@/lib/dashboard/datos-del-panel";
import type { FixedExpense, Subscription, TeamCompensation } from "@/types/expenses";
import type { ClientPayment } from "@/types/clients";

/**
 * SCRUM-540 · El Panel calculado en el servidor da lo mismo que daba el
 * navegador. La referencia es el cálculo de `DashboardPageContent` y de
 * `FinanceDataProvider` antes del cambio, copiado acá tal cual.
 */

function comoAntes(e: EntradasDelPanel) {
  // FinanceDataProvider
  const expensesSummary = computeExpensesSummary(
    e.fixedExpenses,
    e.subscriptions,
    enrichTeamCompensationWithCommissions(e.teamCompensation, e.closingCalls)
  );
  const b = e.metricasImportadas;
  const live = deriveFinanceSummary(e.clients, e.closingCalls, expensesSummary, e.paymentPlatforms, undefined, e.payments);
  let financeSummary = live;
  if (!(live.facturacion > 0 || !b)) {
    const bFact = b["facturacion"] ?? 0;
    const effectiveGastos = live.gastosTotales > 0 ? live.gastosTotales : (b["gastos"] ?? 0);
    const bCash = b["cash_collected"] != null ? b["cash_collected"] : Math.max(0, bFact - effectiveGastos);
    financeSummary = {
      ...live,
      facturacion: bFact,
      cashCollected: bCash,
      gastosTotales: effectiveGastos,
      margenPercent: bFact > 0 ? ((bFact - effectiveGastos) / bFact) * 100 : 0,
    };
  }
  // PlatformDataProvider + DashboardPageContent
  const salesMetrics = deriveSalesMetrics(e.conversations, e.closingCalls);
  const hasLive = salesMetrics.totalConversations > 0 || salesMetrics.bookingRate > 0;
  const effective =
    hasLive || !b
      ? salesMetrics
      : { ...salesMetrics, bookingRate: (b["tasa_agendamiento"] ?? 0) * 100, ghostingRate: (b["tasa_fantasma"] ?? 0) * 100 };
  const derived = deriveDashboardData(
    e.clients,
    e.conversations,
    e.closingCalls,
    expensesSummary,
    e.paymentPlatforms,
    effective,
    e.hoy,
    e.frequentObjections,
    e.payments,
    financeSummary
  );
  return {
    data: { ...derived, isEmpty: e.clients.length === 0 && e.conversations.length === 0 && e.closingCalls.length === 0 },
    embudo: buildSalesFunnel(e.conversations, e.closingCalls),
  };
}

const base: EntradasDelPanel = {
  clients: mockClients,
  closingCalls: mockClosingCalls,
  conversations: mockConversations,
  fixedExpenses: [{ id: "g", name: "Oficina", category: "other", amount: 300, currency: "USD", frequency: "monthly", status: "active" } as unknown as FixedExpense],
  subscriptions: [{ id: "s", name: "Tool", amount: 20, currency: "USD", billingCycle: "monthly" } as unknown as Subscription],
  teamCompensation: [{ id: "t", memberId: "t", memberName: "Ana", roleLabel: "Closer", hasFixed: true, fixedMonthly: 1000, hasCommission: true, commissionPercent: 10 } as unknown as TeamCompensation],
  paymentPlatforms: [],
  payments: [] as ClientPayment[],
  metricasImportadas: null,
  hoy: "2026-10-15",
  frequentObjections: [],
};

describe("calcularDatosDelPanel", () => {
  it("⭐ con datos en vivo, lo mismo que calculaba el navegador", () => {
    expect(calcularDatosDelPanel(base)).toEqual(comoAntes(base));
    expect(calcularDatosDelPanel(base).data.isEmpty).toBe(false);
  });

  it("⭐ sin datos en vivo y con métricas importadas, el mismo respaldo que antes", () => {
    const e = {
      ...base,
      clients: [],
      closingCalls: [],
      conversations: [],
      metricasImportadas: { facturacion: 5000, tasa_agendamiento: 0.3, tasa_fantasma: 0.1 },
    };
    expect(calcularDatosDelPanel(e)).toEqual(comoAntes(e));
    expect(calcularDatosDelPanel(e).data.isEmpty).toBe(true);
  });
});
