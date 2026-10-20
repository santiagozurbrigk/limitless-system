/**
 * ⭐ Los totales de Finanzas, en un solo lugar (SCRUM-540).
 *
 * Los calculaba sólo `FinanceDataProvider`, en el navegador, a partir de las
 * filas: gastos fijos, suscripciones, sueldos y comisiones por persona, cada
 * cobro. Para eso mandaba esas filas a cualquiera que viera Ventas o el Panel,
 * aunque esas pantallas sólo muestran totales. Ahora la misma cuenta corre:
 *   - en el navegador, para quien tiene Finanzas (recibe las filas, como antes);
 *   - en el servidor, para Ventas (`getResumenFinancieroAction`) y para el Panel
 *     (`leerDatosDelPanel`), que reciben sólo el resultado.
 * Funciones puras: las mismas entradas dan los mismos números en los dos lados.
 */

import { computeExpensesSummary } from "@/lib/metrics/compute-expenses-summary";
import { enrichTeamCompensationWithCommissions } from "@/lib/metrics/enrich-team-compensation";
import { deriveFinanceSummary } from "@/lib/metrics/derive-finance-summary";
import { deriveMonthlySeries } from "@/lib/metrics/derive-monthly-series";
import type { Client, ClientPayment } from "@/types/clients";
import type { ClosingCall } from "@/types/closing";
import type {
  ExpensesSummary,
  FixedExpense,
  Subscription,
  TeamCompensation,
} from "@/types/expenses";
import type {
  FinanceSummary,
  MonthlySeriesPoint,
  PaymentPlatformConfig,
} from "@/types/finance";

export type EntradasDelResumen = {
  clients: Client[];
  closingCalls: ClosingCall[];
  fixedExpenses: FixedExpense[];
  subscriptions: Subscription[];
  teamCompensation: TeamCompensation[];
  paymentPlatforms: PaymentPlatformConfig[];
  payments: ClientPayment[];
};

/** Lo que reciben Ventas y el Panel en lugar de las filas: sólo totales. */
export type ResumenFinanciero = {
  expensesSummary: ExpensesSummary;
  /** Sin las métricas importadas: el provider las aplica igual que con las filas. */
  financeSummary: FinanceSummary;
  monthlySeries: MonthlySeriesPoint[];
};

export const GASTOS_EN_CERO: ExpensesSummary = {
  fixedMonthly: 0,
  subscriptionsMonthly: 0,
  teamFixedMonthly: 0,
  teamCommissionsMonthly: 0,
  totalMonthly: 0,
};

/*
 * ⭐ `ahora` es el "hoy" con el que se decide "este mes" (comisiones, período de
 * la facturación, la serie de 6 meses). En el navegador (Finanzas) se deja el
 * reloj de quien mira, como en `main`. En el servidor (el Panel y el resumen de
 * Ventas) hay que pasar el día de la organización, `diaLocal(hoy)` con `hoy` en
 * su zona: el reloj del proceso (UTC en Vercel) cambia de mes horas antes que
 * una org de América (AR 2 de SCRUM-540, regla de SCRUM-493).
 */

export function resumenDeGastos(
  entradas: Pick<EntradasDelResumen, "fixedExpenses" | "subscriptions" | "teamCompensation" | "closingCalls">,
  ahora: Date = new Date()
): ExpensesSummary {
  return computeExpensesSummary(
    entradas.fixedExpenses,
    entradas.subscriptions,
    enrichTeamCompensationWithCommissions(entradas.teamCompensation, entradas.closingCalls, ahora)
  );
}

/** El resumen "en vivo" (sin métricas importadas), sólo con los campos de `FinanceSummary`. */
export function resumenEnVivo(
  entradas: Pick<EntradasDelResumen, "clients" | "closingCalls" | "paymentPlatforms" | "payments">,
  gastos: ExpensesSummary,
  ahora: Date = new Date()
): FinanceSummary {
  const {
    facturacion,
    cashCollected,
    porCobrar,
    porCobrarByMonth,
    gastosTotales,
    margenPercent,
    closerBreakdown,
    platformBalances,
  } = deriveFinanceSummary(
    entradas.clients,
    entradas.closingCalls,
    gastos,
    entradas.paymentPlatforms,
    undefined,
    entradas.payments,
    ahora
  );
  return {
    facturacion,
    cashCollected,
    porCobrar,
    porCobrarByMonth,
    gastosTotales,
    margenPercent,
    closerBreakdown,
    platformBalances,
  };
}

