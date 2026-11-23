"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@ai-coo/ui";
import { formatUsd } from "@/lib/super-admin/org-metrics";
import { EmptyState } from "@/components/shared/empty-state";
import type { AdminHoldingRow } from "@/lib/super-admin/holdings-admin";
import { createHoldingOrgAction } from "@/app/super-admin/actions";
import {
  deleteOrganizationAction,
  previewOrganizationDeletionAction,
} from "@/app/super-admin/delete-actions";
import { DeletionDialog } from "@/components/super-admin/deletion-dialog";
import { TempCredentialsDialog } from "@/components/shared/temp-credentials-dialog";
import type { TempCredentials } from "@/lib/auth/temp-credentials";
import { brand } from "@/lib/brand";
import { rutasDeAdministracion, type BaseDeAdministracion } from "@/lib/administracion/rutas";

function CreateHoldingDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tempCredentials, setTempCredentials] = useState<TempCredentials | null>(
    null
  );
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createHoldingOrgAction({ name, founderEmail: email });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setName("");
      setEmail("");
      setTempCredentials(res.data.tempCredentials);
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Nuevo holding
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo holding</DialogTitle>
            <DialogDescription>
              Creá la cuenta del dueño del holding. Al confirmar vas a recibir
              las credenciales temporales para compartirle.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="holding-name">Nombre del holding</Label>
              <Input
                id="holding-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="holding-email">Email del dueño</Label>
              <Input
                id="holding-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Creando…" : "Crear holding"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      {tempCredentials && (
        <TempCredentialsDialog
          open
          onClose={() => setTempCredentials(null)}
          email={tempCredentials.email}
          tempPassword={tempCredentials.tempPassword}
        />
      )}
    </>
  );
}

export function HoldingsAdminPanel({
  holdings,
  base,
}: {
  holdings: AdminHoldingRow[];
  base?: BaseDeAdministracion;
}) {
  const rutas = rutasDeAdministracion(base);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [aEliminar, setAEliminar] = useState<AdminHoldingRow | null>(null);
  const detail = holdings.find((h) => h.id === detailId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Creá el usuario del dueño del holding. Él agrega y gestiona sus
          negocios desde su cuenta en {brand.name}.
        </p>
        <CreateHoldingDialog />
      </div>

      {holdings.length === 0 ? (
        <EmptyState
          variant="inline"
          title="No hay holdings creados"
          description="Creá uno para dar acceso al dueño del portfolio."
        />
      ) : (
        <div className="space-y-4">
          {holdings.map((holding) => (
            <div
              key={holding.id}
              className="rounded-xl border border-border/60 p-5 space-y-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{holding.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {holding.founderName ?? "—"} · {holding.founderEmail ?? "—"}
                  </p>
                </div>
                <Badge variant="secondary">
                  {holding.businesses.length} negocios
                </Badge>
              </div>

              <p className="text-sm">
                MRR total del portfolio:{" "}
                <span className="font-medium">
                  {formatUsd(holding.portfolioMrr)}
                </span>
              </p>

              {holding.businesses.length > 0 && (
                <ul className="text-sm text-muted-foreground space-y-1">
                  {holding.businesses.map((b) => (
                    <li key={b.id}>
                      · {b.business_name ?? b.business_org?.name ?? "Negocio"}
                      {b.revenue_share_pct != null &&
                        ` (${b.revenue_share_pct}%)`}
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDetailId(holding.id)}
                >
                  Ver portfolio
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <Link href={rutas.organizacion(holding.id)}>
                    Ver detalle
                  </Link>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setAEliminar(holding)}
                >
                  Eliminar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={Boolean(detail)} onOpenChange={() => setDetailId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{detail?.name} — Portfolio</DialogTitle>
            <DialogDescription>
              Negocios vinculados a este holding, con MRR combinado y revenue
              share de cada uno.
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <p>
                MRR combinado:{" "}
                <strong>{formatUsd(detail.portfolioMrr)}</strong>
              </p>
              {detail.businesses.length === 0 ? (
                <p className="text-muted-foreground">
                  El dueño aún no agregó negocios desde su cuenta.
                </p>
              ) : (
                <ul className="space-y-2">
                  {detail.businesses.map((b) => (
                    <li
                      key={b.id}
                      className="rounded-lg border border-border/50 p-3"
                    >
                      <p className="font-medium">
                        {b.business_name ?? b.business_org?.name}
                      </p>
                      <p className="text-muted-foreground">
                        Revenue share: {b.revenue_share_pct ?? 0}%
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <DeletionDialog
        open={aEliminar !== null}
        onOpenChange={(open) => {
          if (!open) setAEliminar(null);
        }}
        titulo={`Eliminar el holding ${aEliminar?.name ?? ""}`}
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
