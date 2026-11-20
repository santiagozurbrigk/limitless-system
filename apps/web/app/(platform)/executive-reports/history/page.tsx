import { FileText } from "lucide-react";
import { ReportsGrid } from "@/components/executive-reports";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { listExecutiveReportsAction } from "@/app/executive-reports/actions";
import { REPORT_CADENCES } from "@/lib/executive-reports/cadences";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";

/**
 * Historial de reportes.
 *
 * No tiene entrada en el navbar a propósito: se llega desde el panel de la
 * barra superior. Es el lugar para volver sobre reportes viejos, no la puerta
 * de entrada a la función.
 */
export default async function ExecutiveReportsHistoryPage() {
  const sinAcceso = await exigirModuloDeLaPagina("operations");
  if (sinAcceso) return sinAcceso;

  const reports = await listExecutiveReportsAction();

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Reportes ejecutivos"
        description="Los genera la IA sola con los datos de tu operación. No hay generación manual: cada cadencia corre en su horario."
      />

      {reports.length === 0 ? (
        <EmptyState
          variant="inline"
          icon={<FileText className="h-5 w-5" />}
          title="Todavía no hay reportes"
          description="El primero aparece cuando haya datos suficientes de tu operación. Se generan solos, no hay nada que apretar."
        />
      ) : (
        <ReportsGrid reports={reports} />
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Las tres cadencias</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {REPORT_CADENCES.map((cadence) => (
            <div
              key={cadence.id}
              className="rounded-2xl border border-border bg-card p-4 dark:border-glass dark:bg-glass"
            >
              <p className="text-sm font-medium">
                {cadence.label}{" "}
                <span className="text-muted-foreground">· {cadence.title}</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{cadence.watches}</p>
              <p className="mt-2 text-xs text-muted-foreground">{cadence.schedule}</p>
              {cadence.caution ? (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  {cadence.caution}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
