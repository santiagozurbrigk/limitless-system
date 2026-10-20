import { getZernioAnalyticsAction } from "@/app/integrations/zernio/actions";
import { getCustomMetricsAction } from "@/app/metrics/actions";
import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { getHoldingSessionState } from "@/lib/holding/session";
import {
  getFrequentObjections,
  mockFrequentObjectionSummaries,
} from "@/lib/metrics/frequent-objections";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { DashboardPageContent } from "@/components/dashboard/dashboard-page-content";
import type { FrequentObjectionsResult } from "@/types/sales";
import { redirect } from "next/navigation";
import { paths } from "@/routes";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";
import { leerDatosDelPanel } from "@/lib/dashboard/leer-datos-del-panel";
import { calcularDatosDelPanel, type EntradasDelPanel } from "@/lib/dashboard/datos-del-panel";

const ENTRADAS_VACIAS: EntradasDelPanel = {
  clients: [],
  closingCalls: [],
  conversations: [],
  fixedExpenses: [],
  subscriptions: [],
  teamCompensation: [],
  paymentPlatforms: [],
  payments: [],
  metricasImportadas: null,
  hoy: new Date().toISOString().slice(0, 10),
  frequentObjections: [],
};

async function loadFrequentObjections(): Promise<FrequentObjectionsResult> {
  if (!isSupabaseConfigured()) {
    return {
      objections: mockFrequentObjectionSummaries(),
      dataSource: "mock",
    };
  }

  const organizationId = await requireOrganizationId();
  return getFrequentObjections(organizationId);
}

export default async function DashboardPage() {
  const sinAcceso = await exigirModuloDeLaPagina("dashboard");
  if (sinAcceso) return sinAcceso;

  const holdingSession = await getHoldingSessionState();
  if (holdingSession.isHolding && !holdingSession.viewingBusiness) {
    redirect(paths.platform.holding);
  }

  const [frequentObjections, zernioAnalytics, customMetrics] =
    await Promise.all([
      loadFrequentObjections(),
      getZernioAnalyticsAction(),
      isSupabaseConfigured() ? getCustomMetricsAction("dashboard") : Promise.resolve([]),
    ]);

  // ⭐ Los totales se calculan acá, en el servidor (SCRUM-540): al navegador
  // va sólo el resultado, no las filas de clientes, conversaciones, llamadas,
  // gastos, sueldos ni cobros. Sin Supabase (modo demo) el Panel queda vacío,
  // como antes.
  const { pagosSinLeer, ...datos } = isSupabaseConfigured()
    ? await leerDatosDelPanel(await requireOrganizationId(), frequentObjections.objections)
    : { ...calcularDatosDelPanel(ENTRADAS_VACIAS), pagosSinLeer: false };

  return (
    <DashboardPageContent
      datos={datos}
      pagosSinLeer={pagosSinLeer}
      zernioAnalytics={zernioAnalytics}
      customMetrics={customMetrics}
    />
  );
}
