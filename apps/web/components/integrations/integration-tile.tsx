"use client";

import { ArrowRight } from "lucide-react";
import { cn } from "@ai-coo/ui";
import { estaConectada, type IntegrationHealth } from "@/lib/integrations/health";
import { getIntegrationDefinition } from "@/lib/integrations/registry";
import { formatRelativeTime } from "@/lib/format";
import { IntegrationLogo } from "./integration-logo";
import {
  IntegrationStateBadge,
  IntegrationStateDot,
} from "./integration-state-badge";

/**
 * Una integración en el grid.
 *
 * La tarjeta entera es un botón: **toda** la configuración vive en el panel de
 * detalle. Antes cada tarjeta tenía hasta tres botones con significados que
 * cambiaban según el proveedor —"Gestionar" sincronizaba en Calendly, abría un
 * sheet en ManyChat y navegaba a otra página en Discord— y las cinco
 * integraciones que no entraban en ese molde no tenían tarjeta.
 *
 * Conectar desde acá también obligaba a decidir a ciegas: el botón mandaba
 * directo a OAuth sin decir qué permisos pedía ni qué alimentaba.
 */
export function IntegrationTile({
  health,
  onOpen,
}: {
  health: IntegrationHealth;
  onOpen: () => void;
}) {
  const definition = getIntegrationDefinition(health.provider);
  const isConnected = estaConectada(health);
  const blocking = health.issues.filter(
    (issue) => issue.level !== "info",
  ).length;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Abrir ${definition.name}`}
      className={cn(
        "group relative flex w-full flex-col gap-3 overflow-hidden rounded-xl border p-4 text-left",
        "transition-colors duration-200",
        "border-border/50 bg-muted/30 hover:border-border",
        "dark:border-glass dark:bg-glass dark:backdrop-blur-md hover:dark:border-glass-strong hover:dark:bg-glass-hover",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        health.state === "error" && "border-red-500/30 dark:border-red-500/30",
        health.state === "attention" &&
          "border-amber-500/25 dark:border-amber-500/25",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <IntegrationLogo provider={health.provider} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-foreground">
              {definition.name}
            </p>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <IntegrationStateDot state={health.state} />
              {health.accountLabel ?? definition.feeds[0]}
            </p>
          </div>
        </div>
        <ArrowRight
          className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-muted-foreground"
          aria-hidden
        />
      </div>

      <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
        {definition.summary}
      </p>

      <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1">
        {blocking > 0 ? (
          <IntegrationStateBadge state={health.state} />
        ) : isConnected ? (
          <span className="truncate text-[10px] text-muted-foreground/70">
            {health.records != null && health.recordsLabel
              ? `${health.records.toLocaleString("es")} ${health.recordsLabel}`
              : "Conectada"}
            {health.lastSyncAt
              ? ` · ${formatRelativeTime(health.lastSyncAt)}`
              : ""}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground/70">
            {definition.auth === "import"
              ? "Importación puntual"
              : "Sin conectar"}
          </span>
        )}
      </div>
    </button>
  );
}