export function calcularResumenFinanciero(
  entradas: EntradasDelResumen,
  ahora: Date = new Date()
): ResumenFinanciero {
  const expensesSummary = resumenDeGastos(entradas, ahora);
  return {
    expensesSummary,
    financeSummary: resumenEnVivo(entradas, expensesSummary, ahora),
    monthlySeries: deriveMonthlySeries(entradas.clients, expensesSummary, entradas.payments, ahora),
  };
}

/**
 * ⭐ El resumen recortado a lo que muestra Ventas (AR 1 de SCRUM-540, mínimo
 * privilegio). La pantalla de métricas de Ventas usa la facturación, lo cobrado
 * y los gastos del período, y de la serie mensual la facturación y lo cobrado.
 * Lo demás que calcula Finanzas no viaja: el desglose de gastos (fijos,
 * suscripciones, sueldos, comisiones), lo cobrado por plataforma, lo pendiente
 * de cobro por mes y el desglose por closer quedan en cero o vacíos.
 */
export function resumenParaVentas(resumen: ResumenFinanciero): ResumenFinanciero {
  return {
    expensesSummary: { ...GASTOS_EN_CERO, totalMonthly: resumen.expensesSummary.totalMonthly },
    financeSummary: {
      facturacion: resumen.financeSummary.facturacion,
      cashCollected: resumen.financeSummary.cashCollected,
      gastosTotales: resumen.financeSummary.gastosTotales,
      margenPercent: resumen.financeSummary.margenPercent,
      porCobrar: 0,
      porCobrarByMonth: [],
      closerBreakdown: [],
      platformBalances: [],
    },
    monthlySeries: resumen.monthlySeries.map((m) => ({
      month: m.month,
      facturacion: m.facturacion,
      cashCollected: m.cashCollected,
      marginPercent: m.marginPercent,
      upfront: 0,
      installments: 0,
      fees: 0,
    })),
  };
}

/**
 * Las métricas importadas a mano (snapshot más reciente) como respaldo cuando
 * no hay facturación en vivo. Es la cuenta que hacía el provider, sin cambios.
 */
export function resumenConMetricasImportadas(
  live: FinanceSummary,
  metricas: Record<string, number> | null
): FinanceSummary {
  if (live.facturacion > 0 || !metricas) return live;
  const bFact = metricas["facturacion"] ?? 0;
  // Los gastos configurados en el módulo antes que los del snapshot, que
  // raramente los trae.
  const bGastosSnapshot = metricas["gastos"] ?? 0;
  const effectiveGastos = live.gastosTotales > 0 ? live.gastosTotales : bGastosSnapshot;
  const bCash =
    metricas["cash_collected"] != null
      ? metricas["cash_collected"]
      : Math.max(0, bFact - effectiveGastos);
  const bMargen = bFact > 0 ? ((bFact - effectiveGastos) / bFact) * 100 : 0;
  return {
    ...live,
    facturacion: bFact,
    cashCollected: bCash,
    gastosTotales: effectiveGastos,
    margenPercent: bMargen,
  };
}

/** Lo mismo para la serie mensual: si está toda en cero, el último mes con el snapshot. */
export function serieConMetricasImportadas(
  series: MonthlySeriesPoint[],
  gastos: ExpensesSummary,
  metricas: Record<string, number> | null
): MonthlySeriesPoint[] {
  if (!metricas) return series;
  if (series.some((m) => m.facturacion > 0)) return series;
  const bFact = metricas["facturacion"] ?? 0;
  if (bFact <= 0) return series;
  const bCash = Math.max(0, bFact - gastos.totalMonthly);
  const bMargin = bFact > 0 ? (bCash / bFact) * 100 : 0;
  const patched = [...series];
  const last = patched[patched.length - 1];
  if (last) {
    patched[patched.length - 1] = {
      ...last,
      facturacion: bFact,
      cashCollected: bCash,
      marginPercent: bMargin,
    };
  }
  return patched;
}
