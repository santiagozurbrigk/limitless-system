import { unstable_rethrow } from "next/navigation";
import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { getFrequentObjections, mockFrequentObjectionSummaries } from "@/lib/metrics/frequent-objections";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { SalesMetricsRedesign } from "@/components/sales/sales-metrics-redesign";
import { getSalesMetricsSnapshotsAction } from "@/app/sales/metrics-actions";
import type { FrequentObjectionsResult } from "@/types/sales";
import type { MetricsSnapshot } from "@/app/sales/metrics-actions";

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

async function loadSnapshots(): Promise<MetricsSnapshot[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    return await getSalesMetricsSnapshotsAction();
  } catch (error) {
    unstable_rethrow(error);
    return [];
  }
}

export default async function SalesMetricsPage() {
  const [frequentObjections, importedSnapshots] = await Promise.all([
    loadFrequentObjections(),
    loadSnapshots(),
  ]);

  return (
    <SalesMetricsRedesign
      frequentObjections={frequentObjections}
      importedSnapshots={importedSnapshots}
    />
  );
}
