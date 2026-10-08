"use client";

import { useMemo } from "react";
import { deriveDashboardData } from "@/lib/metrics/derive-dashboard-data";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { useFinanceData } from "@/providers/finance-data-provider";
import { usePlatformData } from "@/providers/platform-data-provider";
import { fechaDeHoyEnZona } from "@/lib/fechas/calendario";
import {
  useHoyDeLaOrganizacion,
  useZonaDeLaOrganizacion,
} from "@/providers/zona-de-la-organizacion-provider";
import type { ZernioAnalyticsSummary } from "@/app/integrations/zernio/actions";
import type { FrequentObjectionsResult } from "@/types/sales";
import type { ComputedCustomMetric } from "@/lib/metrics/custom-metrics";
import { PageLoading } from "@/components/shared/page-loading";
import { SetupChecklist } from "@/components/onboarding/setup-checklist";
import { DashboardOverview } from "./dashboard-overview";
import { AvisoDeLecturaFallida } from "@/components/shared/aviso-de-lectura-fallida";

const useSupabase = isSupabaseConfigured();

export function DashboardPageContent({
  frequentObjections = null,
  zernioAnalytics = {
    totalImpressions: 0,
    totalLikes: 0,
    totalComments: 0,
    hasData: false,
  },
  customMetrics = [],
}: {
  frequentObjections?: FrequentObjectionsResult | null;
  zernioAnalytics?: ZernioAnalyticsSummary;
  customMetrics?: ComputedCustomMetric[];
}) {
  const {
    clients,
    conversations,
    closingCalls,
    salesMetrics,
    clientsLoading,
    conversationsLoading,
    closingCallsLoading,
  } = usePlatformData();

  const { expensesSummary, paymentPlatforms, financeConfigLoading, clientPayments, clientPaymentsError, financeSummary, salesBaselineMetrics } =
    useFinanceData();

  const loading =
    useSupabase &&
    (clientsLoading ||
      conversationsLoading ||
      closingCallsLoading ||
      financeConfigLoading);

  // Fallback baseline para métricas de ventas: si no hay datos live, usar snapshot
  const effectiveSalesMetrics = useMemo(() => {
    const hasLiveData = salesMetrics.totalConversations > 0 || salesMetrics.bookingRate > 0;
    if (hasLiveData || !salesBaselineMetrics) return salesMetrics;
    return {
      ...salesMetrics,
      bookingRate: (salesBaselineMetrics["tasa_agendamiento"] ?? 0) * 100,
      ghostingRate: (salesBaselineMetrics["tasa_fantasma"] ?? 0) * 100,
    };
  }, [salesMetrics, salesBaselineMetrics]);

  // Hoy en la zona de la org; en el render del servidor (null) se calcula con
  // la misma zona, así que da el mismo día salvo justo a la medianoche.
  const zonaDeLaOrganizacion = useZonaDeLaOrganizacion();
  const hoyDeLaOrganizacion =
    useHoyDeLaOrganizacion() ?? fechaDeHoyEnZona(zonaDeLaOrganizacion);

  const data = useMemo(() => {
    const derived = deriveDashboardData(
      clients,
      conversations,
      closingCalls,
      expensesSummary,
      paymentPlatforms,
      effectiveSalesMetrics,
      hoyDeLaOrganizacion,
      frequentObjections?.objections ?? [],
      clientPayments,
      financeSummary  // baseline-enriched desde el provider
    );

    const hasNoActivity =
      clients.length === 0 &&
      conversations.length === 0 &&
      closingCalls.length === 0;

    return {
      ...derived,
      isEmpty: !useSupabase || hasNoActivity,
    };
  }, [
    clients,
    conversations,
    closingCalls,
    expensesSummary,
    paymentPlatforms,
    effectiveSalesMetrics,
    frequentObjections,
    clientPayments,
    financeSummary,
    hoyDeLaOrganizacion,
  ]);

  if (loading) {
    return <PageLoading label="Cargando panel general…" />;
  }

  /*
   * El checklist va acá y no dentro de `DashboardOverview` porque ese
   * componente hace un early return al empty state — que es justo donde cae una
   * organización recién configurada, o sea el momento en que el checklist más
   * hace falta.
   */
  return (
    <div className="space-y-6">
      <SetupChecklist />
      {clientPaymentsError ? (
        <AvisoDeLecturaFallida
          titulo="No se pudieron cargar los pagos: lo cobrado no está al día."
          motivo={clientPaymentsError}
        />
      ) : null}
      <DashboardOverview data={data} zernioAnalytics={zernioAnalytics} />
    </div>
  );
}
