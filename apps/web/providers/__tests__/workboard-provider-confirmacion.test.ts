/**
 * SCRUM-503 (revisión 3, MENOR-3): el provider del Tablero con su estado de
 * verdad. Los otros tests prueban las piezas puras; éste prueba que el
 * provider las conecta: que despacha el tiempo registrado, que cancelar lo
 * olvida y avisa, y que un completado posterior registra sus propios minutos.
 *
 * Sin DOM no hay React que guarde el estado entre renders, así que los hooks
 * del provider se reemplazan por unos mínimos que sí lo guardan: cada
 * "render" es llamar a `WorkboardProvider` y leer el `value` del contexto.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => {
  let celdas: unknown[] = [];
  let i = 0;
  return {
    reiniciar() {
      celdas = [];
      i = 0;
    },
    empezarRender() {
      i = 0;
    },
    useState(inicial: unknown) {
      const k = i++;
      if (!(k in celdas)) celdas[k] = typeof inicial === "function" ? (inicial as () => unknown)() : inicial;
      const set = (v: unknown) => {
        celdas[k] = typeof v === "function" ? (v as (x: unknown) => unknown)(celdas[k]) : v;
      };
      return [celdas[k], set];
    },
    useReducer(reducer: (s: unknown, e: unknown) => unknown, inicial: unknown) {
      const k = i++;
      if (!(k in celdas)) celdas[k] = inicial;
      const despachar = (e: unknown) => {
        celdas[k] = reducer(celdas[k], e);
      };
      return [celdas[k], despachar];
    },
  };
});

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: hooks.useState,
  useReducer: hooks.useReducer,
  useCallback: (f: unknown) => f,
  useMemo: (f: () => unknown) => f(),
}));

const sim = vi.hoisted(() => ({
  avisos: [] as Array<{ title: string; description?: string }>,
  acciones: {} as Record<string, (...args: unknown[]) => Promise<unknown>>,
  registros: [] as number[],
}));

vi.mock("@/providers/toast-provider", () => ({
  useToast: () => ({ push: (aviso: { title: string }) => sim.avisos.push(aviso) }),
}));
vi.mock("@/app/workboard/actions", () => {
  const nombres = [
    "assignTaskToLaunchAction",
    "assignTaskToSprintAction",
    "createWorkboardTaskAction",
    "deleteWorkboardTaskAction",
    "getSprintsAction",
    "logTaskTimeAction",
    "moveWorkboardTaskAction",
    "updateWorkboardTaskAction",
  ];
  return Object.fromEntries(nombres.map((n) => [n, (...args: unknown[]) => sim.acciones[n](...args)]));
});

import { WorkboardProvider, type useWorkboard } from "@/providers/workboard-provider";
import type { WorkboardTask } from "@/types/workboard";

type Contexto = ReturnType<typeof useWorkboard>;

const TAREA = {
  id: "t1",
  title: "Llamar",
  description: "",
  status: "todo",
  area: "general",
  priority: "medium",
  tags: [],
  position: 0,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
} as unknown as WorkboardTask;

function render(): Contexto {
  hooks.empezarRender();
  const elemento = WorkboardProvider({
    initialTasks: [TAREA],
    members: [],
    initialSprints: [],
    initialSprintFilterId: "all",
    launches: [],
    children: null,
  }) as { props: { value: Contexto } };
  return elemento.props.value;
}

const ok = async () => ({ success: true, data: undefined });

beforeEach(() => {
  hooks.reiniciar();
  sim.avisos = [];
  sim.registros = [];
  sim.acciones = {
    getSprintsAction: async () => ({ success: true, data: [] }),
    logTaskTimeAction: async (input: unknown) => {
      sim.registros.push((input as { actualMinutes: number }).actualMinutes);
      return { success: true, data: undefined };
    },
    moveWorkboardTaskAction: async () => ({ success: false, error: "Sesión no válida" }),
  };
  (globalThis as Record<string, unknown>).window = { setTimeout: () => 0 };
});
afterEach(() => {
  delete (globalThis as Record<string, unknown>).window;
});

describe("WorkboardProvider · completar con tiempo", () => {
  it("⭐ registro bien y completado rechazado: el modal queda con el tiempo marcado y el reintento no lo vuelve a registrar", async () => {
    await render().moveTask("t1", "done");
    expect(render().pendingCompleteTask?.id).toBe("t1");

    await expect(render().confirmCompleteWithTime(30)).resolves.toBe(false);
    expect(sim.registros).toEqual([30]);
    expect(render().pendingTimeLoggedMinutes).toBe(30);

    sim.acciones.moveWorkboardTaskAction = ok;
    await expect(render().confirmCompleteWithTime(30)).resolves.toBe(true);
    expect(sim.registros).toEqual([30]);
    expect(render().pendingCompleteTask).toBeNull();
  });

  it("⭐ cancelar con tiempo registrado avisa, lo olvida, y el completado siguiente registra sus minutos", async () => {
    await render().moveTask("t1", "done");
    await render().confirmCompleteWithTime(30);
    expect(render().pendingTimeLoggedMinutes).toBe(30);

    sim.avisos = [];
    render().cancelComplete();
    expect(sim.avisos).toEqual([
      {
        title: "La tarea no se completó, pero el tiempo quedó registrado",
        description: "Tiempo registrado: 30 minutos. Si volvés a completarla, no lo cargues otra vez.",
        variant: "default",
      },
    ]);
    expect(render().pendingCompleteTask).toBeNull();
    expect(render().pendingTimeLoggedMinutes).toBeNull();

    sim.acciones.moveWorkboardTaskAction = ok;
    await render().moveTask("t1", "done");
    expect(render().pendingTimeLoggedMinutes).toBeNull();
    await expect(render().confirmCompleteWithTime(120)).resolves.toBe(true);
    expect(sim.registros).toEqual([30, 120]);
  });

  it("cancelar sin tiempo registrado no avisa", async () => {
    await render().moveTask("t1", "done");
    render().cancelComplete();
    expect(sim.avisos).toEqual([]);
    expect(render().pendingCompleteTask).toBeNull();
  });
});
