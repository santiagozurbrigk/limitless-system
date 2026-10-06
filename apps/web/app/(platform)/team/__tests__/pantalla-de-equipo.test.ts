/**
 * SCRUM-497: `/team` dibuja su propio estado cuando la lectura del equipo
 * vuelve con error, en vez de terminar en la pantalla de error de Next (que en
 * producción muestra un párrafo técnico en inglés). No hay error boundary en
 * la plataforma: la lectura devuelve el error como valor y la página lo
 * muestra.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sim = vi.hoisted(() => ({
  resultado: null as unknown,
}));

vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/app/team/actions", () => ({
  getTeamPageContextAction: async () => sim.resultado,
}));
// La pantalla real usa hooks de cliente; acá alcanza con ver qué recibe.
vi.mock("@/components/team/team-overview", () => ({
  TeamOverview: (props: { members: Array<{ id: string }> }) =>
    `equipo:${props.members.map((m) => m.id).join(",")}`,
}));

import TeamPage from "../page";

beforeEach(() => {
  sim.resultado = null;
});

describe("TeamPage", () => {
  it("⭐ con la lectura rechazada muestra el motivo, no la pantalla de error de Next", async () => {
    sim.resultado = { success: false, error: "Sesión no válida" };
    const html = renderToStaticMarkup(await TeamPage());
    expect(html).toContain("No se pudo cargar el equipo");
    expect(html).toContain("Sesión no válida");
  });

  it("con éxito muestra el equipo", async () => {
    sim.resultado = {
      success: true,
      data: { members: [{ id: "m1" }], roles: [], invitations: [], canManage: true, canEditRates: true },
    };
    const html = renderToStaticMarkup(await TeamPage());
    expect(html).toContain("equipo:m1");
    expect(html).not.toContain("No se pudo cargar el equipo");
  });
});
