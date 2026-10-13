import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-516: los planes y las duraciones de plan devuelven sus errores
 * esperables como valor. Antes el editor de planes mostraba el texto crudo de
 * la base ("TypeError: fetch failed", una RLS en inglés), la lista de planes
 * devolvía `[]` ante una falla (Cobros y el cierre de venta veían "sin
 * planes") y las duraciones lanzaban "Solo el founder..." como `Error` común
 * dentro de `runMutation`.
 */

const sim = vi.hoisted(() => ({
  configurado: true,
  clientes: [] as Array<{ offeredProduct?: string }>,
  extraer: null as null | (() => Promise<unknown>),
}));

vi.mock("@/lib/observability/reportar-falla", async () => {
  const { base } = await import("./supabase-falso");
  return {
    reportarFalla: (error: unknown, contexto: unknown) => base.reportes.push({ error, contexto }),
  };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => sim.configurado }));
vi.mock("@/lib/supabase/server", async () => {
  const { base } = await import("./supabase-falso");
  return { createClient: async () => base.cliente() };
});
vi.mock("@/lib/auth/bootstrap", async () => {
  const { base, ORG, esTablaFaltante } = await import("./supabase-falso");
  const { ErrorEsperable } = await import("@/lib/server/error-esperable");
  return {
    requireOrganizationId: async () => {
      if (!base.sesion) throw new ErrorEsperable("Sesión no válida");
      return ORG;
    },
    getCurrentProfile: async () => base.perfil,
    isMissingTableError: esTablaFaltante,
  };
});
vi.mock("@/lib/sales/pagos", () => ({ leerPagosDeLaOrganizacion: async () => [] }));
vi.mock("@/app/clients/actions", () => ({
  listClientsAction: async () => sim.clientes,
}));
vi.mock("@/lib/rag/extract-plan-durations", () => ({
  extractPlanDurationsFromRAG: async (_org: string, nombres: string[]) =>
    sim.extraer
      ? sim.extraer()
      : nombres.map((plan_name) => ({ plan_name, duration_days: 90, confidence: "high" })),
}));

import {
  createPlanAction,
  deletePlanAction,
  listPlansAction,
  updatePlanAction,
} from "../plan-actions";
import {
  getClientsTableEnrichmentAction,
  listPlanDurationsAction,
  resolvePlanDurationsAction,
  updatePlanDurationAction,
} from "../plan-duration-actions";
import { base, ORG, OTRA_ORG, TEXTO_FIJO } from "./supabase-falso";
import { AI_KEY_REJECTED_MESSAGE } from "@/lib/ai/anthropic-auth-errors";
import { claudeNoCreditsUserMessage } from "@/lib/ai/anthropic-errors";

const PLAN = "22222222-2222-4222-8222-222222222222";
const PLAN_AJENO = "33333333-3333-4333-8333-333333333333";
const FETCH_FAILED = { message: "TypeError: fetch failed" };

function planFila(id: string, org: string, name = "Mentoría") {
  return {
    id,
    organization_id: org,
    name,
    duration_days: 90,
    installment_systems: [],
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  };
}

let consola: ReturnType<typeof vi.spyOn>;
let aviso: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  base.reiniciar();
  sim.configurado = true;
  sim.clientes = [];
  sim.extraer = null;
  base.tablas.plans = [planFila(PLAN, ORG), planFila(PLAN_AJENO, OTRA_ORG, "Ajeno")];
  base.tablas.plan_durations = [];
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
  aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  consola.mockRestore();
  aviso.mockRestore();
});

describe("listPlansAction", () => {
  it("devuelve los planes", async () => {
    // Sin filtro propio: la RLS de `plans` decide qué ve la sesión (no cambia).
    base.tablas.plans = [planFila(PLAN, ORG)];
    const r = await listPlansAction();
    expect(r).toMatchObject({ success: true, data: [{ id: PLAN, name: "Mentoría" }] });
  });

  it("sin Supabase configurado, la lista vacía (como antes)", async () => {
    sim.configurado = false;
    await expect(listPlansAction()).resolves.toEqual({ success: true, data: [] });
  });

  it("⭐ una falla de la base ya no es \"sin planes\": texto fijo y se reporta", async () => {
    base.errores.plans = FETCH_FAILED;
    await expect(listPlansAction()).resolves.toEqual({ success: false, error: TEXTO_FIJO });
    expect(base.reportes).toEqual([
      {
        error: expect.objectContaining({ name: "FallaDeLaBase", message: "TypeError: fetch failed" }),
        contexto: { accion: "[listPlans]" },
      },
    ]);
  });
});

