"use client";

import { useEffect, useState, useTransition } from "react";
import { GlassPanel, cn } from "@ai-coo/ui";
import {
  Award,
  Calendar,
  CheckCircle2,
  DollarSign,
  RefreshCw,
  TrendingUp,
  User,
} from "lucide-react";
import { Button } from "@ai-coo/ui";
import {
  getCloserMetricsAction,
  syncCloserCalendlyAction,
  type CloserMetrics,
} from "@/app/sales/closer-actions";
import { useToast } from "@/providers/toast-provider";
import { correrMutacion, type Aviso } from "@/lib/client/correr-accion";
import { RadarPerformanceChart } from "@/components/charts/platform/radar-performance-chart";
import { brandColors } from "@/lib/brand";

function MetricChip({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
        {label}
      </span>
      <span
        className={cn(
          "text-sm font-semibold tabular-nums",
          highlight ? "text-emerald-500" : "text-foreground"
        )}
      >
        {value}
      </span>
    </div>
  );
}

function CloserCard({
  metrics,
  rank,
  onSync,
  syncing,
}: {
  metrics: CloserMetrics;
  rank: number;
  onSync?: () => void;
  syncing?: boolean;
}) {
  const initials = (metrics.closerName ?? "?")
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <GlassPanel className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        {/* Rank + avatar */}
        <div className="relative shrink-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {initials}
          </div>
          {rank <= 3 && (
            <div
              className={cn(
                "absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold",
                rank === 1 && "bg-amber-400 text-amber-900",
                rank === 2 && "bg-slate-300 text-slate-700",
                rank === 3 && "bg-amber-700/60 text-amber-100"
              )}
            >
              {rank}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">
            {metrics.closerName ?? "Closer"}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {metrics.closerEmail ?? ""}
          </p>
        </div>

        <div className="flex items-center gap-1">
          {metrics.calendlyConnected ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
              <CheckCircle2 className="h-2.5 w-2.5" />
              Calendly
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted/50 border border-border/40 px-2 py-0.5 text-[10px] text-muted-foreground font-medium">
              Sin Calendly
            </span>
          )}
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-3 gap-3 border-t border-border/30 pt-3">
        <MetricChip label="Llamadas" value={metrics.totalCalls} />
        <MetricChip
          label="Cerradas"
          value={`${metrics.closedCalls} (${metrics.conversionPct}%)`}
          highlight={metrics.conversionPct >= 40}
        />
        <MetricChip
          label="Revenue"
          value={
            metrics.totalRevenue > 0
              ? `$${metrics.totalRevenue.toLocaleString("es-AR")}`
              : "—"
          }
          highlight={metrics.totalRevenue > 0}
        />
      </div>

      <div className="grid grid-cols-3 gap-3 border-t border-border/30 pt-3">
        <MetricChip
          label="Score IA"
          value={metrics.avgScore != null ? `${metrics.avgScore}/100` : "—"}
        />
        <MetricChip
          label="Comisión"
          value={
            metrics.commissionPct ? `${metrics.commissionPct}%` : "No asignada"
          }
        />
        <MetricChip
          label="A cobrar"
          value={
            metrics.commissionAmount > 0
              ? `$${metrics.commissionAmount.toLocaleString("es-AR")}`
              : "—"
          }
          highlight={metrics.commissionAmount > 0}
        />
      </div>

      {/* Sync manual */}
      {metrics.calendlyConnected && onSync && (
        <div className="border-t border-border/30 pt-3">
          <Button
            size="sm"
            variant="ghost"
            onClick={onSync}
            disabled={syncing}
            className="h-7 text-xs gap-1.5 text-muted-foreground"
          >
            <RefreshCw className={cn("h-3 w-3", syncing && "animate-spin")} />
            {syncing ? "Sincronizando…" : "Sincronizar Calendly"}
          </Button>
        </div>
      )}
    </GlassPanel>
  );
}

const PERIOD_OPTIONS = [
  { label: "Últimos 30 días", value: 30 },
  { label: "Últimos 60 días", value: 60 },
  { label: "Últimos 90 días", value: 90 },
] as const;


/**
 * Sincroniza el Calendly de un closer (SCRUM-504). Un rechazo esperable (sin
 * integración, conexión vencida, Calendly que limita las consultas) se avisa
 * con su motivo; si la acción lanza, con el texto fijo. Con éxito avisa los
 * números y llama a `alSincronizar`.
 */
export function sincronizarCalendlyDelCloser(
  closerId: string,
  avisar: (aviso: Aviso) => void,
  alSincronizar: () => void
): Promise<void> {
  return correrMutacion({
    accion: () => syncCloserCalendlyAction(closerId),
    avisar,
    tituloError: "Error en sync",
    etiqueta: "[ClosersRanking] sincronizar",
    alExito: (result) => {
      avisar({
        title: `Sync: ${result.inserted} nuevas, ${result.updated} actualizadas`,
        variant: "success",
      });
      alSincronizar();
    },
  });
}

