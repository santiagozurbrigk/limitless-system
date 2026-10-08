import { SalesMetricsRedesign } from "@/components/sales/sales-metrics-redesign";
import { getFrequentObjectionsAction } from "@/app/sales/actions";
import { getSalesMetricsSnapshotsAction } from "@/app/sales/metrics-actions";

/**
 * Las dos lecturas devuelven su error como valor (SCRUM-504): la pantalla se
 * dibuja igual y avisa el motivo (objeciones y métricas importadas). No hay
 * error boundary en la plataforma (SCRUM-108). Sin Supabase configurado, las
 * acciones devuelven las objeciones de ejemplo y ninguna métrica importada.
 */
export default async function SalesMetricsPage() {
  const [objeciones, snapshots] = await Promise.all([
    getFrequentObjectionsAction(),
    getSalesMetricsSnapshotsAction(),
  ]);

  return (
    <SalesMetricsRedesign
      frequentObjections={objeciones.success ? objeciones.data : undefined}
      frequentObjectionsError={objeciones.success ? null : objeciones.error}
      importedSnapshots={snapshots.success ? snapshots.data : []}
      importedSnapshotsError={snapshots.success ? null : snapshots.error}
    />
  );
}