describe("createPlanAction", () => {
  it("crea el plan en la organización de la sesión", async () => {
    const r = await createPlanAction({ name: "  Premium  ", durationDays: 30 });
    expect(r).toMatchObject({ success: true, data: { name: "Premium", durationDays: 30 } });
    expect(base.escrituras()[0]).toMatchObject({
      tabla: "plans",
      op: "insert",
      valores: { organization_id: ORG, name: "Premium" },
    });
  });

  it("⭐ sin nombre vuelve con el motivo, sin escribir", async () => {
    await expect(createPlanAction({ name: " " })).resolves.toEqual({
      success: false,
      error: "El nombre es obligatorio",
    });
    expect(base.escrituras()).toEqual([]);
  });

  it("sin Supabase configurado devuelve el motivo", async () => {
    sim.configurado = false;
    await expect(createPlanAction({ name: "Plan" })).resolves.toEqual({
      success: false,
      error: "Supabase no configurado",
    });
  });

  it("sin sesión devuelve el motivo y no se reporta", async () => {
    base.sesion = false;
    await expect(createPlanAction({ name: "Plan" })).resolves.toEqual({
      success: false,
      error: "Sesión no válida",
    });
    expect(base.reportes).toEqual([]);
  });

  it("⭐ una RLS que rechaza no llega cruda: texto fijo y se reporta", async () => {
    base.errores["plans:insert"] = {
      message: 'new row violates row-level security policy for table "plans"',
      code: "42501",
    };
    const r = await createPlanAction({ name: "Plan" });
    expect(r).toEqual({ success: false, error: TEXTO_FIJO });
    expect(JSON.stringify(r)).not.toContain("row-level");
    expect(base.reportes).toHaveLength(1);
  });
});

describe("updatePlanAction", () => {
  it("actualiza filtrando por id y organización", async () => {
    const r = await updatePlanAction(PLAN, { name: "Nuevo nombre" });
    expect(r).toMatchObject({ success: true, data: { id: PLAN, name: "Nuevo nombre" } });
    expect(base.escrituras()[0].filtros).toEqual([
      ["id", PLAN],
      ["organization_id", ORG],
    ]);
  });

  it("⭐ un plan de otra organización vuelve como no encontrado, sin tocarlo", async () => {
    await expect(updatePlanAction(PLAN_AJENO, { name: "Robado" })).resolves.toEqual({
      success: false,
      error: "No se encontró el plan. Puede que lo hayan eliminado.",
    });
    expect(base.tablas.plans.find((p) => p.id === PLAN_AJENO)?.name).toBe("Ajeno");
    expect(base.reportes).toEqual([]);
  });

  it("sin Supabase configurado devuelve el motivo", async () => {
    sim.configurado = false;
    await expect(updatePlanAction(PLAN, { name: "x" })).resolves.toEqual({
      success: false,
      error: "Supabase no configurado",
    });
  });
});

describe("deletePlanAction", () => {
  it("borra filtrando por id y organización", async () => {
    await expect(deletePlanAction(PLAN)).resolves.toEqual({ success: true, data: undefined });
    expect(base.escrituras()[0]).toMatchObject({
      op: "delete",
      filtros: [
        ["id", PLAN],
        ["organization_id", ORG],
      ],
    });
    expect(base.tablas.plans.map((p) => p.id)).toEqual([PLAN_AJENO]);
  });

  it("⭐ un plan de otra organización no se borra", async () => {
    await deletePlanAction(PLAN_AJENO);
    expect(base.tablas.plans.map((p) => p.id)).toContain(PLAN_AJENO);
  });

  it("sin sesión devuelve el motivo", async () => {
    base.sesion = false;
    await expect(deletePlanAction(PLAN)).resolves.toEqual({
      success: false,
      error: "Sesión no válida",
    });
  });
});

