"use client";

import { useState } from "react";
import {
  BarChart2,
  ChevronDown,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Badge, Button, cn, GlassPanel } from "@ai-coo/ui";
import {
  generateContentPatternReportAction,
  getLatestContentPatternReportAction,
  type ContentPatternReport,
  type GeneratePatternReportParams,
  type PatternRankedItem,
} from "@/app/marketing/content/pattern-report-actions";
import { leerConMotivo } from "@/lib/client/correr-accion";

// ─── Selector de rango ──────────────────────────────────────────────────────────

type RangeOption = {
  label: string;
  params: GeneratePatternReportParams;
};

const RANGE_OPTIONS: RangeOption[] = [
  { label: "Últimas 30 piezas", params: { type: "COUNT", count: 30 } },
  { label: "Últimas 60 piezas", params: { type: "COUNT", count: 60 } },
  { label: "Últimas 90 piezas", params: { type: "COUNT", count: 90 } },
  { label: "Todo el historial", params: { type: "COUNT", count: "all" } },
];

// ─── Componente principal ───────────────────────────────────────────────────────

export function ContentPatternReport({
  initialReport,
  errorInicial = null,
}: {
  initialReport: ContentPatternReport | null;
  /**
   * Por qué no se pudo leer el último reporte (SCRUM-519). Se muestra en el
   * mismo lugar que el error de generar: sin esto, la falla se veía como "todavía
   * no hay reporte".
   */
  errorInicial?: string | null;
}) {
  const [report, setReport] = useState<ContentPatternReport | null>(
    initialReport
  );
  const [selectedRange, setSelectedRange] = useState<RangeOption>(
    RANGE_OPTIONS[0]
  );
  const [rangeOpen, setRangeOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(errorInicial);
  const [minCount, setMinCount] = useState(2);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const result = await leerConMotivo(
        () => generateContentPatternReportAction(selectedRange.params),
        "[ContentPatternReport] generar"
      );
      if (result.ok) setReport(result.data);
      else setError(result.motivo);
    } finally {
      setLoading(false);
    }
  }

  const generatedDate = report?.generated_at
    ? new Date(report.generated_at).toLocaleDateString("es-AR", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="space-y-4">
      {/* Header + selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-medium">Patrones de contenido</h3>
        <div className="flex items-center gap-2">
          {/* Selector de rango */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setRangeOpen((o) => !o)}
              className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-1.5 text-xs hover:bg-muted/40 transition-colors"
            >
              {selectedRange.label}
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  rangeOpen && "rotate-180"
                )}
              />
            </button>
            {rangeOpen && (
              <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-border/60 bg-card shadow-lg overflow-hidden">
                {RANGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    className={cn(
                      "w-full px-3 py-2 text-left text-xs hover:bg-muted/40 transition-colors",
                      selectedRange.label === opt.label &&
                        "text-primary font-medium"
                    )}
                    onClick={() => {
                      setSelectedRange(opt);
                      setRangeOpen(false);
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={handleGenerate}
            disabled={loading}
            className="gap-1.5 text-xs"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : report ? (
              <RefreshCw className="h-3.5 w-3.5" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {report ? "Regenerar" : "Generar análisis"}
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <GlassPanel className="p-4 border-destructive/40 bg-destructive/5">
          <p className="text-sm text-destructive">{error}</p>
        </GlassPanel>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl border border-border/60 bg-muted/20"
            />
          ))}
        </div>
      )}

      {/* Sin reporte todavía */}
      {!loading && !report && !error && (
        <GlassPanel className="p-8 text-center">
          <BarChart2 className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm font-medium mb-1">Análisis de patrones bajo demanda</p>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            Elegí el rango y hacé clic en &ldquo;Generar análisis&rdquo; para que la IA analice
            los formatos, hooks y temas que mejor funcionan en tu contenido.
          </p>
        </GlassPanel>
      )}

      {/* Reporte */}
      {!loading && report && (
        <div className="space-y-6">
          {/* Metadatos */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
              {report.content_ids.length} piezas analizadas
            </span>
            {generatedDate && (
              <>
                <span aria-hidden>·</span>
                <span>Generado el {generatedDate}</span>
              </>
            )}
          </div>

          {/* Filtro de mínimo de apariciones */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Mínimo de apariciones:</span>
            <div className="flex gap-1">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMinCount(n)}
                  className={cn(
                    "rounded px-2 py-0.5 font-medium transition-colors",
                    minCount === n
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  {n}+
                </button>
              ))}
            </div>
          </div>

          {/* Rankings */}
          <div className="grid gap-4 sm:grid-cols-3">
            <RankingCard
              title="Formatos"
              items={report.top_formats.filter((i) => i.count >= minCount)}
              colorClass="bg-brand-500/20 text-brand-400"
            />
            <RankingCard
              title="Hooks"
              items={report.top_hooks.filter((i) => i.count >= minCount)}
              colorClass="bg-blue-500/20 text-blue-400"
            />
            <RankingCard
              title="Temas / Dolores"
              items={report.top_topics.filter((i) => i.count >= minCount)}
              colorClass="bg-amber-500/20 text-amber-400"
            />
          </div>

          {/* Resumen IA */}
          {report.summary && (
            <GlassPanel className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-ai shrink-0" />
                <p className="text-sm font-medium">Observaciones</p>
              </div>
              <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                {report.summary}
              </div>
            </GlassPanel>
          )}

          {/* Sugerencias IA */}
          {report.suggestions && (
            <GlassPanel className="p-5 space-y-3 border-ai/20 bg-ai/5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-ai shrink-0" />
                <p className="text-sm font-medium">Sugerencias</p>
              </div>
              <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                {report.suggestions}
              </div>
            </GlassPanel>
          )}

          {/* Nota de muestra */}
          {report.sample_size_notes && (
            <p className="text-xs text-muted-foreground/70 italic">
              {report.sample_size_notes}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub-componentes ────────────────────────────────────────────────────────────

function RankingCard({
  title,
  items,
  colorClass,
}: {
  title: string;
  items: PatternRankedItem[];
  colorClass: string;
}) {
  const maxCount = items.length > 0 ? Math.max(...items.map((i) => i.count)) : 1;

  return (
    <GlassPanel className="p-4 space-y-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {title}
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground/60">Sin datos clasificados</p>
      ) : (
        <div className="space-y-2">
          {items.slice(0, 5).map((item) => {
            const pct = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
            return (
              <div key={item.value} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs truncate">{item.label}</span>
                  <Badge
                    variant="secondary"
                    className={cn("shrink-0 text-[10px] px-1.5 py-0 font-mono tabular-nums", colorClass)}
                  >
                    {item.count}
                  </Badge>
                </div>
                <div className="h-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-current opacity-30 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {item.avg_views !== undefined && item.avg_views > 0 && (
                  <p className="text-[10px] text-muted-foreground/60 tabular-nums">
                    {item.avg_views.toLocaleString("es-AR")} views prom.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </GlassPanel>
  );
}
