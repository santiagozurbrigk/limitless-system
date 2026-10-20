import { listAutomationFlowsAction } from "@/app/marketing/automations-actions";
import { AutomationsDashboard } from "@/components/marketing/automations-dashboard";
import { paths } from "@/routes";
import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";

export const metadata = { title: "Automatizaciones" };

export default async function AutomatizacionesPage() {
  const sinAcceso = await exigirModuloDeLaPagina("marketing");
  if (sinAcceso) return sinAcceso;

  const { flows, manychatConnected } = await listAutomationFlowsAction();

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Automatizaciones y flujos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Flujos activos de tus integraciones conectadas
        </p>
      </div>
      <AutomationsDashboard
        flows={flows}
        manychatConnected={manychatConnected}
        integrationsPath={paths.platform.integrations}
      />
    </div>
  );
}
