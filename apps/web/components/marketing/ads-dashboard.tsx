"use client";

import {
  Fragment,
  useCallback,
  useMemo,
  useState,
  useTransition,
} from "react";
import Image from "next/image";
import {
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  LayoutList,
  Layers,
  Megaphone,
} from "lucide-react";
import {
  getMarketingAdsAction,
  type MarketingAdsFilters,
} from "@/app/marketing/content/ad-actions";
import { EmptyState } from "@/components/shared/empty-state";
import { leerConMotivo } from "@/lib/client/correr-accion";
import { FilterPills } from "@/components/marketing/filter-pills";
import type { ZernioAdMetrics, ZernioAdStatus, ZernioLinkedAd } from "@/lib/zernio/client";
import {
  formatActionKey,
  formatCurrency,
  formatMultiplier,
  formatNumber,
  formatPercent,
  formatSeconds,
  normalizeAdMetrics,
} from "@/lib/utils/format-ad-metrics";
import { Badge, cn, MetricStat, Skeleton } from "@ai-coo/ui";
import {
  ALL_METRIC_DEFS,
  MetricColumnSelector,
  ctrColorClass,
  roasColorClass,
  useMetricColumns,
  type AnyMetricKey,
  type MetricDef,
  type MetricKey,
} from "./ads-metric-columns";

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  initialAds: ZernioLinkedAd[];
  initialError?: string | null;
  initialRangeDays?: 7 | 30 | 90;
};

type StatusFilter = "all" | "active" | "paused" | "error";
type PlatformFilter = "all" | "facebook" | "instagram";
type RangeDays = 7 | 30 | 90;
type SortKey = AnyMetricKey | "budget";
type SortDir = "asc" | "desc";
type ViewMode = "flat" | "campaigns";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "active", label: "Activos" },
  { value: "paused", label: "Pausados" },
  { value: "error", label: "Error" },
];

const PLATFORM_OPTIONS: { value: PlatformFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
];

const RANGE_OPTIONS: { value: RangeDays; label: string }[] = [
  { value: 7, label: "7 días" },
  { value: 30, label: "30 días" },
  { value: 90, label: "90 días" },
];

const STATUS_LABELS: Record<ZernioAdStatus, string> = {
  active: "Activo",
  paused: "Pausado",
  pending_review: "En revisión",
  rejected: "Rechazado",
  completed: "Finalizado",
  cancelled: "Cancelado",
  error: "Error",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveDateRange(days: RangeDays) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return {
    fromDate: from.toISOString().slice(0, 10),
    toDate: to.toISOString().slice(0, 10),
  };
}

function buildFilters(
  status: StatusFilter,
  platform: PlatformFilter,
  rangeDays: RangeDays
): MarketingAdsFilters {
  return {
    ...resolveDateRange(rangeDays),
    ...(status !== "all" ? { status } : {}),
    ...(platform !== "all" ? { platform } : {}),
  };
}

function statusBadgeClass(status: ZernioAdStatus): string {
  switch (status) {
    case "active":
      return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300";
    case "paused":
      return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300";
    case "error":
    case "rejected":
      return "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300";
    case "completed":
      return "border-muted bg-muted/50 text-muted-foreground";
    default:
      return "border-border bg-background text-muted-foreground";
  }
}

function aggregateGroup(adsList: ZernioLinkedAd[]) {
  const ms = adsList.map((a) => normalizeAdMetrics(a.metrics));
  const sum = (key: MetricKey) =>
    ms.reduce((s, m) => s + ((m[key] as number) ?? 0), 0);
  const avg = (key: MetricKey) => {
    const vals = ms.map((m) => (m[key] as number) ?? 0).filter((v) => v > 0);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  };
  return {
    spend: sum("spend"),
    impressions: sum("impressions"),
    reach: sum("reach"),
    clicks: sum("clicks"),
    conversions: sum("conversions"),
    purchaseValue: sum("purchaseValue"),
    engagement: sum("engagement"),
    videoPlayActions: sum("videoPlayActions"),
    video30SecWatchedActions: sum("video30SecWatchedActions"),
    videoThruplayWatchedActions: sum("videoThruplayWatchedActions"),
    videoP25WatchedActions: sum("videoP25WatchedActions"),
    videoP50WatchedActions: sum("videoP50WatchedActions"),
    videoP75WatchedActions: sum("videoP75WatchedActions"),
    videoP100WatchedActions: sum("videoP100WatchedActions"),
    videoAvgTimeWatchedActions: avg("videoAvgTimeWatchedActions"),
    roas: avg("roas"),
    ctr: avg("ctr"),
    cpc: avg("cpc"),
    cpm: avg("cpm"),
    costPerConversion: avg("costPerConversion"),
  };
}

