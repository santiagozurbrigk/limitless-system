"use client";

import { MetricBand, MetricStat } from "@ai-coo/ui";
import { CategoryBarChart } from "@/components/charts/platform";
import { formatUsdPrecise } from "@/lib/super-admin/org-metrics";
import type { AdminAiCostDashboard } from "@/types/super-admin";
import { brand } from "@/lib/brand";

const PLAN_LABEL: Record<string, string> = {
  starter: "Starter",
  growth: "Growth",
  enterprise: "Enterprise",
};

export function AiCostDashboardContent({
  data,
}: {
  data: AdminAiCostDashboard;
}) {
  const { summary, organizations, profitabilityChart, modelUsage } = data;

  const hasUsage =
    summary.totalTokenCostMonthUsd > 0 || modelUsage.length > 0;

  const modelTotals = modelUsage.reduce(
    (acc, row) => ({
      requests: acc.requests + row.requests,
      inputTokens: acc.inputTokens + row.inputTokens,
      outputTokens: acc.outputTokens + row.outputTokens,
      inputCostUsd: acc.inputCostUsd + row.inputCostUsd,
      outputCostUsd: acc.outputCostUsd + row.outputCostUsd,
      totalCostUsd: acc.totalCostUsd + row.totalCostUsd,
    }),
    {
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      inputCostUsd: 0,
      outputCostUsd: 0,
      totalCostUsd: 0,
    }
  );

  function formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return String(n);
  }

  function shortModelName(model: string): string {
    if (model.includes("haiku")) return "claude-haiku-4-5";
    if (model.includes("sonnet")) return "claude-sonnet-4-6";
    if (model.includes("opus")) return "claude-opus";
    return model;
  }

  const chartItems = profitabilityChart.map((row) => ({
    label: row.orgName.split(" ")[0] ?? row.orgName,
    value: row.marginUsd,
  }));

  return (
    <div className="space-y-10">
      {!hasUsage ? (
        <div className="rounded-xl border border-border/60 p-8 text-center text-sm text-muted-foreground dark:border-white/[0.08]">
          Sin uso de IA este mes
        </div>
      ) : null}

      <MetricBand>
        <MetricStat
          title="MRR total"
          value={formatUsdPrecise(summary.totalMrrUsd)}
          subtitle={`${summary.activeOrganizations} orgs activas`}
        />
        <MetricStat
          title="Costo total infra"
          value={formatUsdPrecise(summary.totalInfraCostUsd)}
          subtitle="Storage + infra estimada"
        />
        <MetricStat
          title="Costo IA (mes)"
          value={formatUsdPrecise(summary.totalTokenCostMonthUsd)}
          subtitle="Claude + embeddings"
        />
        <MetricStat
          title="Margen global"
          value={formatUsdPrecise(summary.estimatedGrossMarginUsd)}
          subtitle={`${summary.globalMarginPercent.toFixed(1)}% sobre MRR`}
          trend="up"
        />
      </MetricBand>

      <section className="rounded-xl border border-border/60 dark:border-white/[0.08]">
        <div className="border-b border-border/60 px-4 py-3 dark:border-white/[0.08]">
          <h3 className="text-sm font-semibold">Costo por organización</h3>
          <p className="text-xs text-muted-foreground">
            Claude (Haiku + Sonnet + Opus), embeddings, storage e infraestructura
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Organización</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Fuente IA</th>
                <th className="px-4 py-3">Haiku</th>
                <th className="px-4 py-3">Sonnet</th>
                <th className="px-4 py-3">Opus</th>
                <th className="px-4 py-3">Embeddings</th>
                <th className="px-4 py-3">Storage</th>
                <th className="px-4 py-3">Infra</th>
                <th className="px-4 py-3">Total mes</th>
                <th className="px-4 py-3">Margen</th>
                <th className="px-4 py-3">%</th>
              </tr>
            </thead>
            <tbody>
              {organizations.map((row) => (
                <tr
                  key={row.orgId}
                  className="border-t border-border/40 dark:border-white/[0.06]"
                >
                  <td className="px-4 py-3 font-medium">{row.orgName}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {PLAN_LABEL[row.plan] ?? row.plan}
                  </td>
                  <td className="px-4 py-3">
                    {row.aiKeySource === "byok" ? (
                      <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        BYOK ✓
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {brand.name} Key
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatUsdPrecise(row.claudeHaikuUsd)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatUsdPrecise(row.claudeSonnetUsd)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatUsdPrecise(row.claudeOpusUsd)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatUsdPrecise(row.embeddingsUsd)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatUsdPrecise(row.storageUsd)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatUsdPrecise(row.infrastructureUsd)}
                  </td>
                  <td className="px-4 py-3 tabular-nums font-medium">
                    {formatUsdPrecise(row.totalMonthUsd)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatUsdPrecise(row.marginUsd)}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-emerald-600 dark:text-emerald-400">
                    {row.marginPercent.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-border/60 dark:border-white/[0.08]">
        <div className="border-b border-border/60 px-4 py-3 dark:border-white/[0.08]">
          <h3 className="text-sm font-semibold">Uso por modelo</h3>
          <p className="text-xs text-muted-foreground">
            Desglose real del mes según token_usage (requests, tokens y costo estimado)
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Modelo</th>
                <th className="px-4 py-3">Requests</th>
                <th className="px-4 py-3">Input tokens</th>
                <th className="px-4 py-3">Output tokens</th>
                <th className="px-4 py-3">Costo estimado</th>
              </tr>
            </thead>
            <tbody>
              {modelUsage.map((row) => (
                <tr
                  key={row.model}
                  className="border-t border-border/40 dark:border-white/[0.06]"
                >
                  <td className="px-4 py-3 font-medium">
                    {shortModelName(row.model)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{row.requests}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatTokens(row.inputTokens)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatTokens(row.outputTokens)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatUsdPrecise(row.inputCostUsd)} +{" "}
                    {formatUsdPrecise(row.outputCostUsd)} ={" "}
                    <span className="font-medium">
                      {formatUsdPrecise(row.totalCostUsd)}
                    </span>
                  </td>
                </tr>
              ))}
              {modelUsage.length > 0 ? (
                <tr className="border-t border-border/60 bg-muted/20 font-medium dark:border-white/[0.08]">
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 tabular-nums">
                    {modelTotals.requests}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatTokens(modelTotals.inputTokens)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatTokens(modelTotals.outputTokens)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatUsdPrecise(modelTotals.inputCostUsd)} +{" "}
                    {formatUsdPrecise(modelTotals.outputCostUsd)} ={" "}
                    {formatUsdPrecise(modelTotals.totalCostUsd)}
                  </td>
                </tr>
              ) : (
                <tr className="border-t border-border/40 dark:border-white/[0.06]">
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-muted-foreground"
                  >
                    Sin uso de IA este mes
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-border/60 p-6 dark:border-white/[0.08]">
        <h3 className="text-sm font-semibold">Rentabilidad por cliente</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Margen estimado (MRR − costo total del mes)
        </p>
        <div className="mt-4 min-h-[200px] max-w-3xl">
          <CategoryBarChart items={chartItems} horizontal className="min-h-[200px]" />
        </div>
      </section>
    </div>
  );
}
