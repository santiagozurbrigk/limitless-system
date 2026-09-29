import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { SalesCallsList } from "@/components/sales/sales-calls-list";
import { getSalesCallsAction } from "@/app/fathom/actions";

export default async function LlamadasVentaPage() {
  const result = await getSalesCallsAction();

  return (
    <div className="space-y-6">
      <PageHeader description="Llamadas de cierre grabadas con Fathom — análisis IA por llamada" />
      {result.ok ? (
        <SalesCallsList calls={result.calls} />
      ) : (
        <EmptyState
          variant="inline"
          icon={<AlertTriangle className="h-5 w-5" />}
          title={result.error}
          description="Probá recargar la página. Si sigue pasando, avisá al equipo técnico: el detalle quedó registrado."
        />
      )}
    </div>
  );
}
