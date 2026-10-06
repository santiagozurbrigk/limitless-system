"use client";

import { useCallback, useEffect, useState } from "react";
import { ModuleSubnav } from "@/components/shared/client";
import { EmptyState } from "@/components/shared/empty-state";
import { getTeamPageContextAction } from "@/app/team/actions";
import { useHashTab } from "@/lib/hooks/use-hash-tab";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { paths } from "@/routes";
import type { CustomRole, TeamInvitation, TeamMember } from "@/types/team";
import { CustomRoleForm } from "./custom-role-form";
import { CustomRolesList } from "./custom-roles-list";
import { TeamInviteModal } from "./team-invite-modal";
import { TeamMembersTable } from "./team-members-table";
import { TeamPendingInvitations } from "./team-pending-invitations";

const TABS = [
  { id: "miembros", label: "Miembros", hash: "miembros" },
  { id: "roles", label: "Roles", hash: "roles" },
] as const;

const DEFAULT_TAB = TABS[0].hash;

export function TeamOverview({
  members: initialMembers,
  roles: initialRoles,
  invitations: initialInvitations,
  canManage: initialCanManage,
}: {
  members: TeamMember[];
  roles: CustomRole[];
  invitations: TeamInvitation[];
  canManage: boolean;
  canEditRates?: boolean;
}) {
  const activeTab = useHashTab(DEFAULT_TAB);
  const root = paths.platform.team.root;

  const [members, setMembers] = useState(initialMembers);
  const [roles, setRoles] = useState(initialRoles);
  const [invitations, setInvitations] = useState(initialInvitations);
  const [canManage, setCanManage] = useState(initialCanManage);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    // Refresco de fondo: si falla, queda lo que ya se ve (la carga inicial de
    // la página es la que muestra el motivo de un error).
    try {
      const resultado = await getTeamPageContextAction();
      if (!resultado.success) return;
      const ctx = resultado.data;
      if (ctx.members.length) setMembers(ctx.members);
      setRoles(ctx.roles);
      setInvitations(ctx.invitations);
      setCanManage(ctx.canManage);
    } catch (error) {
      console.error("[TeamOverview] refrescar equipo", error);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const navTabs = TABS.map((t) => ({
    label: t.label,
    href: `${root}#${t.hash}`,
  }));

  return (
    <div className="space-y-6">
      <ModuleSubnav
        tabs={navTabs}
        isTabActive={(href) => {
          const hash = href.split("#")[1] ?? DEFAULT_TAB;
          return activeTab === hash;
        }}
      />
      {activeTab === "roles" ? (
        <div className="space-y-8">
          {canManage ? (
            <CustomRoleForm onCreated={() => void refresh()} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Solo founders y admins pueden crear roles personalizados.
            </p>
          )}
          <CustomRolesList
            roles={roles}
            canManage={canManage}
            onUpdated={() => void refresh()}
          />
        </div>
      ) : (
        <>
          {canManage ? (
            <div className="flex justify-end">
              <TeamInviteModal roles={roles} onInvited={() => void refresh()} />
            </div>
          ) : null}
          <TeamMembersTable
            members={members}
            customRoles={roles}
            canManage={canManage}
            onUpdated={() => void refresh()}
          />
          {members.length === 0 ? (
            <EmptyState
              title="Todavía no hay miembros en tu equipo"
              description="Invitá al primero desde el botón de arriba para empezar a colaborar."
            />
          ) : null}
          <TeamPendingInvitations
            invitations={invitations}
            onUpdated={() => void refresh()}
          />
        </>
      )}
    </div>
  );
}
