/**
 * SCRUM-541 · Las 8 Server Actions de lectura de Embudos chequean `funnels`.
 *
 * Se pueden invocar a mano sin abrir ninguna pantalla, así que el guardia de la
 * página no alcanza: sin el módulo, cada una devuelve el rechazo como valor y no
 * lee nada (ni la org, ni la base, ni la integración).
 *
 * Con el módulo, cada una devuelve lo mismo que antes y hace las mismas
 * consultas: el Supabase falso anota cada llamada con sus argumentos, así que un
 * filtro perdido o una columna cambiada al mover un cuerpo no pasan.
 *
 * `getVTurbStatusAction` (deuda de Integraciones) lee los players sin pasar por
 * la action que ahora chequea Embudos: quien tiene Integraciones y no Embudos
 * sigue viendo el estado de VTurb igual.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyPermissions } from "@/constants/permission-modules";
import type { PermissionLevel } from "@/types/team";
import type { UserPermissions } from "@/lib/auth/get-current-permissions";
import {
  FUNNEL_TEMPLATES,
  getInstrumentationTool,
  getSpineStage,
  requireFunnelTemplate,
  sourcesForStage,
  type FunnelSourceConfigField,
} from "@/lib/funnels";

type Llamada = [string, ...unknown[]];
type Consulta = [string, ...Llamada[]];

const sim = vi.hoisted(() => ({
  permisos: null as unknown as UserPermissions,
  llamadasAPermisos: 0,
  lecturas: [] as string[],
  consultas: [] as unknown[][],
  tablas: {} as Record<string, unknown[]>,
  resolveFunnel: [] as unknown[][],
  integracionVTurb: null as unknown,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/get-current-permissions", () => ({
  getCurrentUserPermissions: async () => {
    sim.llamadasAPermisos += 1;
    return sim.permisos;
  },
}));
vi.mock("@/lib/auth/bootstrap", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/bootstrap")>()),
  requireOrganizationId: async () => {
    sim.lecturas.push("requireOrganizationId");
    return "org-1";
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    sim.lecturas.push("createClient");
    return {
      from(tabla: string) {
        sim.lecturas.push(`from:${tabla}`);
        const consulta: unknown[] = [tabla];
        sim.consultas.push(consulta);
        const filas = sim.tablas[tabla] ?? [];
        const builder = {
          select: (...args: unknown[]) => {
            consulta.push(["select", ...args]);
            return builder;
          },
          eq: (...args: unknown[]) => {
            consulta.push(["eq", ...args]);
            return builder;
          },
          order: (...args: unknown[]) => {
            consulta.push(["order", ...args]);
            return builder;
          },
          maybeSingle: async () => {
            consulta.push(["maybeSingle"]);
            return { data: filas[0] ?? null, error: null };
          },
          then: (
            resolver: (valor: { data: unknown[]; error: null }) => unknown,
            rechazar?: (motivo: unknown) => unknown
          ) => Promise.resolve({ data: filas, error: null }).then(resolver, rechazar),
        };
        return builder;
      },
    };
  },
}));
vi.mock("@/lib/funnels/resolve", () => ({
  resolveFunnel: async (_supabase: unknown, ...args: unknown[]) => {
    sim.resolveFunnel.push(args);
    return { marca: "EMBUDO_RESUELTO" };
  },
}));
vi.mock("@/lib/vturb/integration", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/vturb/integration")>()),
  getVTurbIntegrationForOrg: async (organizationId: string) => {
    sim.lecturas.push(`getVTurbIntegrationForOrg:${organizationId}`);
    return sim.integracionVTurb;
  },
}));

import {
  getFunnelAction,
  getFunnelBindingsAction,
  listFunnelFormOptionsAction,
  listFunnelIndexAction,
  listFunnelInstancesAction,
  listFunnelTemplatesAction,
} from "../actions";
import { listGHLStageOptionsAction } from "@/app/ghl/opportunity-actions";
import { getVTurbStatusAction, listVTurbPlayerOptionsAction } from "@/app/vturb/actions";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const INSTANCE_COLUMNS =
  "id, organization_id, template_id, name, product_id, currency, price_point, reporting_timezone, is_active";

const VSL = {
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
const WEBINAR = {
  id: "f-2",
  organization_id: "org-1",
  template_id: "webinar",
  name: "Webinar de marzo",
  product_id: null,
  currency: "ARS",
  price_point: 1500,
  reporting_timezone: "America/Argentina/Buenos_Aires",
  is_active: true,
};
// Su plantilla ya no existe en código: ninguna lectura la devuelve.
const HUERFANA = { ...WEBINAR, id: "f-3", template_id: "plantilla-borrada", name: "Viejo" };

const BINDINGS = [
  { funnel_instance_id: "f-1", step_id: "vsl.click", source_id: "ad_clicks", config: null },
  { funnel_instance_id: "f-1", step_id: "vsl.watch", source_id: "vturb_plays", config: {} },
  {
    funnel_instance_id: "f-1",
    step_id: "vsl.booking",
    source_id: "ghl_stage_entered",
    config: { stageId: "st-9" },
  },
  { funnel_instance_id: "f-2", step_id: "webinar.click", source_id: "ad_clicks", config: null },
];

const PLAYERS = [
  { external_id: "pl-1", name: "VSL A", duration_seconds: 600, pitch_time: null },
  { external_id: "pl-2", name: null, duration_seconds: null, pitch_time: 0 },
  { external_id: "pl-3", name: "VSL C", duration_seconds: 900, pitch_time: 120 },
];

const TABLAS: Record<string, unknown[]> = {
  funnel_instances: [VSL, WEBINAR, HUERFANA],
  funnel_step_bindings: BINDINGS,
  forms: [
    { id: "form-1", title: "Aplicación", platform: "typeform", total_responses: 12 },
    { id: "form-2", title: null, platform: null, total_responses: null },
  ],
  ghl_pipeline_stages: [
    { external_id: "st-1", name: "Nuevo", position: 1, pipeline_external_id: "p-1" },
    { external_id: "st-2", name: null, position: null, pipeline_external_id: "p-2" },
  ],
  ghl_pipelines: [{ external_id: "p-1", name: "Ventas" }],
  vturb_players: PLAYERS,
};

const INTEGRACION_VTURB = {
  organization_id: "org-1",
  api_key_encrypted: "cifrada",
  timezone: "America/Sao_Paulo",
  players_synced_at: "2026-11-01T10:00:00Z",
  last_error: "token vencido",
  created_at: "2026-10-01T10:00:00Z",
  updated_at: "2026-11-01T10:00:00Z",
};

const RECHAZO = {
  success: false,
  error: "No tenés acceso a Embudos.",
  motivo: "sin-acceso",
  moduleId: "funnels",
};

function member(
  modulos: Partial<UserPermissions["modules"]>,
  hasRoleConfigured = true
): UserPermissions {
  return {
    role: "member",
    isFounder: false,
    modules: { ...emptyPermissions(), ...modulos },
    hasRoleConfigured,
    enabledAddOns: [],
  };
}

/** Todos los módulos en `full` salvo Embudos. */
function memberSinEmbudos(): UserPermissions {
  const modulos = Object.fromEntries(
    Object.keys(emptyPermissions()).map((id) => [id, "full" as PermissionLevel])
  ) as UserPermissions["modules"];
  return member({ ...modulos, funnels: "none" });
}