export function ClosersRanking() {
  const { push } = useToast();
  const [metrics, setMetrics] = useState<CloserMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<30 | 60 | 90>(30);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function loadMetrics(days: number) {
    setLoading(true);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    getCloserMetricsAction(since)
      .then((data) =>
        setMetrics(data.sort((a, b) => b.closedCalls - a.closedCalls))
      )
      .catch(() => push({ title: "Error al cargar métricas" }))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadMetrics(period);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  function handleSync(closerId: string) {
    setSyncingId(closerId);
    startTransition(async () => {
      try {
        await sincronizarCalendlyDelCloser(closerId, push, () => loadMetrics(period));
      } finally {
        setSyncingId(null);
      }
    });
  }

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-52 rounded-xl bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!metrics.length) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/40">
          <User className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Sin closers registrados</p>
          <p className="text-xs text-muted-foreground mt-1">
            Los miembros del equipo con rol &ldquo;Closer&rdquo; aparecerán aquí con sus métricas.
          </p>
        </div>
      </div>
    );
  }

  const totalRevenue = metrics.reduce((s, m) => s + m.totalRevenue, 0);
  const totalCalls = metrics.reduce((s, m) => s + m.totalCalls, 0);
  const totalClosed = metrics.reduce((s, m) => s + m.closedCalls, 0);
  const teamConversion = totalCalls > 0 ? Math.round((totalClosed / totalCalls) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Resumen del equipo */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: User, label: "Closers", value: metrics.length },
          { icon: Calendar, label: "Llamadas", value: totalCalls },
          { icon: TrendingUp, label: "Conversión", value: `${teamConversion}%` },
          {
            icon: DollarSign,
            label: "Revenue total",
            value: totalRevenue > 0 ? `$${totalRevenue.toLocaleString("es-AR")}` : "—",
          },
        ].map(({ icon: Icon, label, value }) => (
          <GlassPanel key={label} className="px-4 py-3 flex items-center gap-3">
            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                {label}
              </p>
              <p className="text-base font-semibold tabular-nums">{value}</p>
            </div>
          </GlassPanel>
        ))}
      </div>

      {/* Selector de período */}
      <div className="flex items-center gap-2">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setPeriod(opt.value)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              period === opt.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted/40 text-muted-foreground hover:bg-muted/70"
            )}
          >
            {opt.label}
          </button>
        ))}
        <Award className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
        <span className="text-xs text-muted-foreground">Ranking por cierres</span>
      </div>

      {/* Radar comparativo de closers */}
      {metrics.length >= 2 && (() => {
        const maxConv = Math.max(...metrics.map((m) => m.conversionPct), 1);
        const maxScore = Math.max(...metrics.map((m) => m.avgScore ?? 0), 1);
        const maxRevenue = Math.max(...metrics.map((m) => m.totalRevenue), 1);
        const maxCalls = Math.max(...metrics.map((m) => m.totalCalls), 1);

        const radarMetrics = [
          { key: "conversion", label: "Conversión" },
          { key: "score", label: "Score IA" },
          { key: "revenue", label: "Revenue" },
          { key: "calls", label: "Volumen" },
        ];

        const RADAR_COLORS = [brandColors.primary, "#0F6E56", "#185FA5", "#D97706", "#E11D48"];

        const series = metrics.slice(0, 5).map((m, i) => ({
          label: (m.closerName ?? "Closer").split(" ")[0] ?? "Closer",
          color: RADAR_COLORS[i] ?? brandColors.primary,
          values: {
            conversion: maxConv > 0 ? (m.conversionPct / maxConv) * 100 : 0,
            score: maxScore > 0 ? ((m.avgScore ?? 0) / maxScore) * 100 : 0,
            revenue: maxRevenue > 0 ? (m.totalRevenue / maxRevenue) * 100 : 0,
            calls: maxCalls > 0 ? (m.totalCalls / maxCalls) * 100 : 0,
          },
        }));

        return (
          <div className="rounded-xl border border-border bg-card dark:border-glass dark:bg-glass p-4 space-y-3">
            <div>
              <p className="text-sm font-medium text-foreground">Comparativa del equipo</p>
              <p className="text-xs text-muted-foreground">Radar multidimensional por closer</p>
            </div>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <RadarPerformanceChart
                metrics={radarMetrics.map((rm) => ({ key: rm.key, label: rm.label }))}
                series={series.map((s) => ({
                  label: s.label,
                  color: s.color,
                  values: s.values,
                }))}
                className="max-w-[280px]"
              />
              <div className="space-y-2">
                {series.map((s) => (
                  <div key={s.label} className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                    <span className="text-xs font-medium text-foreground">{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {metrics.map((m, i) => (
          <CloserCard
            key={m.closerId}
            metrics={m}
            rank={i + 1}
            onSync={() => handleSync(m.closerId)}
            syncing={syncingId === m.closerId}
          />
        ))}
      </div>
    </div>
  );
}
