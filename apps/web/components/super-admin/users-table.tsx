"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Button, DataTable, Input } from "@ai-coo/ui";
import {
  deactivateUserAction,
  regenerateTempPasswordAction,
} from "@/app/super-admin/actions";
import {
  deleteUserAction,
  previewUserDeletionAction,
} from "@/app/super-admin/delete-actions";
import { DeletionDialog } from "@/components/super-admin/deletion-dialog";
import { TempCredentialsDialog } from "@/components/shared/temp-credentials-dialog";
import type { TempCredentials } from "@/lib/auth/temp-credentials";
import { formatOrgDateTime } from "@/lib/super-admin/format-org-datetime";
import type { AdminUserRow } from "@/types/super-admin";
import { rutasDeAdministracion, type BaseDeAdministracion } from "@/lib/administracion/rutas";

type RoleFilter = "all" | "founder" | "admin" | "other";

const ROLE_LABEL: Record<string, string> = {
  founder: "Founder",
  admin: "Admin",
  project_manager: "Gestor de proyecto",
  setter: "Setter",
  operator: "Operador",
  viewer: "Viewer",
};

function formatDate(iso: string | null, timezone: string | null): string {
  return formatOrgDateTime(iso, timezone, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function UsersTable({
  users,
  base,
}: {
  users: AdminUserRow[];
  base?: BaseDeAdministracion;
}) {
  const rutas = rutasDeAdministracion(base);
  const [filter, setFilter] = useState<RoleFilter>("all");
  const [orgFilter, setOrgFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [tempCredentials, setTempCredentials] = useState<TempCredentials | null>(
    null
  );
  const [aEliminar, setAEliminar] = useState<AdminUserRow | null>(null);

  const organizations = useMemo(() => {
    const names = new Map<string, string>();
    for (const user of users) {
      names.set(user.organizationId, user.organizationName);
    }
    return [...names.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (orgFilter !== "all" && u.organizationId !== orgFilter) return false;
      if (filter === "founder" && u.role !== "founder") return false;
      if (filter === "admin" && u.role !== "admin") return false;
      if (
        filter === "other" &&
        (u.role === "founder" || u.role === "admin")
      ) {
        return false;
      }
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.organizationName.toLowerCase().includes(q)
      );
    });
  }, [users, filter, orgFilter, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["all", "Todos"],
            ["founder", "Founders"],
            ["admin", "Admins"],
            ["other", "Otros roles"],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            size="sm"
            variant={filter === key ? "default" : "outline"}
            onClick={() => setFilter(key)}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-muted-foreground" htmlFor="org-filter">
          Organización
        </label>
        <select
          id="org-filter"
          value={orgFilter}
          onChange={(e) => setOrgFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="all">Todas</option>
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
      </div>
      <Input
        placeholder="Buscar por nombre, email u organización…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-md"
      />
      <DataTable
        title="Usuarios"
        columns={[
          { key: "name", header: "Nombre", cell: (r) => r.name },
          { key: "email", header: "Email", cell: (r) => r.email },
          {
            key: "org",
            header: "Organización",
            cell: (r) => r.organizationName,
          },
          {
            key: "role",
            header: "Rol",
            cell: (r) => ROLE_LABEL[r.role] ?? r.role,
          },
          {
            key: "status",
            header: "Estado",
            cell: (r) => (
              <Badge variant={r.status === "active" ? "success" : "secondary"}>
                {r.status === "active" ? "Activo" : "Inactivo"}
              </Badge>
            ),
          },
          {
            key: "login",
            header: "Último login",
            cell: (r) => formatDate(r.lastLogin, r.organizationTimezone),
          },
          {
            key: "actions",
            header: "Acciones",
            cell: (r) => (
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link
                    href={rutas.organizacion(
                      r.organizationId
                    )}
                  >
                    Ver org
                  </Link>
                </Button>
                {r.status === "active" && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pendingId === r.id}
                      onClick={async () => {
                        setPendingId(r.id);
                        const res = await regenerateTempPasswordAction(r.id);
                        setPendingId(null);
                        if (res.success) {
                          setTempCredentials(res.data);
                        }
                      }}
                    >
                      Regenerar contraseña
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pendingId === r.id}
                      onClick={async () => {
                        setPendingId(r.id);
                        await deactivateUserAction(r.id);
                        setPendingId(null);
                      }}
                    >
                      Desactivar
                    </Button>
                  </>
                )}
                {/* Fuera del bloque de "activo": una cuenta desactivada es
                    justamente la que más se quiere dar de baja del todo. */}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setAEliminar(r)}
                >
                  Eliminar
                </Button>
              </div>
            ),
          },
        ]}
        data={filtered}
        keyExtractor={(r) => r.id}
      />
      <DeletionDialog
        open={aEliminar !== null}
        onOpenChange={(open) => {
          if (!open) setAEliminar(null);
        }}
        titulo={`Eliminar a ${aEliminar?.name ?? ""}`}
        cargarVistaPrevia={() => previewUserDeletionAction(aEliminar?.id ?? "")}
        ejecutar={(confirmacion) =>
          deleteUserAction({ profileId: aEliminar?.id ?? "", confirmacion })
        }
      />
      {tempCredentials ? (
        <TempCredentialsDialog
          open
          email={tempCredentials.email}
          tempPassword={tempCredentials.tempPassword}
          onClose={() => setTempCredentials(null)}
        />
      ) : null}
    </div>
  );
}
