"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@ai-coo/ui";
import { aceptarInvitacionAction } from "@/app/team/actions";
import { correrAccion } from "@/lib/client/correr-accion";
import { paths } from "@/routes";

/** El botón de `/invite` para quien tiene la sesión del email invitado. */
export function AceptarInvitacion({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const aceptar = () => {
    setError(null);
    startTransition(async () => {
      await correrAccion({
        accion: () => aceptarInvitacionAction(token),
        alTerminar: (resultado) => {
          if (!resultado.success) {
            setError(resultado.error);
            return;
          }
          router.push(paths.platform.dashboard);
          router.refresh();
        },
        avisar: (aviso) => setError(aviso.description ?? aviso.title),
        tituloError: "No se pudo aceptar la invitación",
        etiqueta: "[invite] aceptarInvitacionAction",
      });
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Vas a unirte con tu cuenta <strong className="text-foreground">{email}</strong>.
      </p>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="button" className="w-full" disabled={pending} onClick={aceptar}>
        {pending ? "Uniendo…" : "Unirme al equipo"}
      </Button>
    </div>
  );
}
