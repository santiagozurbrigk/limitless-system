"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, ExternalLink, KeyRound, Loader2 } from "lucide-react";
import { Badge, Button, Input, SteppedAlert } from "@ai-coo/ui";
import {
  removeClaudeApiKeyAction,
  saveClaudeApiKeyAction,
  type ClaudeApiKeyStatus,
} from "@/app/settings/actions";
import {
  removePlatformClaudeKeyAction,
  savePlatformClaudeKeyAction,
} from "@/app/super-admin/platform-ai-actions";
import { FieldLabel } from "./field-label";
import { SectionHeader } from "@ai-coo/ui";
import { useToast } from "@/providers/toast-provider";
import { brand } from "@/lib/brand";

/**
 * Cargar, ver y quitar la clave de Claude.
 *
 * - `scope="org"` (Ajustes → IA): la clave de la organización. Sin ella, la org
 *   no tiene IA (SCRUM-7).
 * - `scope="platform"` (Super-admin → Infraestructura): la clave de la
 *   plataforma, sólo para el trabajo de super-admin.
 */
export function ClaudeApiKeySettings({
  initialStatus,
  scope = "org",
}: {
  initialStatus: ClaudeApiKeyStatus;
  scope?: "org" | "platform";
}) {
  const isPlatform = scope === "platform";
  const saveAction = isPlatform ? savePlatformClaudeKeyAction : saveClaudeApiKeyAction;
  const removeAction = isPlatform ? removePlatformClaudeKeyAction : removeClaudeApiKeyAction;
  const { push } = useToast();
  const [status, setStatus] = useState(initialStatus);
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [connecting, startConnect] = useTransition();
  const [removing, startRemove] = useTransition();

  const handleConnect = () => {
    setError(null);
    startConnect(async () => {
      const result = await saveAction(apiKey);
      if (!result.success) {
        setError(result.error);
        push({ title: "No se pudo conectar", description: result.error });
        return;
      }

      setApiKey("");
      const savedStatus = result.data?.status ?? "valid";
      setStatus({
        hasKey: true,
        status: savedStatus,
        lastValidated: new Date().toISOString(),
        keyPreview: result.data?.maskedKey ?? null,
      });
      if (savedStatus === "valid_no_credits") {
        push({
          title: "API key guardada",
          description:
            "Tu key es válida pero tu cuenta de Anthropic no tiene créditos cargados.",
        });
      } else {
        push({
          title: "API key conectada",
          description: isPlatform
            ? "El trabajo de super-admin usará esta cuenta de Claude."
            : "Las llamadas de IA usarán tu cuenta de Claude.",
          variant: "success",
        });
      }
    });
  };

  const handleRemove = () => {
    if (
      !window.confirm(
        isPlatform
          ? "¿Eliminar la clave de la plataforma? Los resúmenes del cerebro global dejan de generarse."
          : `¿Eliminar tu API key? Sin clave, las funciones de IA de ${brand.name} quedan desactivadas para tu cuenta.`
      )
    ) {
      return;
    }

    setError(null);
    startRemove(async () => {
      const result = await removeAction();
      if (!result.success) {
        setError(result.error);
        push({ title: "No se pudo eliminar", description: result.error });
        return;
      }

      setStatus({
        hasKey: false,
        status: "none",
        lastValidated: null,
        keyPreview: null,
      });
      push({
        title: "API key eliminada",
        description: "Las funciones de IA quedan desactivadas hasta que cargues otra.",
        variant: "success",
      });
    });
  };

  const validatedLabel = status.lastValidated
    ? new Date(status.lastValidated).toLocaleString("es", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <section>
      <SectionHeader
        icon={KeyRound}
        title={isPlatform ? "Clave de Claude de la plataforma" : "Claude API Key"}
        variant="settings"
      />
      {isPlatform ? (
        <p className="mb-2 text-sm text-muted-foreground">
          La usa sólo el trabajo de super-admin (resúmenes del cerebro global). Las
          organizaciones nunca la usan: cada una trabaja con su propia clave.
        </p>
      ) : null}
      <p className="mb-4 text-sm text-muted-foreground">
        Necesitás una cuenta en{" "}
        <Link
          href="https://console.anthropic.com"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-brand-600 underline underline-offset-2 hover:text-brand-500 dark:text-brand-400"
        >
          console.anthropic.com
        </Link>
        . El costo promedio para uso típico es $10–30/mes.
      </p>

      {status.hasKey ? (
        <div className="space-y-4 rounded-xl border border-border/60 bg-card/40 p-4 dark:border-glass dark:bg-glass">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="success">Conectada</Badge>
            {status.status === "valid_no_credits" ? (
              <Badge variant="warning">Sin créditos</Badge>
            ) : null}
            {status.status === "invalid" ? (
              <Badge variant="destructive">Inválida</Badge>
            ) : null}
          </div>
          {status.keyPreview ? (
            <p className="text-sm text-foreground">
              Tu API key:{" "}
              <span className="font-mono text-muted-foreground">
                {status.keyPreview}
              </span>
            </p>
          ) : null}
          {status.status === "valid_no_credits" ? (
            <SteppedAlert
              variant="warning"
              title="Sin créditos en Anthropic"
              icon={<AlertTriangle className="h-4 w-4" />}
              action={
                <Button size="sm" variant="outline" asChild>
                  <Link
                    href="https://console.anthropic.com/settings/billing"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5"
                  >
                    Ir a billing de Anthropic
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              }
            >
              <p>
                Tu API key es válida pero tu cuenta de Anthropic no tiene créditos
                cargados. Las funciones de IA no van a funcionar hasta que cargues
                saldo en{" "}
                <Link
                  href="https://console.anthropic.com/settings/billing"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
                >
                  console.anthropic.com
                </Link>
                .
              </p>
            </SteppedAlert>
          ) : null}
          {validatedLabel ? (
            <p className="text-xs text-muted-foreground">
              Validada el: {validatedLabel}
            </p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="border-red-500/40 text-red-400 hover:bg-red-500/10"
            disabled={removing}
            onClick={handleRemove}
          >
            {removing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Eliminando…
              </>
            ) : (
              "Eliminar key"
            )}
          </Button>
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-border/60 bg-card/40 p-4 dark:border-glass dark:bg-glass">
          <div>
            <p className="text-sm font-medium text-foreground">
              {isPlatform ? "Cargá la API key de la plataforma" : "Conectá tu API key de Claude"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {isPlatform
                ? "Creá una key en la cuenta de Anthropic de la plataforma y pegala acá."
                : `Las funciones de IA de ${brand.name} usan tu cuenta de Anthropic. Sin una key cargada, quedan desactivadas. Creá una key en la consola y pegala acá.`}
            </p>
            <Link
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs text-brand-600 dark:text-brand-400 hover:underline"
            >
              Obtener API key en console.anthropic.com
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>

          <div className="space-y-2">
            <FieldLabel htmlFor="claude-api-key">API key</FieldLabel>
            <div className="relative max-w-md">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="claude-api-key"
                type="password"
                placeholder="sk-ant-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="pl-9"
                disabled={connecting}
              />
            </div>
          </div>

          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          ) : null}

          <Button
            type="button"
            className="bg-brand-600 hover:bg-brand-700"
            disabled={!apiKey.trim() || connecting}
            onClick={handleConnect}
          >
            {connecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Validando…
              </>
            ) : (
              "Conectar"
            )}
          </Button>
        </div>
      )}
    </section>
  );
}
