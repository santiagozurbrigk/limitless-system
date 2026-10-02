"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  linkDriveFileToContentAction,
  unlinkDriveFileAction,
} from "@/app/marketing/content/drive-actions";
import { TrialReelsButton, TrialReelsPanel } from "@/components/marketing/trial-reels";
import type { ReelVariationJob } from "@/types/reel-variations";
import { DriveFilePicker } from "@/components/marketing/drive-file-picker";
import {
  AnalysisDimensionIcon,
  ContentTypeIcon,
  MetricIcon,
  type MetricIconName,
} from "@/components/marketing/marketing-icons";
import { ZernioPostComments } from "@/components/marketing/zernio-post-comments";
import { ZernioPostAds } from "@/components/marketing/zernio-post-ads";
import { ChartShell } from "@/components/charts/platform/chart-shell";
import { RingDistributionChart } from "@/components/charts/platform/ring-distribution-chart";
import { RadarPerformanceChart } from "@/components/charts/platform/radar-performance-chart";
import { paths } from "@/routes";
import type { ContentMetrics, ContentPiece, ContentPieceWithVariants } from "@/types/content";
import {
  Badge,
  Button,
  cn,
} from "@ai-coo/ui";
import { useToast } from "@/providers/toast-provider";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  Folder,
  Instagram,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { safeThumbnailUrl } from "@/lib/marketing/cdn-utils";
import { brandColors } from "@/lib/brand";
import { ESCONDIDO } from "@/lib/release/escondido";

// ─── Types & helpers ────────────────────────────────────────────────────────

type Props = {
  piece: ContentPieceWithVariants;
  variants: ContentPiece[];
  orgAvg: ContentMetrics | null;
  initialReelJobs?: ReelVariationJob[];
};

type DetailTab = "metricas" | "analisis" | "comentarios" | "anuncios" | "variantes" | "trial_reels";

function computeEngagementRate(m: ContentMetrics): number | null {
  const { likes = 0, comments = 0, shares = 0, saves = 0, reach = 0 } = m;
  if (!reach) return null;
  return ((likes + comments + shares + saves) / reach) * 100;
}

function computeSaveRate(m: ContentMetrics): number | null {
  const { saves = 0, reach = 0 } = m;
  if (!reach) return null;
  return (saves / reach) * 100;
}

function computeShareRate(m: ContentMetrics): number | null {
  const { shares = 0, reach = 0 } = m;
  if (!reach) return null;
  return (shares / reach) * 100;
}

