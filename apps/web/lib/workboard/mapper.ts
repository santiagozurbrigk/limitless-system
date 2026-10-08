import type {
  WorkboardAssignee,
  TaskArea,
  TaskPriority,
  TaskStatus,
  WorkboardMember,
  WorkboardTask,
  WorkboardTaskLinkedSop,
} from "@/types/workboard";
import { mergeTaskLinks, type TaskLinksByTaskId } from "./task-links";

const WORKBOARD_STATUS_SET = new Set<TaskStatus>([
  "todo",
  "in_progress",
  "review",
  "done",
]);
const TASK_AREA_SET = new Set<TaskArea>([
  "marketing",
  "ventas",
  "operaciones",
  "finanzas",
  "clientes",
  "general",
]);
const PRIORITY_SET = new Set<TaskPriority>(["low", "medium", "high"]);

export type WorkboardTaskRow = {
  id: string;
  organization_id: string;
  status: string;
  area: string;
  priority: string;
  title: string;
  description: string;
  assignee_id: string | null;
  assignee_ids?: string[] | null;
  completed_by?: string | null;
  completed_at?: string | null;
  due_date: string | null;
  tags: string[] | null;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  estimated_minutes?: number | null;
  actual_minutes?: number | null;
  timer_started_at?: string | null;
  timer_running?: boolean | null;
  time_entries?: unknown;
  sprint_id?: string | null;
  launch_id?: string | null;
  sop_id?: string | null;
  sop?: { id: string; title: string } | null;
  assignee?: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
};

export function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function displayName(
  fullName: string | null | undefined,
  email: string
): string {
  if (fullName?.trim()) return fullName.trim();
  return email.split("@")[0] ?? email;
}

export function rowToMember(row: {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
}): WorkboardMember {
  const name = displayName(row.full_name, row.email);
  return {
    id: row.id,
    name,
    email: row.email,
    role: row.role,
    initials: initialsFromName(name),
  };
}

export function rowToTask(
  row: WorkboardTaskRow,
  memberMap?: Map<string, WorkboardMember>,
  links?: TaskLinksByTaskId
): WorkboardTask {
  const status = WORKBOARD_STATUS_SET.has(row.status as TaskStatus)
    ? (row.status as TaskStatus)
    : "todo";
  const area = TASK_AREA_SET.has(row.area as TaskArea)
    ? (row.area as TaskArea)
    : "general";
  const priority = PRIORITY_SET.has(row.priority as TaskPriority)
    ? (row.priority as TaskPriority)
    : "medium";

  let assignee: WorkboardTask["assignee"];
  if (row.assignee) {
    const name = displayName(row.assignee.full_name, row.assignee.email);
    assignee = { id: row.assignee.id, name, initials: initialsFromName(name) };
  } else if (row.assignee_id && memberMap?.has(row.assignee_id)) {
    const m = memberMap.get(row.assignee_id)!;
    assignee = { id: m.id, name: m.name, initials: m.initials };
  }

  /**
   * ⭐ La lista de responsables.
   *
   * Se arma desde `assignee_ids`, y si viniera vacía se cae al responsable
   * único de siempre: las tareas creadas antes de esta columna tienen uno solo,
   * y no mostrarlo sería perderlo de vista.
   */
  const idsDeResponsables =
    row.assignee_ids && row.assignee_ids.length > 0
      ? row.assignee_ids
      : row.assignee_id
        ? [row.assignee_id]
        : [];

  const assignees: WorkboardAssignee[] = idsDeResponsables.flatMap((id) => {
    const m = memberMap?.get(id);
    if (m) return [{ id: m.id, name: m.name, initials: m.initials }];
    // El responsable embebido por la consulta, cuando es el principal.
    if (row.assignee && row.assignee.id === id) {
      const name = displayName(row.assignee.full_name, row.assignee.email);
      return [{ id, name, initials: initialsFromName(name) }];
    }
    return [];
  });

  const completadaPor = row.completed_by ? memberMap?.get(row.completed_by) : undefined;

  const linkBundle = links ? mergeTaskLinks(row.id, links) : null;
  let linkedSop: WorkboardTaskLinkedSop | null = null;
  if (row.sop) {
    linkedSop = { id: row.sop.id, title: row.sop.title };
  } else if (row.sop_id && linkBundle?.linkedSop) {
    linkedSop = linkBundle.linkedSop;
  }

  return {
    id: row.id,
    status,
    title: row.title,
    description: row.description ?? "",
    area,
    priority,
    assignee: assignee ?? assignees[0],
    assigneeId: row.assignee_id ?? assignees[0]?.id ?? null,
    assignees,
    assigneeIds: idsDeResponsables,
    completedBy: completadaPor
      ? { id: completadaPor.id, name: completadaPor.name, initials: completadaPor.initials }
      : null,
    completedAt: row.completed_at ?? null,
    dueDate: row.due_date ?? undefined,
    tags: row.tags ?? [],
    position: row.position,
    estimatedMinutes: row.estimated_minutes ?? undefined,
    actualMinutes: row.actual_minutes ?? undefined,
    sprintId: row.sprint_id ?? undefined,
    launchId: row.launch_id ?? undefined,
    linkedSop,
    linkedDocuments: linkBundle?.linkedDocuments ?? [],
    attachments: linkBundle?.attachments ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
