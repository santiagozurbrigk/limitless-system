/**
 * SCRUM-541 · Las 3 pantallas de Embudos dibujan `SinAcceso` cuando una de sus
 * lecturas vuelve rechazada.
 *
 * Pasa si los permisos cambian entre el guardia de la página y la lectura del
 * mismo render: los permisos no se cachean, cada lectura los vuelve a mirar. La
 * página dibuja lo mismo que el guardia («No tenés acceso a Embudos») y nada
 * más: ni la cabecera ni la lista ni los formularios, y no responde «no existe».
 *
 * Con datos, cada pantalla le pasa a sus componentes lo mismo que devolvieron
 * las lecturas. Las actions se simulan (su lógica se prueba en
 * `app/funnels/__tests__/lecturas-de-embudos-por-modulo.test.ts`) y los
 * componentes de cliente se reemplazan por una marca que anota sus props.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SinAcceso } from "@/components/platform/sin-acceso";
import { computeFunnel, requireFunnelTemplate, resolvePeriod } from "@/lib/funnels";
import type { ResolvedFunnelData } from "@/lib/funnels/resolve";

const sim = vi.hoisted(() => ({
  lecturas: {} as Record<string, unknown>,
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
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: unknown }) =>
    createElement("a", { href }, children as never),
}));

function lectura(nombre: string) {
  return async () => sim.lecturas[nombre];
}
vi.mock("@/app/funnels/actions", () => ({
  listFunnelIndexAction: lectura("listFunnelIndexAction"),
  listFunnelTemplatesAction: lectura("listFunnelTemplatesAction"),
  getFunnelAction: lectura("getFunnelAction"),
  listFunnelInstancesAction: lectura("listFunnelInstancesAction"),
  getFunnelBindingsAction: lectura("getFunnelBindingsAction"),
  listFunnelFormOptionsAction: lectura("listFunnelFormOptionsAction"),
}));
vi.mock("@/app/ghl/opportunity-actions", () => ({
  listGHLStageOptionsAction: lectura("listGHLStageOptionsAction"),
}));
vi.mock("@/app/vturb/actions", () => ({
  listVTurbPlayerOptionsAction: lectura("listVTurbPlayerOptionsAction"),
}));
vi.mock("@/app/webinarjam/actions", () => ({
  listWebinarJamWebinarOptionsAction: lectura("listWebinarJamWebinarOptionsAction"),
}));

// Los componentes de cliente usan hooks: acá alcanza con ver qué reciben.
function marca(nombre: string) {
  function Marca(props: Record<string, unknown>) {
    sim.props[nombre] = props;
    return createElement("div", { "data-componente": nombre });
  }
  return Marca;
}
vi.mock("@/components/funnels/funnel-create-form", () => ({
  FunnelCreateForm: marca("FunnelCreateForm"),
}));
vi.mock("@/components/funnels/funnel-bindings-form", () => ({
  FunnelBindingsForm: marca("FunnelBindingsForm"),
}));
vi.mock("@/components/funnels/funnel-switcher", () => ({
  FunnelSwitcher: marca("FunnelSwitcher"),
}));
vi.mock("@/components/funnels/funnel-kpi-panel", () => ({
  FunnelKpiPanel: marca("FunnelKpiPanel"),
}));
vi.mock("@/components/funnels/funnel-spine-strip", () => ({
  FunnelSpineStrip: marca("FunnelSpineStrip"),
}));
vi.mock("@/components/funnels/funnel-steps-table", () => ({
  FunnelStepsTable: marca("FunnelStepsTable"),
}));

import FunnelsPage from "../page";
import FunnelDetailPage from "../[funnelId]/page";
import FunnelConfigurePage from "../[funnelId]/configurar/page";

// ─── Datos que devuelven las lecturas ────────────────────────────────────────

const RECHAZO = {
  success: false,
  error: "No tenés acceso a Embudos.",
  motivo: "sin-acceso",
  moduleId: "funnels",
};

const SOLO_SIN_ACCESO = renderToStaticMarkup(createElement(SinAcceso, { moduleLabel: "Embudos" }));

const INSTANCIA = {
  id: "f-1",
  organization_id: "org-1",
  template_id: "vsl_call",
  name: "VSL de enero",
  product_id: null,
  currency: "USD",
  price_point: 997,
  reporting_timezone: "America/Argentina/Buenos_Aires",
  is_active: true,
};
const OTRA_INSTANCIA = { ...INSTANCIA, id: "f-2", template_id: "webinar", name: "Webinar de marzo" };

const PLANTILLA = requireFunnelTemplate("vsl_call");
const COMPUTADO = computeFunnel(PLANTILLA, {});

const EMBUDO: ResolvedFunnelData = {
  instance: INSTANCIA,
  template: PLANTILLA,
  period: resolvePeriod("30d", new Date("2026-11-04T15:00:00Z")),
  stepCounts: {},
  measures: {},
  provenance: PLANTILLA.steps.map((step) => ({
    stepId: step.id,
    sourceId: null,
    provenance: null,
    unbound: true,
    nullReason: null,
  })),
  computed: COMPUTADO,
};

const INDICE = [
  {
    id: "f-1",
    name: "VSL de enero",
    templateId: "vsl_call",
    templateLabel: "VSL Book-a-Call Funnel",
    badge: "Application-led",
    currency: "USD",
    pricePoint: 997,
    stepCount: 7,
    boundSteps: 3,
  },
];
const PLANTILLAS = [
  { id: "vsl_call", label: "VSL Book-a-Call Funnel", description: "VSL", badge: "Application-led", stepCount: 7 },
];
const BINDINGS = { instanceName: "VSL de enero", templateLabel: "VSL Book-a-Call Funnel", rows: [] };
const ETAPAS_GHL = [{ stageId: "st-1", stageName: "Nuevo", pipelineId: "p-1", pipelineName: "Ventas", position: 1 }];
const PLAYERS = [{ playerId: "pl-1", name: "VSL A", durationSeconds: 600, pitchTime: 120 }];
const WEBINARS = [{ product: "wj", webinarId: "w-1", name: "Clase", scheduleCount: 2, pitchSecond: null }];
const FORMULARIOS = [{ formId: "form-1", title: "Aplicación", platform: "typeform", totalResponses: 12 }];

function conDatos() {
  sim.lecturas = {
    listFunnelIndexAction: INDICE,
    listFunnelTemplatesAction: PLANTILLAS,
    getFunnelAction: EMBUDO,
    listFunnelInstancesAction: [INSTANCIA, OTRA_INSTANCIA],
    getFunnelBindingsAction: BINDINGS,
    listFunnelFormOptionsAction: FORMULARIOS,
    listGHLStageOptionsAction: ETAPAS_GHL,
    listVTurbPlayerOptionsAction: PLAYERS,
    listWebinarJamWebinarOptionsAction: WEBINARS,
  };
}

const params = { params: Promise.resolve({ funnelId: "f-1" }) };

const PANTALLAS = {
  "/funnels": () => FunnelsPage(),
  "/funnels/[funnelId]": () =>
    FunnelDetailPage({ ...params, searchParams: Promise.resolve({ period: "30d" }) }),
  "/funnels/[funnelId]/configurar": () => FunnelConfigurePage(params),
};

async function html(ruta: keyof typeof PANTALLAS): Promise<string> {
  return renderToStaticMarkup(await PANTALLAS[ruta]());
}

beforeEach(() => {
  conDatos();
  sim.props = {};
  sim.notFound = 0;
});

describe("una lectura del corte vuelve rechazada", () => {
  const casos: Array<[string, keyof typeof PANTALLAS]> = [
    ["listFunnelIndexAction", "/funnels"],
    ["listFunnelTemplatesAction", "/funnels"],
    ["getFunnelAction", "/funnels/[funnelId]"],
    ["listFunnelInstancesAction", "/funnels/[funnelId]"],
    ["getFunnelBindingsAction", "/funnels/[funnelId]/configurar"],
    ["listGHLStageOptionsAction", "/funnels/[funnelId]/configurar"],
    ["listVTurbPlayerOptionsAction", "/funnels/[funnelId]/configurar"],
    ["listFunnelFormOptionsAction", "/funnels/[funnelId]/configurar"],
  ];

  it.each(casos)(
    "⭐ %s rechazada: %s dibuja solo «No tenés acceso a Embudos», sin notFound",
    async (accion, ruta) => {
      sim.lecturas[accion] = RECHAZO;
      expect(await html(ruta)).toBe(SOLO_SIN_ACCESO);
      expect(sim.notFound).toBe(0);
      expect(sim.props).toEqual({});
    }
  );

  it("el HTML de comparación es el de SinAcceso con la etiqueta de Embudos", () => {
    expect(SOLO_SIN_ACCESO).toContain(
      '<h1 class="text-lg font-medium text-foreground">No tenés acceso a Embudos</h1>'
    );
  });
});

describe("con datos, cada pantalla dibuja lo mismo que antes", () => {
  it("/funnels lista los embudos y le pasa las plantillas al formulario de alta", async () => {
    const pagina = await html("/funnels");
    expect(sim.props).toEqual({ FunnelCreateForm: { templates: PLANTILLAS } });
    expect(pagina).toContain('<p class="min-w-0 truncate text-sm font-medium">VSL de enero</p>');
    expect(pagina).toContain(
      '<span class="text-amber-600 dark:text-amber-400">3 de 7 pasos con fuente</span>'
    );
    expect(pagina).not.toContain("No tenés acceso");
  });

  it("/funnels sin embudos dice «Todavía no hay embudos»", async () => {
    sim.lecturas.listFunnelIndexAction = [];
    const pagina = await html("/funnels");
    expect(pagina).toContain("Todavía no hay embudos");
    expect(sim.props).toEqual({ FunnelCreateForm: { templates: PLANTILLAS } });
  });

  it("el detalle le pasa el embudo y la lista a sus componentes", async () => {
    const pagina = await html("/funnels/[funnelId]");
    expect(sim.props).toEqual({
      FunnelSwitcher: {
        current: { id: "f-1", name: "VSL de enero", templateLabel: "VSL Book-a-Call Funnel" },
        items: [
          { id: "f-1", name: "VSL de enero", templateLabel: "VSL Book-a-Call Funnel" },
          { id: "f-2", name: "Webinar de marzo", templateLabel: "Webinar Funnel" },
        ],
        periodId: "30d",
      },
      FunnelKpiPanel: { kpis: COMPUTADO.kpis, currency: "USD" },
      FunnelSpineStrip: { stages: COMPUTADO.stages, transitions: COMPUTADO.transitions },
      FunnelStepsTable: {
        template: PLANTILLA,
        computed: COMPUTADO,
        provenance: EMBUDO.provenance,
        currency: "USD",
      },
    });
    expect(pagina).toContain('<div data-componente="FunnelSwitcher"></div>');
    expect(pagina).not.toContain("No tenés acceso");
  });

  it("el detalle de un embudo que no existe llama a notFound", async () => {
    sim.lecturas.getFunnelAction = null;
    await expect(html("/funnels/[funnelId]")).rejects.toThrow(NOT_FOUND);
    expect(sim.notFound).toBe(1);
  });

  it("configurar le pasa los bindings y los catálogos al formulario", async () => {
    const pagina = await html("/funnels/[funnelId]/configurar");
    expect(sim.props).toEqual({
      FunnelBindingsForm: {
        funnelId: "f-1",
        rows: [],
        ghlStages: ETAPAS_GHL,
        vturbPlayers: PLAYERS,
        webinarJamWebinars: WEBINARS,
        forms: FORMULARIOS,
      },
    });
    expect(pagina).toContain("Fuentes de VSL de enero");
    expect(pagina).toContain("Volver al embudo");
  });

  it("configurar de un embudo que no existe llama a notFound", async () => {
    sim.lecturas.getFunnelBindingsAction = null;
    await expect(html("/funnels/[funnelId]/configurar")).rejects.toThrow(NOT_FOUND);
    expect(sim.notFound).toBe(1);
  });
});
