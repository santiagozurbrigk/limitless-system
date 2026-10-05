import { toDateKey } from "@/lib/closing/calendar";
import type { WorkboardTask } from "@/types/workboard";
import { sortWorkboardTasks, taskCalendarDate } from "./group-tasks";

export function buildMonthGrid(anchor: Date): Date[] {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - startOffset);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push(d);
  }
  return cells;
}

/** Las tareas por día del calendario, con la zona de la organización (`zona`). */
export function groupTasksByDateKey(
  tasks: WorkboardTask[],
  zona: string | null
): Map<string, WorkboardTask[]> {
  const map = new Map<string, WorkboardTask[]>();
  for (const task of tasks) {
    const key = taskCalendarDate(task, zona);
    if (!key) continue;
    const list = map.get(key) ?? [];
    list.push(task);
    map.set(key, list);
  }
  for (const [key, list] of map) {
    map.set(key, sortWorkboardTasks(list, zona));
  }
  return map;
}

export function isSameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export { toDateKey };