// ─── Small UI helpers ─────────────────────────────────────────────────────────

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function StatusSummary({ ads }: { ads: ZernioLinkedAd[] }) {
  const counts = useMemo(() => {
    const r = { active: 0, paused: 0, error: 0, other: 0 };
    for (const ad of ads) {
      if (ad.status === "active") r.active++;
      else if (ad.status === "paused") r.paused++;
      else if (ad.status === "error" || ad.status === "rejected") r.error++;
      else r.other++;
    }
    return r;
  }, [ads]);

  if (ads.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {counts.active > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {counts.active} activo{counts.active !== 1 ? "s" : ""}
        </span>
      )}
      {counts.paused > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          {counts.paused} pausado{counts.paused !== 1 ? "s" : ""}
        </span>
      )}
      {counts.error > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
          {counts.error} con error
        </span>
      )}
      {counts.other > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
          {counts.other} otro{counts.other !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}

function SpendBudgetBar({ spend, budgetAmount }: { spend: number; budgetAmount: number }) {
  if (budgetAmount <= 0) return <span className="text-sm tabular-nums">{formatCurrency(spend)}</span>;
  const pct = Math.min((spend / budgetAmount) * 100, 100);
  const barColor = pct >= 90 ? "bg-red-500" : pct >= 60 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="min-w-[90px] space-y-1">
      <span className="text-sm tabular-nums">{formatCurrency(spend)}</span>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground">{pct.toFixed(0)}% del budget</span>
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  currentKey,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey | null;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = currentKey === sortKey;
  return (
    <th className="px-4 py-3 font-medium">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-foreground",
          active ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {label}
        <ArrowUpDown className={cn("h-3 w-3 transition-opacity", active ? "opacity-100" : "opacity-40")} aria-hidden />
      </button>
    </th>
  );
}

function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="border-b bg-muted/30 px-4 py-3">
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b px-4 py-4 last:border-b-0">
          <Skeleton className="h-10 w-10 shrink-0 rounded-md" />
          <div className="grid flex-1 grid-cols-4 gap-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Ad expanded detail ───────────────────────────────────────────────────────

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h4>
  );
}

