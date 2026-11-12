/**
 * SCRUM-541 (corte B) · Las 4 pantallas de servidor que leen con las actions de
 * Operaciones dibujan `SinAcceso` cuando una de sus lecturas vuelve rechazada.
 *
 * Pasa si los permisos cambian entre el guardia de la página y la lectura del
 * mismo render: los permisos no se cachean, cada lectura los vuelve a mirar. La
 * página dibuja lo mismo que el guardia («No tenés acceso a Operaciones») y nada
 * más, y no responde «no existe». En `/operations/inputs`, con la semana
 * rechazada no se piden los inputs ni el estado.
 *
 * Con datos, cada pantalla le pasa a sus componentes lo mismo que devolvieron
 * las lecturas. Las actions se simulan (su lógica se prueba en
 * `app/operations/__tests__/lecturas-de-operaciones-por-modulo.test.ts`) y los
 * componentes se reemplazan por una marca que anota sus props.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SinAcceso } from "@/components/platform/sin-acceso";
import { getReportCadence } from "@/lib/executive-reports/cadences";
import { mapWeeklyInputRowsToTeamInputs } from "@/lib/operations/weekly-input-mapper";
import { formatWeekRange } from "@/lib/operations/weekly-utils";
import type { WeeklyInputRow } from "@/types/operations";

const sim = vi.hoisted(() => ({
  lecturas: {} as Record<string, unknown>,
  llamadas: {} as Record<string, number>,
  props: {} as Record<string, unknown>,
  notFound: 0,
}));

const NOT_FOUND = "NOT_FOUND_DE_PRUEBA";

// SCRUM-540: la página arranca con el guardia del módulo; acá entra alguien con el módulo.
vi.mock("@/lib/auth/acceso-a-modulo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/acceso-a-modulo")>()),
  exigirModuloDeLaPagina: async () => null,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    sim.notFound += 1;
    throw new Error("NOT_FOUND_DE_PRUEBA");
  },
  unstable_rethrow: () => {},
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: unknown }) =>
    createElement("a", { href }, children as never),
}));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/auth/bootstrap", () => ({
  getCurrentProfile: async () => ({ role: "founder" }),
  requireOrganizationId: async () => "org-1",
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/executive-reports/compute-departments", () => ({
  computeDepartmentStatuses: async () => [],
}));
vi.mock("@/lib/operations/map-weekly-report", () => ({
  departmentStatusesToOperationsDepartments: () => [{ marca: "DEPARTAMENTOS" }],
}));
vi.mock("@/mocks/operations-overview", () => ({ mockOperationsOverview: { departments: [] } }));

function lectura(nombre: string) {
  return async () => {
    sim.llamadas[nombre] = (sim.llamadas[nombre] ?? 0) + 1;
    return sim.lecturas[nombre];
  };
}
vi.mock("@/app/operations/actions", () => ({
  getCurrentWeekStartAction: lectura("getCurrentWeekStartAction"),
  getWeeklyInputsAction: lectura("getWeeklyInputsAction"),
  getWeeklyCompletionStatus: lectura("getWeeklyCompletionStatus"),
  getWeeklyReportAction: lectura("getWeeklyReportAction"),
}));
vi.mock("@/app/executive-reports/actions", () => ({
  listExecutiveReportsAction: lectura("listExecutiveReportsAction"),
  getExecutiveReportByIdAction: lectura("getExecutiveReportByIdAction"),
}));

// Los componentes se reemplazan por una marca: acá alcanza con ver qué reciben.
function marca(nombre: string) {
  function Marca(props: Record<string, unknown>) {
    sim.props[nombre] = props;
    return createElement("div", { "data-componente": nombre });
  }
  return Marca;
}
// Las pestañas dibujan su contenido, así se ve qué recibe cada panel.
function MarcaDePestanas(props: { weeklyContent: unknown; teamContent: unknown }) {
  sim.props.InputsPageTabs = props;
  return createElement(
    "div",
    { "data-componente": "InputsPageTabs" },
    props.weeklyContent as never,
    props.teamContent as never
  );
}
vi.mock("@/components/operations/weekly-inputs-page-content", () => ({
  WeeklyInputsPageContent: marca("WeeklyInputsPageContent"),
}));
vi.mock("@/components/operations/team-input-form", () => ({
  TeamInputForm: marca("TeamInputForm"),
}));
vi.mock("@/components/operations/team-inputs-list", () => ({
  TeamInputsList: marca("TeamInputsList"),
}));
vi.mock("@/components/operations/inputs-page-tabs", () => ({
  InputsPageTabs: MarcaDePestanas,
}));
vi.mock("@/components/operations/operations-overview", () => ({
  OperationsOverview: marca("OperationsOverview"),
}));
vi.mock("@/components/executive-reports", () => ({
  ReportsGrid: marca("ReportsGrid"),
  ReportBody: marca("ReportBody"),
}));
vi.mock("@/components/shared/page-header", () => ({ PageHeader: marca("PageHeader") }));
vi.mock("@/components/shared/empty-state", () => ({ EmptyState: marca("EmptyState") }));

import InputsPage from "../inputs/page";
import OperationsOverviewPage from "../overview/page";
import ExecutiveReportsHistoryPage from "../../executive-reports/history/page";
import ExecutiveReportDetailPage from "../../executive-reports/[id]/page";

// ─── Datos que devuelven las lecturas ────────────────────────────────────────

const RECHAZO = {
  success: false,
  error: "No tenés acceso a Operaciones.",
  motivo: "sin-acceso",
  moduleId: "operations",
};

const SOLO_SIN_ACCESO = renderToStaticMarkup(
  createElement(SinAcceso, { moduleLabel: "Operaciones" })
);

const SEMANA = "2026-11-09";

const FILAS: WeeklyInputRow[] = [
  {
    id: "in-1",
    organization_id: "org-1",
    week_start: SEMANA,
    department: "ventas",
    type: "text",
    content: "Cerramos 3",
    rating: null,
    submitted_by: "u-1",
    created_at: "2026-11-10T10:00:00Z",
    updated_at: "2026-11-10T10:00:00Z",
    profiles: { full_name: "Ana", avatar_url: null },
  },
];
const ESTADO = { completed: ["sales"], total: 5 };
const REPORTE_SEMANAL = {
  id: "ws-1",
  organization_id: "org-1",
  week_start: SEMANA,
  executive_summary: "Semana estable",
  risks: [],
  bottlenecks: [],
  recommendations: [],
  generated_at: "2026-11-12T09:00:00Z",
  status: "ready",
  created_at: "2026-11-12T09:00:00Z",
};
const REPORTE = {
  id: "5b2f7c1e-8d4a-4c3b-9e6f-1a2b3c4d5e6f",
  title: "Reporte semanal",
  period: "weekly",
  weekLabel: "Semana 46",
  generatedAt: "2026-11-12T08:00:00Z",
  executiveSummary: "Todo bien",
  risks: [],
  bottlenecks: [],
  recommendations: [],
  departments: [],
};

function conDatos() {
  sim.lecturas = {
    getCurrentWeekStartAction: SEMANA,
    getWeeklyInputsAction: FILAS,
    getWeeklyCompletionStatus: ESTADO,
    getWeeklyReportAction: REPORTE_SEMANAL,
    listExecutiveReportsAction: [REPORTE],
    getExecutiveReportByIdAction: REPORTE,
  };
}

const PANTALLAS = {
  "/operations/inputs": () => InputsPage(),
  "/operations/overview": () => OperationsOverviewPage(),
  "/executive-reports/history": () => ExecutiveReportsHistoryPage(),
  "/executive-reports/[id]": () =>
    ExecutiveReportDetailPage({ params: Promise.resolve({ id: REPORTE.id }) }),
};

async function html(ruta: keyof typeof PANTALLAS): Promise<string> {
  return renderToStaticMarkup(await PANTALLAS[ruta]());
}

beforeEach(() => {
  conDatos();
  sim.llamadas = {};
  sim.props = {};
  sim.notFound = 0;
});

describe("una lectura del corte vuelve rechazada", () => {
  const casos: Array<[string, keyof typeof PANTALLAS]> = [
    ["getCurrentWeekStartAction", "/operations/inputs"],
    ["getWeeklyInputsAction", "/operations/inputs"],
    ["getWeeklyCompletionStatus", "/operations/inputs"],
    ["getWeeklyReportAction", "/operations/overview"],
    ["listExecutiveReportsAction", "/executive-reports/history"],
    ["getExecutiveReportByIdAction", "/executive-reports/[id]"],
  ];

  it.each(casos)(
    "⭐ %s rechazada: %s dibuja solo «No tenés acceso a Operaciones», sin notFound",
    async (accion, ruta) => {
      sim.lecturas[accion] = RECHAZO;
      expect(await html(ruta)).toBe(SOLO_SIN_ACCESO);
      expect(sim.notFound).toBe(0);
      expect(sim.props).toEqual({});
      // Con la semana rechazada no se piden los inputs ni el estado.
      const despuesDeLaSemana = accion === "getCurrentWeekStartAction" ? 0 : 1;
      if (ruta === "/operations/inputs") {
        expect(sim.llamadas.getWeeklyInputsAction ?? 0).toBe(despuesDeLaSemana);
        expect(sim.llamadas.getWeeklyCompletionStatus ?? 0).toBe(despuesDeLaSemana);
      }
    }
  );

  it("el HTML de comparación es el de SinAcceso con la etiqueta de Operaciones", () => {
    expect(SOLO_SIN_ACCESO).toContain(
      '<h1 class="text-lg font-medium text-foreground">No tenés acceso a Operaciones</h1>'
    );
  });
});

describe("con datos, cada pantalla dibuja lo mismo que antes", () => {
  it("/operations/inputs le pasa la semana, los inputs y el estado a sus componentes", async () => {
    const pagina = await html("/operations/inputs");
    expect(sim.props).toEqual({
      PageHeader: { description: "Contexto semanal del equipo para reportes y análisis IA" },
      InputsPageTabs: {
        isFounder: true,
        weeklyContent: expect.anything(),
        teamContent: expect.anything(),
      },
      WeeklyInputsPageContent: {
        initialInputs: FILAS,
        initialCompleted: ["sales"],
        initialInputCount: 1,
        weekStart: SEMANA,
      },
      TeamInputForm: {},
      TeamInputsList: { inputs: mapWeeklyInputRowsToTeamInputs(FILAS) },
    });
    expect(pagina).toContain(formatWeekRange(SEMANA));
    expect(pagina).not.toContain("No tenés acceso");
    expect(sim.llamadas).toEqual({
      getCurrentWeekStartAction: 1,
      getWeeklyInputsAction: 1,
      getWeeklyCompletionStatus: 1,
    });
  });

  it("/operations/inputs sin inputs muestra el estado vacío", async () => {
    sim.lecturas.getWeeklyInputsAction = [];
    await html("/operations/inputs");
    expect(sim.props).toMatchObject({
      EmptyState: { title: "Sin inputs esta semana" },
      WeeklyInputsPageContent: { initialInputs: [], weekStart: SEMANA },
    });
  });

  it("/operations/overview le pasa el reporte y los departamentos", async () => {
    await html("/operations/overview");
    expect(sim.props).toEqual({
      PageHeader: { description: "Salud operativa y capacidad del equipo" },
      OperationsOverview: {
        weeklyReport: REPORTE_SEMANAL,
        departments: [{ marca: "DEPARTAMENTOS" }],
        isFounder: true,
      },
    });
  });

  it("/operations/overview sin reporte le pasa weeklyReport: null", async () => {
    sim.lecturas.getWeeklyReportAction = null;
    await html("/operations/overview");
    expect(sim.props).toMatchObject({ OperationsOverview: { weeklyReport: null } });
  });

  it("/executive-reports/history le pasa los reportes a la grilla", async () => {
    await html("/executive-reports/history");
    expect(sim.props).toMatchObject({ ReportsGrid: { reports: [REPORTE] } });
    expect(sim.props).not.toHaveProperty("EmptyState");
  });

  it("/executive-reports/history sin reportes dice «Todavía no hay reportes»", async () => {
    sim.lecturas.listExecutiveReportsAction = [];
    await html("/executive-reports/history");
    expect(sim.props).toMatchObject({ EmptyState: { title: "Todavía no hay reportes" } });
    expect(sim.props).not.toHaveProperty("ReportsGrid");
  });

  it("/executive-reports/[id] le pasa el reporte al cuerpo", async () => {
    const cadencia = getReportCadence("weekly");
    await html("/executive-reports/[id]");
    expect(sim.props).toEqual({
      PageHeader: {
        title: "Reporte semanal",
        description: `${cadencia.label} · ${cadencia.title} — ${cadencia.watches}`,
      },
      ReportBody: { report: REPORTE },
    });
    expect(sim.notFound).toBe(0);
  });

  it("/executive-reports/[id] de un reporte que no existe llama a notFound", async () => {
    sim.lecturas.getExecutiveReportByIdAction = null;
    await expect(html("/executive-reports/[id]")).rejects.toThrow(NOT_FOUND);
    expect(sim.notFound).toBe(1);
  });
});
