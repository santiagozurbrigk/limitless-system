"use client";

import { useActionState, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, GlassPanel, Input, Label, Text } from "@ai-coo/ui";
import { AppLogo } from "@/components/brand";
import {
  signInAction,
  signUpAction,
  type AuthActionState,
} from "@/app/auth/actions";
import {
  TEMP_PASSWORD_EXPIRED_MESSAGE,
  TEMP_PASSWORD_EXPIRED_QUERY,
} from "@/lib/auth/temp-password-expiry";
import {
  CUENTA_DESACTIVADA_MESSAGE,
  CUENTA_DESACTIVADA_QUERY,
} from "@/lib/auth/cuenta-desactivada";

const initialState: AuthActionState = {};

export function SupabaseLoginForm() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [callbackError, setCallbackError] = useState<string | null>(null);
  const action = mode === "login" ? signInAction : signUpAction;
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
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
            {mode === "login" ? "Bienvenido de nuevo" : "Crea tu cuenta"}
          </h1>
          <Text muted className="text-sm">
            {mode === "login"
              ? "Inicia sesión en tu espacio de trabajo"
              : "Registra tu organización en AI COO"}
          </Text>
        </div>
      </div>

      <form action={formAction} className="space-y-4">
        {mode === "signup" && (
          <div className="space-y-2">
            <Label htmlFor="fullName">Nombre</Label>
            <Input
              id="fullName"
              name="fullName"
              autoComplete="name"
              placeholder="Tu nombre"
            />
          </div>
        )}
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
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
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
          {pending
            ? "Procesando…"
            : mode === "login"
              ? "Iniciar sesión"
              : "Crear cuenta"}
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        {mode === "login" ? (
          <>
            ¿Primera vez?{" "}
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => setMode("signup")}
            >
              Crear cuenta
            </button>
          </>
        ) : (
          <>
            ¿Ya tienes cuenta?{" "}
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => setMode("login")}
            >
              Iniciar sesión
            </button>
          </>
        )}
      </p>

      <p className="mt-4 text-center">
        <Link
          href="#"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={(e) => e.preventDefault()}
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </p>
    </GlassPanel>
  );
}