function AdExpandedDetails({ metrics }: { metrics: ZernioAdMetrics }) {
  const actionEntries = Object.entries(metrics.actions ?? {}).filter(([, v]) => v > 0);
  const showVideo = metrics.videoPlayActions > 0;
  const showActions = actionEntries.length > 0;

  return (
    <div className="space-y-5 bg-muted/10 px-4 py-5">
      <section className="space-y-3">
        <SectionTitle>Performance</SectionTitle>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <DetailMetric label="Gasto" value={formatCurrency(metrics.spend)} />
          <DetailMetric label="Impresiones" value={formatNumber(metrics.impressions)} />
          <DetailMetric label="Alcance" value={formatNumber(metrics.reach)} />
          <DetailMetric label="Clics" value={formatNumber(metrics.clicks)} />
          <DetailMetric label="CTR" value={formatPercent(metrics.ctr)} />
          <DetailMetric label="CPC" value={formatCurrency(metrics.cpc)} />
          <DetailMetric label="CPM" value={formatCurrency(metrics.cpm)} />
          <DetailMetric label="Engagement" value={formatNumber(metrics.engagement)} />
        </div>
      </section>

      <section className="space-y-3 border-t pt-5">
        <SectionTitle>Conversiones</SectionTitle>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <DetailMetric label="Conversiones" value={formatNumber(metrics.conversions)} />
          <DetailMetric label="Costo/Conv." value={formatCurrency(metrics.costPerConversion)} />
          <DetailMetric label="Valor de compras" value={formatCurrency(metrics.purchaseValue)} />
          <DetailMetric label="ROAS" value={formatMultiplier(metrics.roas)} />
        </div>
      </section>

      {showVideo && (
        <section className="space-y-3 border-t pt-5">
          <SectionTitle>Video</SectionTitle>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <DetailMetric label="Reproducciones" value={formatNumber(metrics.videoPlayActions)} />
            <DetailMetric label="30 seg" value={formatNumber(metrics.video30SecWatchedActions)} />
            <DetailMetric label="ThruPlay" value={formatNumber(metrics.videoThruplayWatchedActions)} />
            <DetailMetric label="Tiempo promedio" value={formatSeconds(metrics.videoAvgTimeWatchedActions)} />
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <DetailMetric label="Visto 25%" value={formatNumber(metrics.videoP25WatchedActions)} />
            <DetailMetric label="Visto 50%" value={formatNumber(metrics.videoP50WatchedActions)} />
            <DetailMetric label="Visto 75%" value={formatNumber(metrics.videoP75WatchedActions)} />
            <DetailMetric label="Visto 95%" value={formatNumber(metrics.videoP95WatchedActions)} />
            <DetailMetric label="Visto 100%" value={formatNumber(metrics.videoP100WatchedActions)} />
          </div>
        </section>
      )}

      {showActions && (
        <section className="space-y-3 border-t pt-5">
          <SectionTitle>Acciones de Meta</SectionTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {actionEntries.map(([key, count]) => {
              const monetaryValue = metrics.actionValues?.[key];
              return (
                <div key={key} className="rounded-md border bg-background p-3">
                  <p className="text-xs font-medium">{formatActionKey(key)}</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums">{formatNumber(count)}</p>
                  {monetaryValue != null && monetaryValue > 0 && (
                    <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{formatCurrency(monetaryValue)}</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {metrics.lastSyncedAt && (
        <p className="border-t pt-4 text-xs text-muted-foreground">
          Última sync: {new Date(metrics.lastSyncedAt).toLocaleString("es-AR")}
        </p>
      )}
    </div>
  );
}

// ─── Ad preview ───────────────────────────────────────────────────────────────

function AdPreview({ ad }: { ad: ZernioLinkedAd }) {
  const [failed, setFailed] = useState(false);
  const thumb = ad.creative?.thumbnailUrl;
  if (thumb && !failed) {
    return (
      <Image
        src={thumb}
        alt=""
        width={40}
        height={40}
        unoptimized
        className="h-10 w-10 rounded-md bg-muted object-cover"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
      <Megaphone className="h-4 w-4" aria-hidden />
    </div>
  );
}

// ─── Flat table ad row ────────────────────────────────────────────────────────

function AdTableRow({
  ad,
  expanded,
  onToggle,
  activeDefs,
  totalCols,
  indented = false,
}: {
  ad: ZernioLinkedAd;
  expanded: boolean;
  onToggle: () => void;
  activeDefs: MetricDef[];
  totalCols: number;
  indented?: boolean;
}) {
  const metrics = normalizeAdMetrics(ad.metrics);
  const budgetLabel =
    ad.budget?.type === "daily"
      ? `${formatCurrency(ad.budget.amount)}/día`
      : `${formatCurrency(ad.budget?.amount ?? 0)}/total`;
  const permalink = ad.creative?.instagramPermalinkUrl;

  return (
    <Fragment>
      <tr className="border-b transition-colors hover:bg-muted/20">
        <td className="px-2 py-3">
          <button
            type="button"
            onClick={onToggle}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-expanded={expanded}
            aria-label={expanded ? "Ocultar métricas" : "Ver métricas completas"}
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} aria-hidden />
          </button>
        </td>
        {!indented && (
          <td className="px-4 py-3">
            <AdPreview ad={ad} />
          </td>
        )}
        <td className={cn("px-4 py-3", indented && "pl-8")}>
          <div className="min-w-[180px]">
            <p className="text-sm font-medium">{ad.name}</p>
            {!indented && (
              <p className="mt-0.5 text-xs text-muted-foreground">{ad.campaignName}</p>
            )}
            <p className="mt-0.5 text-xs text-muted-foreground/60">{ad.adSetName}</p>
            {permalink && (
              <a
                href={permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Ver en Instagram
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            )}
          </div>
        </td>
        <td className="px-4 py-3">
          <Badge variant="outline" className={cn("capitalize", statusBadgeClass(ad.status))}>
            {STATUS_LABELS[ad.status] ?? ad.status}
          </Badge>
        </td>
        <td className="px-4 py-3 text-sm tabular-nums">{budgetLabel}</td>

        {activeDefs.map((def) => {
          let val: number;
          if (def.isDynamic && def.key.startsWith("action:")) {
            const actionKey = def.key.slice("action:".length);
            val = metrics.actions?.[actionKey] ?? 0;
          } else {
            val = (metrics[def.key as MetricKey] as number) ?? 0;
          }
          return (
            <td
              key={def.key}
              className={cn("px-4 py-3 text-sm tabular-nums", def.colorFn?.(val))}
            >
              {def.format(val)}
            </td>
          );
        })}
      </tr>

      {expanded && (
        <tr className="border-b bg-muted/5">
          <td colSpan={totalCols} className="p-0">
            <AdExpandedDetails metrics={metrics} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

// ─── KPI chip (used in campaign view) ────────────────────────────────────────

function KpiChip({
  label,
  value,
  colored,
  small,
}: {
  label: string;
  value: string;
  colored?: string;
  small?: boolean;
}) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className={cn("text-[10px] text-muted-foreground", small && "text-[9px]")}>{label}</span>
      <span className={cn("tabular-nums font-semibold", small ? "text-xs" : "text-sm", colored)}>{value}</span>
    </div>
  );
}

// ─── Campaign hierarchy view ──────────────────────────────────────────────────

function CampaignView({
  groupedByCampaign,
  activeDefs,
}: {
  groupedByCampaign: Map<string, Map<string, ZernioLinkedAd[]>>;
  activeDefs: MetricDef[];
}) {
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
  const [expandedAdSets, setExpandedAdSets] = useState<Set<string>>(new Set());
  const [expandedAds, setExpandedAds] = useState<Set<string>>(new Set());

  const toggleCampaign = (name: string) => {
    setExpandedCampaigns((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleAdSet = (key: string) => {
    setExpandedAdSets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAd = (id: string) => {
    setExpandedAds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalAdCols = 5 + activeDefs.length; // expand + name + status + budget + metric cols (no preview in nested)

  if (groupedByCampaign.size === 0) {
    return (
      <EmptyState title="Sin campañas" description="No hay anuncios con los filtros actuales." />
    );
  }

  return (
    <div className="space-y-3">
      {[...groupedByCampaign.entries()].map(([campaignName, adSetMap]) => {
        const allCampaignAds = [...adSetMap.values()].flat();
        const campAgg = aggregateGroup(allCampaignAds);
        const campExpanded = expandedCampaigns.has(campaignName);
        const activeCount = allCampaignAds.filter((a) => a.status === "active").length;

        return (
          <div key={campaignName} className="overflow-hidden rounded-xl border border-border">
            {/* Campaign header */}
            <button
              type="button"
              onClick={() => toggleCampaign(campaignName)}
              className="flex w-full items-center gap-4 bg-muted/20 px-4 py-4 text-left transition-colors hover:bg-muted/40"
            >
              <ChevronRight
                className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", campExpanded && "rotate-90")}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{campaignName}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {allCampaignAds.length} anuncio{allCampaignAds.length !== 1 ? "s" : ""} · {adSetMap.size} conjunto{adSetMap.size !== 1 ? "s" : ""}
                  {activeCount > 0 && (
                    <span className="ml-2 inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {activeCount} activo{activeCount !== 1 ? "s" : ""}
                    </span>
                  )}
                </p>
              </div>
              <div className="hidden items-center gap-8 md:flex">
                <KpiChip label="Gasto" value={formatCurrency(campAgg.spend)} />
                <KpiChip label="Impres." value={formatNumber(campAgg.impressions)} />
                <KpiChip label="ROAS" value={formatMultiplier(campAgg.roas)} colored={roasColorClass(campAgg.roas)} />
                <KpiChip label="CTR" value={formatPercent(campAgg.ctr)} colored={ctrColorClass(campAgg.ctr)} />
                <KpiChip label="Conv." value={formatNumber(campAgg.conversions)} />
              </div>
            </button>

            {/* AdSets */}
            {campExpanded && (
              <div className="border-t">
                {[...adSetMap.entries()].map(([adSetName, ads]) => {
                  const adSetKey = `${campaignName}::${adSetName}`;
                  const adSetAgg = aggregateGroup(ads);
                  const adSetExpanded = expandedAdSets.has(adSetKey);
                  const adSetActiveCount = ads.filter((a) => a.status === "active").length;

                  return (
                    <div key={adSetKey} className="border-b last:border-b-0">
                      {/* AdSet row */}
                      <button
                        type="button"
                        onClick={() => toggleAdSet(adSetKey)}
                        className="flex w-full items-center gap-3 px-4 py-3 pl-10 text-left transition-colors hover:bg-muted/20"
                      >
                        <ChevronRight
                          className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", adSetExpanded && "rotate-90")}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{adSetName}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {ads.length} anuncio{ads.length !== 1 ? "s" : ""}
                            {adSetActiveCount > 0 && (
                              <span className="ml-2 text-emerald-600 dark:text-emerald-400">
                                · {adSetActiveCount} activo{adSetActiveCount !== 1 ? "s" : ""}
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="hidden items-center gap-6 md:flex">
                          <KpiChip label="Gasto" value={formatCurrency(adSetAgg.spend)} small />
                          <KpiChip label="ROAS" value={formatMultiplier(adSetAgg.roas)} colored={roasColorClass(adSetAgg.roas)} small />
                          <KpiChip label="CTR" value={formatPercent(adSetAgg.ctr)} colored={ctrColorClass(adSetAgg.ctr)} small />
                          <KpiChip label="Conv." value={formatNumber(adSetAgg.conversions)} small />
                        </div>
                      </button>

                      {/* Ads table */}
                      {adSetExpanded && (
                        <div className="w-full min-w-0 overflow-x-auto border-t bg-muted/5">
                          <table className="w-full text-left" style={{ minWidth: "max-content" }}>
                            <thead className="border-b bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
                              <tr>
                                <th className="w-10 px-2 py-2" />
                                <th className="px-4 py-2 font-medium">Anuncio</th>
                                <th className="px-4 py-2 font-medium">Estado</th>
                                <th className="px-4 py-2 font-medium">Budget</th>
                                {activeDefs.map((def) => (
                                  <th key={def.key} className="px-4 py-2 font-medium">{def.shortLabel}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {ads.map((ad) => (
                                <AdTableRow
                                  key={ad._id}
                                  ad={ad}
                                  expanded={expandedAds.has(ad._id)}
                                  onToggle={() => toggleAd(ad._id)}
                                  activeDefs={activeDefs}
                                  totalCols={totalAdCols}
                                  indented
                                />
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * Recarga los anuncios con los filtros. La lectura devuelve su error como valor
 * (SCRUM-502): sin anuncios y con el motivo, que el tablero muestra; si la
 * acción lanzó, el texto fijo.
 */
export async function cargarAnuncios(
  filtros: MarketingAdsFilters
): Promise<{ ads: ZernioLinkedAd[]; error: string | null }> {
  const lectura = await leerConMotivo(
    () => getMarketingAdsAction(filtros),
    "[AdsDashboard] recargar"
  );
  return lectura.ok
    ? { ads: lectura.data.ads, error: null }
    : { ads: [], error: lectura.motivo };
}

export function AdsDashboard({ initialAds, initialError = null, initialRangeDays = 30 }: Props) {
  const [ads, setAds] = useState(initialAds);
  const [error, setError] = useState<string | null>(initialError);

  // Server-side filters (trigger API refetch)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [rangeDays, setRangeDays] = useState<RangeDays>(initialRangeDays);

  // Client-side filters (applied to already-fetched ads)
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [adSetFilter, setAdSetFilter] = useState("all");

  // View & sort
  const [viewMode, setViewMode] = useState<ViewMode>("flat");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [pending, startTransition] = useTransition();

  // Unique action keys from all ads data (for dynamic event columns)
  const availableActions = useMemo(() => {
    const keys = new Set<string>();
    for (const ad of ads) {
      for (const k of Object.keys(ad.metrics?.actions ?? {})) {
        if ((ad.metrics.actions[k] ?? 0) > 0) keys.add(k);
      }
    }
    return [...keys].sort();
  }, [ads]);

  // Metric column selector
  const { selected: selectedMetrics, toggle: toggleMetric, reset: resetMetrics, activeDefs, dynamicDefs } = useMetricColumns(availableActions);

  // ── Derived: unique campaign names from all ads
  const campaignOptions = useMemo(() => {
    const names = [...new Set(ads.map((a) => a.campaignName).filter(Boolean))].sort();
    return [{ value: "all", label: "Todas las campañas" }, ...names.map((n) => ({ value: n, label: n }))];
  }, [ads]);

  // ── Derived: unique adset names (filtered by selected campaign)
  const adSetOptions = useMemo(() => {
    const filtered = campaignFilter === "all" ? ads : ads.filter((a) => a.campaignName === campaignFilter);
    const names = [...new Set(filtered.map((a) => a.adSetName).filter(Boolean))].sort();
    return [{ value: "all", label: "Todos los conjuntos" }, ...names.map((n) => ({ value: n, label: n }))];
  }, [ads, campaignFilter]);

  // ── Derived: display ads after client-side filters
  const displayAds = useMemo(() => {
    return ads.filter((ad) => {
      if (campaignFilter !== "all" && ad.campaignName !== campaignFilter) return false;
      if (adSetFilter !== "all" && ad.adSetName !== adSetFilter) return false;
      return true;
    });
  }, [ads, campaignFilter, adSetFilter]);

  // ── Sorted ads for flat view
  const sortedAds = useMemo(() => {
    if (!sortKey) return displayAds;
    return [...displayAds].sort((a, b) => {
      const ma = normalizeAdMetrics(a.metrics);
      const mb = normalizeAdMetrics(b.metrics);
      const resolveVal = (m: ReturnType<typeof normalizeAdMetrics>, ad: ZernioLinkedAd, key: SortKey): number => {
        if (key === "budget") return ad.budget?.amount ?? 0;
        if (typeof key === "string" && key.startsWith("action:")) return m.actions?.[key.slice("action:".length)] ?? 0;
        return (m[key as MetricKey] as number) ?? 0;
      };
      const valA = resolveVal(ma, a, sortKey);
      const valB = resolveVal(mb, b, sortKey);
      return sortDir === "desc" ? valB - valA : valA - valB;
    });
  }, [displayAds, sortKey, sortDir]);

  // ── Grouped by campaign → adset for campaign view
  const groupedByCampaign = useMemo(() => {
    const map = new Map<string, Map<string, ZernioLinkedAd[]>>();
    for (const ad of displayAds) {
      const camp = ad.campaignName ?? "Sin campaña";
      const adset = ad.adSetName ?? "Sin conjunto";
      if (!map.has(camp)) map.set(camp, new Map());
      const adsetMap = map.get(camp)!;
      if (!adsetMap.has(adset)) adsetMap.set(adset, []);
      adsetMap.get(adset)!.push(ad);
    }
    return map;
  }, [displayAds]);

  // ── KPIs from display ads
  const kpis = useMemo(() => {
    const agg = aggregateGroup(displayAds);
    return agg;
  }, [displayAds]);

  // ── Refetch from API
  const refetch = useCallback(
    (status: StatusFilter, platform: PlatformFilter, range: RangeDays) => {
      startTransition(async () => {
        const result = await cargarAnuncios(buildFilters(status, platform, range));
        setAds(result.ads);
        setError(result.error);
        setExpandedIds(new Set());
        setCampaignFilter("all");
        setAdSetFilter("all");
      });
    },
    []
  );

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Fixed columns: expand + preview + name + status + budget = 5
  const totalCols = 5 + activeDefs.length;

  return (
    <div className="min-w-0 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Anuncios</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Meta Ads sincronizados en vivo desde Zernio
        </p>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricStat title="Gasto total" value={formatCurrency(kpis.spend)} />
        <MetricStat title="Impresiones" value={formatNumber(kpis.impressions)} />
        <MetricStat title="Alcance" value={formatNumber(kpis.reach)} />
        <MetricStat title="Conversiones" value={formatNumber(kpis.conversions)} />
        <MetricStat title="ROAS promedio" value={formatMultiplier(kpis.roas)} />
        <MetricStat title="CTR promedio" value={formatPercent(kpis.ctr)} />
        <MetricStat title="Costo/Conv." value={formatCurrency(kpis.costPerConversion)} />
        <MetricStat title="Valor de compras" value={formatCurrency(kpis.purchaseValue)} />
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-4">
        {/* Row 1: server-side filters */}
        <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Estado</p>
            <FilterPills
              options={STATUS_OPTIONS}
              value={statusFilter}
              onChange={(v) => { setStatusFilter(v as StatusFilter); refetch(v as StatusFilter, platformFilter, rangeDays); }}
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Plataforma</p>
            <FilterPills
              options={PLATFORM_OPTIONS}
              value={platformFilter}
              onChange={(v) => { setPlatformFilter(v as PlatformFilter); refetch(statusFilter, v as PlatformFilter, rangeDays); }}
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Período</p>
            <FilterPills
              options={RANGE_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
              value={String(rangeDays)}
              onChange={(v) => { const n = Number(v) as RangeDays; setRangeDays(n); refetch(statusFilter, platformFilter, n); }}
            />
          </div>
        </div>

        {/* Row 2: client-side filters + view toggle + column selector */}
        <div className="flex flex-wrap items-end gap-3">
          <FilterSelect
            label="Campaña"
            value={campaignFilter}
            onChange={(v) => { setCampaignFilter(v); setAdSetFilter("all"); }}
            options={campaignOptions}
          />
          <FilterSelect
            label="Conjunto de anuncios"
            value={adSetFilter}
            onChange={setAdSetFilter}
            options={adSetOptions}
          />

          {/* Spacer */}
          <div className="flex-1" />

          {/* View toggle */}
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Vista</p>
              <div className="flex rounded-lg border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setViewMode("flat")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors",
                    viewMode === "flat"
                      ? "bg-foreground text-background"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  )}
                >
                  <LayoutList className="h-3.5 w-3.5" aria-hidden />
                  Anuncios
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("campaigns")}
                  className={cn(
                    "flex items-center gap-1.5 border-l px-3 py-1.5 text-sm transition-colors",
                    viewMode === "campaigns"
                      ? "bg-foreground text-background"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  )}
                >
                  <Layers className="h-3.5 w-3.5" aria-hidden />
                  Campañas
                </button>
              </div>
            </div>
            <MetricColumnSelector
              selected={selectedMetrics}
              onToggle={toggleMetric}
              onReset={resetMetrics}
              dynamicDefs={dynamicDefs}
            />
          </div>
        </div>
      </div>

      {/* Loading */}
      {pending && <TableSkeleton />}

      {/* Error */}
      {!pending && error && ads.length === 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Empty */}
      {!pending && !error && displayAds.length === 0 && (
        <EmptyState
          title="No hay anuncios"
          description={
            campaignFilter !== "all" || adSetFilter !== "all"
              ? "No hay anuncios con los filtros seleccionados."
              : "Cuando crees o boosteés contenido desde Meta Ads, aparecerán aquí."
          }
        />
      )}

      {/* Content */}
      {!pending && displayAds.length > 0 && (
        <>
          <StatusSummary ads={displayAds} />

          {/* ── Campaign hierarchy view ── */}
          {viewMode === "campaigns" && (
            <CampaignView
              groupedByCampaign={groupedByCampaign}
              activeDefs={activeDefs}
            />
          )}

          {/* ── Flat table view ── */}
          {viewMode === "flat" && (
            <div className="w-full min-w-0 overflow-x-auto rounded-lg border">
              <table className="w-full text-left" style={{ minWidth: "max-content" }}>
                <thead className="border-b bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-10 px-2 py-3" aria-label="Expandir" />
                    <th className="px-4 py-3 font-medium">Preview</th>
                    <th className="px-4 py-3 font-medium">Nombre / Campaña</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                    <SortableHeader label="Budget" sortKey="budget" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                    {activeDefs.map((def) =>
                      def.sortable ? (
                        <SortableHeader
                          key={def.key}
                          label={def.shortLabel}
                          sortKey={def.key}
                          currentKey={sortKey}
                          dir={sortDir}
                          onSort={handleSort}
                        />
                      ) : (
                        <th key={def.key} className="px-4 py-3 font-medium uppercase tracking-wide text-muted-foreground">
                          {def.shortLabel}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sortedAds.map((ad) => (
                    <AdTableRow
                      key={ad._id}
                      ad={ad}
                      expanded={expandedIds.has(ad._id)}
                      onToggle={() => toggleExpanded(ad._id)}
                      activeDefs={activeDefs}
                      totalCols={totalCols}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
