import { MessageSquarePlus } from "lucide-react";
import { WeeklyInputsPageContent } from "@/components/operations/weekly-inputs-page-content";
import { TeamInputForm } from "@/components/operations/team-input-form";
import { TeamInputsList } from "@/components/operations/team-inputs-list";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { InputsPageTabs } from "@/components/operations/inputs-page-tabs";
import {
  getCurrentWeekStartAction,
  getWeeklyInputsAction,
  getWeeklyCompletionStatus,
} from "@/app/operations/actions";
import { mapWeeklyInputRowsToTeamInputs } from "@/lib/operations/weekly-input-mapper";
import { formatWeekRange } from "@/lib/operations/weekly-utils";
import { getCurrentProfile } from "@/lib/auth/bootstrap";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default async function InputsPage() {
  // La semana de la organización, no la del reloj del servidor (UTC).
  const weekStart = await getCurrentWeekStartAction();

  const [rows, completionStatus, profile] = await Promise.all([
    getWeeklyInputsAction(weekStart),
    isSupabaseConfigured() ? getWeeklyCompletionStatus(weekStart) : Promise.resolve({ completed: [], total: 5 }),
    getCurrentProfile(),
  ]);

  const teamInputs = mapWeeklyInputRowsToTeamInputs(rows);
  const isFounder = profile?.role === "founder";

  const teamInputsPanel = (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <TeamInputForm />
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">
          Inputs de esta semana ({teamInputs.length})
        </h3>
        {teamInputs.length > 0 ? (
          <TeamInputsList inputs={teamInputs} />
        ) : (
          <EmptyState
            icon={<MessageSquarePlus className="h-7 w-7" />}
            title="Sin inputs esta semana"
            description="Lo que cargues queda disponible para la IA en sus análisis."
          />
        )}
      </div>
    </div>
  );

  const weeklyContent = (
    <WeeklyInputsPageContent
      initialInputs={rows}
      initialCompleted={completionStatus.completed}
      initialInputCount={completionStatus.completed.length}
      weekStart={weekStart}
    />
  );

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <PageHeader description="Contexto semanal del equipo para reportes y análisis IA" />
        <p className="text-sm text-muted-foreground">{formatWeekRange(weekStart)}</p>
      </div>
      <InputsPageTabs
        isFounder={isFounder}
        weeklyContent={weeklyContent}
        teamContent={teamInputsPanel}
      />
    </div>
  );
}
