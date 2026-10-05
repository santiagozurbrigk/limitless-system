"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, GlassPanel, Input, Label } from "@ai-coo/ui";
import { completePasswordChangeAction } from "@/app/auth/force-password-change/actions";
import { correrMutacion } from "@/lib/client/correr-accion";
import { paths } from "@/routes";

export default function ForcePasswordChangePage() {
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirm) {
      setError("Las contraseñas no coinciden");
      return;
    }
    if (newPassword.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
      return;
    }

    setLoading(true);

    await correrMutacion({
      accion: () => completePasswordChangeAction(newPassword),
      // El error se muestra debajo del formulario, como los de validación.
      avisar: (aviso) => {
        setError(aviso.description ?? aviso.title);
        setLoading(false);
      },
      tituloError: "No se pudo cambiar la contraseña",
      etiqueta: "[ForcePasswordChange] cambiar contraseña",
      alExito: () => {
        router.push(paths.platform.dashboard);
        router.refresh();
      },
    });
  };

  return (
    <GlassPanel className="p-8 shadow-xl" glow>
      <div className="mb-6 space-y-1 text-center">
        <h1 className="text-xl font-semibold tracking-tight">
          Creá tu contraseña
        </h1>
        <p className="text-sm text-muted-foreground">
          Por seguridad, necesitás cambiar tu contraseña temporal antes de
          continuar.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="new-password">Nueva contraseña</Label>
          <Input
            id="new-password"
            type="password"
            placeholder="Mínimo 8 caracteres"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-password">Confirmar contraseña</Label>
          <Input
            id="confirm-password"
            type="password"
            placeholder="Repetí la contraseña"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Guardando…" : "Crear contraseña y continuar"}
        </Button>
      </form>
    </GlassPanel>
  );
}
