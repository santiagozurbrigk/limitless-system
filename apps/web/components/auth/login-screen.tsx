"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, GlassPanel, Input, Label, Text, cn } from "@ai-coo/ui";
import { AppLogo } from "@/components/brand";
import {
  MOCK_CLIENT_CREDENTIALS,
  MOCK_SUPER_ADMIN_CREDENTIALS,
} from "@/lib/auth/mock-credentials";
import { paths } from "@/routes";
import { ESCONDIDO } from "@/lib/release/escondido";

export type LoginVariant = "client" | "superAdmin";

const COPY = {
  client: {
    title: "Bienvenido de nuevo",
    subtitle: "Inicia sesión en tu espacio de trabajo",
    submitLabel: "Iniciar sesión",
    redirectTo: paths.platform.dashboard,
    hint: `Demo: ${MOCK_CLIENT_CREDENTIALS.email} / ${MOCK_CLIENT_CREDENTIALS.password}`,
    validate: (email: string, password: string) =>
      email === MOCK_CLIENT_CREDENTIALS.email &&
      password === MOCK_CLIENT_CREDENTIALS.password,
  },
  superAdmin: {
    title: "Acceso interno",
    subtitle: "Restringido a personal autorizado únicamente",
    submitLabel: "Acceder al panel",
    redirectTo: paths.superAdmin.dashboard,
    hint: `Interno: ${MOCK_SUPER_ADMIN_CREDENTIALS.email} / ${MOCK_SUPER_ADMIN_CREDENTIALS.password}`,
    validate: (email: string, password: string) =>
      email === MOCK_SUPER_ADMIN_CREDENTIALS.email &&
      password === MOCK_SUPER_ADMIN_CREDENTIALS.password,
  },
} as const;

type LoginScreenProps = {
  variant: LoginVariant;
  redirectTo?: string;
  showForgotPassword?: boolean;
};

export function LoginScreen({
  variant,
  redirectTo,
  showForgotPassword = false,
}: LoginScreenProps) {
  const router = useRouter();
  const copy = COPY[variant];
  const destination = redirectTo ?? copy.redirectTo;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!copy.validate(email.trim(), password)) {
      setError("Credenciales incorrectas. Usa las credenciales de demostración.");
      return;
    }
    setLoading(true);
    setTimeout(() => {
      router.push(destination);
    }, 400);
  };

  const isSuperAdmin = variant === "superAdmin";

  return (
    <GlassPanel
      className={cn(
        "p-8 shadow-xl",
        isSuperAdmin && "border-amber-500/20 shadow-amber-500/5"
      )}
      glow={!isSuperAdmin}
    >
      <div className="mb-8 flex flex-col items-center gap-4 text-center">
        {isSuperAdmin ? (
          <Badge
            variant="secondary"
            className="border-amber-500/30 bg-amber-500/10 text-amber-200/90"
          >
            Super Admin
          </Badge>
        ) : (
          <AppLogo display="login" href={undefined} className="pointer-events-none" />
        )}
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">{copy.title}</h1>
          <Text muted className="text-sm">
            {copy.subtitle}
          </Text>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="tu@empresa.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Contraseña</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <p className="rounded-md border border-border/50 bg-muted/20 px-3 py-2 text-2xs text-muted-foreground">
          {copy.hint}
        </p>

        <Button
          type="submit"
          className={cn(
            "w-full",
            isSuperAdmin && "bg-amber-600 hover:bg-amber-600/90 text-white"
          )}
          disabled={loading}
        >
          {loading ? "Accediendo…" : copy.submitLabel}
        </Button>

        {showForgotPassword && !ESCONDIDO.olvideContrasena && (
          <p className="text-center">
            <Link
              href={paths.auth.forgotPassword}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </p>
        )}
      </form>
    </GlassPanel>
  );
}
