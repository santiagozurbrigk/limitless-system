"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Button, DataTable, Input } from "@ai-coo/ui";
import { paths } from "@/routes";
import type { OrganizationStatus } from "@ai-coo/types";
import type { AdminOrganizationListRow } from "@/types/super-admin";
import {
  ETIQUETA_DE_ESTADO_DE_ORG,
  VARIANTE_DE_ESTADO_DE_ORG,
  accionDeEstado,
} from "@/lib/super-admin/estado-de-org";
import { formatOrgDate } from "@/lib/super-admin/format-org-datetime";
import { setOrganizationStatusAction } from "@/app/super-admin/actions";
import {
  deleteOrganizationAction,
  previewOrganizationDeletionAction,
} from "@/app/super-admin/delete-actions";
import { DeletionDialog } from "@/components/super-admin/deletion-dialog";

// "Desconocido" no tiene filtro propio: se ve en "Todas".
type Filter = "all" | OrganizationStatus;

export function OrganizationsList({
  organizations,
}: {
  organizations: AdminOrganizationListRow[];
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [aEliminar, setAEliminar] = useState<AdminOrganizationListRow | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return organizations.filter((org) => {
      if (filter !== "all" && org.status !== filter) return false;
      if (!q) return true;
      return (
        org.name.toLowerCase().includes(q) ||
        org.founderEmail.toLowerCase().includes(q) ||
        org.founderName.toLowerCase().includes(q)
      );
    });
  }, [organizations, filter, search]);

  async function toggleStatus(org: AdminOrganizationListRow, activar: boolean) {
    setPendingId(org.id);
    await setOrganizationStatusAction(org.id, activar);
    setPendingId(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["all", "Todas"],
              ["active", "Activas"],
              ["paused", "Pausadas"],
              ["churned", "Dadas de baja"],
            ] as const
          ).map(([key, label]) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={filter === key ? "default" : "outline"}
              onClick={() => setFilter(key)}
            >
              {label}
            </Button>
          ))}
        </div>
        <Button asChild size="sm">
          <Link href={paths.superAdmin.organizationsNew}>Crear cuenta</Link>
        </Button>
      </div>

      <Input
        placeholder="Buscar por nombre o email…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-md"
      />

      <DataTable
        title="Organizaciones"
        columns={[
          { key: "name", header: "Nombre", cell: (r) => r.name },
          {
            key: "industry",
            header: "Industria",
            cell: (r) => r.industry ?? "—",
          },
          {
            key: "users",
            header: "Miembros",
            cell: (r) => r.usersCount,
          },
          {
            key: "status",
            header: "Estado",
            cell: (r) => (
              <Badge variant={VARIANTE_DE_ESTADO_DE_ORG[r.status]}>
                {ETIQUETA_DE_ESTADO_DE_ORG[r.status]}
              </Badge>
            ),
          },
          {
            key: "byok",
            header: "BYOK",
            cell: (r) =>
              r.byokEnabled ? (
                <span className="text-xs font-medium text-emerald-500">✓</span>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              ),
          },
          {
            key: "created",
            header: "Creada",
            cell: (r) => formatOrgDate(r.createdAt, r.timezone),
          },
          {
            key: "actions",
            header: "Acciones",
            cell: (r) => (
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link href={paths.superAdmin.organizationDetail(r.id)}>
                    Ver detalle
                  </Link>
                </Button>
                {(() => {
                  const accion = accionDeEstado(r.status);
                  if (!accion) return null;
                  return (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pendingId === r.id}
                      onClick={() => toggleStatus(r, accion.activar)}
                    >
                      {pendingId === r.id ? "Procesando…" : accion.etiqueta}
                    </Button>
                  );
                })()}
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
        titulo={`Eliminar ${aEliminar?.name ?? ""}`}
        cargarVistaPrevia={() =>
          previewOrganizationDeletionAction(aEliminar?.id ?? "")
        }
        ejecutar={(confirmacion) =>
          deleteOrganizationAction({
            organizationId: aEliminar?.id ?? "",
            confirmacion,
          })
        }
      />
    </div>
  );
}
