import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { ClosingOverview } from "@/components/closing";
import { PageLoading } from "@/components/shared/page-loading";
import { getGHLIntegrationStatusAction } from "@/app/ghl/actions";
import { listLeadsTableAction } from "@/app/sales/lead-actions";
import { getTeamMembersAction } from "@/app/team/actions";

async function ClosingPageContent() {
  const [ghlStatus, leadsTable, teamMembers] = await Promise.all([
    getGHLIntegrationStatusAction(),
    // Devuelve su error como valor (SCRUM-504): la pantalla se dibuja igual
    // (calendario y llamadas) y el seguimiento muestra el motivo.
    listLeadsTableAction(),
    // El equipo es para asignar responsables: si falla, la tabla igual sirve.
    getTeamMembersAction()
      .then((resultado) => (resultado.success ? resultado.data : []))
      .catch((error: unknown) => {
        unstable_rethrow(error);
        return [];
      }),
  ]);

  return (
    <ClosingOverview
      ghlCalendars={ghlStatus.connected ? ghlStatus.connectedCalendars : []}
      ghlSelectedCalendarIds={ghlStatus.selectedCalendarIds}
      leadsTable={leadsTable.success ? leadsTable.data : null}
      leadsTableError={leadsTable.success ? null : leadsTable.error}
      teamMembers={teamMembers}
    />
  );
}

export default function ClosingPage() {
  return (
    <Suspense fallback={<PageLoading label="Cargando closing…" />}>
      <ClosingPageContent />
    </Suspense>
  );
}
