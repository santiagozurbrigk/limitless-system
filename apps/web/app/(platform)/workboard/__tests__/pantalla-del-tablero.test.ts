/**
 * SCRUM-503: `/workboard` dibuja su propio estado cuando la lectura del
 * tablero vuelve con error, en vez de terminar en la pantalla de error de
 * Next (que en producción muestra un párrafo técnico en inglés). No hay error
 * boundary en la plataforma: la lectura devuelve el error como valor y la
 * página lo muestra.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sim = vi.hoisted(() => ({
  resultado: null as unknown,
}));

vi.mock("@/app/workboard/actions", () => ({
  loadWorkboardPageDataAction: async () => sim.resultado,
}));
vi.mock("@/app/lanzamientos/actions", () => ({
  listLaunchPickerOptionsAction: async () => [],
}));
// La pantalla real usa hooks de cliente; acá alcanza con ver qué recibe.
vi.mock("@/components/workboard", () => ({
  WorkboardShell: () => "tablero",
}));
vi.mock("@/providers/workboard-provider", () => ({
  WorkboardProvider: (props: {
    initialTasks: Array<{ id: string }>;
    initialSprintFilterId: string;
    children: unknown;
  }) =>
    `tareas:${props.initialTasks.map((t) => t.id).join(",")} filtro:${props.initialSprintFilterId}`,
}));

import WorkboardPage from "../page";

beforeEach(() => {
  sim.resultado = null;
});

describe("WorkboardPage", () => {
  it("⭐ con la lectura rechazada muestra el motivo, no la pantalla de error de Next", async () => {
    sim.resultado = { success: false, error: "Sesión no válida" };
    const html = renderToStaticMarkup(await WorkboardPage());
    expect(html).toContain("No se pudo cargar el tablero");
    expect(html).toContain("Sesión no válida");
  });

  it("con una falla inesperada muestra el texto fijo que devolvió la acción", async () => {
    sim.resultado = { success: false, error: "Ocurrió un error inesperado. Intentá de nuevo." };
    const html = renderToStaticMarkup(await WorkboardPage());
    expect(html).toContain("Ocurrió un error inesperado. Intentá de nuevo.");
  });

  it("con éxito muestra el tablero con el sprint activo elegido", async () => {
    sim.resultado = {
      success: true,
      data: {
        tasks: [{ id: "t1" }],
        members: [],
        sprints: [{ id: "s1", status: "active" }],
      },
    };
    const html = renderToStaticMarkup(await WorkboardPage());
    expect(html).toContain("tareas:t1 filtro:s1");
    expect(html).not.toContain("No se pudo cargar el tablero");
  });
});
