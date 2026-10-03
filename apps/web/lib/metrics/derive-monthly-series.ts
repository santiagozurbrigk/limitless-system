import type { Client, ClientPayment } from "@/types/clients";
import type { ExpensesSummary } from "@/types/expenses";
import type { MonthlySeriesPoint } from "@/types/finance";
import {
  collectRevenueEvents,
  filterRevenueEvents,
} from "@/lib/metrics/revenue-events";
import { resolveRevenueDateRange } from "@/lib/metrics/revenue-period";

const MONTH_SHORT = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

/** Últimos 6 meses: facturación = ingresos por fecha de cobro en cada mes. */
export function deriveMonthlySeries(
  clients: Client[],
  expenses: ExpensesSummary,
  payments?: ClientPayment[],
  now: Date = new Date()
): MonthlySeriesPoint[] {
  const events = collectRevenueEvents(clients, payments);
  const buckets: MonthlySeriesPoint[] = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    // El ancla se arma con el día local: con `toISOString()`, en una zona al
    // este de UTC el día 1 pasaba a ser el último del mes anterior y cada barra
    // mostraba los datos del mes previo (SCRUM-101).
    const period = resolveRevenueDateRange({
      preset: "month",
      anchor: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`,
    });
    const monthEvents = filterRevenueEvents(events, period);

    let facturacion = 0;
    let upfront = 0;
    let installments = 0;
    let fees = 0;

    for (const event of monthEvents) {
      facturacion += event.amount;
      if (event.source === "upfront" || event.source === "upfront_portion") {
        upfront += event.amount;
      } else if (event.source === "installment") {
        installments += event.amount;
      } else {
        fees += event.amount;
      }
    }

    const gastos = expenses.totalMonthly;
    const gananciaNeta = facturacion - gastos;
    const marginPercent =
      facturacion > 0 ? (gananciaNeta / facturacion) * 100 : 0;
    const safe = (n: number) => (Number.isFinite(n) ? n : 0);

    buckets.push({
      month: MONTH_SHORT[d.getMonth()] ?? "—",
      facturacion: safe(facturacion),
      cashCollected: safe(gananciaNeta),
      upfront: safe(upfront),
      installments: safe(installments),
      fees: safe(fees),
      marginPercent: safe(marginPercent),
    });
  }

  return buckets;
}
