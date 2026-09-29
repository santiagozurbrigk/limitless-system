"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  TrendingUp,
  User,
} from "lucide-react";
import { cn } from "@ai-coo/ui";
import type { SalesCall } from "@/lib/fathom/sales-calls";

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}min` : `${h}h`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("es", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return null;
  const color =
    score >= 80
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
      : score >= 60
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
      : "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums",
        color
      )}
    >
      <TrendingUp className="h-3 w-3" />
      {score}/100
    </span>
  );
}

function StatusPill({ sold, booked, qualified }: { sold: boolean; booked: boolean; qualified: boolean | null }) {
  if (sold) return <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">Cerrada</span>;
  if (booked) return <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-xs font-medium text-brand-700 dark:text-brand-300 border border-brand-500/30">Agendada</span>;
  if (qualified === false) return <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground border border-border">No calificada</span>;
  return null;
}

function SalesCallCard({ call }: { call: SalesCall }) {
  const [expanded, setExpanded] = useState(false);
  const analysis = call.call_analyses;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Main row */}
      <div className="flex items-start gap-4 p-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium leading-tight">{call.title}</h3>
            {analysis ? (
              <StatusPill
                sold={analysis.sold}
                booked={analysis.booked}
                qualified={analysis.lead_qualified}
              />
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>{formatDate(call.call_date)}</span>
            {call.duration_seconds ? (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDuration(call.duration_seconds)}
              </span>
            ) : null}
            {analysis?.closer_name ? (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {analysis.closer_name}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {analysis?.overall_score != null ? (
            <ScoreBadge score={analysis.overall_score} />
          ) : null}
          {call.fathom_url ? (
            <a
              href={call.fathom_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3 w-3" />
              Ver grabación
            </a>
          ) : null}
          {analysis ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="rounded-md border border-border p-1.5 hover:bg-muted transition-colors"
              aria-label={expanded ? "Ocultar análisis" : "Ver análisis"}
            >
              {expanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          ) : null}
        </div>
      </div>

      {/* Analysis panel */}
      {expanded && analysis ? (
        <div className="border-t border-border bg-muted/20 px-4 py-4 space-y-4">
          {analysis.summary ? (
            <p className="text-sm leading-relaxed text-foreground/90">
              {analysis.summary}
            </p>
          ) : call.ai_situation_summary ? (
            <p className="text-sm leading-relaxed text-foreground/90">
              {call.ai_situation_summary}
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            {analysis.strengths?.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  Fortalezas
                </p>
                <ul className="space-y-1">
                  {analysis.strengths.slice(0, 4).map((s, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {analysis.improvements?.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                  Áreas de mejora
                </p>
                <ul className="space-y-1">
                  {analysis.improvements.slice(0, 4).map((s, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          {analysis.objections?.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground">
                Objeciones detectadas
              </p>
              <div className="flex flex-wrap gap-1.5">
                {analysis.objections.map((obj, i) => (
                  <span
                    key={i}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-xs",
                      obj.handled
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                    )}
                  >
                    {obj.text}
                    {obj.handled ? " ✓" : " ✗"}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function SalesCallsList({ calls }: { calls: SalesCall[] }) {
  if (calls.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-8 text-center">
        <p className="text-sm font-medium">Sin llamadas de venta registradas</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Conectá Fathom y asegurate de que el nombre de las llamadas incluya
          palabras como &quot;cierre&quot;, &quot;venta&quot;, &quot;closing&quot; o &quot;demo&quot;.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {calls.map((call) => (
        <SalesCallCard key={call.id} call={call} />
      ))}
    </div>
  );
}
