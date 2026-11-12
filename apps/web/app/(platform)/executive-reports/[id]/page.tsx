import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ReportBody } from "@/components/executive-reports";
import { PageHeader } from "@/components/shared/page-header";
import { getExecutiveReportByIdAction } from "@/app/executive-reports/actions";
import { getReportCadence } from "@/lib/executive-reports/cadences";
import { paths } from "@/routes/paths";
import { SinAcceso } from "@/components/platform/sin-acceso";
import { getPermissionModuleLabel } from "@/constants/permission-modules";
import { esRechazoPorModulo, exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";

export default async function ExecutiveReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sinAcceso = await exigirModuloDeLaPagina("operations");
  if (sinAcceso) return sinAcceso;

  const { id } = await params;
  const report = await getExecutiveReportByIdAction(id);
  // Sin Operaciones la lectura vuelve rechazada: pasa si los permisos cambian
  // entre el guardia y la lectura, que los vuelve a mirar (SCRUM-541).
  if (esRechazoPorModulo(report)) {
    return <SinAcceso moduleLabel={getPermissionModuleLabel(report.moduleId)} />;
  }
  if (!report) notFound();

  const cadence = getReportCadence(report.period);

  return (
    <div className="space-y-6 p-6">
      <Link
        href={paths.platform.executiveReports.history}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Todos los reportes
      </Link>

      <PageHeader
        title={report.title}
        description={`${cadence.label} · ${cadence.title} — ${cadence.watches}`}
      />

      <div className="rounded-2xl border border-border bg-card p-6 dark:border-glass dark:bg-glass">
        <ReportBody report={report} />
      </div>
    </div>
  );
}
