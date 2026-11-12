/**
 * SCRUM-541 (corte B) · Las 10 Server Actions de lectura de Operaciones chequean
 * `operations`.
 *
 * Se pueden invocar a mano sin abrir ninguna pantalla, así que el guardia de la
 * página no alcanza: sin el módulo, cada una devuelve el rechazo como valor y no
 * lee nada (ni la org, ni la base).
 *
 * Con el módulo, cada una devuelve lo mismo que antes y hace las mismas
 * consultas: el Supabase falso anota cada llamada con sus argumentos, así que un
 * filtro perdido o una columna cambiada al mover un cuerpo no pasan.
 *
 * `countWeeklyInputsForWeek` no la llama ninguna pantalla y no chequea: cuenta
 * con la función interna, sin leer permisos, también para quien no tiene
 * Operaciones.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyPermissions } from "@/constants/permission-modules";
import type { PermissionLevel } from "@/types/team";
import type { UserPermissions } from "@/lib/auth/get-current-permissions";

type Llamada = [string, ...unknown[]];
type Consulta = [string, ...Llamada[]];

const sim = vi.hoisted(() => ({
  permisos: null as unknown as UserPermissions,
  llamadasAPermisos: 0,
  lecturas: [] as string[],
  consultas: [] as unknown[][],
  tablas: {} as Record<string, unknown[]>,
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
  tryRequireOrganizationId: async () => {
    sim.lecturas.push("tryRequireOrganizationId");
    return "org-1";
  },
}));
vi.mock("@/lib/supabase/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/env")>()),
  isSupabaseConfigured: () => true,
}));
// "Hoy" para la organización: un jueves, así la semana es la del lunes 9.
vi.mock("@/lib/fechas/organizacion", () => ({
  fechaDeHoyDeLaOrganizacion: async () => {
    sim.lecturas.push("fechaDeHoyDeLaOrganizacion");
    return "2026-11-12";
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

import {
  countWeeklyInputsForWeek,
  getCurrentWeekStartAction,
  getWeeklyCompletionStatus,
  getWeeklyInputsAction,
  getWeeklyInputsForWeekAction,
  getWeeklyInputsHistoryAction,
  getWeeklyReportAction,
} from "../actions";
import {
  getExecutiveReportByIdAction,
  listExecutiveReportsAction,
} from "@/app/executive-reports/actions";
import { getSalesFrameworksAction } from "@/app/product/actions";
import { getSopVideoJobAction } from "@/app/sops/video-actions";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SEMANA = "2026-11-09";
const UUID_REPORTE = "5b2f7c1e-8d4a-4c3b-9e6f-1a2b3c4d5e6f";

const COLUMNAS_INPUTS =
  "id, organization_id, week_start, department, type, content, rating, submitted_by, created_at, updated_at, profiles(full_name, avatar_url)";
const COLUMNAS_REPORTES =
  "id, period, week_label, title, executive_summary, risks, bottlenecks, recommendations, departments, generated_at";

const BASE_INPUT = {
  organization_id: "org-1",
  type: "text",
  rating: null,
  submitted_by: "u-1",
  created_at: "2026-11-10T10:00:00Z",
  updated_at: "2026-11-10T10:00:00Z",
};
// `profiles` llega en arreglo, suelto o vacío: las tres formas del join.
const INPUTS = [
  {
    ...BASE_INPUT,
    id: "in-1",
    week_start: SEMANA,
    department: "ventas",
    content: "Cerramos 3",
    profiles: [{ full_name: "Ana", avatar_url: null }],
  },
  {
    ...BASE_INPUT,
    id: "in-2",
    week_start: SEMANA,
    department: "ventas",
    content: "Otra",
    profiles: { full_name: "Beto", avatar_url: "https://x/b.png" },
  },
  {
    ...BASE_INPUT,
    id: "in-3",
    week_start: "2026-11-02",
    department: "delivery",
    content: null,
    rating: 4,
    profiles: null,
  },
];
const INPUTS_MAPEADOS = [
  { ...INPUTS[0], profiles: { full_name: "Ana", avatar_url: null } },
  { ...INPUTS[1], profiles: { full_name: "Beto", avatar_url: "https://x/b.png" } },
  { ...INPUTS[2], profiles: null },
];

const REPORTE_SEMANAL = {
  id: "ws-1",
  organization_id: "org-1",
  week_start: SEMANA,
  executive_summary: "Semana estable",
  risks: ["r1"],
  bottlenecks: [],
  recommendations: ["c1"],
  generated_at: "2026-11-12T09:00:00Z",
  status: "ready",
  created_at: "2026-11-12T09:00:00Z",
};

const REPORTE_EJECUTIVO = {
  id: UUID_REPORTE,
  period: "weekly",
  week_label: "Semana 46",
  title: "Reporte semanal",
  executive_summary: "Todo bien",
  risks: ["riesgo", 2],
  bottlenecks: null,
  recommendations: ["hacer"],
  departments: [{ name: "Ventas", status: "critical" }, { name: "Delivery", status: "raro" }, null],
  generated_at: "2026-11-12T08:00:00Z",
};
const REPORTE_EJECUTIVO_MAPEADO = {
  id: UUID_REPORTE,
  title: "Reporte semanal",
  period: "weekly",
  weekLabel: "Semana 46",
  generatedAt: "2026-11-12T08:00:00Z",
  executiveSummary: "Todo bien",
  risks: ["riesgo", "2"],
  bottlenecks: [],
  recommendations: ["hacer"],
  departments: [
    { name: "Ventas", status: "critical" },
    { name: "Delivery", status: "watch" },
  ],
};

const FRAMEWORKS = [
  {
    id: "fw-1",
    name: "Script de cierre",
    description: null,
    content: "Hola",
    type: "script",
    is_active: true,
  },
];

const JOB = {
  id: "job-1",
  status: "generating",
  title: "Pago manual",
  department: null,
  transcript: "texto",
  transcript_seconds: 120,
  generated_markdown: null,
  open_questions: ["¿quién aprueba?", 3],
  error: null,
  created_at: "2026-11-12T07:00:00Z",
};
const JOB_MAPEADO = {
  id: "job-1",
  status: "generating",
  title: "Pago manual",
  department: null,
  transcript: "texto",
  transcriptSeconds: 120,
  generatedMarkdown: null,
  openQuestions: ["¿quién aprueba?"],
  error: null,
  createdAt: "2026-11-12T07:00:00Z",
};

const TABLAS: Record<string, unknown[]> = {
  weekly_inputs: INPUTS,
  weekly_reports: [REPORTE_SEMANAL],
  executive_reports: [REPORTE_EJECUTIVO],
  sales_frameworks: FRAMEWORKS,
  sop_generation_jobs: [JOB],
};

const RECHAZO = {
  success: false,
  error: "No tenés acceso a Operaciones.",
  motivo: "sin-acceso",
  moduleId: "operations",
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

/** Todos los módulos en `full` salvo Operaciones. */
function memberSinOperaciones(): UserPermissions {
  const modulos = Object.fromEntries(
    Object.keys(emptyPermissions()).map((id) => [id, "full" as PermissionLevel])
  ) as UserPermissions["modules"];
  return member({ ...modulos, operations: "none" });
}

