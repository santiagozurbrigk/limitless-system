import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { getFrequentObjections, mockFrequentObjectionSummaries } from "@/lib/metrics/frequent-objections";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { SalesMetricsRedesign } from "@/components/sales/sales-metrics-redesign";
import { getSalesMetricsSnapshotsAction } from "@/app/sales/metrics-actions";
import type { FrequentObjectionsResult } from "@/types/sales";
import type { MetricsSnapshot } from "@/app/sales/metrics-actions";
import type { MutationResult } from "@/lib/server/action-result";

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

/**
 * La lectura devuelve su error como valor (SCRUM-504): la pantalla se dibuja
 * igual, sin las métricas importadas, y avisa el motivo. No hay error boundary
 * en la plataforma (SCRUM-108).
 */
async function loadSnapshots(): Promise<MutationResult<MetricsSnapshot[]>> {
  if (!isSupabaseConfigured()) return { success: true, data: [] };
  return getSalesMetricsSnapshotsAction();
}

export default async function SalesMetricsPage() {
  const [frequentObjections, snapshots] = await Promise.all([
    loadFrequentObjections(),
    loadSnapshots(),
  ]);

  return (
    <SalesMetricsRedesign
      frequentObjections={frequentObjections}
      importedSnapshots={snapshots.success ? snapshots.data : []}
      importedSnapshotsError={snapshots.success ? null : snapshots.error}
    />
  );
}
