/**
 * SCRUM-504: `/sales/closing` se dibuja igual cuando la tabla de seguimiento
 * vuelve con error, y le pasa el motivo a la pantalla. Antes, sin sesión, la
 * lectura lanzaba (pantalla de error de Next) y con un error de la base se
 * mostraba la tabla vacía, como si no hubiera leads.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sim = vi.hoisted(() => ({ tabla: null as unknown }));

vi.mock("@/app/ghl/actions", () => ({
  getGHLIntegrationStatusAction: async () => ({ connected: false, selectedCalendarIds: [] }),
}));
vi.mock("@/app/team/actions", () => ({
  getTeamMembersAction: async () => ({ success: true, data: [] }),
}));
vi.mock("@/app/sales/lead-actions", () => ({
  listLeadsTableAction: async () => sim.tabla,
}));
// La pantalla real usa hooks de cliente; acá alcanza con ver qué recibe.
vi.mock("@/components/closing", () => ({
  ClosingOverview: (props: { leadsTable: { total: number } | null; leadsTableError: string | null }) =>
    `tabla:${props.leadsTable ? props.leadsTable.total : "-"}|error:${props.leadsTableError ?? "-"}`,
}));

import ClosingPage from "../page";

/** La página envuelve el contenido en Suspense: se renderiza el hijo async. */
async function contenido(): Promise<string> {
  const pagina = ClosingPage() as { props: { children: { type: () => Promise<unknown> } } };
  return renderToStaticMarkup((await pagina.props.children.type()) as never);
}

beforeEach(() => {
  sim.tabla = { success: true, data: { total: 3, rows: [] } };
});

describe("ClosingPage", () => {
  it("⭐ con la tabla rechazada se dibuja y le pasa el motivo a la pantalla", async () => {
    sim.tabla = { success: false, error: "Sesión no válida" };
    await expect(contenido()).resolves.toBe("tabla:-|error:Sesión no válida");
  });

  it("con éxito pasa la tabla, sin error", async () => {
    await expect(contenido()).resolves.toBe("tabla:3|error:-");
  });
});
