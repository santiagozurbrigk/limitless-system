"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button, GlassPanel, Input, Label } from "@ai-coo/ui";
import {
  requestPasswordResetAction,
  type AuthActionState,
} from "@/app/auth/actions";
import { paths } from "@/routes";

const initialState: AuthActionState = {};

/**
 * "¿Olvidaste tu contraseña?" (SCRUM-16): pide el email y manda el link para
 * elegir una contraseña nueva. La respuesta es la misma exista o no la cuenta.
 */
export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(
    requestPasswordResetAction,
    initialState
  );

  return (
    <GlassPanel className="p-8 shadow-xl" glow>
      <div className="mb-6 space-y-1 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Recuperar contraseña</h1>
        <p className="text-sm text-muted-foreground">
          Te mandamos un link para elegir una contraseña nueva.
        </p>
      </div>

      {state.success ? (
        <p className="text-sm text-foreground" role="status">
          {state.success}
        </p>
      ) : (
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="tu@email.com"
              required
            />
          </div>
          {state.error && (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Enviando…" : "Enviar link"}
          </Button>
        </form>
      )}

      <p className="mt-6 text-center">
        <Link
          href={paths.auth.login}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Volver a iniciar sesión
        </Link>
      </p>
    </GlassPanel>
  );
}
