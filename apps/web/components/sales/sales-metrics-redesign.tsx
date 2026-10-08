"use client";

import { useState } from "react";
import {
  Target,
  Users,
  CalendarCheck,
  PhoneCall,
  Clock,
  CheckCircle,
  XCircle,
  UserMinus,
  Heart,
  Activity,
  DollarSign,
  Wallet,
} from "lucide-react";
import { GlassPanel } from "@ai-coo/ui";
import { formatPercent } from "@/lib/format";
import { formatMoney } from "@/lib/finance/format";
import {
  ChartShell,
  DualAreaChart,
  FunnelChartPanel,
  PieDistributionChart,
  RingDistributionChart,
} from "@/components/charts/platform";
import { FrequentObjectionsSection } from "./frequent-objections-section";
import { CloserPerformancePanel } from "./closer-performance-panel";
import { SalesTeamPerformanceSection } from "./sales-team-performance-section";
// Componentes del módulo de métricas
import { DateRangePicker, getDefaultDateRange } from "./metrics/date-range-picker";
import { KpiHeroCard } from "./metrics/kpi-hero-card";
import { StatCard } from "./metrics/stat-card";
import { GaugeSideCard } from "./metrics/gauge-side-card";
import { SummaryStrip } from "./metrics/summary-strip";
import { useSalesMetrics } from "./metrics/use-sales-metrics";
import type { DateRange } from "./metrics/date-range-picker";
import { useZonaDeLaOrganizacion } from "@/providers/zona-de-la-organizacion-provider";
import type { FrequentObjectionsResult } from "@/types/sales";
import type { MetricsSnapshot } from "@/app/sales/metrics-actions";

// ─── Componente principal ─────────────────────────────────────────────────────

/**
 * Aviso de una lectura que no se pudo hacer, con su motivo (SCRUM-504): lo
 * devuelve la acción; si fue inesperado, el texto fijo.
 */
export function AvisoDeLecturaFallida({ titulo, motivo }: { titulo: string; motivo: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
    >
      <span className="font-medium">{titulo}</span> {motivo}
    </div>
  );
}

