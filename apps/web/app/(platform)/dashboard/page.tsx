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

  return (
    <DashboardPageContent
      frequentObjections={frequentObjections}
      zernioAnalytics={zernioAnalytics}
      customMetrics={customMetrics}
    />
  );
}
