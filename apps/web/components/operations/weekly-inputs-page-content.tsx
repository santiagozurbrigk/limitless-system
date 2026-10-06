"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { Button, cn } from "@ai-coo/ui";
import {
  generateWeeklyReportAction,
  getWeeklyCompletionStatus,
  getWeeklyInputsAction,
} from "@/app/operations/actions";
import { mapWeeklyInputRowsToTeamInputs } from "@/lib/operations/weekly-input-mapper";
import { manejarReporteSemanal } from "@/lib/operations/resultado-reporte-semanal";
import { correrAccion } from "@/lib/client/correr-accion";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { paths } from "@/routes";
import { useToast } from "@/providers/toast-provider";
import type { Department, WeeklyInputRow } from "@/types/operations";
import { WeeklyInputForm } from "./weekly-input-form";
import { WeeklyInputsHistory } from "./weekly-inputs-history";
import { WeeklyInputsList } from "./weekly-inputs-list";

export function WeeklyInputsPageContent({
  initialInputs = [],
  initialCompleted = [],
  initialInputCount = 0,
  weekStart,
}: {
  initialInputs?: WeeklyInputRow[];
  initialCompleted?: Department[];
  initialInputCount?: number;
  /** El lunes de la semana de la organización (lo resuelve el servidor con su zona). */
  weekStart: string;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [inputs, setInputs] = useState(initialInputs);
  const [completed, setCompleted] = useState<Department[]>(initialCompleted);
  const [inputCount, setInputCount] = useState(initialInputCount);
  const [generating, startGenerate] = useTransition();
  const useSupabase = isSupabaseConfigured();
  const totalDepartments = 5;

  const teamInputs = useMemo(
    () => mapWeeklyInputRowsToTeamInputs(inputs),
    [inputs]
  );

  const handleSaved = () => {
    void (async () => {
      if (!useSupabase) return;
      const [rows, status] = await Promise.all([
        getWeeklyInputsAction(weekStart),
        getWeeklyCompletionStatus(weekStart),
      ]);
      setInputs(rows);
      setCompleted(status.completed);
      setInputCount(status.completed.length);
    })();
  };

  const canGenerateReport = inputCount >= 2;

  const handleGenerateReport = () => {
    if (!canGenerateReport) return;

    startGenerate(async () => {
      await correrAccion({
        accion: generateWeeklyReportAction,
        avisar: push,
        tituloError: "No se pudo generar el reporte",
        etiqueta: "[WeeklyInputs] generar reporte",
        alTerminar: (resultado) =>
          manejarReporteSemanal(resultado, {
            avisar: push,
            irAOperaciones: () => {
              router.push(paths.platform.operations.overview);
              router.refresh();
            },
          }),
      });
    });
  };

  const progressPct = Math.round((completed.length / totalDepartments) * 100);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium">Completa los inputs por departamento</p>
          <p className="text-xs text-muted-foreground">Al guardar al menos 2 departamentos podés generar el reporte ejecutivo.</p>
        </div>

        <div className="flex flex-col gap-2 sm:items-end">
          <Button
            type="button"
            className="bg-brand-600 hover:bg-brand-700"
            disabled={!canGenerateReport || generating || !useSupabase}
            onClick={handleGenerateReport}
          >
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generando reporte…
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generar reporte con IA
              </>
            )}
          </Button>
          {!canGenerateReport && !generating ? (
            <p className="text-xs text-muted-foreground">
              Necesitás al menos 2 departamentos con input.
            </p>
          ) : null}
          {!useSupabase ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Modo demo — conectá Supabase para persistir inputs.
            </p>
          ) : null}
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Progreso semanal</span>
          <span className={completed.length === totalDepartments ? "text-emerald-500 font-medium" : ""}>
            {completed.length}/{totalDepartments} departamentos
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              completed.length === totalDepartments
                ? "bg-emerald-500"
                : progressPct >= 40
                ? "bg-brand-500"
                : "bg-brand-400"
            )}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <WeeklyInputForm
        completedDepartments={completed}
        onSaved={handleSaved}
      />

      <WeeklyInputsList
        inputs={teamInputs}
        showEmptyState
        editable
        onChanged={handleSaved}
      />

      <WeeklyInputsHistory currentWeekStart={weekStart} />
    </div>
  );
}
