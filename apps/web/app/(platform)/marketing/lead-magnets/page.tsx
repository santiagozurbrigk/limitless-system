import { getLeadMagnetsAction } from "@/app/marketing/lead-magnets-actions";
import { LeadMagnetsOverview } from "@/components/marketing/lead-magnets/lead-magnets-overview";
import { EmptyState } from "@/components/shared/empty-state";

export const metadata = { title: "Lead Magnets" };

export default async function LeadMagnetsPage() {
  const leadMagnets = await getLeadMagnetsAction();
  // La lista devuelve su error como valor (SCRUM-520): si falla, el motivo en
  // vez de "Sin lead magnets registrados" y métricas en cero.
  if (!leadMagnets.success) {
    return (
      <div className="p-6">
        <EmptyState title="No se pudieron cargar los lead magnets" description={leadMagnets.error} />
      </div>
    );
  }
  return <LeadMagnetsOverview initialLeadMagnets={leadMagnets.data} />;
}
