"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { GlassPanel, MetricBand, MetricStat } from "@ai-coo/ui";
import {
  CategoryBarChart,
  GaugeTargetChart,
  InteractiveDualAreaChart,
  MetricChartPanel,
  RingDistributionChart,
} from "@/components/charts/platform";
import type { PieData } from "@/components/charts/pie-context";
import { expenseSegmentColors } from "@/lib/chart/colors";
import { useFinanceData } from "@/providers";
import { usePlatformData } from "@/providers/platform-data-provider";
import { formatMoney } from "@/lib/finance/format";
import { deriveFinanceSummary } from "@/lib/metrics/derive-finance-summary";
import {
  collectRevenueEvents,
  filterRevenueEvents,
} from "@/lib/metrics/revenue-events";
import {
  DEFAULT_REVENUE_RANGE,
  resolveRevenueDateRange,
  type RevenueDateRange,
} from "@/lib/metrics/revenue-period";
import { BentoCellPlace, BentoGrid } from "@/components/shared/bento-grid";
import { FacturacionPeriodFilter } from "./facturacion-period-filter";
import { paths } from "@/routes";
import { AvisoDeLecturaFallida } from "@/components/shared/aviso-de-lectura-fallida";

export function FinanceMetrics() {
  const {
    clients,
    closingCalls,
    clientsLoading,
    closingCallsLoading,
  } = usePlatformData();
  const { paymentPlatforms, expensesSummary, monthlySeries, clientPayments, clientPaymentsError, financeSummary: baselineFinanceSummary } =
    useFinanceData();

  const [revenueRange, setRevenueRange] =
    useState<RevenueDateRange>(DEFAULT_REVENUE_RANGE);

  const loading = clientsLoading || closingCallsLoading;

  const summary = useMemo(() => {
    const live = deriveFinanceSummary(
      clients,
      closingCalls,
      expensesSummary,
      paymentPlatforms,
      revenueRange,
      clientPayments
    );
    // Si no hay datos live (cliente nuevo sin integraciones), aplicar overlay
    // de valores numéricos desde el baseline. Preservamos revenuePeriod y
    // metadata del live para que los labels de período sigan funcionando.
    if (live.facturacion === 0 && baselineFinanceSummary.facturacion > 0) {
      return {
        ...live,
        facturacion: baselineFinanceSummary.facturacion,
        cashCollected: baselineFinanceSummary.cashCollected,
        gastosTotales: baselineFinanceSummary.gastosTotales > 0
          ? baselineFinanceSummary.gastosTotales
          : live.gastosTotales,
        margenPercent: baselineFinanceSummary.margenPercent,
      };
    }
    return live;
  }, [
    clients,
    closingCalls,
    expensesSummary,
    paymentPlatforms,
    clientPayments,
    revenueRange,
    baselineFinanceSummary,
  ]);

  const periodEvents = useMemo(() => {
    const period = resolveRevenueDateRange(revenueRange);
    return filterRevenueEvents(
      collectRevenueEvents(clients, clientPayments),
      period
    );
  }, [clients, clientPayments, revenueRange]);

  const dualRows = useMemo(
    () =>
      monthlySeries.map((m) => ({
        label: m.month,
        primary: m.facturacion,
        secondary: m.cashCollected,
      })),
    [monthlySeries]
  );

  const expenseSlices: PieData[] = useMemo(
    () =>
      [
        {
          label: "Gastos fijos",
          value: expensesSummary.fixedMonthly,
          color: expenseSegmentColors[0],
        },
        {
          label: "Suscripciones",
          value: expensesSummary.subscriptionsMonthly,
          color: expenseSegmentColors[1],
        },
        {
          label: "Equipo",
          value: expensesSummary.teamFixedMonthly + expensesSummary.teamCommissionsMonthly,
          color: expenseSegmentColors[2],
        },
      ].filter((s) => s.value > 0),
    [expensesSummary]
  );

  const s = summary;

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
        Cargando métricas financieras…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {clientPaymentsError ? (
        <AvisoDeLecturaFallida
          titulo="No se pudieron cargar los pagos: lo cobrado no está al día."
          motivo={clientPaymentsError}
        />
      ) : null}
      <FacturacionPeriodFilter
        value={revenueRange}
        onChange={setRevenueRange}
        periodLabel={s.revenuePeriod.label}
        facturacion={s.facturacion}
        formatMoney={(n) => formatMoney(n)}
        eventCount={periodEvents.length}
      />

      <MetricBand className="mb-4">
        <MetricStat
          title="Facturación"
          value={formatMoney(s.facturacion)}
          subtitle={s.revenuePeriod.label}
        />
        <MetricStat
          title="Cash collected"
          value={formatMoney(s.cashCollected)}
          subtitle="Cobros confirmados en el período"
        />
        <MetricStat
          title="Margen"
          value={`${s.margenPercent.toFixed(1)}%`}
          subtitle="Objetivo 60%"
        />
        <MetricStat
          title="Por cobrar"
          value={formatMoney(s.porCobrar)}
          subtitle="Cuotas pendientes"
        />
      </MetricBand>

      <div className="mb-4 flex justify-end">
        <Link
          href={paths.platform.settingsTab("pagos")}
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-500 dark:text-brand-400 dark:hover:text-brand-300"
        >
          Gestionar plataformas de cobro
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <GlassPanel className="relative overflow-hidden p-0">
        <div className="min-h-[280px] w-full px-2 pb-4 pt-4">
          <InteractiveDualAreaChart
            data={dualRows}
            primaryKey="facturacion"
            secondaryKey="cashCollected"
            primaryLabel="Facturación"
            secondaryLabel="Cash collected"
            emptyMessage="Sin suficientes meses para el gráfico"
          />
        </div>
      </GlassPanel>

      <BentoGrid>
        <BentoCellPlace className="col-span-2 row-span-2 lg:col-span-2 lg:row-span-2">
          <MetricChartPanel
            title="Margen"
            value={`${s.margenPercent.toFixed(1)}%`}
            subtitle="Objetivo 60%"
            className="min-h-[280px]"
          >
            <GaugeTargetChart
              value={s.margenPercent}
              max={100}
              target={60}
              label="Margen"
              variant="margin"
            />
          </MetricChartPanel>
        </BentoCellPlace>

        <BentoCellPlace className="col-span-2 row-span-1 lg:col-span-2 lg:col-start-3 lg:row-start-1">
          <MetricChartPanel
            title="Por cobrar"
            value={formatMoney(s.porCobrar)}
            subtitle="Cuotas pendientes por mes"
            className="min-h-[140px]"
          >
            <CategoryBarChart
              items={s.porCobrarByMonth.map((m) => ({
                label: m.month,
                value: m.amount,
              }))}
              className="min-h-[120px]"
              emptyMessage="No hay cuotas pendientes"
            />
          </MetricChartPanel>
        </BentoCellPlace>

        <BentoCellPlace className="col-span-2 row-span-1 lg:col-span-2 lg:col-start-3 lg:row-start-2">
          <MetricChartPanel
            title="Gastos (período)"
            value={formatMoney(s.gastosTotales)}
            subtitle="Distribución mensual estimada"
            className="min-h-[140px]"
          >
            <RingDistributionChart
              slices={expenseSlices}
              centerValue={formatMoney(expensesSummary.totalMonthly)}
              centerLabel="/ mes"
              emptyMessage="Sin gastos configurados"
            />
          </MetricChartPanel>
        </BentoCellPlace>
      </BentoGrid>
    </div>
  );
}
