import { listAutomationFlowsAction } from "@/app/marketing/automations-actions";
import { AutomationsDashboard } from "@/components/marketing/automations-dashboard";
import { EmptyState } from "@/components/shared/empty-state";
import { paths } from "@/routes";

export const metadata = { title: "Automatizaciones" };

export default async function AutomatizacionesPage() {
  const resultado = await listAutomationFlowsAction();

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Automatizaciones y flujos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Flujos activos de tus integraciones conectadas
        </p>
      </div>
      {/* Los flujos devuelven su error como valor (SCRUM-520): si ManyChat o la
          base fallan, el motivo en vez de "No hay flujos configurados". */}
      {resultado.success ? (
        <AutomationsDashboard
          flows={resultado.data.flows}
          manychatConnected={resultado.data.manychatConnected}
          integrationsPath={paths.platform.integrations}
        />
      ) : (
        <EmptyState
          title="No se pudieron cargar los flujos"
          description={resultado.error}
        />
      )}
    </div>
  );
}
