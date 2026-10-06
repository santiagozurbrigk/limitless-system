import { TeamOverview } from "@/components/team/team-overview";
import { getTeamPageContextAction } from "@/app/team/actions";
import { EmptyState } from "@/components/shared/empty-state";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default async function TeamPage() {
  if (!isSupabaseConfigured()) {
    return (
      <TeamOverview
        members={[]}
        roles={[]}
        invitations={[]}
        canManage={false}
      />
    );
  }

  const resultado = await getTeamPageContextAction();
  // La lectura devuelve su error como valor (SCRUM-497): la pantalla muestra
  // el motivo en vez de la pantalla de error de Next.
  if (!resultado.success) {
    return (
      <EmptyState title="No se pudo cargar el equipo" description={resultado.error} />
    );
  }

  const ctx = resultado.data;
  return (
    <TeamOverview
      members={ctx.members}
      roles={ctx.roles}
      invitations={ctx.invitations}
      canManage={ctx.canManage}
      canEditRates={ctx.canEditRates}
    />
  );
}