const FOUNDER: UserPermissions = {
  role: "founder",
  isFounder: true,
  modules: emptyPermissions(),
  hasRoleConfigured: true,
  enabledAddOns: [],
};

// ─── Consultas de `a9637de6`, copiadas de cada cuerpo ───────────────────────

const ORG: Llamada = ["eq", "organization_id", "org-1"];

const CONSULTA_VTURB_PLAYERS: Consulta = [
  "vturb_players",
  ["select", "external_id, name, duration_seconds, pitch_time"],
  ORG,
  ["order", "name", { ascending: true }],
];

function filaDeBinding(
  stepId: string,
  actual: { sourceId: string | null; config: Record<string, unknown>; missing: string[] }
) {
  const step = requireFunnelTemplate("vsl_call").steps.find((s) => s.id === stepId)!;
  return {
    stepId: step.id,
    stepLabel: step.label,
    stageId: step.stageId,
    stageLabel: getSpineStage(step.stageId).label,
    metricLabel: step.metricLabel,
    currentSourceId: actual.sourceId,
    currentConfig: actual.config,
    missingConfig: actual.missing,
    options: sourcesForStage(step.stageId).map((source) => ({
      sourceId: source.id,
      label: source.label,
      description: source.description,
      configFields: [
        ...((source as { configFields?: readonly FunnelSourceConfigField[] }).configFields ?? []),
      ],
    })),
    documentTool: getInstrumentationTool(step.sourceHint).label,
  };
}