function fmtPct(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

function fmtNum(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString("es-AR");
}

// ─── Main component ──────────────────────────────────────────────────────────

export function ContentPieceDetail({ piece, variants, orgAvg, initialReelJobs = [] }: Props) {
  const router = useRouter();
  const { push } = useToast();
  const [analyzing, setAnalyzing] = useState(false);
  const [showDrivePicker, setShowDrivePicker] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>("metricas");
  const [reelJobs, setReelJobs] = useState<ReelVariationJob[]>(initialReelJobs);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const res = await fetch("/api/content/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentPieceId: piece.id }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "Error al analizar");
      }
      push({ title: "Análisis completado", variant: "success" });
      router.refresh();
    } catch (err) {
      push({
        title: "Error al analizar",
        description: err instanceof Error ? err.message : "Error desconocido",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDriveLink = async (file: { id: string; name: string; url: string }) => {
    try {
      await linkDriveFileToContentAction(piece.id, file);
      setShowDrivePicker(false);
      push({ title: "Archivo vinculado", variant: "success" });
      router.refresh();
    } catch (err) {
      push({
        title: "No se pudo vincular",
        description: err instanceof Error ? err.message : "Error desconocido",
      });
    }
  };

  const handleDriveUnlink = async () => {
    try {
      await unlinkDriveFileAction(piece.id);
      push({ title: "Archivo desvinculado", variant: "success" });
      router.refresh();
    } catch (err) {
      push({
        title: "No se pudo desvincular",
        description: err instanceof Error ? err.message : "Error desconocido",
      });
    }
  };

  const platformLabel =
    piece.platform === "youtube"
      ? "YouTube"
      : piece.platform === "instagram"
        ? "Instagram"
        : "plataforma";

  // Filtrar URLs efímeras del CDN de Instagram (expiran ~1-2hs → generan 403 en consola)
  const pieceThumbnail = safeThumbnailUrl(piece.thumbnail_url);

  const tabs = [
    { tab: "metricas" as const, label: "Métricas" },
    { tab: "analisis" as const, label: "Análisis", showCheck: Boolean(piece.analysis) },
    { tab: "comentarios" as const, label: "Comentarios" },
    { tab: "anuncios" as const, label: "Anuncios" },
    {
      tab: "variantes" as const,
      label: `Variantes${variants.length > 0 ? ` (${variants.length})` : ""}`,
    },
    {
      tab: "trial_reels" as const,
      label: `Trial Reels${reelJobs.length > 0 ? ` (${reelJobs.length})` : ""}`,
    },
  ] as const;

  return (
    <div className="flex flex-col gap-4">
      {/* Back button */}
      <Button variant="ghost" size="sm" className="gap-2 -ml-2 w-fit" asChild>
        <Link href={paths.platform.marketing.content}>
          <ArrowLeft className="h-4 w-4" />
          Volver al contenido
        </Link>
      </Button>

      {/* Main layout */}
      <div className="flex min-h-[680px] overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
        {/* ─── Left panel ──────────────────────────────────────────── */}
        <div className="flex w-64 flex-shrink-0 flex-col gap-4 border-r border-border/60 p-4">
          {/* Thumbnail — filtra URLs CDN expiradas de Instagram para evitar 403 en consola */}
          <div className="relative aspect-[9/16] overflow-hidden rounded-xl bg-muted shadow-inner">
            {pieceThumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={pieceThumbnail}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <ContentTypeIcon type={piece.type} size={40} />
              </div>
            )}
            {/* Type badge overlay */}
            <span className="absolute left-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
              {piece.type}
            </span>
          </div>

          {/* Metadata */}
          <div className="space-y-2">
            <p className="line-clamp-3 text-xs font-medium leading-relaxed text-foreground/90">
              {piece.caption ?? piece.title ?? "Sin descripción"}
            </p>
            {piece.published_at ? (
              <p className="text-[11px] text-muted-foreground" suppressHydrationWarning>
                {new Date(piece.published_at).toLocaleDateString("es-AR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            ) : null}

            {/* Platform ID chip */}
            {piece.platform_post_id ? (
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(piece.platform_post_id!);
                  push({ title: "ID copiado", variant: "success" });
                }}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/50 bg-muted/60 px-2 py-0.5 text-[10px] font-mono text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Copiar platform_post_id"
              >
                <span className="truncate">{piece.platform_post_id}</span>
                <Copy className="h-2.5 w-2.5 shrink-0" />
              </button>
            ) : null}

            {/* External link */}
            {piece.platform_post_url ? (
              <a
                href={piece.platform_post_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                <Instagram className="h-3 w-3" aria-hidden />
                Ver en {platformLabel}
                <ExternalLink className="h-2.5 w-2.5" aria-hidden />
              </a>
            ) : null}
          </div>

          {/* Drive file */}
          <div className="rounded-xl border border-border/50 bg-muted/30 p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Archivo de Drive
            </p>
            {piece.drive_file_id ? (
              <div className="flex items-start gap-2">
                <Folder className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" aria-hidden />
                <div className="min-w-0 flex-1">
                  <a
                    href={piece.drive_file_url ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="line-clamp-2 text-xs font-medium text-primary hover:underline"
                  >
                    {piece.drive_file_name}
                  </a>
                  <button
                    type="button"
                    onClick={() => void handleDriveUnlink()}
                    className="mt-1 text-[10px] text-destructive hover:underline"
                  >
                    Desvincular
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowDrivePicker(true)}
                className="text-xs text-primary hover:underline"
              >
                + Vincular archivo de Drive
              </button>
            )}
          </div>

          {/* AI analyze button */}
          <div className="space-y-2">
            <Button
              type="button"
              className={cn(
                "w-full gap-2 font-medium",
                !piece.drive_file_id && "opacity-50"
              )}
              disabled={analyzing || !piece.drive_file_id}
              onClick={() => void handleAnalyze()}
            >
              <Sparkles className="h-4 w-4" aria-hidden />
              {analyzing
                ? "Analizando…"
                : piece.analysis
                  ? "Re-analizar con IA"
                  : "Analizar con IA"}
            </Button>
            {!piece.drive_file_id ? (
              <p className="text-center text-[10px] text-muted-foreground">
                Vinculá un archivo de Drive para analizar
              </p>
            ) : null}
          </div>

          {/* Trial Reels button */}
          {(piece.type === "reel" || piece.type === "story") && (
            <TrialReelsButton
              contentPieceId={piece.id}
              hasDriveFile={Boolean(piece.drive_file_id)}
              onJobCreated={(jobId) => {
                // Agregar job placeholder y cambiar a tab trial_reels
                setReelJobs((prev) => [
                  {
                    id: jobId,
                    organization_id: "",
                    source_piece_id: piece.id,
                    status: "pending",
                    delay_hours: 2,
                    variations: [],
                    error_message: null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  },
                  ...prev,
                ]);
                setActiveTab("trial_reels");
              }}
            />
          )}
          {(piece.type === "reel" || piece.type === "story") && !piece.drive_file_id && (
            <p className="text-center text-[10px] text-muted-foreground">
              Vinculá un video de Drive para Trial Reels
            </p>
          )}
        </div>

        {/* ─── Right panel ─────────────────────────────────────────── */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-border/60 px-4">
            {tabs.map((item) => (
              <button
                key={item.tab}
                type="button"
                onClick={() => setActiveTab(item.tab)}
                className={cn(
                  "border-b-2 px-4 py-3.5 text-sm font-medium transition-colors",
                  activeTab === item.tab
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="inline-flex items-center gap-1.5">
                  {item.label}
                  {"showCheck" in item && item.showCheck ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
                  ) : null}
                </span>
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === "metricas" ? (
              <MetricasTab piece={piece} orgAvg={orgAvg} />
            ) : null}
            {activeTab === "analisis" ? <AnalisisTab piece={piece} /> : null}
            {activeTab === "comentarios" ? <ComentariosTab piece={piece} /> : null}
            {activeTab === "anuncios" ? <AnunciosTab piece={piece} /> : null}
            {activeTab === "variantes" ? (
              <VariantesTab variants={variants} />
            ) : null}
            {activeTab === "trial_reels" ? (
              <div className="p-5">
                <p className="mb-4 text-xs text-muted-foreground">
                  Generación automática de 5 variaciones del reel con FFmpeg.
                  Cada variante aplica una transformación diferente (velocidad, música, subtítulos, color)
                  y reescribe los metadatos del archivo para publicación como trial reels.
                </p>
                <TrialReelsPanel
                  contentPieceId={piece.id}
                  initialJobs={reelJobs}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Drive picker modal */}
      {showDrivePicker ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-background p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">Seleccionar archivo de Google Drive</h2>
              <button
                type="button"
                onClick={() => setShowDrivePicker(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <DriveFilePicker
              onSelect={handleDriveLink}
              onClose={() => setShowDrivePicker(false)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Métricas Tab ────────────────────────────────────────────────────────────

function MetricasTab({
  piece,
  orgAvg,
}: {
  piece: ContentPiece;
  orgAvg: ContentMetrics | null;
}) {
  const m = piece.metrics;

  if (!m) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-muted-foreground">Sin métricas disponibles.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Las métricas se sincronizan automáticamente desde Zernio.
        </p>
      </div>
    );
  }

  const engRate = computeEngagementRate(m);
  const orgEngRate = orgAvg ? computeEngagementRate(orgAvg) : null;
  const saveRate = computeSaveRate(m);
  const shareRate = computeShareRate(m);

  // Interaction distribution donut
  const totalInteractions =
    (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.saves ?? 0);
  const donutSlices = [
    { label: "Likes", value: m.likes ?? 0, color: brandColors.primary },
    { label: "Comentarios", value: m.comments ?? 0, color: brandColors.primaryLight },
    { label: "Compartidos", value: m.shares ?? 0, color: brandColors.primaryLighter },
    { label: "Guardados", value: m.saves ?? 0, color: brandColors.primaryDeep },
  ].filter((s) => s.value > 0);

  // Radar: esta pieza vs promedio org
  const radarMetrics = [
    { key: "views", label: "Views" },
    { key: "reach", label: "Alcance" },
    { key: "likes", label: "Likes" },
    { key: "comments", label: "Comentarios" },
    { key: "saves", label: "Guardados" },
  ];

  const normalizeRadar = (
    pieceVal: number,
    avgVal: number
  ): number => {
    if (!avgVal) return pieceVal > 0 ? 75 : 0;
    // Scale: avg = 50, double avg = 100, 0 = 0
    return Math.min(100, Math.round((pieceVal / avgVal) * 50));
  };

  const radarSeries = orgAvg
    ? [
        {
          label: "Esta pieza",
          color: "var(--primary)",
          values: {
            views: normalizeRadar(m.views ?? 0, orgAvg.views ?? 0),
            reach: normalizeRadar(m.reach ?? 0, orgAvg.reach ?? 0),
            likes: normalizeRadar(m.likes ?? 0, orgAvg.likes ?? 0),
            comments: normalizeRadar(m.comments ?? 0, orgAvg.comments ?? 0),
            saves: normalizeRadar(m.saves ?? 0, orgAvg.saves ?? 0),
          },
        },
        {
          label: "Promedio org",
          color: "var(--chart-3, #6b7280)",
          values: {
            views: 50,
            reach: 50,
            likes: 50,
            comments: 50,
            saves: 50,
          },
        },
      ]
    : null;

  return (
    <div className="space-y-6 p-5">
      {/* ── Section 1: Primary metrics ── */}
      <div>
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Alcance y visibilidad
        </p>
        <div className="grid grid-cols-3 gap-3">
          <PrimaryMetricCard
            label="Views"
            icon="views"
            value={m.views}
            orgAvg={orgAvg?.views}
          />
          <PrimaryMetricCard
            label="Alcance"
            icon="reach"
            value={m.reach}
            orgAvg={orgAvg?.reach}
          />
          <PrimaryMetricCard
            label="Impresiones"
            icon="impressions"
            value={m.impressions}
            orgAvg={orgAvg?.impressions}
          />
        </div>
      </div>

      {/* ── Section 2: Interaction metrics ── */}
      <div>
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Interacciones
        </p>
        <div className="grid grid-cols-4 gap-2">
          {(
            [
              { label: "Likes", icon: "likes" as const, value: m.likes },
              { label: "Comentarios", icon: "comments" as const, value: m.comments },
              { label: "Compartidos", icon: "shares" as const, value: m.shares },
              { label: "Guardados", icon: "saves" as const, value: m.saves },
            ] as Array<{ label: string; icon: MetricIconName; value?: number }>
          ).map((stat) => (
            <SecondaryMetricCard
              key={stat.label}
              label={stat.label}
              icon={stat.icon}
              value={stat.value ?? 0}
            />
          ))}
        </div>
      </div>

      {/* ── Section 3: Computed ratios + Donut ── */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Donut */}
        <ChartShell
          title="Distribución de interacciones"
          subtitle={`${fmtNum(totalInteractions)} interacciones totales`}
          className="min-h-[200px]"
        >
          {donutSlices.length > 0 ? (
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <RingDistributionChart
                  slices={donutSlices}
                  centerValue={fmtNum(totalInteractions)}
                  centerLabel="total"
                  className="max-w-[160px]"
                />
              </div>
              <div className="space-y-2">
                {donutSlices.map((s) => (
                  <div key={s.label} className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-sm shrink-0"
                      style={{ background: s.color }}
                    />
                    <span className="text-xs text-muted-foreground">{s.label}</span>
                    <span className="ml-auto text-xs font-semibold tabular-nums">
                      {fmtNum(s.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Sin interacciones registradas
            </p>
          )}
        </ChartShell>

        {/* Ratios */}
        <div className="flex flex-col gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Ratios clave
          </p>
          {m.reach ? (
            <>
              <RatioCard
                label="Engagement rate"
                description={`Basado en ${fmtNum(m.reach)} reach`}
                value={engRate}
                orgValue={orgEngRate}
                format={fmtPct}
                accent
              />
              <RatioCard
                label="Save rate"
                description="Guardados / alcance"
                value={saveRate}
                format={(v) => fmtPct(v, 2)}
              />
              <RatioCard
                label="Share rate"
                description="Compartidos / alcance"
                value={shareRate}
                format={(v) => fmtPct(v, 2)}
              />
            </>
          ) : (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Se necesita dato de alcance (reach) para calcular ratios.
            </p>
          )}
        </div>
      </div>

      {/* ── Section 4: Radar vs org avg ── */}
      {radarSeries ? (
        <ChartShell
          title="Esta pieza vs promedio org"
          subtitle={`Comparado con el promedio de tu contenido`}
          className="min-h-[300px]"
        >
          <div className="flex flex-col items-center gap-3">
            <RadarPerformanceChart
              metrics={radarMetrics}
              series={radarSeries}
              className="max-w-[280px]"
            />
            <div className="flex justify-center gap-6 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-3 rounded-sm bg-primary" />
                Esta pieza
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="h-2 w-3 rounded-sm"
                  style={{ background: "var(--chart-3, #6b7280)" }}
                />
                Promedio org
              </span>
            </div>
          </div>
        </ChartShell>
      ) : null}

      {/* ── Section 5: Sales attribution ── */}
      {/* Siempre vacía: escondida para el release (SCRUM-490). */}
      {!ESCONDIDO.marketingConexionVentas && <SalesAttributionSection piece={piece} />}

      {/* Metrics freshness */}
      {piece.metrics_updated_at ? (
        <p className="text-[10px] text-muted-foreground text-right" suppressHydrationWarning>
          Métricas actualizadas:{" "}
          {new Date(piece.metrics_updated_at).toLocaleString("es-AR", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      ) : null}
    </div>
  );
}

// ─── Metric card components ──────────────────────────────────────────────────

function PrimaryMetricCard({
  label,
  icon,
  value,
  orgAvg,
}: {
  label: string;
  icon: MetricIconName;
  value?: number;
  orgAvg?: number;
}) {
  const val = value ?? 0;
  const delta =
    orgAvg && orgAvg > 0
      ? ((val - orgAvg) / orgAvg) * 100
      : null;

  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
      <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <MetricIcon name={icon} size={13} />
        {label}
      </div>
      <p className="text-2xl font-bold tabular-nums text-foreground">
        {fmtNum(val)}
      </p>
      {delta !== null ? (
        <div
          className={cn(
            "mt-1.5 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
            delta >= 0
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-red-500/10 text-red-600 dark:text-red-400"
          )}
        >
          {delta >= 0 ? "+" : ""}
          {delta.toFixed(0)}% vs avg
        </div>
      ) : orgAvg !== undefined ? (
        <p className="mt-1 text-[10px] text-muted-foreground">
          org avg {fmtNum(orgAvg)}
        </p>
      ) : null}
    </div>
  );
}

function SecondaryMetricCard({
  label,
  icon,
  value,
}: {
  label: string;
  icon: MetricIconName;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/10 p-3 text-center">
      <div className="mb-1.5 flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
        <MetricIcon name={icon} size={12} />
        <span>{label}</span>
      </div>
      <p className="text-lg font-bold tabular-nums">{fmtNum(value)}</p>
    </div>
  );
}

function RatioCard({
  label,
  description,
  value,
  orgValue,
  format,
  accent = false,
}: {
  label: string;
  description: string;
  value: number | null;
  orgValue?: number | null;
  format: (v: number) => string;
  accent?: boolean;
}) {
  const delta =
    value !== null && orgValue != null && orgValue > 0
      ? ((value - orgValue) / orgValue) * 100
      : null;

  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-xl border p-3",
        accent
          ? "border-primary/20 bg-primary/5"
          : "border-border/50 bg-muted/10"
      )}
    >
      <div>
        <p className={cn("text-xs font-semibold", accent ? "text-primary" : "text-foreground")}>
          {label}
        </p>
        <p className="text-[10px] text-muted-foreground">{description}</p>
        {orgValue != null ? (
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            org avg {format(orgValue)}
          </p>
        ) : null}
      </div>
      <div className="text-right">
        <p className="text-lg font-bold tabular-nums">
          {value !== null ? format(value) : "—"}
        </p>
        {delta !== null ? (
          <span
            className={cn(
              "text-[10px] font-medium",
              delta >= 0 ? "text-emerald-500" : "text-red-500"
            )}
          >
            {delta >= 0 ? "+" : ""}
            {delta.toFixed(0)}%
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ─── Sales Attribution ───────────────────────────────────────────────────────

function SalesAttributionSection({ piece }: { piece: ContentPiece }) {
  const attribution = piece.sales_attributed;

  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">Atribución de ventas</h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Leads del inbox atribuidos a esta pieza (ventana de 7 días post-publicación)
        </p>
      </div>

      {!attribution ? (
        <div className="rounded-lg bg-muted/40 px-4 py-5 text-center">
          <p className="text-xs text-muted-foreground">Sin atribución de ventas todavía</p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Los leads que escriban al inbox dentro de los 7 días posteriores a la publicación
            se atribuirán automáticamente.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-2">
            {(
              [
                { label: "Leads", value: attribution.lead_count, icon: "leads" as const },
                { label: "Agendados", value: attribution.scheduled_count, icon: "scheduled" as const },
                { label: "Cerrados", value: attribution.closed_count, icon: "closed" as const },
                {
                  label: "Revenue",
                  value: attribution.total_revenue,
                  icon: "revenue" as const,
                  isCurrency: true,
                },
              ] as Array<{
                label: string;
                value: number;
                icon: MetricIconName;
                isCurrency?: boolean;
              }>
            ).map((step, index) => (
              <div key={step.label} className="flex items-center gap-1.5">
                <div className="flex-1 rounded-xl border border-border/50 bg-background p-3 text-center">
                  <div className="mb-1 flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
                    <MetricIcon name={step.icon} size={11} />
                    {step.label}
                  </div>
                  <p className="text-base font-bold tabular-nums" suppressHydrationWarning>
                    {step.isCurrency
                      ? step.value.toLocaleString("es-AR", {
                          style: "currency",
                          currency: "USD",
                          maximumFractionDigits: 0,
                        })
                      : step.value.toLocaleString("es-AR")}
                  </p>
                </div>
                {index < 3 ? (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" aria-hidden />
                ) : null}
              </div>
            ))}
          </div>
          {attribution.last_attributed_at ? (
            <p className="text-[10px] text-muted-foreground" suppressHydrationWarning>
              Última atribución:{" "}
              {new Date(attribution.last_attributed_at).toLocaleString("es-AR")}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ─── Análisis Tab ────────────────────────────────────────────────────────────

function AnalisisTab({ piece }: { piece: ContentPiece }) {
  if (!piece.analysis) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-6">
        <Sparkles className="h-8 w-8 text-muted-foreground/40 mb-3" aria-hidden />
        <p className="text-sm font-medium text-muted-foreground">
          Esta pieza no tiene análisis todavía
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Vinculá el archivo de Drive y presioná &quot;Analizar con IA&quot;.
        </p>
      </div>
    );
  }

  const analysis = piece.analysis;

  return (
    <div className="space-y-5 p-5">
      {/* Dimensions grid */}
      <div className="grid grid-cols-3 gap-3">
        <AnalysisCard
          label="Formato"
          dimension="formato"
          name={analysis.formato.name}
          description={analysis.formato.description}
          color="blue"
        />
        <AnalysisCard
          label="Dolor"
          dimension="dolor"
          name={analysis.dolor.name}
          description={analysis.dolor.description}
          color="orange"
        />
        <AnalysisCard
          label="Ángulo"
          dimension="angulo"
          name={analysis.angulo.name}
          description={analysis.angulo.description}
          color="purple"
        />
      </div>

      {/* Why it worked */}
      <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          ¿Por qué funcionó?
        </p>
        <p className="text-sm leading-relaxed">{analysis.why_it_worked}</p>
      </div>

      {/* Video structure */}
      {analysis.video_structure && analysis.video_structure.length > 0 ? (
        <div>
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Estructura del video
          </p>
          <div className="space-y-2">
            {analysis.video_structure.map((section, index) => (
              <div
                key={index}
                className="rounded-xl border border-border/50 bg-muted/10 p-4"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                    {index + 1}
                  </span>
                  <p className="text-xs font-semibold text-primary">{section.part}</p>
                </div>
                <p className="text-sm text-foreground/80">{section.description}</p>
                {section.script_note ? (
                  <p className="mt-2 rounded-lg bg-muted/40 px-3 py-2 text-xs italic text-muted-foreground">
                    {section.script_note}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Transcript */}
      {piece.transcript ? (
        <details className="rounded-xl border border-border/50">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
            Transcripción completa
          </summary>
          <div className="border-t border-border/50 px-4 pb-4 pt-3">
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
              {piece.transcript}
            </p>
          </div>
        </details>
      ) : null}
    </div>
  );
}

function AnalysisCard({
  label,
  dimension,
  name,
  description,
  color,
}: {
  label: string;
  dimension: "formato" | "dolor" | "angulo";
  name: string;
  description: string;
  color: "blue" | "orange" | "purple";
}) {
  const colorMap = {
    blue: "border-blue-200/60 bg-blue-50/80 dark:border-blue-900/40 dark:bg-blue-950/30",
    orange: "border-orange-200/60 bg-orange-50/80 dark:border-orange-900/40 dark:bg-orange-950/30",
    purple: "border-primary/20 bg-primary/5",
  };

  return (
    <div className={cn("rounded-xl border p-4", colorMap[color])}>
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        <AnalysisDimensionIcon dimension={dimension} size={13} />
        {label}
      </div>
      <p className="text-sm font-semibold leading-tight">{name}</p>
      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

// ─── Comentarios Tab ─────────────────────────────────────────────────────────

function ComentariosTab({ piece }: { piece: ContentPiece }) {
  if (!piece.platform_post_id) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-6">
        <p className="text-sm text-muted-foreground">
          Esta pieza no tiene post de Zernio asociado.
        </p>
      </div>
    );
  }
  return (
    <div className="p-5">
      <ZernioPostComments contentPieceId={piece.id} />
    </div>
  );
}

// ─── Anuncios Tab ────────────────────────────────────────────────────────────

function AnunciosTab({ piece }: { piece: ContentPiece }) {
  return (
    <div className="p-5">
      <ZernioPostAds contentPieceId={piece.id} />
    </div>
  );
}

// ─── Variantes Tab ───────────────────────────────────────────────────────────

function VariantesTab({ variants }: { variants: ContentPiece[] }) {
  if (variants.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-6">
        <Sparkles className="h-8 w-8 text-muted-foreground/40 mb-3" aria-hidden />
        <p className="text-sm text-muted-foreground">No hay variantes generadas todavía.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Pedile al Agente de Negocio que cree variantes de este contenido.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-5">
      <p className="text-xs text-muted-foreground">
        Las variantes también están disponibles en{" "}
        <Link
          href={`${paths.platform.marketing.content}?tab=borradores`}
          className="text-primary underline underline-offset-2 hover:no-underline"
        >
          Borradores de contenido
        </Link>
        .
      </p>

      {variants.map((variant) => (
        <div key={variant.id} className="rounded-xl border border-border/60 bg-muted/10 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              Variante IA
            </span>
            <span className="text-[11px] text-muted-foreground" suppressHydrationWarning>
              {new Date(variant.created_at).toLocaleDateString("es-AR")}
            </span>
            {variant.platform_post_id ? (
              <Badge variant="secondary" className="gap-1 text-[11px]">
                Publicado
                {variant.platform_post_url ? (
                  <a
                    href={variant.platform_post_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center hover:text-primary"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </Badge>
            ) : null}
          </div>

          {variant.brief ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-blue-50/80 p-2 dark:bg-blue-950/30">
                  <p className="text-[10px] text-muted-foreground">Formato</p>
                  <p className="text-xs font-medium">{variant.brief.formato?.name}</p>
                </div>
                <div className="rounded-lg bg-orange-50/80 p-2 dark:bg-orange-950/30">
                  <p className="text-[10px] text-muted-foreground">Dolor</p>
                  <p className="text-xs font-medium">{variant.brief.dolor?.name}</p>
                </div>
                <div className="rounded-lg bg-primary/5 p-2">
                  <p className="text-[10px] text-muted-foreground">Ángulo</p>
                  <p className="text-xs font-medium">{variant.brief.angulo?.name}</p>
                </div>
              </div>

              {variant.brief.structure?.map((section, index) => (
                <div key={index} className="rounded-xl border border-border/50 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/15 text-[9px] font-bold text-primary">
                      {index + 1}
                    </span>
                    <p className="text-xs font-semibold text-primary">{section.part}</p>
                  </div>
                  <p className="text-sm text-foreground/80">{section.description}</p>
                  {section.example_script ? (
                    <p className="mt-2 rounded-lg bg-muted/60 px-3 py-2 font-mono text-xs">
                      {section.example_script}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Esta variante no tiene brief todavía.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
