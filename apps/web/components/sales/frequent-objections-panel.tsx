"use client";

import { AlertTriangle, ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import { Badge } from "@ai-coo/ui";
import { EmptyState } from "@/components/shared/empty-state";
import { Panel } from "@/components/shared/panel";
import { cn } from "@/lib/utils";
import type {
  FrequentObjectionSummary,
  FrequentObjectionsDataSource,
  ObjectionCategory,
} from "@/types/sales";

const CATEGORY_LABEL: Record<ObjectionCategory, string> = {
  closing: "Closing",
  setting: "Setting",
  marketing: "Marketing",
};

const CATEGORY_BADGE_CLASS: Record<ObjectionCategory, string> = {
  closing: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
  setting: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  marketing: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
};

function TrendIndicator({ objection }: { objection: FrequentObjectionSummary }) {
  if (objection.trend === "up") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
        <ArrowUp className="h-3.5 w-3.5" />+{objection.trendPct}% vs mes anterior
      </span>
    );
  }

  if (objection.trend === "down") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <ArrowDown className="h-3.5 w-3.5" />-{objection.trendPct}% vs mes anterior
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <ArrowRight className="h-3.5 w-3.5" />
      Estable
    </span>
  );
}

export function FrequentObjectionsPanel({
  objections,
  dataSource = "empty",
  loadError,
}: {
  objections: FrequentObjectionSummary[];
  dataSource?: FrequentObjectionsDataSource;
  /** Por qué no se pudieron leer las objeciones (SCRUM-504). */
  loadError?: string | null;
}) {
  if (loadError) {
    return (
      <div id="objections">
        <Panel title="Objeciones frecuentes">
          <EmptyState
            variant="inline"
            title="No pudimos cargar las objeciones"
            description={loadError}
            icon={<AlertTriangle className="h-4 w-4" />}
          />
        </Panel>
      </div>
    );
  }

  if (dataSource === "empty" || objections.length === 0) {
    return (
      <div id="objections">
        <Panel title="Objeciones frecuentes">
          <EmptyState
            variant="inline"
            title="Todavía no hay objeciones detectadas"
            description="Conectá Fathom o sincronizá conversaciones para ver objeciones reales de tus calls y DMs."
          />
        </Panel>
      </div>
    );
  }

  const subtitle =
    dataSource === "calls"
      ? "Detectadas en análisis de calls — últimos 30 días"
      : dataSource === "conversations"
        ? "Detectadas en conversaciones DM — últimos 30 días"
        : "Datos de demostración";

  return (
    <div id="objections">
      <Panel title="Objeciones frecuentes" subtitle={subtitle}>
        {dataSource === "mock" ? (
          <div className="mb-4 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-200">
            Sin datos reales aún — conectá Fathom para ver objeciones reales
          </div>
        ) : null}

        <div className="space-y-4">
          {objections.map((objection) => (
            <div key={objection.category} className="space-y-2">
              <article className="rounded-xl border border-border/60 px-4 py-4 dark:border-white/[0.08]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <Badge
                    variant="outline"
                    className={cn("shrink-0", CATEGORY_BADGE_CLASS[objection.category])}
                  >
                    {CATEGORY_LABEL[objection.category]}
                  </Badge>
                  <TrendIndicator objection={objection} />
                </div>

                <p className="mt-3 text-sm font-medium tabular-nums">
                  {objection.count} objeciones este mes
                </p>

                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Tasa de resolución</span>
                    <span className="font-medium tabular-nums text-foreground">
                      {objection.resolutionRate}% resueltas
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted/40">
                    <div
                      className="h-full rounded-full bg-brand-500 transition-all"
                      style={{ width: `${objection.resolutionRate}%` }}
                    />
                  </div>
                </div>

                {objection.topExamples.length > 0 ? (
                  <ul className="mt-4 space-y-2 border-t border-border/40 pt-3">
                    {objection.topExamples.map((example) => (
                      <li
                        key={example}
                        className="text-sm italic text-muted-foreground before:mr-1 before:content-['“'] after:content-['”']"
                      >
                        {example}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>

              {objection.alert ? (
                <div className="flex gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-100">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <p>{objection.alert}</p>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
