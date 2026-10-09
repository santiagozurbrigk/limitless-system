"use client";

import { useActionState, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, GlassPanel, Input, Label, Text } from "@ai-coo/ui";
import { AppLogo } from "@/components/brand";
import { signInAction, type AuthActionState } from "@/app/auth/actions";
import {
  TEMP_PASSWORD_EXPIRED_MESSAGE,
  TEMP_PASSWORD_EXPIRED_QUERY,
} from "@/lib/auth/temp-password-expiry";
import {
  CUENTA_DESACTIVADA_MESSAGE,
  CUENTA_DESACTIVADA_QUERY,
} from "@/lib/auth/cuenta-desactivada";
import { ESCONDIDO } from "@/lib/release/escondido";
import {
  LINK_RECUPERACION_VENCIDO_MESSAGE,
  LINK_RECUPERACION_VENCIDO_QUERY,
} from "@/lib/auth/recuperar-contrasena";
import { paths } from "@/routes";

const initialState: AuthActionState = {};

export function SupabaseLoginForm() {
  const searchParams = useSearchParams();
  const [callbackError, setCallbackError] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(signInAction, initialState);

  useEffect(() => {
    if (searchParams.get("error") === LINK_RECUPERACION_VENCIDO_QUERY) {
      setCallbackError(LINK_RECUPERACION_VENCIDO_MESSAGE);
      return;
    }
    if (searchParams.get("error") === "auth_callback") {
      setCallbackError(
        "No se pudo completar el inicio de sesión. Intenta de nuevo."
      );
      return;
    }
    if (searchParams.get("error") === TEMP_PASSWORD_EXPIRED_QUERY) {
      setCallbackError(TEMP_PASSWORD_EXPIRED_MESSAGE);
    }
    if (searchParams.get("error") === CUENTA_DESACTIVADA_QUERY) {
      setCallbackError(CUENTA_DESACTIVADA_MESSAGE);
    }
  }, [searchParams]);

  return (
    <GlassPanel className="p-8 shadow-xl" glow>
      <div className="mb-8 flex flex-col items-center gap-4 text-center">
        <AppLogo display="login" href={undefined} className="pointer-events-none" />
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">
            Bienvenido de nuevo
          </h1>
          <Text muted className="text-sm">
            Inicia sesión en tu espacio de trabajo
          </Text>
        </div>
      </div>

      <form action={formAction} className="space-y-4">
        {/* Volver a la invitación de equipo después de entrar (lo valida signInAction). */}
        {searchParams.get("next") ? (
          <input type="hidden" name="next" value={searchParams.get("next") ?? ""} />
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="tu@empresa.com"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Contraseña</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="Mínimo 6 caracteres"
            minLength={6}
            required
          />
        </div>

        {(state.error || callbackError) && (
          <p className="text-sm text-destructive" role="alert">
            {state.error ?? callbackError}
          </p>
        )}
        {state.success && (
          <p className="text-sm text-emerald-600 dark:text-emerald-400" role="status">
            {state.success}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Procesando…" : "Iniciar sesión"}
        </Button>
      </form>

      {/* SCRUM-23: no hay alta pública; las cuentas se crean por invitación. */}
      <p className="mt-6 text-center text-xs text-muted-foreground">
        ¿No tenés cuenta? El acceso es por invitación: pedíselo a quien administra tu equipo.
      </p>

      {!ESCONDIDO.olvideContrasena && (
        <p className="mt-4 text-center">
          <Link
            href={paths.auth.forgotPassword}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </p>
      )}
    </GlassPanel>
  );
}
