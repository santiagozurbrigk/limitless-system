"use client";

import { cn } from "@ai-coo/ui";
import { FunnelChartPanel } from "@/components/charts/platform/funnel-chart-panel";
import type { SalesFunnel } from "@/lib/metrics/build-sales-funnel-stages";

/**
 * El embudo llega calculado del servidor (SCRUM-540): el Panel no recibe las
 * conversaciones ni las llamadas, sólo las etapas.
 */
export function SalesFunnelStrip({ embudo }: { embudo: SalesFunnel }) {
  const { stages, subtitle, conversion } = embudo;

  // Con una sola etapa no hay embudo que mostrar: sería una barra sola con un
  // 100% que no compara contra nada.
  if (stages.length < 2) return null;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-card px-5 pb-5 pt-4",
        "dark:border-glass dark:bg-glass dark:backdrop-blur-md"
      )}
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Embudo de conversión</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        {conversion && (
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            {conversion} total
          </span>
        )}
      </div>

      <FunnelChartPanel
        stages={stages}
        orientation="horizontal"
        color="hsl(var(--primary))"
        style={{ minHeight: 180, aspectRatio: "3.2 / 1" }}
        className="min-h-[180px]"
      />
    </div>
  );
}
