/**
 * ⭐ El Panel se calcula en el servidor (SCRUM-540, mínimo privilegio).
 *
 * El Panel muestra sólo totales: facturación, clientes nuevos, tasas de
 * agendamiento y de fantasma, el embudo, riesgos y oportunidades. Antes los
 * calculaba en el navegador con las filas que pedía el marco (cada cliente,
 * cada conversación, cada llamada, cada gasto, sueldo y cobro), así que a quien
 * sólo tenía el Panel le llegaban todas esas filas. Ahora la página del Panel
 * (que ya exige el módulo con `exigirModuloDeLaPagina`) lee en el servidor y
 * manda al navegador sólo el resultado: `DashboardData` y las etapas del
 * embudo. La cuenta es la misma que hacía el navegador (las mismas funciones).
 */

import { buildSalesFunnel, type SalesFunnel } from "@/lib/metrics/build-sales-funnel-stages";
import { deriveDashboardData } from "@/lib/metrics/derive-dashboard-data";
import { deriveSalesMetrics } from "@/lib/metrics/derive-sales-metrics";
import {
  resumenConMetricasImportadas,
  resumenDeGastos,
  resumenEnVivo,
  type EntradasDelResumen,
} from "@/lib/finance/resumen-financiero";
import type { Conversation, FrequentObjectionSummary, SalesMetricsData } from "@/types/sales";
import type { DashboardData } from "@/types/dashboard";

export type EntradasDelPanel = EntradasDelResumen & {
  conversations: Conversation[];
  /** El snapshot más reciente de métricas importadas, o null. */
  metricasImportadas: Record<string, number> | null;
  /** Hoy en la zona de la organización (`YYYY-MM-DD`). */
  hoy: string;
  frequentObjections: FrequentObjectionSummary[];
};

export type DatosDelPanel = {
  data: DashboardData;
  embudo: SalesFunnel;
};

/**
 * Las métricas de ventas del Panel: si no hay datos en vivo, las tasas del
 * snapshot importado (lo que hacía `DashboardPageContent`).
 */
export function metricasDeVentasDelPanel(
  salesMetrics: SalesMetricsData,
  metricasImportadas: Record<string, number> | null
): SalesMetricsData {
  const hasLiveData = salesMetrics.totalConversations > 0 || salesMetrics.bookingRate > 0;
  if (hasLiveData || !metricasImportadas) return salesMetrics;
  return {
    ...salesMetrics,
    bookingRate: (metricasImportadas["tasa_agendamiento"] ?? 0) * 100,
    ghostingRate: (metricasImportadas["tasa_fantasma"] ?? 0) * 100,
  };
}

export function calcularDatosDelPanel(entradas: EntradasDelPanel): DatosDelPanel {
  const salesMetrics = metricasDeVentasDelPanel(
    deriveSalesMetrics(entradas.conversations, entradas.closingCalls),
    entradas.metricasImportadas
  );
  const gastos = resumenDeGastos(entradas);
  const financeSummary = resumenConMetricasImportadas(
    resumenEnVivo(entradas, gastos),
    entradas.metricasImportadas
  );
  const derived = deriveDashboardData(
    entradas.clients,
    entradas.conversations,
    entradas.closingCalls,
    gastos,
    entradas.paymentPlatforms,
    salesMetrics,
    entradas.hoy,
    entradas.frequentObjections,
    entradas.payments,
    financeSummary
  );
  const hasNoActivity =
    entradas.clients.length === 0 &&
    entradas.conversations.length === 0 &&
    entradas.closingCalls.length === 0;
  return {
    data: { ...derived, isEmpty: hasNoActivity },
    embudo: buildSalesFunnel(entradas.conversations, entradas.closingCalls),
  };
}
