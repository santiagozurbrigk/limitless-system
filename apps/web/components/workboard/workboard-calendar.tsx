"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, cn } from "@ai-coo/ui";
import { formatMonthTitle } from "@/lib/closing/calendar";
import {
  STATUS_COLORS,
  STATUS_LABELS,
  WORKBOARD_STATUSES,
} from "@/lib/workboard/constants";
import type { TaskStatus } from "@/types/workboard";
import {
  buildMonthGrid,
  groupTasksByDateKey,
  isSameMonth,
  toDateKey,
} from "@/lib/workboard/calendar-grid";
import { filterTasksByDoneVisibility, filterWorkboardTasks } from "@/lib/workboard/group-tasks";
import { useWorkboard } from "@/providers/workboard-provider";
import { diaLocal, fechaDeHoyEnZona } from "@/lib/fechas/calendario";
import {
  useHoyDeLaOrganizacion,
  useZonaDeLaOrganizacion,
} from "@/providers/zona-de-la-organizacion-provider";
import type { WorkboardTask } from "@/types/workboard";

const WEEKDAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function WorkboardCalendar() {
  const { tasks, areaFilter, sprintFilterId, launchFilterId, assigneeFilterId, setSelectedTask } =
    useWorkboard();
  const zonaDeLaOrganizacion = useZonaDeLaOrganizacion();
  // El mes que se abre es el de hoy en la organización.
  const [anchor, setAnchor] = useState(() => diaLocal(fechaDeHoyEnZona(zonaDeLaOrganizacion)));
  const [showDoneTasks, setShowDoneTasks] = useState(false);

  const filtered = useMemo(() => {
    const base = filterWorkboardTasks(
      tasks,
      areaFilter,
      sprintFilterId,
      launchFilterId,
      assigneeFilterId
    );
    return filterTasksByDoneVisibility(base, showDoneTasks);
  }, [tasks, areaFilter, sprintFilterId, launchFilterId, assigneeFilterId, showDoneTasks]);

  const byDate = useMemo(
    () => groupTasksByDateKey(filtered, zonaDeLaOrganizacion),
    [filtered, zonaDeLaOrganizacion]
  );
  const cells = useMemo(() => buildMonthGrid(anchor), [anchor]);
  // "Hoy" es el de la organización; `null` en el render del servidor.
  const todayKey = useHoyDeLaOrganizacion();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() =>
            setAnchor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
          }
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-sm font-semibold capitalize text-foreground">
          {formatMonthTitle(anchor)}
        </h2>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() =>
            setAnchor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
          }
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {WORKBOARD_STATUSES.map((status) => (
            <span key={status} className="flex items-center gap-1.5">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  STATUS_COLORS[status as TaskStatus].dot
                )}
              />
              {STATUS_LABELS[status]}
            </span>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border"
            checked={showDoneTasks}
            onChange={(e) => setShowDoneTasks(e.target.checked)}
          />
          Mostrar solo tareas hechas
        </label>
      </div>

      <div className="workboard-calendar-panel overflow-hidden rounded-xl border border-border">
        <div className="workboard-calendar-header grid grid-cols-7 border-b border-border">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="px-2 py-2 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((date) => {
            const key = toDateKey(date);
            const dayTasks = byDate.get(key) ?? [];
            const inMonth = isSameMonth(date, anchor);
            const isToday = key === todayKey;

            return (
              <div
                key={key}
                className={cn(
                  "workboard-day-cell min-h-[100px] border-b border-r border-border/60 p-1.5",
                  !inMonth && "workboard-day-cell--outside",
                  isToday && "workboard-day-cell--today"
                )}
              >
                <span
                  className={cn(
                    "mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs",
                    isToday
                      ? "bg-primary text-primary-foreground font-medium"
                      : inMonth
                        ? "text-foreground"
                        : "text-muted-foreground/50"
                  )}
                >
                  {date.getDate()}
                </span>
                <div className="space-y-1">
                  {dayTasks.slice(0, 4).map((task) => (
                    <CalendarTaskChip
                      key={task.id}
                      task={task}
                      onClick={() => setSelectedTask(task)}
                    />
                  ))}
                  {dayTasks.length > 4 ? (
                    <p className="px-1 text-[10px] text-muted-foreground">
                      +{dayTasks.length - 4} más
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CalendarTaskChip({
  task,
  onClick,
}: {
  task: WorkboardTask;
  onClick: () => void;
}) {
  const colors = STATUS_COLORS[task.status];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full truncate rounded border px-1.5 py-0.5 text-left text-[10px] font-medium transition-opacity hover:opacity-90",
        colors.chip
      )}
      title={task.title}
    >
      {task.title}
    </button>
  );
}
