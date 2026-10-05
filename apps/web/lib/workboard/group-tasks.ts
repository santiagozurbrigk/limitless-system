import { fechaDeInstanteEnZona } from "@/lib/fechas/calendario";
import { STATUS_LABELS, WORKBOARD_STATUSES } from "./constants";
import type { TaskPriority, TaskStatus, WorkboardColumn, WorkboardTask } from "@/types/workboard";

/** Orden de prioridad en tablero: alta → media → baja (valores del check en DB). */
const PRIORITY_SORT_ORDER: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/**
 * Fecha usada para ordenar: vencimiento si existe; si no, día de creación en la
 * zona de la organización (`zona`; null = la de por defecto). `created_at` es
 * un instante: cortarlo en UTC pasaba al día siguiente una tarea creada de
 * noche en Argentina (SCRUM-493).
 */
export function taskSortDateKey(task: WorkboardTask, zona: string | null): string {
  if (task.dueDate) return task.dueDate;
  return fechaDeInstanteEnZona(task.createdAt, zona);
}

export function compareWorkboardTasks(
  a: WorkboardTask,
  b: WorkboardTask,
  zona: string | null
): number {
  const byPriority =
    PRIORITY_SORT_ORDER[a.priority] - PRIORITY_SORT_ORDER[b.priority];
  if (byPriority !== 0) return byPriority;
  return taskSortDateKey(a, zona).localeCompare(taskSortDateKey(b, zona));
}

export function sortWorkboardTasks(tasks: WorkboardTask[], zona: string | null): WorkboardTask[] {
  return [...tasks].sort((a, b) => compareWorkboardTasks(a, b, zona));
}

export function groupTasksIntoColumns(
  tasks: WorkboardTask[],
  zona: string | null
): WorkboardColumn[] {
  return WORKBOARD_STATUSES.map((status) => ({
    id: status,
    title: STATUS_LABELS[status],
    tasks: sortWorkboardTasks(
      tasks.filter((t) => t.status === status),
      zona
    ),
  }));
}

/** El día del calendario de una tarea: su vencimiento o, si no tiene, el día en que se creó (en la zona de la org). */
export function taskCalendarDate(task: WorkboardTask, zona: string | null): string | null {
  if (task.dueDate) return task.dueDate;
  if (task.createdAt) return fechaDeInstanteEnZona(task.createdAt, zona) || null;
  return null;
}

export function filterTasksByArea(
  tasks: WorkboardTask[],
  areaFilter: string
): WorkboardTask[] {
  if (areaFilter === "all") return tasks;
  return tasks.filter((t) => t.area === areaFilter);
}

export function filterTasksBySprint(
  tasks: WorkboardTask[],
  sprintFilterId: string
): WorkboardTask[] {
  if (sprintFilterId === "all") return tasks;
  return tasks.filter((t) => t.sprintId === sprintFilterId);
}

export function filterTasksByLaunch(
  tasks: WorkboardTask[],
  launchFilterId: string
): WorkboardTask[] {
  if (launchFilterId === "all") return tasks;
  return tasks.filter((t) => t.launchId === launchFilterId);
}

/**
 * ⭐ Filtra por responsable mirando **todos** los responsables, no sólo el primero.
 *
 * Con tareas compartidas, comparar contra un único id escondía la tarea a todos
 * menos a uno: filtrabas por tu nombre y no aparecía algo que sí es tuyo. Es el
 * modo de falla que hace que la gente deje de usar el filtro.
 *
 * `assignees` puede venir vacío en tareas viejas, así que se cae a `assigneeId`.
 */
function responsablesDe(task: WorkboardTask): string[] {
  if (task.assigneeIds?.length) return task.assigneeIds;
  return task.assigneeId ? [task.assigneeId] : [];
}

export function filterTasksByAssignee(
  tasks: WorkboardTask[],
  assigneeFilterId: string
): WorkboardTask[] {
  if (assigneeFilterId === "all") return tasks;
  if (assigneeFilterId === "unassigned") {
    return tasks.filter((t) => responsablesDe(t).length === 0);
  }
  return tasks.filter((t) => responsablesDe(t).includes(assigneeFilterId));
}

export function filterTasksByDoneVisibility(
  tasks: WorkboardTask[],
  showDoneOnly: boolean
): WorkboardTask[] {
  if (showDoneOnly) {
    return tasks.filter((t) => t.status === "done");
  }
  return tasks.filter((t) => t.status !== "done");
}

/** Oculta tareas hechas en Kanban salvo las visibles temporalmente tras completarse. */
export function filterKanbanDoneTasks(
  tasks: WorkboardTask[],
  visibleDoneUntil: Record<string, number>
): WorkboardTask[] {
  const now = Date.now();
  return tasks.filter((task) => {
    if (task.status !== "done") return true;
    const until = visibleDoneUntil[task.id];
    return until != null && now < until;
  });
}

export function filterWorkboardTasks(
  tasks: WorkboardTask[],
  areaFilter: string,
  sprintFilterId: string,
  launchFilterId = "all",
  assigneeFilterId = "all"
): WorkboardTask[] {
  return filterTasksByAssignee(
    filterTasksByLaunch(
      filterTasksBySprint(filterTasksByArea(tasks, areaFilter), sprintFilterId),
      launchFilterId
    ),
    assigneeFilterId
  );
}

export function getNextPosition(
  tasks: WorkboardTask[],
  status: TaskStatus
): number {
  const inColumn = tasks.filter((t) => t.status === status);
  if (inColumn.length === 0) return 0;
  return Math.max(...inColumn.map((t) => t.position)) + 1;
}
