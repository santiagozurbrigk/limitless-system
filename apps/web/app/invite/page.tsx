import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@ai-coo/ui";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignOutButton } from "@/components/settings/sign-out-button";
import { cargarInvitacion } from "@/lib/team/cargar-invitacion";
import {
  loginParaInvitacion,
  MENSAJE_INVITACION,
  MENSAJE_INVITACION_NO_CARGADA,
  MENSAJE_SIN_CUENTA,
  vistaDeInvitacionPendiente,
} from "@/lib/team/invitacion";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { AceptarInvitacion } from "./aceptar-invitacion";

/**
 * Aceptar una invitación de equipo (`/invite?token=`).
 *
 * Pública (ver `lib/supabase/public-paths.ts`): el token del link permite VER
 * la invitación. Aceptarla exige la sesión de la cuenta del email invitado
 * (SCRUM-495): esta página no crea cuentas. Sin sesión, manda a iniciar sesión
 * y vuelve acá (`next`); con la sesión de otro email, pide cerrarla.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Invitación al equipo",
  robots: { index: false, follow: false },
};

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
      {children}
    </div>
  );
}

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token: tokenCrudo } = await searchParams;
  const token = typeof tokenCrudo === "string" ? tokenCrudo.trim() : "";

  const invitacion = !isSupabaseConfigured()
    ? ({ estado: "error" } as const)
    : token
      ? await cargarInvitacion(token)
      : ({ estado: "no_existe" } as const);

  let emailDeLaSesion: string | null = null;
  if (invitacion.estado === "pendiente") {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    emailDeLaSesion = user ? (user.email ?? "") : null;
  }

  return (
    <AuthShell>
      <div className="mx-auto w-full max-w-md space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Unite al equipo</h1>
          {invitacion.estado === "pendiente" ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {invitacion.invitadoPor ? `${invitacion.invitadoPor} te invitó` : "Te invitaron"} a{" "}
              <strong className="text-foreground">{invitacion.organizacion}</strong>
              {invitacion.rol ? (
                <>
                  {" "}
                  con el rol <strong className="text-foreground">{invitacion.rol}</strong>
                </>
              ) : null}
              .
            </p>
          ) : null}
        </div>

        {invitacion.estado !== "pendiente" ? (
          <Aviso>
            {invitacion.estado === "error"
              ? MENSAJE_INVITACION_NO_CARGADA
              : MENSAJE_INVITACION[invitacion.estado]}
          </Aviso>
        ) : (
          (() => {
            const vista = vistaDeInvitacionPendiente(invitacion.email, emailDeLaSesion);
            if (vista === "aceptar") {
              return <AceptarInvitacion token={token} email={invitacion.email} />;
            }
            if (vista === "otro_email") {
              return (
                <div className="space-y-4">
                  <Aviso>
                    Iniciaste sesión como <strong>{emailDeLaSesion || "otra cuenta"}</strong>, pero
                    la invitación es para <strong>{invitacion.email}</strong>. Cerrá sesión,
                    volvé a abrir este link y entrá con la cuenta de ese email.
                  </Aviso>
                  <SignOutButton />
                </div>
              );
            }
            return (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Para aceptarla, iniciá sesión con la cuenta de{" "}
                  <strong className="text-foreground">{invitacion.email}</strong>.
                </p>
                <Button asChild className="w-full">
                  <Link href={loginParaInvitacion(token)}>Iniciar sesión</Link>
                </Button>
                <p className="text-center text-xs text-muted-foreground">{MENSAJE_SIN_CUENTA}</p>
              </div>
            );
          })()
        )}
      </div>
    </AuthShell>
  );
}