const SIN_FUENTE = { sourceId: null, config: {}, missing: [] };

type Caso = {
  nombre: string;
  llamar: () => Promise<unknown>;
  valor: () => unknown;
  consultas: Consulta[];
};

const CASOS: Caso[] = [
  {
    nombre: "listFunnelInstancesAction",
    llamar: () => listFunnelInstancesAction(),
    valor: () => [VSL, WEBINAR],
    consultas: [
      [
        "funnel_instances",
        ["select", INSTANCE_COLUMNS],
        ORG,
        ["eq", "is_active", true],
        ["order", "created_at", { ascending: true }],
      ],
    ],
  },
  {
    nombre: "getFunnelAction",
    llamar: () => getFunnelAction("f-1", "30d"),
    valor: () => ({ marca: "EMBUDO_RESUELTO" }),
    consultas: [
      ["funnel_instances", ["select", INSTANCE_COLUMNS], ORG, ["eq", "id", "f-1"], ["maybeSingle"]],
      [
        "funnel_step_bindings",
        ["select", "step_id, source_id, config"],
        ORG,
        ["eq", "funnel_instance_id", "f-1"],
      ],
    ],
  },
  {
    nombre: "listFunnelTemplatesAction",
    llamar: () => listFunnelTemplatesAction(),
    valor: () =>
      FUNNEL_TEMPLATES.map((t) => ({
        id: t.id,
        label: t.label,
        description: t.description,
        badge: t.badge,
        stepCount: t.steps.length,
      })),
    consultas: [],
  },
  {
    nombre: "getFunnelBindingsAction",
    llamar: () => getFunnelBindingsAction("f-1"),
    valor: () => ({
      instanceName: "VSL de enero",
      templateLabel: "VSL Book-a-Call Funnel",
      rows: [
        filaDeBinding("vsl.click", { sourceId: "ad_clicks", config: {}, missing: [] }),
        filaDeBinding("vsl.watch", { sourceId: "vturb_plays", config: {}, missing: ["playerId"] }),
        filaDeBinding("vsl.booking", {
          sourceId: "ghl_stage_entered",
          config: { stageId: "st-9" },
          missing: [],
        }),
        filaDeBinding("vsl.qualified", SIN_FUENTE),
        filaDeBinding("vsl.show", SIN_FUENTE),
        filaDeBinding("vsl.close", SIN_FUENTE),
        filaDeBinding("vsl.cash", SIN_FUENTE),
      ],
    }),
    consultas: [
      [
        "funnel_instances",
        ["select", "id, name, template_id"],
        ORG,
        ["eq", "id", "f-1"],
        ["maybeSingle"],
      ],
      [
        "funnel_step_bindings",
        ["select", "step_id, source_id, config"],
        ORG,
        ["eq", "funnel_instance_id", "f-1"],
      ],
    ],
  },
  {
    nombre: "listFunnelFormOptionsAction",
    llamar: () => listFunnelFormOptionsAction(),
    valor: () => [
      { formId: "form-1", title: "Aplicación", platform: "typeform", totalResponses: 12 },
      { formId: "form-2", title: "Formulario sin título", platform: null, totalResponses: 0 },
    ],
    consultas: [
      [
        "forms",
        ["select", "id, title, platform, total_responses"],
        ORG,
        ["eq", "is_active", true],
        ["order", "title", { ascending: true }],
      ],
    ],
  },
  {
    nombre: "listFunnelIndexAction",
    llamar: () => listFunnelIndexAction(),
    valor: () => [
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
      {
        id: "f-2",
        name: "Webinar de marzo",
        templateId: "webinar",
        templateLabel: "Webinar Funnel",
        badge: "Registration-led",
        currency: "ARS",
        pricePoint: 1500,
        stepCount: 7,
        boundSteps: 1,
      },
    ],
    consultas: [
      [
        "funnel_instances",
        ["select", INSTANCE_COLUMNS],
        ORG,
        ["eq", "is_active", true],
        ["order", "created_at", { ascending: true }],
      ],
      ["funnel_step_bindings", ["select", "funnel_instance_id, step_id"], ORG],
    ],
  },
  {
    nombre: "listGHLStageOptionsAction",
    llamar: () => listGHLStageOptionsAction(),
    valor: () => [
      { stageId: "st-1", stageName: "Nuevo", pipelineId: "p-1", pipelineName: "Ventas", position: 1 },
      { stageId: "st-2", stageName: null, pipelineId: "p-2", pipelineName: null, position: null },
    ],
    consultas: [
      [
        "ghl_pipeline_stages",
        ["select", "external_id, name, position, pipeline_external_id"],
        ORG,
        ["order", "position", { ascending: true }],
      ],
      ["ghl_pipelines", ["select", "external_id, name"], ORG],
    ],
  },
  {
    nombre: "listVTurbPlayerOptionsAction",
    llamar: () => listVTurbPlayerOptionsAction(),
    valor: () => [
      { playerId: "pl-1", name: "VSL A", durationSeconds: 600, pitchTime: null },
      { playerId: "pl-2", name: null, durationSeconds: null, pitchTime: 0 },
      { playerId: "pl-3", name: "VSL C", durationSeconds: 900, pitchTime: 120 },
    ],
    consultas: [CONSULTA_VTURB_PLAYERS],
  },
];