const FOUNDER: UserPermissions = {
  role: "founder",
  isFounder: true,
  modules: emptyPermissions(),
  hasRoleConfigured: true,
  enabledAddOns: [],
};

// ─── Consultas de `e33f61e0`, copiadas de cada cuerpo ───────────────────────

const ORG: Llamada = ["eq", "organization_id", "org-1"];

const CONSULTA_INPUTS: Consulta = [
  "weekly_inputs",
  ["select", COLUMNAS_INPUTS],
  ORG,
  ["eq", "week_start", SEMANA],
  ["order", "created_at", { ascending: false }],
];

type Caso = {
  nombre: string;
  llamar: () => Promise<unknown>;
  valor: unknown;
  consultas: Consulta[];
};

const CASOS: Caso[] = [
  {
    nombre: "getCurrentWeekStartAction",
    llamar: () => getCurrentWeekStartAction(),
    valor: SEMANA,
    consultas: [],
  },
  {
    nombre: "getWeeklyInputsForWeekAction",
    llamar: () => getWeeklyInputsForWeekAction(SEMANA),
    valor: INPUTS_MAPEADOS,
    consultas: [CONSULTA_INPUTS],
  },
  {
    nombre: "getWeeklyInputsAction",
    llamar: () => getWeeklyInputsAction(),
    valor: INPUTS_MAPEADOS,
    consultas: [CONSULTA_INPUTS],
  },
  {
    nombre: "getWeeklyInputsHistoryAction",
    llamar: () => getWeeklyInputsHistoryAction(),
    valor: [SEMANA, "2026-11-02"],
    consultas: [
      [
        "weekly_inputs",
        ["select", "week_start"],
        ORG,
        ["order", "week_start", { ascending: false }],
      ],
    ],
  },
  {
    nombre: "getWeeklyReportAction",
    llamar: () => getWeeklyReportAction(),
    valor: REPORTE_SEMANAL,
    consultas: [
      ["weekly_reports", ["select", "*"], ORG, ["eq", "week_start", SEMANA], ["maybeSingle"]],
    ],
  },
  {
    nombre: "getWeeklyCompletionStatus",
    llamar: () => getWeeklyCompletionStatus(),
    valor: { completed: ["sales", "delivery"], total: 5 },
    consultas: [CONSULTA_INPUTS],
  },
  {
    nombre: "listExecutiveReportsAction",
    llamar: () => listExecutiveReportsAction(),
    valor: [REPORTE_EJECUTIVO_MAPEADO],
    consultas: [
      [
        "executive_reports",
        ["select", COLUMNAS_REPORTES],
        ORG,
        ["order", "generated_at", { ascending: false }],
      ],
    ],
  },
  {
    nombre: "getExecutiveReportByIdAction",
    llamar: () => getExecutiveReportByIdAction(UUID_REPORTE),
    valor: REPORTE_EJECUTIVO_MAPEADO,
    consultas: [
      [
        "executive_reports",
        ["select", COLUMNAS_REPORTES],
        ORG,
        ["eq", "id", UUID_REPORTE],
        ["maybeSingle"],
      ],
    ],
  },
  {
    nombre: "getSalesFrameworksAction",
    llamar: () => getSalesFrameworksAction(),
    valor: FRAMEWORKS,
    consultas: [
      [
        "sales_frameworks",
        ["select", "*"],
        ORG,
        ["eq", "is_active", true],
        ["order", "created_at", { ascending: false }],
      ],
    ],
  },
  {
    nombre: "getSopVideoJobAction",
    llamar: () => getSopVideoJobAction("job-1"),
    valor: JOB_MAPEADO,
    consultas: [
      ["sop_generation_jobs", ["select", "*"], ["eq", "id", "job-1"], ORG, ["maybeSingle"]],
    ],
  },
];

