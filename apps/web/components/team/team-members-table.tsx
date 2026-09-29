"use client";

import { useTransition } from "react";
import { Badge, Button, DataTable } from "@ai-coo/ui";
import {
  deactivateMemberAction,
  updateMemberRoleAction,
} from "@/app/team/actions";
import { es } from "@/lib/locale/es";
import { useToast } from "@/providers/toast-provider";
import { formatRelativeTime } from "@/lib/format";
import type { CustomRole, TeamMember } from "@/types/team";

const selectClass =
  "h-8 rounded-md border border-border bg-background px-2 text-xs dark:border-white/[0.08] dark:bg-[#1A1A1A]";

function MemberAvatar({ member }: { member: TeamMember }) {
  const initials = member.name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (member.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={member.avatarUrl}
        alt=""
        className="h-8 w-8 rounded-full object-cover"
      />
    );
  }

  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/15 text-[11px] font-medium text-brand-700 dark:text-brand-300">
      {initials}
    </div>
  );
}

function MemberActions({
  member,
  canManage,
  onUpdated,
}: {
  member: TeamMember;
  canManage: boolean;
  onUpdated: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  if (!canManage) return null;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 text-xs"
      disabled={pending || member.status === "inactive"}
      onClick={() =>
        startTransition(async () => {
          const result = await deactivateMemberAction(member.id);
          if (!result.success) {
            push({ title: "No se pudo desactivar", description: result.error });
          }
          onUpdated();
        })
      }
    >
      Desactivar
    </Button>
  );
}

function RoleSelect({
  member,
  customRoles,
  canManage,
  onUpdated,
}: {
  member: TeamMember;
  customRoles: CustomRole[];
  canManage: boolean;
  onUpdated: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const { push } = useToast();
  const assignableRoles = customRoles.filter((r) => !r.isDefault);

  if (member.role === "founder") {
    return <Badge variant="secondary">Fundador</Badge>;
  }

  if (!canManage) {
    return (
      <span className="text-sm">{member.customRoleName ?? "Sin rol asignado"}</span>
    );
  }

  if (assignableRoles.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">
        Creá un rol custom en la pestaña Roles
      </span>
    );
  }

  return (
    <select
      className={selectClass}
      value={member.customRoleId ?? ""}
      disabled={pending}
      onChange={(e) =>
        startTransition(async () => {
          const result = await updateMemberRoleAction(member.id, {
            customRoleId: e.target.value || null,
          });
          if (!result.success) {
            push({ title: "No se pudo cambiar el rol", description: result.error });
          }
          onUpdated();
        })
      }
    >
      <option value="">Sin rol</option>
      {assignableRoles.map((role) => (
        <option key={role.id} value={role.id}>
          {role.name}
        </option>
      ))}
    </select>
  );
}

export function TeamMembersTable({
  members,
  customRoles,
  canManage = false,
  onUpdated,
}: {
  members: TeamMember[];
  customRoles: CustomRole[];
  canManage?: boolean;
  onUpdated?: () => void;
}) {
  const refresh = () => onUpdated?.();

  return (
    <DataTable
      title="Miembros"
      columns={[
        {
          key: "avatar",
          header: "",
          cell: (r) => <MemberAvatar member={r} />,
        },
        { key: "name", header: "Nombre", cell: (r) => r.name },
        { key: "email", header: "Email", cell: (r) => r.email },
        {
          key: "role",
          header: "Rol",
          cell: (r) => (
            <RoleSelect
              member={r}
              customRoles={customRoles}
              canManage={canManage}
              onUpdated={refresh}
            />
          ),
        },
        {
          key: "status",
          header: "Estado",
          cell: (r) => (
            <Badge variant={r.status === "active" ? "success" : "secondary"}>
              {r.status === "active"
                ? es.status.member.active
                : es.status.member.inactive}
            </Badge>
          ),
        },
        {
          key: "login",
          header: "Último acceso",
          cell: (r) => formatRelativeTime(r.lastLogin),
        },
        {
          key: "actions",
          header: "Acciones",
          cell: (r) => (
            <MemberActions
              member={r}
              canManage={canManage}
              onUpdated={refresh}
            />
          ),
        },
      ]}
      data={members}
      keyExtractor={(r) => r.id}
    />
  );
}
