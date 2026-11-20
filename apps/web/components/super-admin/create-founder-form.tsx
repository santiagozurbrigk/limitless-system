"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button, Input, Label } from "@ai-coo/ui";
import { createFounderAccountAction } from "@/app/super-admin/actions";
import { TempCredentialsDialog } from "@/components/shared/temp-credentials-dialog";
import type { TempCredentials } from "@/lib/auth/temp-credentials";
import { rutasDeAdministracion, type BaseDeAdministracion } from "@/lib/administracion/rutas";

export function CreateFounderForm({ base }: { base?: BaseDeAdministracion } = {}) {
  const rutas = rutasDeAdministracion(base);
  const [orgName, setOrgName] = useState("");
  const [founderName, setFounderName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tempCredentials, setTempCredentials] = useState<TempCredentials | null>(
    null
  );
  const [createdOrgId, setCreatedOrgId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createFounderAccountAction({
        organizationName: orgName,
        founderName,
        email,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setCreatedOrgId(res.data.organizationId);
      setTempCredentials(
        res.data.tempCredentials ?? {
          email: res.data.email,
          tempPassword: res.data.password,
        }
      );
    });
  }

  function handleCloseCredentials() {
    setTempCredentials(null);
    setOrgName("");
    setFounderName("");
    setEmail("");
    setCreatedOrgId(null);
  }

  return (
    <>
      <form
        onSubmit={onSubmit}
        className="mx-auto max-w-lg space-y-6 rounded-xl border border-border/60 p-8"
      >
        <p className="text-sm text-muted-foreground">
          Se generará una contraseña temporal de 12 caracteres. El founder debe
          cambiarla en su primer acceso.
        </p>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <div className="space-y-2">
          <Label htmlFor="orgName">Nombre de la organización</Label>
          <Input
            id="orgName"
            required
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="founderName">Nombre del founder</Label>
          <Input
            id="founderName"
            required
            value={founderName}
            onChange={(e) => setFounderName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email del founder</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creando…" : "Crear cuenta"}
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href={rutas.organizaciones}>Cancelar</Link>
        </Button>
        {createdOrgId && (
          <Button asChild variant="outline" size="sm">
            <Link href={rutas.organizacion(createdOrgId)}>
              Ver organización creada
            </Link>
          </Button>
        )}
      </form>

      {tempCredentials && (
        <TempCredentialsDialog
          open
          onClose={handleCloseCredentials}
          email={tempCredentials.email}
          tempPassword={tempCredentials.tempPassword}
        />
      )}
    </>
  );
}
