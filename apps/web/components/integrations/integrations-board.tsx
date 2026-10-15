"use client";

import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@ai-coo/ui";
import type { IntegrationProvider } from "@/constants/integrations";
import {
  coincideConElFiltro,
  type FiltroDeIntegraciones,
  type IntegrationHealth,
  type IntegrationsSummary,
} from "@/lib/integrations/health";
import {
  CATEGORY_DESCRIPTIONS,
  groupByCategory,
} from "@/lib/integrations/registry";
import { IntegrationTile } from "./integration-tile";
import { IntegrationDetail } from "./integration-detail";
import { IntegrationsOauthToasts } from "./integrations-oauth-toasts";

type Filter = FiltroDeIntegraciones;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "atencion", label: "Requieren atención" },
  { id: "conectadas", label: "Conectadas" },
  { id: "sin_conectar", label: "Sin conectar" },
];

const matches = coincideConElFiltro;

/**
 * La pantalla de Integraciones, entera.
 *
 * Antes eran dos superficies distintas pegadas una debajo de la otra: un grid de
 * nueve tarjetas y cinco paneles sueltos con su propio diseño, más un bloque de
 * assets de video que no era una integración. Nada decía cuántas integraciones
 * estaban rotas sin recorrerlas de a una.
 *
 * Ahora hay una sola: resumen arriba, filtro por estado, y la misma tarjeta para
 * las catorce. El detalle abre en lugar del grid en vez de en un diálogo, porque
 * varios formularios de configuración abren diálogos propios.
 */
export function IntegrationsBoard({
  healths,
  summary,
  settings,
}: {
  healths: IntegrationHealth[];
  summary: IntegrationsSummary;
  /** Configuración propia de cada proveedor, renderizada en el servidor. */
  settings: Partial<Record<IntegrationProvider, ReactNode>>;
}) {
  const [filter, setFilter] = useState<Filter>("todas");
  const [selected, setSelected] = useState<IntegrationProvider | null>(null);

  function open(provider: IntegrationProvider) {
    setSelected(provider);
    // El detalle reemplaza al grid en el mismo lugar: sin esto, abrir una
    // integración desde el final de la lista deja la vista a mitad de camino.
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const visible = useMemo(
    () => healths.filter((health) => matches(health, filter)),
    [healths, filter],
  );
  const groups = useMemo(() => groupByCategory(visible), [visible]);

  const selectedHealth = selected
    ? healths.find((health) => health.provider === selected)
    : undefined;

  if (selectedHealth) {
    return (
      <>
        <IntegrationsOauthToasts />
        <IntegrationDetail
          health={selectedHealth}
          settings={settings[selectedHealth.provider]}
          onBack={() => setSelected(null)}
        />
      </>
    );
  }

  return (
    <div className="space-y-6">
      <IntegrationsOauthToasts />

      {/* Resumen: la pregunta "¿está todo bien?" contestada sin recorrer nada */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((option) => {
          const count =
            option.id === "todas"
              ? summary.total
              : option.id === "atencion"
                ? summary.needAttention
                : option.id === "conectadas"
                  ? summary.connected
                  : summary.notConnected;

          const isActive = filter === option.id;
          const isAlarm = option.id === "atencion" && count > 0;

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setFilter(option.id)}
              aria-pressed={isActive}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                isActive
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "border-border/60 text-muted-foreground hover:text-foreground",
                !isActive &&
                  isAlarm &&
                  "border-amber-500/40 text-amber-600 dark:text-amber-400",
              )}
            >
              {option.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] tabular-nums",
                  isActive ? "bg-primary/15" : "bg-muted",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/60 px-4 py-8 text-center text-xs text-muted-foreground">
          No hay integraciones en este filtro.
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.category} className="space-y-3">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
              </h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                {CATEGORY_DESCRIPTIONS[group.category]}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((health) => (
                <IntegrationTile
                  key={health.provider}
                  health={health}
                  onOpen={() => open(health.provider)}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