beforeEach(() => {
  // El período de `getFunnelAction` sale del reloj: fijo para que el valor sea exacto.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-04T15:00:00Z"));
  sim.llamadasAPermisos = 0;
  sim.lecturas = [];
  sim.consultas = [];
  sim.resolveFunnel = [];
  sim.tablas = TABLAS;
  sim.integracionVTurb = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("las 8 lecturas de Embudos", () => {
  it.each(CASOS.map((caso) => [caso.nombre, caso] as const))(
    "⭐ %s, llamada a mano por un member sin Embudos: devuelve el rechazo y no lee nada",
    async (_nombre, caso) => {
      sim.permisos = memberSinEmbudos();
      expect(await caso.llamar()).toEqual(RECHAZO);
      expect(sim.lecturas).toEqual([]);
      expect(sim.consultas).toEqual([]);
      expect(sim.resolveFunnel).toEqual([]);
    }
  );

  const quienesTienenEmbudos: Array<[string, () => UserPermissions]> = [
    ["el founder", () => FOUNDER],
    ["un member con Embudos", () => member({ funnels: "view" })],
    ["alguien sin rol", () => member({}, false)],
  ];

  describe.each(quienesTienenEmbudos)("%s", (_quien, permisos) => {
    it.each(CASOS.map((caso) => [caso.nombre, caso] as const))(
      "%s devuelve lo mismo y hace las mismas consultas que antes del chequeo",
      async (_nombre, caso) => {
        sim.permisos = permisos();
        expect(await caso.llamar()).toEqual(caso.valor());
        expect(sim.consultas).toEqual(caso.consultas);
      }
    );
  });

  it("getFunnelAction le pasa a resolveFunnel la instancia, los bindings y el período pedido", async () => {
    sim.permisos = member({ funnels: "view" });
    await getFunnelAction("f-1", "30d");
    expect(sim.resolveFunnel).toEqual([
      [VSL, BINDINGS, { presetId: "30d", start: "2026-10-06", end: "2026-11-04" }],
    ]);
  });
});

describe("getVTurbStatusAction, para quien tiene Integraciones y no Embudos", () => {
  beforeEach(() => {
    sim.permisos = member({ integrations: "full" });
  });

  it("⭐ con VTurb conectado devuelve el estado con los players, sin leer permisos", async () => {
    sim.integracionVTurb = INTEGRACION_VTURB;
    expect(await getVTurbStatusAction()).toEqual({
      connected: true,
      playersSyncedAt: "2026-11-01T10:00:00Z",
      playerCount: 3,
      playersWithoutPitchTime: 2,
      lastError: "token vencido",
    });
    expect(sim.llamadasAPermisos).toBe(0);
    expect(sim.consultas).toEqual([CONSULTA_VTURB_PLAYERS]);
    expect(sim.lecturas).toContain("getVTurbIntegrationForOrg:org-1");
  });

  it("con VTurb sin conectar devuelve el estado vacío", async () => {
    sim.integracionVTurb = null;
    expect(await getVTurbStatusAction()).toEqual({
      connected: false,
      playersSyncedAt: null,
      playerCount: 0,
      playersWithoutPitchTime: 0,
      lastError: null,
    });
    expect(sim.llamadasAPermisos).toBe(0);
    expect(sim.consultas).toEqual([]);
  });

  it("listVTurbPlayerOptionsAction le devuelve el rechazo", async () => {
    sim.integracionVTurb = INTEGRACION_VTURB;
    expect(await listVTurbPlayerOptionsAction()).toEqual(RECHAZO);
    expect(sim.lecturas).toEqual([]);
  });
});
