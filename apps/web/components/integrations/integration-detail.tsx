"use client";

import type { ReactNode } from "react";
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, FileText } from "lucide-react";
import { Button, cn } from "@ai-coo/ui";
import { estaConectada, type IntegrationHealth } from "@/lib/integrations/health";
import {
  AUTH_LABELS,
  CATEGORY_LABELS,
  TRANSPORT_LABELS,
  getIntegrationDefinition,
} from "@/lib/integrations/registry";
import { formatRelativeTime } from "@/lib/format";
import { IntegrationLogo } from "./integration-logo";
import { IntegrationStateBadge } from "./integration-state-badge";
import { IntegrationIssues } from "./integration-issues";
import { IntegrationConnectActions } from "./integration-connect-actions";

/**
 * El detalle de una integración: qué mueve, cómo está y qué se configura.
 *
 * Es una vista, no un modal. El contenido —flujos de datos, incidencias con su
 * texto de acción y formularios de configuración con secretos que hay que
 * copiar— no entra cómodo en un diálogo, y además varios formularios abren sus
 * propios diálogos: anidarlos daría problemas de foco.
 *
 * Antes esta pantalla no existía. Lo más parecido era una tarjeta con dos líneas
 * de descripción y un botón cuyo significado cambiaba según el proveedor, más
 * —para cinco de las catorce integraciones— un panel suelto al final de la
 * página que había que ir a buscar scrolleando.
 */
export function IntegrationDetail({
  health,
  settings,
  onBack,
}: {
  health: IntegrationHealth;
  /** Configuración propia del proveedor, cuando la tiene. */
  settings?: ReactNode;
  onBack: () => void;
}) {
  const definition = getIntegrationDefinition(health.provider);
  const isConnected = estaConectada(health);

  return (
    <div className="space-y-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="-ml-2 h-8 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
        Todas las integraciones
      </Button>

      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <IntegrationLogo provider={health.provider} size="lg" />
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight">
                {definition.name}
              </h2>
              <IntegrationStateBadge state={health.state} />
            </div>
            <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
              {definition.summary}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground/80">
              <span>{CATEGORY_LABELS[definition.category]}</span>
              <span aria-hidden>·</span>
              <span>{AUTH_LABELS[definition.auth]}</span>
              {isConnected && health.accountLabel ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="truncate">{health.accountLabel}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <IntegrationConnectActions
          provider={health.provider}
          state={health.state}
        />
      </div>

      <IntegrationIssues issues={health.issues} />

      {/* Lo que hay hoy en Limitless gracias a esta integración */}
      {isConnected ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Stat
            label={health.recordsLabel ?? "Registros"}
            value={
              health.records != null
                ? health.records.toLocaleString("es")
                : "Sin conteo"
            }
          />
          <Stat
            label="Últimos datos recibidos"
            value={formatRelativeTime(health.lastSyncAt)}
            hint={
              health.lastSyncAt
                ? new Date(health.lastSyncAt).toLocaleString("es-AR")
                : "Todavía no llegó nada desde que se conectó."
            }
          />
        </div>
      ) : null}

      {/* Configuración propia del proveedor */}
      {settings ? (
        <section className="space-y-3">
          <SectionTitle>Configuración</SectionTitle>
          <div className="rounded-2xl border border-border bg-card p-5 dark:border-glass dark:bg-glass">
            {settings}
          </div>
        </section>
      ) : null}

      {/* Qué datos mueve */}
      <section className="space-y-3">
        <SectionTitle>Qué datos mueve</SectionTitle>
        <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border dark:border-glass">
          {definition.dataFlows.map((flow, index) => (
            <li
              key={index}
              className="flex flex-wrap items-start gap-3 px-4 py-3"
            >
              <span
                className={cn(
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                  flow.direction === "in"
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
                title={
                  flow.direction === "in"
                    ? `Limitless lee de ${definition.name}`
                    : `Limitless escribe en ${definition.name}`
                }
              >
                {flow.direction === "in" ? (
                  <ArrowDownLeft className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium">{flow.label}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {flow.lands}
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                {TRANSPORT_LABELS[flow.transport]}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Qué deja de funcionar sin esto */}
      <section className="space-y-3">
        <SectionTitle>Qué alimenta en Limitless</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {definition.feeds.map((feed) => (
            <span
              key={feed}
              className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-[3px] text-[11px] font-medium text-primary dark:text-brand-400"
            >
              {feed}
            </span>
          ))}
        </div>
        {definition.localDocs ? (
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <FileText className="h-3 w-3" aria-hidden />
            Documentación de la API capturada en el repo:{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
              {definition.localDocs}
            </code>
          </p>
        ) : null}
      </section>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3 dark:border-glass dark:bg-glass">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      {hint ? (
        <p className="mt-0.5 text-[11px] text-muted-foreground/80">{hint}</p>
      ) : null}
    </div>
  );
}
