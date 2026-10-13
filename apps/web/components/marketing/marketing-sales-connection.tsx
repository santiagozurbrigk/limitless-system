"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, TrendingUp } from "lucide-react";
import { Badge, cn, GlassPanel } from "@ai-coo/ui";
import {
  getClosedBuyerJourneysAction,
  getSalesContentRankAction,
} from "@/app/marketing/actions";
import { getLatestContentPatternReportAction } from "@/app/marketing/content/pattern-report-actions";
import { leerConMotivo } from "@/lib/client/correr-accion";
import type { SalesContentRankView } from "@/lib/marketing/content-sales-rank";
import { paths } from "@/routes";
import { ContentThumbnail } from "@/components/marketing-insights/content-thumbnail";
import { CONTENT_TYPE_LABEL } from "@/components/marketing-insights/content-labels";
import { EmptyState } from "@/components/shared/empty-state";
import { ContentPatternReport } from "@/components/marketing/content-pattern-report";
import type { ClosedBuyerJourney } from "@/types/marketing-insights";
import type { ContentPatternReport as ContentPatternReportType } from "@/app/marketing/content/pattern-report-actions";

/**
 * Lo que necesita la sección del último reporte (SCRUM-519): el reporte o, si
 * no se pudo leer, el motivo. Sin el motivo, la falla se veía como "todavía no
 * hay reporte" y la sección ofrecía generar el primero.
 */
export async function leerUltimoReporte(
  leer: typeof getLatestContentPatternReportAction = getLatestContentPatternReportAction
): Promise<{ reporte: ContentPatternReportType | null; motivo: string | null }> {
  const lectura = await leerConMotivo(leer, "[MarketingSalesConnection] último reporte");
  return lectura.ok
    ? { reporte: lectura.data, motivo: null }
    : { reporte: null, motivo: lectura.motivo };
}

export function MarketingSalesConnection() {
  const [loading, setLoading] = useState(true);
  const [rank, setRank] = useState<SalesContentRankView[]>([]);
  const [journeys, setJourneys] = useState<ClosedBuyerJourney[]>([]);
  const [latestReport, setLatestReport] =
    useState<ContentPatternReportType | null>(null);
  const [motivoDelReporte, setMotivoDelReporte] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      getSalesContentRankAction(),
      getClosedBuyerJourneysAction(),
      leerUltimoReporte(),
    ])
      .then(([rankData, journeyData, ultimo]) => {
        if (!active) return;
        setRank(rankData);
        setJourneys(journeyData);
        setLatestReport(ultimo.reporte);
        setMotivoDelReporte(ultimo.motivo);
      })
      .catch(() => {
        if (!active) return;
        setRank([]);
        setJourneys([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const maxRevenue = rank.length > 0 ? Math.max(...rank.map((r) => r.revenue)) : 0;

  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          ¿Qué contenido está generando tus ventas?
        </h2>
        <p className="mt-2 text-muted-foreground max-w-2xl">
          Visualizá el camino completo de cada cliente, desde el primer contenido que vio hasta
          que compró. Los datos vienen de UTMs, YouTube e Instagram según lo que tengas conectado.
        </p>
      </div>

      <section className="space-y-4">
        <h3 className="text-sm font-medium">Top contenido por ventas generadas</h3>
        {loading ? (
          <SectionLoading />
        ) : rank.length === 0 ? (
          <EmptyState
            icon={<TrendingUp className="h-8 w-8" />}
            title="Todavía no hay ventas atribuibles a contenido"
            description="Cuando un cliente cerrado tenga su camino vinculado (contenido → conversación → venta), el contenido de origen va a aparecer rankeado acá — con o sin UTM."
          />
        ) : (
          <div className="space-y-4">
            {rank.map((item, i) => {
              const pct = maxRevenue > 0 ? (item.revenue / maxRevenue) * 100 : 0;
              return (
                <GlassPanel
                  key={item.contentId}
                  className="p-4 flex flex-wrap gap-4 items-center"
                >
                  <span className="text-xl font-bold text-muted-foreground w-8">
                    #{i + 1}
                  </span>
                  <Link href={paths.platform.marketing.contentDetail(item.contentId)}>
                    <ContentThumbnail
                      content={{
                        title: item.title,
                        type: item.type,
                        thumbnailHue: item.thumbnailHue,
                      }}
                      size="sm"
                      className="h-16 w-16"
                    />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {CONTENT_TYPE_LABEL[item.type]}
                      {item.publishLabel ? ` · ${item.publishLabel}` : ""}
                    </p>
                    <p className="text-sm mt-1">
                      {item.salesCount} {item.salesCount === 1 ? "venta" : "ventas"} influenciadas · $
                      {item.revenue.toLocaleString("es-ES")} revenue
                    </p>
                    <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden max-w-md">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-brand-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </GlassPanel>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-medium">Journeys de compradores</h3>
        {loading ? (
          <SectionLoading />
        ) : journeys.length === 0 ? (
          <EmptyState
            icon={<TrendingUp className="h-8 w-8" />}
            title="Todavía no hay journeys reconstruibles"
            description="Necesitás al menos un cliente cerrado con su conversación vinculada. Al cerrar una llamada, el vínculo se crea automáticamente por nombre o referencia."
          />
        ) : (
          <div className="space-y-3">
            {journeys.map((journey) => (
              <BuyerJourneyRow key={journey.id} journey={journey} />
            ))}
          </div>
        )}
      </section>

      <section>
        {loading ? (
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Patrones de contenido</h3>
            <SectionLoading />
          </div>
        ) : (
          <ContentPatternReport initialReport={latestReport} errorInicial={motivoDelReporte} />
        )}
      </section>
    </div>
  );
}

function SectionLoading() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-20 animate-pulse rounded-xl border border-border/60 bg-muted/20"
        />
      ))}
    </div>
  );
}

function BuyerJourneyRow({ journey }: { journey: ClosedBuyerJourney }) {
  const [open, setOpen] = useState(true);

  return (
    <GlassPanel className="overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-muted/20"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex flex-wrap items-center gap-2">
          {journey.clientId ? (
            <Link
              href={paths.platform.clients.detail(journey.clientId)}
              className="font-medium hover:text-primary"
              onClick={(e) => e.stopPropagation()}
            >
              {journey.leadName}
            </Link>
          ) : (
            <span className="font-medium">{journey.leadName}</span>
          )}
          <Badge variant="success">Cerrado</Badge>
          <span className="text-sm text-muted-foreground tabular-nums">
            ${journey.closedAmount.toLocaleString("es-ES")}
          </span>
        </div>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="overflow-x-auto px-4 pb-4">
          <div className="flex items-center gap-2 min-w-max">
            {journey.steps.map((step, i) => (
              <div key={`${step.type}-${i}`} className="flex items-center gap-2">
                {i > 0 && <div className="h-px w-6 bg-border shrink-0" aria-hidden />}
                <div
                  className={cn(
                    "shrink-0 rounded-lg px-3 py-3 text-center text-[10px] font-medium border",
                    step.type === "content" && "w-40 border-border bg-muted/20",
                    step.type === "dm" && "w-24 border-ai/40 bg-ai/10 text-ai",
                    step.type === "booking" && "w-24 border-primary/40 bg-primary/10",
                    step.type === "sale" &&
                      "w-24 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  )}
                >
                  <p className="line-clamp-2">{step.label}</p>
                  {step.date && <p className="text-[9px] opacity-70 mt-0.5">{step.date}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </GlassPanel>
  );
}
