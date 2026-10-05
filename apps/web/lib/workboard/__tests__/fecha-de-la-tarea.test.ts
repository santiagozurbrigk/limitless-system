/**
 * SCRUM-493: una tarea del tablero sin vencimiento se ubica (calendario) y se
 * ordena por el día en que se creó, en la zona de la organización. `created_at`
 * es un instante: cortarlo en UTC pasaba al día siguiente una tarea creada a
 * las 22:00 de Argentina.
 */
import { afterEach, describe, expect, it } from "vitest";
import { conZona, restaurarZona } from "@/lib/fechas/__tests__/zona";
import type { WorkboardTask } from "@/types/workboard";
import { groupTasksByDateKey } from "../calendar-grid";
import { taskCalendarDate, taskSortDateKey } from "../group-tasks";

afterEach(restaurarZona);

const ARGENTINA = "America/Argentina/Buenos_Aires";

function tarea(parcial: Partial<WorkboardTask>): WorkboardTask {
  return {
    id: "t1",
    status: "todo",
    title: "Tarea",
    description: "",
    area: "general",
    priority: "medium",
    assignees: [],
    assigneeIds: [],
    tags: [],
    position: 0,
    linkedDocuments: [],
    attachments: [],
    createdAt: "2026-10-02T01:00:00.000Z",
    ...parcial,
  } as WorkboardTask;
}

describe("⭐ día de una tarea sin vencimiento", () => {
  it("una tarea creada el 1-oct a las 22:00 de Argentina es del 1, en cualquier navegador", () => {
    for (const zonaDelNavegador of ["UTC", "Europe/Madrid", ARGENTINA]) {
      conZona(zonaDelNavegador);
      expect(taskCalendarDate(tarea({}), ARGENTINA)).toBe("2026-10-01");
      expect(taskSortDateKey(tarea({}), ARGENTINA)).toBe("2026-10-01");
      expect([...groupTasksByDateKey([tarea({})], ARGENTINA).keys()]).toEqual(["2026-10-01"]);
    }
  });

  it("con vencimiento, manda el vencimiento", () => {
    expect(taskCalendarDate(tarea({ dueDate: "2026-10-09" }), ARGENTINA)).toBe("2026-10-09");
  });
});
