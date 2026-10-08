"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Clock, Lightbulb, Target, Wrench } from "lucide-react";
import {
  Badge,
  Button,
  cn,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@ai-coo/ui";
import { Panel } from "@/components/shared/panel";
import { EmptyState } from "@/components/shared/empty-state";
import { getTimeByMemberAction } from "@/app/workboard/actions";
import { correrAccion } from "@/lib/client/correr-accion";
import { mockMemberTimeReports } from "@/mocks/workboard-time";
import { buildAutomationInsights } from "@/lib/workboard/time-report";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { MemberTimeReport, TaskTimeKind } from "@/types/workboard";

const useSupabase = isSupabaseConfigured();

const KIND_LABEL: Record<TaskTimeKind, string> = {
  strategic: "Estratégica",
  operational: "Operativa",
};

function formatMoney(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function varianceLabel(task: MemberTimeReport["topTasks"][number]): string | null {
  if (!task.estimatedMinutes || task.estimatedMinutes <= 0) return null;
  const actualMinutes = Math.round(task.hours * 60);
  const estHours = (task.estimatedMinutes / 60).toFixed(1).replace(/\.0$/, "");
  const actHours = (actualMinutes / 60).toFixed(1).replace(/\.0$/, "");
  const pct = task.variancePercent ?? 0;
  if (pct === 0) return `Estimó ${estHours}hs → tardó ${actHours}hs`;
  const sign = pct > 0 ? "+" : "";
  return `Estimó ${estHours}hs → tardó ${actHours}hs (${sign}${pct}%)`;
}

function MemberTimeCard({ report }: { report: MemberTimeReport }) {
  return (
    <Panel
      title={report.name}
      subtitle={`${report.totalHours} h registradas`}
      contentClassName="space-y-4"
    >
      <div className="flex items-center gap-3">
        {report.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={report.avatarUrl}
            alt=""
            className="h-11 w-11 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
            style={{ backgroundColor: report.avatarColor }}
            aria-hidden
          >
            {report.initials}
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <Target className="h-3.5 w-3.5" />
              Estratégico {report.strategicPercent}%
            </span>
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Wrench className="h-3.5 w-3.5" />
              Operativo {report.operationalPercent}%
            </span>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="bg-emerald-500/80 transition-all"
              style={{ width: `${report.strategicPercent}%` }}
            />
            <div
              className="bg-muted-foreground/30"
              style={{ width: `${report.operationalPercent}%` }}
            />
          </div>
        </div>
      </div>

      {report.totalCostUsd != null && report.hourlyRate != null ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="text-sm text-muted-foreground">
                Costo estimado:{" "}
                <span className="font-semibold text-foreground">
                  {formatMoney(report.totalCostUsd, report.currency ?? "USD")}
                </span>{" "}
                este período
              </p>
            </TooltipTrigger>
            <TooltipContent>
              Basado en {formatMoney(report.hourlyRate, report.currency ?? "USD")}
              /hora configurado en perfil
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">
          Top 3 tareas por tiempo
        </p>
        <ol className="space-y-2">
          {report.topTasks.map((task, index) => {
            const variance = varianceLabel(task);
            return (
              <li
                key={task.taskId}
                className="flex items-start justify-between gap-3 rounded-lg border border-border/60 px-3 py-2.5 dark:border-white/[0.08]"
              >
                <div className="flex min-w-0 items-start gap-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-2xs font-semibold tabular-nums">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-snug">{task.title}</p>
                    <Badge
                      variant={task.kind === "strategic" ? "default" : "secondary"}
                      className="mt-1 text-2xs"
                    >
                      {KIND_LABEL[task.kind]}
                    </Badge>
                    {variance ? (
                      <p
                        className={cn(
                          "mt-1 text-[11px]",
                          (task.variancePercent ?? 0) > 0
                            ? "text-red-600 dark:text-red-400"
                            : (task.variancePercent ?? 0) < 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-muted-foreground"
                        )}
                      >
                        {variance}
                      </p>
                    ) : null}
                  </div>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-brand-700 dark:text-brand-300">
                  {task.hours}h
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </Panel>
  );
}

/**
 * Lee el reporte de tiempo (SCRUM-503). La lectura devuelve su error como
 * valor: el motivo se muestra en la pantalla. Si la acción lanza, se registra
 * en la consola y se muestra el texto fijo. `null` si Next está navegando (un
 * redirect): no hay nada que mostrar.
 */
export async function leerReporteDeTiempo(): Promise<
  { ok: true; reports: MemberTimeReport[] } | { ok: false; error: string } | null
> {
  const salida: {
    leido: { ok: true; reports: MemberTimeReport[] } | { ok: false; error: string } | null;
  } = { leido: null };
  await correrAccion({
    accion: () => getTimeByMemberAction(),
    alTerminar: (resultado) => {
      salida.leido = resultado.success
        ? { ok: true, reports: resultado.data ?? [] }
        : { ok: false, error: resultado.error };
    },
    avisar: (aviso) => {
      salida.leido = { ok: false, error: aviso.description ?? aviso.title };
    },
    tituloError: "No pudimos cargar el reporte de tiempo",
    etiqueta: "[WorkboardTimeReport]",
  });
  return salida.leido;
}

export function WorkboardTimeReport() {
  const [reports, setReports] = useState<MemberTimeReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [usingDemo, setUsingDemo] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setLoadError(null);

      if (!useSupabase) {
        if (!cancelled) {
          setReports(mockMemberTimeReports);
          setUsingDemo(true);
          setLoading(false);
        }
        return;
      }

      const leido = await leerReporteDeTiempo();
      if (cancelled || !leido) return;
      if (leido.ok) {
        setReports(leido.reports);
        setUsingDemo(false);
      } else {
        setReports([]);
        setLoadError(leido.error);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const data = reports;
  const totalHours = data.reduce((sum, r) => sum + r.totalHours, 0);
  const insights = useMemo(() => buildAutomationInsights(data), [data]);

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">Cargando reporte de tiempo…</p>
    );
  }

  if (loadError) {
    return (
      <EmptyState
        variant="inline"
        title="No pudimos cargar el reporte de tiempo"
        description={loadError}
      />
    );
  }

  if (!usingDemo && data.length === 0) {
    return (
      <EmptyState
        title="Todavía no hay tiempo registrado"
        description="Registrá tiempo en las tareas del tablero para ver el reporte por persona."
        icon={<Clock className="h-5 w-5" />}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm dark:border-white/[0.08]">
        <Clock className="h-4 w-4 text-brand-400" />
        <span className="text-muted-foreground">Tiempo registrado:</span>
        <span className="font-semibold tabular-nums">{totalHours} h</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">
          {data.length} miembros con actividad
        </span>
        {usingDemo ? (
          <Badge variant="secondary" className="text-2xs">
            Datos demo
          </Badge>
        ) : null}
      </div>

      <div className={cn("grid gap-4", "sm:grid-cols-2 xl:grid-cols-2")}>
        {data.map((report) => (
          <MemberTimeCard key={report.memberId} report={report} />
        ))}
      </div>

      {insights.length > 0 ? (
        <Panel
          title="Insights de automatización"
          contentClassName="space-y-3"
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Lightbulb className="h-4 w-4 text-amber-400" />
            Recomendaciones basadas en el tiempo registrado
          </div>
          <ul className="space-y-3">
            {insights.map((insight) => (
              <li
                key={insight.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2.5 text-sm dark:border-white/[0.08]"
              >
                <span className="text-muted-foreground">{insight.message}</span>
                {insight.actionLabel && insight.actionHref ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={insight.actionHref}>{insight.actionLabel}</Link>
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