describe("listPlanDurationsAction", () => {
  it("devuelve las duraciones de la organización", async () => {
    base.tablas.plan_durations = [
      { id: "d1", organization_id: ORG, plan_name: "Mentoría", duration_days: 90, source: "manual" },
      { id: "d2", organization_id: OTRA_ORG, plan_name: "Ajeno", duration_days: 30, source: "manual" },
    ];
    const r = await listPlanDurationsAction();
    expect(r).toMatchObject({ success: true, data: [{ id: "d1", planName: "Mentoría" }] });
    expect(r.success && r.data).toHaveLength(1);
  });

  it("sin la tabla, la lista vacía (la migración no corrió)", async () => {
    base.errores.plan_durations = { message: 'relation "plan_durations" does not exist' };
    await expect(listPlanDurationsAction()).resolves.toEqual({ success: true, data: [] });
    expect(base.reportes).toEqual([]);
  });

  it("⭐ una falla de la base ya no es la lista vacía: texto fijo y se reporta", async () => {
    base.errores.plan_durations = FETCH_FAILED;
    await expect(listPlanDurationsAction()).resolves.toEqual({ success: false, error: TEXTO_FIJO });
    expect(base.reportes).toHaveLength(1);
  });

  it("sin sesión devuelve el motivo", async () => {
    base.sesion = false;
    await expect(listPlanDurationsAction()).resolves.toEqual({
      success: false,
      error: "Sesión no válida",
    });
  });
});

describe("getClientsTableEnrichmentAction (duraciones)", () => {
  it("⭐ si las duraciones no se pueden leer, sigue con lo cobrado y la falla queda registrada", async () => {
    base.errores.plan_durations = FETCH_FAILED;
    await expect(getClientsTableEnrichmentAction()).resolves.toEqual({
      success: true,
      data: { paidByClientId: {}, planDurations: [], isFounder: true },
    });
    expect(base.reportes).toEqual([
      {
        error: expect.objectContaining({ name: "FallaDeLaBase", message: "TypeError: fetch failed" }),
        contexto: { lectura: "cobros:duraciones-de-plan" },
      },
    ]);
  });
});

describe("resolvePlanDurationsAction", () => {
  it("infiere y guarda las duraciones en la organización de la sesión", async () => {
    await expect(resolvePlanDurationsAction(["Mentoría"])).resolves.toEqual({
      success: true,
      data: { resolved: 1 },
    });
    expect(base.escrituras()[0]).toMatchObject({
      tabla: "plan_durations",
      op: "upsert",
      valores: { organization_id: ORG, plan_name: "Mentoría", duration_days: 90, source: "rag" },
    });
  });

  it("⭐ quien no es founder recibe el motivo, sin escribir ni reportar", async () => {
    base.perfil = { id: "yo", role: "member" };
    await expect(resolvePlanDurationsAction(["Mentoría"])).resolves.toEqual({
      success: false,
      error: "Solo el founder puede gestionar duraciones de planes",
    });
    expect(base.escrituras()).toEqual([]);
    expect(base.reportes).toEqual([]);
  });

  it("sin planes devuelve el motivo", async () => {
    await expect(resolvePlanDurationsAction()).resolves.toEqual({
      success: false,
      error: "No hay planes para inferir. Asigná productos a los clientes primero.",
    });
  });

  it.each([
    ["clave rechazada", AI_KEY_REJECTED_MESSAGE],
    ["sin créditos", claudeNoCreditsUserMessage()],
  ])("⭐ Claude con %s vuelve con su motivo y no se reporta", async (_n, mensaje) => {
    sim.extraer = async () => {
      throw new Error(mensaje);
    };
    await expect(resolvePlanDurationsAction(["Mentoría"])).resolves.toEqual({
      success: false,
      error: mensaje,
    });
    expect(base.reportes).toEqual([]);
  });

  it("otra falla de Claude es inesperada: texto fijo y se reporta", async () => {
    const falla = new Error("529 overloaded");
    sim.extraer = async () => {
      throw falla;
    };
    await expect(resolvePlanDurationsAction(["Mentoría"])).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
    expect(base.reportes).toEqual([{ error: falla, contexto: { accion: "[resolvePlanDurations]" } }]);
  });

  it("si falta la tabla al guardar, el motivo con la migración", async () => {
    base.errores["plan_durations:upsert"] = { message: 'relation "plan_durations" does not exist' };
    const r = await resolvePlanDurationsAction(["Mentoría"]);
    expect(r).toEqual({
      success: false,
      error:
        "Falta la tabla plan_durations. Ejecutá supabase/migrations/20260720100000_clients_offered_product_and_plan_durations.sql",
    });
  });
});

