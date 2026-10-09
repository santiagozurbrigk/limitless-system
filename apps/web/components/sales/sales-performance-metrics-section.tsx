"use client";

import { useEffect, useState } from "react";
import {
  getSalesPerformanceMetricsAction,
  type SalesMetricsPeriod,
} from "@/app/sales/metrics-actions";
import { formatPercent } from "@/lib/format";
import type { SalesPerformanceMetrics } from "@/types/sales";
import { Button, cn } from "@ai-coo/ui";
import { leerConMotivo, type Lectura } from "@/lib/client/correr-accion";

/**
 * Lee las métricas del período. `motivo` si no se pudieron leer (lo devuelve
 * la acción; si fue inesperado, el texto fijo).
 */
export function cargarMetricasDeRendimiento(
  period: SalesMetricsPeriod
): Promise<Lectura<SalesPerformanceMetrics>> {
  return leerConMotivo(
    () => getSalesPerformanceMetricsAction(period),
    "[SalesPerformanceMetricsSection]"
  );
}

function MetricTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

export function SalesPerformanceMetricsSection() {
  const [period, setPeriod] = useState<SalesMetricsPeriod>("month");
  const [metrics, setMetrics] = useState<SalesPerformanceMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void cargarMetricasDeRendimiento(period).then((lectura) => {
      if (cancelled) return;
      if (lectura.ok) {
        setMetrics(lectura.data);
      } else {
        setError(lectura.motivo);
        setMetrics(null);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [period]);

  if (loading) {
    return (
      <div className="rounded-lg border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
        Cargando métricas de rendimiento…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-6 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["month", "Este mes"],
            ["30d", "Últimos 30 días"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={period === value ? "default" : "outline"}
            className={cn(period === value && "pointer-events-none")}
            onClick={() => setPeriod(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      <Section title="Rendimiento de Closer">
        <div className="grid gap-3 md:grid-cols-2">
          <MetricTile
            label="Close rate"
            value={formatPercent(metrics.closer.closeRate)}
            hint="Cierres / asistencias"
          />
          <MetricTile
            label="Show rate"
            value={formatPercent(metrics.closer.showRate)}
            hint="Asistencias / agendas"
          />
        </div>
      </Section>

      <Section title="Rendimiento de Leads">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricTile label="Leads" value={String(metrics.leads.leadsCount)} />
          <MetricTile label="Agendas" value={String(metrics.leads.agendasCount)} />
          <MetricTile
            label="En nutrición"
            value={String(metrics.leads.nurturingCount)}
          />
          <MetricTile label="Perdidos" value={String(metrics.leads.lostCount)} />
        </div>
      </Section>

      <Section title="Rendimiento de Agendas">
        <MetricTile
          label="Agendas totales"
          value={String(metrics.schedules.totalAgendas)}
        />
      </Section>

      <Section title="Rendimiento de Llamadas">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MetricTile label="Cierres" value={String(metrics.calls.cierres)} />
          <MetricTile
            label="Agendas en seguimiento"
            value={String(metrics.calls.followUpScheduled)}
          />
          <MetricTile
            label="Señas"
            value={
              metrics.calls.senas === null
                ? "Próximamente"
                : String(metrics.calls.senas)
            }
            hint={
              metrics.calls.senas === null
                ? "TODO: agregar estado seña al schema"
                : undefined
            }
          />
          <MetricTile
            label="Asistencias"
            value={String(metrics.calls.asistencias)}
          />
          <MetricTile
            label="Inasistencias"
            value={String(metrics.calls.noShows)}
          />
          <MetricTile
            label="NO cierres"
            value={String(metrics.calls.noCierres)}
          />
        </div>
      </Section>
    </div>
  );
}