/** Las llamadas a mano: la de un reporte va con un id inválido, que antes devolvía `null` sin chequear. */
const LLAMADAS_A_MANO: Array<[string, () => Promise<unknown>]> = CASOS.map((caso) => [
  caso.nombre,
  caso.nombre === "getExecutiveReportByIdAction"
    ? () => getExecutiveReportByIdAction("x")
    : caso.llamar,
]);

beforeEach(() => {
  sim.llamadasAPermisos = 0;
  sim.lecturas = [];
  sim.consultas = [];
  sim.tablas = TABLAS;
});

describe("las 10 lecturas de Operaciones", () => {
  it.each(LLAMADAS_A_MANO)(
    "⭐ %s, llamada a mano por un member sin Operaciones: devuelve el rechazo y no lee nada",
    async (_nombre, llamar) => {
      sim.permisos = memberSinOperaciones();
      expect(await llamar()).toEqual(RECHAZO);
      expect(sim.lecturas).toEqual([]);
      expect(sim.consultas).toEqual([]);
    }
  );

  const quienesTienenOperaciones: Array<[string, () => UserPermissions]> = [
    ["el founder", () => FOUNDER],
    ["un member con Operaciones", () => member({ operations: "view" })],
    ["alguien sin rol", () => member({}, false)],
  ];

  describe.each(quienesTienenOperaciones)("%s", (_quien, permisos) => {
    it.each(CASOS.map((caso) => [caso.nombre, caso] as const))(
      "%s devuelve lo mismo y hace las mismas consultas que antes del chequeo",
      async (_nombre, caso) => {
        sim.permisos = permisos();
        expect(await caso.llamar()).toEqual(caso.valor);
        expect(sim.consultas).toEqual(caso.consultas);
      }
    );
  });

  it("getExecutiveReportByIdAction con un id inválido y el módulo devuelve null sin consultar", async () => {
    sim.permisos = member({ operations: "view" });
    expect(await getExecutiveReportByIdAction("x")).toBeNull();
    expect(sim.consultas).toEqual([]);
  });

  it("getExecutiveReportByIdAction de un reporte que no existe devuelve null", async () => {
    sim.permisos = member({ operations: "view" });
    sim.tablas = { ...TABLAS, executive_reports: [] };
    expect(await getExecutiveReportByIdAction(UUID_REPORTE)).toBeNull();
  });
});

describe("las que leen los inputs de la semana miran los permisos una sola vez", () => {
  it.each([
    ["getWeeklyCompletionStatus", () => getWeeklyCompletionStatus()],
    ["getWeeklyInputsForWeekAction", () => getWeeklyInputsForWeekAction(SEMANA)],
  ] as const)("%s lee los permisos exactamente 1 vez", async (_nombre, llamar) => {
    sim.permisos = member({ operations: "full" });
    await llamar();
    expect(sim.llamadasAPermisos).toBe(1);
  });
});

describe("countWeeklyInputsForWeek, sin llamador y sin chequeo", () => {
  it("⭐ cuenta los departamentos de la semana para quien no tiene Operaciones, sin leer permisos", async () => {
    sim.permisos = memberSinOperaciones();
    expect(await countWeeklyInputsForWeek(SEMANA)).toBe(2);
    expect(sim.llamadasAPermisos).toBe(0);
    expect(sim.consultas).toEqual([CONSULTA_INPUTS]);
  });
});
