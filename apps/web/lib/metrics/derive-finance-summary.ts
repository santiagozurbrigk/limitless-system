import type { Client, ClientPayment } from "@/types/clients";
import type { ClosingCall } from "@/types/closing";
import type { ExpensesSummary } from "@/types/expenses";
import type {
  CloserPerformance,
  FinanceSummary,
  PaymentPlatformConfig,
} from "@/types/finance";
import {
  collectRevenueEvents,
  filterRevenueEvents,
  sumAllRecognizedRevenue,
} from "@/lib/metrics/revenue-events";
import {
  DEFAULT_REVENUE_RANGE,
  parseDateOnly,
  prorateMonthlyExpenses,
  resolveRevenueDateRange,
  type ResolvedRevenuePeriod,
  type RevenueDateRange,
} from "@/lib/metrics/revenue-period";

const DEFAULT_COMMISSION_RATE = 0.1;

/** Fallback si las plataformas aún usan IDs mock en local. */
const LEGACY_PLATFORM_TO_CONFIG_ID: Record<string, string> = {
  stripe: "pp-stripe",
  mercadopago: "pp-mp",
  paypal: "pp-stripe",
  bank_transfer: "pp-wise",
};

function configIdForPlatformId(
  platformId: string | undefined,
  paymentPlatforms: PaymentPlatformConfig[]
): string | null {
  if (!platformId) return null;
  if (paymentPlatforms.some((p) => p.id === platformId)) return platformId;
  return null;
}

function configIdForPaymentSlug(
  platform: string,
  paymentPlatforms: PaymentPlatformConfig[]
): string | null {
  const bySlug = paymentPlatforms.find((p) => p.slug === platform);
  if (bySlug) return bySlug.id;
  const legacy = LEGACY_PLATFORM_TO_CONFIG_ID[platform];
  if (legacy && paymentPlatforms.some((p) => p.id === legacy)) return legacy;
  return null;
}

/** Total histórico reconocido (todas las fechas de cobro). */
export function cobradoSegunPagoForClient(client: Client): number {
  return collectRevenueEvents([client]).reduce((s, e) => s + e.amount, 0);
}

/** @deprecated Usar cobradoSegunPagoForClient o sumRevenueInPeriod */
export const cashCollectedForClient = cobradoSegunPagoForClient;

function pendientePorCobrar(client: Client): number {
  return Math.max(0, client.totalAmount - cobradoSegunPagoForClient(client));
}

/**
 * Mes (YYYY-MM) y nombre del mes de una fecha YYYY-MM-DD, leída como día local.
 * `new Date("2026-10-01")` es medianoche UTC: en Argentina daba "septiembre"
 * para una cuota que vence el 1 de octubre (SCRUM-101).
 */
function mesDeVencimiento(dateIso: string): { clave: string; nombre: string; anio: number } {
  const d = parseDateOnly(dateIso);
  return {
    clave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    nombre: d.toLocaleDateString("es", { month: "long" }),
    anio: d.getFullYear(),
  };
}

export function deriveCloserBreakdown(
  closingCalls: ClosingCall[],
  commissionRate = DEFAULT_COMMISSION_RATE
): CloserPerformance[] {
  const byCloser = new Map<
    string,
    { dealsClosed: number; revenue: number }
  >();

  for (const call of closingCalls) {
    if (call.status !== "closed" || !call.outcome?.revenue) continue;
    const name = call.closedByName?.trim() || "Sin asignar";
    const prev = byCloser.get(name) ?? { dealsClosed: 0, revenue: 0 };
    byCloser.set(name, {
      dealsClosed: prev.dealsClosed + 1,
      revenue: prev.revenue + call.outcome.revenue,
    });
  }

  return Array.from(byCloser.entries()).map(([name, stats], index) => ({
    id: `closer-${index}`,
    name,
    dealsClosed: stats.dealsClosed,
    revenue: stats.revenue,
    commission: Math.round(stats.revenue * commissionRate),
  }));
}

export function deriveFinanceSummary(
  clients: Client[],
  closingCalls: ClosingCall[],
  expenses: ExpensesSummary,
  paymentPlatforms: PaymentPlatformConfig[],
  revenueRange: RevenueDateRange = DEFAULT_REVENUE_RANGE,
  payments?: ClientPayment[]
): FinanceSummary & { revenuePeriod: ResolvedRevenuePeriod } {
  const revenuePeriod = resolveRevenueDateRange(revenueRange);
  const events = collectRevenueEvents(clients, payments);
  const periodEvents = filterRevenueEvents(events, revenuePeriod);

  const facturacion = periodEvents.reduce((sum, e) => sum + e.amount, 0);
  const gastosTotales = prorateMonthlyExpenses(
    expenses.totalMonthly,
    revenuePeriod
  );
  const gananciaNeta = facturacion - gastosTotales;
  const cashCollected = gananciaNeta;
  const margenPercent =
    facturacion > 0 ? (gananciaNeta / facturacion) * 100 : 0;

  const porCobrar = clients.reduce((sum, c) => sum + pendientePorCobrar(c), 0);

  // Por mes y año, en orden cronológico. Antes se agrupaba sólo por el nombre
  // del mes: octubre de 2026 y octubre de 2027 se sumaban juntos, y el orden
  // era el de los clientes (SCRUM-101).
  const pendingByMonth = new Map<string, { nombre: string; anio: number; amount: number }>();
  for (const client of clients) {
    for (const inst of client.installments ?? []) {
      if (inst.status !== "pending" || !inst.dueDate) continue;
      const mes = mesDeVencimiento(inst.dueDate);
      const prev = pendingByMonth.get(mes.clave);
      pendingByMonth.set(mes.clave, { ...mes, amount: (prev?.amount ?? 0) + inst.amount });
    }
  }

  const ordenados = Array.from(pendingByMonth.entries()).sort(([a], [b]) => a.localeCompare(b));
  const variosAnios = new Set(ordenados.map(([, m]) => m.anio)).size > 1;
  const porCobrarByMonth = ordenados.map(([, m]) => ({
    month: variosAnios ? `${m.nombre} ${m.anio}` : m.nombre,
    amount: m.amount,
  }));

  const balanceByPlatform = new Map<string, number>();
  for (const event of periodEvents) {
    const configId =
      configIdForPlatformId(event.paymentDestinationPlatformId, paymentPlatforms) ??
      configIdForPaymentSlug(event.platform, paymentPlatforms);
    if (!configId) continue;
    balanceByPlatform.set(
      configId,
      (balanceByPlatform.get(configId) ?? 0) + event.amount
    );
  }

  const platformBalances = paymentPlatforms
    .filter((p) => balanceByPlatform.has(p.id))
    .map((p) => ({
      platformId: p.id,
      amount: balanceByPlatform.get(p.id) ?? 0,
    }));

  return {
    facturacion,
    cashCollected,
    porCobrar,
    porCobrarByMonth,
    gastosTotales,
    margenPercent,
    closerBreakdown: deriveCloserBreakdown(closingCalls),
    platformBalances,
    revenuePeriod,
  };
}

export { sumAllRecognizedRevenue };