export function SalesMetricsRedesign({
  frequentObjections,
  frequentObjectionsError = null,
  importedSnapshots = [],
  importedSnapshotsError = null,
}: {
  frequentObjections?: FrequentObjectionsResult;
  /** Por qué no se pudieron leer las objeciones en el servidor, si falló. */
  frequentObjectionsError?: string | null;
  importedSnapshots?: MetricsSnapshot[];
  /** Por qué no se pudieron leer las métricas importadas, si falló. */
  importedSnapshotsError?: string | null;
}) {
  // "Este mes" en la zona de la organización (SCRUM-493).
  const zonaDeLaOrganizacion = useZonaDeLaOrganizacion();
  const [dateRange, setDateRange] = useState<DateRange>(() =>
    getDefaultDateRange(zonaDeLaOrganizacion)
  );

  const {
    isLoading,
    perfMetrics,
    perfError,
    filteredMetrics,
    filteredConversations,
    financeSummary,
    facturacionSparkData,
    cashCollectedSparkData,
    bookingSparkData,
    agendasSparkData,
    weeklyTrend,
    leadSourceSlices,
    convStatusSlices,
    funnelStages,
  } = useSalesMetrics(dateRange);

  const totalConvs = filteredConversations.length;

  // ── Fallback: usar snapshot más reciente cuando no hay datos en vivo ──────
  // perfMetrics viene de closing_calls/conversations; si el usuario no tiene
  // datos operativos cargados en Limitless, todas las métricas son 0.
  // En ese caso usamos el snapshot importado más reciente como fuente.
  const latestSnapshot = importedSnapshots[0] ?? null; // ordenados desc por period_start
  const liveDataIsEmpty =
    !perfMetrics ||
    (perfMetrics.closer.closeRate === 0 &&
      perfMetrics.closer.showRate === 0 &&
      perfMetrics.leads.leadsCount === 0 &&
      perfMetrics.calls.cierres === 0);
  const useSnapshotFallback = liveDataIsEmpty && !!latestSnapshot;

  const sm = latestSnapshot?.metrics ?? {};
  const effectiveCloseRate = useSnapshotFallback
    ? (sm["close_rate"] ?? 0) * 100
    : (perfMetrics?.closer.closeRate ?? 0);
  const effectiveShowRate = useSnapshotFallback
    ? (sm["show_rate"] ?? 0) * 100
    : (perfMetrics?.closer.showRate ?? 0);
  const effectiveFacturacion = useSnapshotFallback
    ? (sm["facturacion"] ?? financeSummary.facturacion)
    : financeSummary.facturacion;
  const effectiveLeads = useSnapshotFallback
    ? (sm["leads_totales"] ?? 0)
    : (perfMetrics?.leads.leadsCount ?? 0);
  const effectiveAgendas = useSnapshotFallback
    ? (sm["agendas_totales"] ?? 0)
    : (perfMetrics?.leads.agendasCount ?? 0);
  const effectiveCierres = useSnapshotFallback
    ? (sm["cierres"] ?? 0)
    : (perfMetrics?.calls.cierres ?? 0);
  const effectiveAsistencias = useSnapshotFallback
    ? (sm["asistencias"] ?? 0)
    : (perfMetrics?.calls.asistencias ?? 0);
  const effectiveInasistencias = useSnapshotFallback
    ? (sm["inasistencias"] ?? 0)
    : (perfMetrics?.calls.noShows ?? 0);
  const effectiveNoCierres = useSnapshotFallback
    ? (sm["no_cierres"] ?? 0)
    : (perfMetrics?.calls.noCierres ?? 0);
  const effectiveTasaAgendamiento = useSnapshotFallback
    ? (sm["tasa_agendamiento"] ?? 0) * 100
    : filteredMetrics.bookingRate;
  const effectiveTasaFantasma = useSnapshotFallback
    ? (sm["tasa_fantasma"] ?? 0) * 100
    : filteredMetrics.ghostingRate;
  const effectiveCashCollected = useSnapshotFallback
    ? Math.max(
        0,
        (sm["facturacion"] ?? 0) -
          (financeSummary.gastosTotales > 0
            ? financeSummary.gastosTotales
            : (sm["gastos"] ?? 0))
      )
    : financeSummary.cashCollected;

  // ── Franja de resumen inferior ────────────────────────────────────────────
  const summaryItems = [
    { label: "Convs. totales", value: String(filteredMetrics.totalConversations) },
    { label: "Activas", value: String(filteredMetrics.activeConversations) },
    { label: "Sin responder", value: String(filteredMetrics.unansweredConversations) },
    { label: "Msg / agend.", value: String(filteredMetrics.messagesPerBooking) },
    { label: "Tiempo resp.", value: `${filteredMetrics.avgResponseMin} min` },
    ...(perfMetrics
      ? [
          {
            label: "Llamadas",
            value: String(
              perfMetrics.calls.asistencias + perfMetrics.calls.noShows
            ),
          },
          { label: "Agendas", value: String(perfMetrics.schedules?.totalAgendas ?? 0) },
          { label: "Cierres", value: String(perfMetrics.calls.cierres) },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">

      {/* ── Selector de período ─────────────────────────────────────────────── */}
      <DateRangePicker value={dateRange} onChange={setDateRange} />

      {perfError && (
        <AvisoDeLecturaFallida
          titulo="No se pudieron cargar las métricas de rendimiento."
          motivo={perfError}
        />
      )}
      {importedSnapshotsError && (
        <AvisoDeLecturaFallida
          titulo="No se pudieron cargar las métricas importadas."
          motivo={importedSnapshotsError}
        />
      )}

      {/* ── 1. KPI Heroes: 4 métricas principales ──────────────────────────── */}
      {useSnapshotFallback && (
        <div className="flex items-center gap-2 rounded-lg border border-brand-300/40 bg-brand-500/5 px-3 py-2">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-500 shrink-0" />
          <p className="text-xs text-muted-foreground">
            Mostrando datos del período importado más reciente (<span className="font-medium text-foreground">{latestSnapshot!.periodLabel}</span>). Conectá tus integraciones para ver métricas en tiempo real.
          </p>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiHeroCard
          label="Close Rate"
          hint={useSnapshotFallback ? `Datos importados · ${latestSnapshot!.periodLabel}` : "Cierres / asistencias"}
          value={isLoading ? "—" : formatPercent(effectiveCloseRate)}
          icon={Target}
          sparkData={bookingSparkData}
        />
        <KpiHeroCard
          label="Show Rate"
          hint={useSnapshotFallback ? `Datos importados · ${latestSnapshot!.periodLabel}` : "Asistencias / agendas"}
          value={isLoading ? "—" : formatPercent(effectiveShowRate)}
          icon={Users}
          sparkData={[...bookingSparkData].reverse()}
        />
        <KpiHeroCard
          label="Facturación"
          hint={useSnapshotFallback ? `Datos importados · ${latestSnapshot!.periodLabel}` : "Total facturado este período"}
          value={isLoading ? "—" : formatMoney(effectiveFacturacion)}
          icon={DollarSign}
          sparkData={facturacionSparkData}
        />
        <KpiHeroCard
          label="Cash Collected"
          hint={useSnapshotFallback ? `Datos importados · ${latestSnapshot!.periodLabel}` : "Facturación − Gastos"}
          value={isLoading ? "—" : formatMoney(effectiveCashCollected)}
          icon={Wallet}
          sparkData={cashCollectedSparkData}
        />
      </div>

      {/* ── 2. Layout asimétrico: contenido + sidebar ──────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">

        {/* ── Columna izquierda ─────────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* Leads */}
          <section className="space-y-3">
            <h3 className="text-[13px] font-semibold">Rendimiento de Leads</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                label="Leads totales"
                value={isLoading ? "—" : effectiveLeads}
                icon={Users}
              />
              <StatCard
                label="Agendas"
                value={isLoading ? "—" : effectiveAgendas}
                icon={CalendarCheck}
              />
              <StatCard
                label="En nutrición"
                value={isLoading ? "—" : (perfMetrics?.leads.nurturingCount ?? 0)}
                icon={Heart}
              />
              <StatCard
                label="Perdidos"
                value={isLoading ? "—" : (perfMetrics?.leads.lostCount ?? 0)}
                icon={UserMinus}
              />
            </div>
          </section>

          {/* Agendas hero — sparkline violeta al borde inferior */}
          <KpiHeroCard
            label="Agendas totales"
            hint={useSnapshotFallback ? `Datos importados · ${latestSnapshot!.periodLabel}` : "Tendencia semanal"}
            value={isLoading ? "—" : String(effectiveAgendas)}
            icon={CalendarCheck}
            sparkData={agendasSparkData}
          />

          {/* Llamadas */}
          <section className="space-y-3">
            <h3 className="text-[13px] font-semibold">Rendimiento de Llamadas</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatCard
                label="Cierres"
                value={isLoading ? "—" : effectiveCierres}
                icon={CheckCircle}
              />
              <StatCard
                label="Asistencias"
                value={isLoading ? "—" : effectiveAsistencias}
                icon={PhoneCall}
              />
              <StatCard
                label="Inasistencias"
                value={isLoading ? "—" : effectiveInasistencias}
                icon={XCircle}
              />
              <StatCard
                label="Seguimientos"
                value={isLoading ? "—" : (perfMetrics?.calls.followUpScheduled ?? 0)}
                icon={CalendarCheck}
              />
              <StatCard
                label="No cierres"
                value={isLoading ? "—" : effectiveNoCierres}
                icon={XCircle}
              />
              <StatCard
                label="Señas"
                value={isLoading ? "—" : (perfMetrics?.calls.senas ?? "—")}
                icon={Activity}
                dimmed={!perfMetrics?.calls.senas}
              />
            </div>
          </section>

          {/* Tendencia semanal */}
          <ChartShell
            title="Tendencia semanal"
            subtitle="Conversaciones nuevas vs agendadas"
          >
            <div className="h-[180px] w-full overflow-hidden">
              <DualAreaChart
                data={weeklyTrend}
                primaryKey="primary"
                secondaryKey="secondary"
                primaryLabel="Conversaciones"
                secondaryLabel="Agendadas"
                className="h-[180px]"
              />
            </div>
          </ChartShell>

          {/* Fuentes de leads */}
          {leadSourceSlices.length > 0 && (
            <ChartShell
              title="Fuentes de leads"
              subtitle={`${totalConvs} conversaciones · distribución por origen`}
            >
              <div className="flex flex-col items-start gap-4 sm:flex-row">
                <div className="shrink-0">
                  <PieDistributionChart slices={leadSourceSlices} className="max-w-[180px]" />
                </div>
                <div className="flex-1 space-y-2">
                  {leadSourceSlices.map((s) => (
                    <div key={s.label} className="flex items-center gap-2">
                      <div
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: s.color }}
                      />
                      <span className="flex-1 text-xs text-muted-foreground">
                        {s.label}
                      </span>
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${s.pct}%`, background: s.color }}
                        />
                      </div>
                      <span className="w-16 text-right text-xs font-medium tabular-nums">
                        {s.pct}% ({s.value})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </ChartShell>
          )}

          {/* Embudo de conversión */}
          {funnelStages.length >= 2 && (
            <ChartShell
              title="Embudo de conversión"
              subtitle="Leads → Agendas → Asistencias → Cierres"
            >
              <div className="h-[140px]">
                <FunnelChartPanel
                  stages={funnelStages}
                  orientation="horizontal"
                  className="h-[140px]"
                />
              </div>
            </ChartShell>
          )}

          {/* Ranking de closers */}
          <CloserPerformancePanel closers={filteredMetrics.closerBreakdown} />

          {/* Equipo de ventas */}
          <SalesTeamPerformanceSection />
        </div>

        {/* ── Sidebar derecho ──────────────────────────────────────────────── */}
        <div className="space-y-4">

          <h3 className="text-[13px] font-semibold">Tasas de conversión</h3>

          <GaugeSideCard
            label="Tasa de agendamiento"
            value={effectiveTasaAgendamiento}
          />

          <GaugeSideCard
            label="Tasa de fantasma"
            value={effectiveTasaFantasma}
          />

          {/* Tiempo de respuesta */}
          <GlassPanel className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-500">
              <Clock size={18} />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Tiempo de respuesta
              </p>
              <p className="text-2xl font-bold tabular-nums">
                {filteredMetrics.avgResponseMin} min
              </p>
              <p className="text-[11px] text-muted-foreground">Objetivo: &lt;10 min</p>
            </div>
          </GlassPanel>

          {/* Motivos de no cierre */}
          <div className="space-y-1.5">
            <p className="px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Motivos de no cierre
            </p>
            <FrequentObjectionsSection
              initialData={frequentObjections}
              initialError={frequentObjectionsError}
            />
          </div>

          {/* Estado de conversaciones */}
          {convStatusSlices.length > 0 && (
            <GlassPanel className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Conversaciones
                </p>
                <span className="text-sm font-bold tabular-nums">{totalConvs}</span>
              </div>
              <div className="flex items-start gap-3">
                <RingDistributionChart
                  slices={convStatusSlices}
                  centerValue={String(totalConvs)}
                  centerLabel="Total"
                  className="max-w-[100px] min-w-[100px] shrink-0"
                />
                <div className="flex-1 space-y-1.5 pt-1">
                  {convStatusSlices.map((s) => (
                    <div
                      key={s.label}
                      className="flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-1.5">
                        <div
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: s.color }}
                        />
                        <span className="text-xs text-muted-foreground">
                          {s.label}
                        </span>
                      </div>
                      <span className="text-xs font-semibold tabular-nums">
                        {s.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </GlassPanel>
          )}

          {/* Eficiencia operativa */}
          <GlassPanel className="space-y-3 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Eficiencia operativa
            </p>
            <div className="divide-y divide-border">
              {[
                {
                  label: "Msg / agendamiento",
                  value: String(filteredMetrics.messagesPerBooking),
                  sub: "Mensajes promedio hasta agenda",
                },
                {
                  label: "Sin responder",
                  value: String(filteredMetrics.unansweredConversations),
                  sub: `de ${filteredMetrics.totalConversations} totales`,
                },
                {
                  label: "Activas",
                  value: String(filteredMetrics.activeConversations),
                },
              ].map((row) => (
                <div key={row.label} className="py-2.5 first:pt-0 last:pb-0">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {row.label}
                  </p>
                  <p className="text-xl font-bold tabular-nums">{row.value}</p>
                  {row.sub && (
                    <p className="text-[10px] text-muted-foreground">{row.sub}</p>
                  )}
                </div>
              ))}
            </div>
          </GlassPanel>
        </div>
      </div>

      {/* ── Franja de resumen ─────────────────────────────────────────────── */}
      <SummaryStrip items={summaryItems} />
    </div>
  );
}