describe("updatePlanDurationAction", () => {
  it("guarda la corrección manual en la organización de la sesión", async () => {
    const r = await updatePlanDurationAction({ planName: "Mentoría", durationDays: 60 });
    expect(r).toMatchObject({ success: true, data: { planName: "Mentoría", durationDays: 60 } });
    expect(base.escrituras()[0].valores).toMatchObject({
      organization_id: ORG,
      source: "manual",
    });
  });

  it("⭐ un dato inválido vuelve con el mensaje de validación, sin escribir", async () => {
    await expect(updatePlanDurationAction({ planName: "", durationDays: 60 })).resolves.toEqual({
      success: false,
      error: "Falta el nombre del plan.",
    });
    await expect(updatePlanDurationAction({ planName: "Plan", durationDays: 0 })).resolves.toEqual({
      success: false,
      error: "La duración tiene que ser de al menos 1 día.",
    });
    expect(base.escrituras()).toEqual([]);
    expect(base.reportes).toEqual([]);
  });

  it("⭐ quien no es founder recibe el motivo", async () => {
    base.perfil = { id: "yo", role: "member" };
    await expect(
      updatePlanDurationAction({ planName: "Mentoría", durationDays: 60 })
    ).resolves.toEqual({
      success: false,
      error: "Solo el founder puede gestionar duraciones de planes",
    });
  });
});

describe("lo inesperado (SCRUM-516)", () => {
  const casos = [
    ["listPlansAction", () => listPlansAction(), "[listPlans]"],
    ["createPlanAction", () => createPlanAction({ name: "Plan" }), "[createPlan]"],
    ["updatePlanAction", () => updatePlanAction(PLAN, { name: "x" }), "[updatePlan]"],
    ["deletePlanAction", () => deletePlanAction(PLAN), "[deletePlan]"],
    ["listPlanDurationsAction", () => listPlanDurationsAction(), "[listPlanDurations]"],
    ["resolvePlanDurationsAction", () => resolvePlanDurationsAction(["Mentoría"]), "[resolvePlanDurations]"],
    [
      "updatePlanDurationAction",
      () => updatePlanDurationAction({ planName: "Mentoría", durationDays: 60 }),
      "[updatePlanDuration]",
    ],
  ] as const;

  it.each(casos)(
    "⭐ %s: una excepción de la red devuelve el texto fijo y se registra y reporta",
    async (_n, correr, etiqueta) => {
      const falla = new TypeError("fetch failed: connect ECONNREFUSED 10.0.0.5:5432");
      base.lanza = falla;
      const r = await correr();
      expect(r).toEqual({ success: false, error: TEXTO_FIJO });
      expect(JSON.stringify(r)).not.toContain("ECONNREFUSED");
      expect(consola).toHaveBeenCalledWith(etiqueta, falla);
      expect(base.reportes).toEqual([{ error: falla, contexto: { accion: etiqueta } }]);
    }
  );

  it.each(casos.filter(([n]) => n !== "listPlanDurationsAction"))(
    "⭐ %s: el error de supabase-js devuelve el texto fijo y se reporta",
    async (_n, correr, etiqueta) => {
      base.errores.plans = FETCH_FAILED;
      base.errores.plan_durations = FETCH_FAILED;
      const r = await correr();
      expect(r).toEqual({ success: false, error: TEXTO_FIJO });
      expect(base.reportes).toEqual([
        {
          error: expect.objectContaining({ message: "TypeError: fetch failed" }),
          contexto: { accion: etiqueta },
        },
      ]);
    }
  );
});
