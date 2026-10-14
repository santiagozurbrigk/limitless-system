import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-519: el reporte de patrones de contenido devuelve sus errores
 * esperables como valor. Antes lanzaba: en producción el usuario veía el
 * párrafo de Next en vez de "No hay piezas publicadas en el rango", y el texto
 * crudo de la base o de Claude si algo fallaba.
 *
 * Nunca se llama a Claude: `callClaudeText` es un doble.
 */

const sim = vi.hoisted(() => ({
  claude: null as null | (() => Promise<string | null>),
  prompts: [] as string[],
}));

vi.mock("@/lib/observability/reportar-falla", async () => {
  const { base } = await import("./base-falsa");
  return {
    reportarFalla: (error: unknown, contexto: unknown) => base.reportes.push({ error, contexto }),
  };
});
vi.mock("@/lib/supabase/server", async () => {
  const { base } = await import("./base-falsa");
  return { createClient: async () => base.cliente() };
});
vi.mock("@/lib/auth/bootstrap", async () => {
  const { base, ORG } = await import("./base-falsa");
  const { ErrorEsperable } = await import("@/lib/server/error-esperable");
  return {
    requireOrganizationId: async () => {
      if (!base.sesion) throw new ErrorEsperable("Sesión no válida");
      return ORG;
    },
  };
});
vi.mock("@/lib/ai/anthropic", () => ({
  callClaudeText: async (pedido: { messages: Array<{ content: string }> }) => {
    sim.prompts.push(pedido.messages[0].content);
    return sim.claude ? sim.claude() : null;
  },
}));

import {
  generateContentPatternReportAction,
  getLatestContentPatternReportAction,
} from "../content/pattern-report-actions";
import { AI_KEY_REJECTED_MESSAGE } from "@/lib/ai/anthropic-auth-errors";
import { base, ORG, OTRA_ORG, TEXTO_FIJO } from "./base-falsa";

const FETCH_FAILED = { message: "TypeError: fetch failed" };
const SIN_PIEZAS = "No hay piezas publicadas en el rango seleccionado. Probá con un rango más amplio.";
const RANGO_INVALIDO = "El rango del análisis no es válido.";

function pieza(id: string, org: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    organization_id: org,
    status: "published",
    variants_of: null,
    format_type: "talking_head",
    hook_type: "curiosidad",
    published_at: "2026-10-01T00:00:00Z",
    analysis: { dolor: { name: "Falta de tiempo" } },
    ...extra,
  };
}

let consola: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  base.reiniciar();
  sim.claude = async () =>
    JSON.stringify({ summary: "Resumen", suggestions: "Más hooks", sample_size_notes: "ok" });
  sim.prompts = [];
  base.tablas.content_pieces = [
    pieza("p1", ORG),
    pieza("p2", ORG, { status: "draft" }),
    pieza("p3", OTRA_ORG),
    pieza("p4", ORG, { variants_of: "p1" }),
  ];
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => consola.mockRestore());

function esperarFallaRegistrada(etiqueta: string) {
  expect(base.reportes).toHaveLength(1);
  expect(base.reportes[0].contexto).toEqual({ accion: etiqueta });
  expect(consola).toHaveBeenCalledWith(etiqueta, expect.anything());
}

describe("generateContentPatternReportAction", () => {
  it("analiza las piezas publicadas de la organización y guarda el reporte", async () => {
    const r = await generateContentPatternReportAction({ type: "COUNT", count: 30 });
    expect(r).toMatchObject({
      success: true,
      data: { organization_id: ORG, content_ids: ["p1"], summary: "Resumen", range_value: "30" },
    });
    expect(base.filtrosDe("content_pieces", "select")).toEqual([
      ["organization_id", ORG],
      ["status", "published"],
      ["is:variants_of", null],
    ]);
    expect(base.escrituras()[0]).toMatchObject({
      tabla: "content_pattern_reports",
      op: "insert",
      valores: { organization_id: ORG, content_ids: ["p1"] },
    });
  });

  it("con un rango de fechas, filtra por la fecha de publicación", async () => {
    const r = await generateContentPatternReportAction({
      type: "DATE_RANGE",
      from: "2026-09-01",
      to: "2026-10-31",
    });
    expect(r).toMatchObject({ success: true, data: { range_value: "2026-09-01:2026-10-31" } });
    expect(base.filtrosDe("content_pieces", "select")).toContainEqual(["gte:published_at", "2026-09-01"]);
  });

  it.each([
    [{ type: "COUNT", count: 45 }],
    [{ type: "DATE_RANGE", from: "ayer", to: "2026-10-31" }],
    [{ type: "OTRO" }],
  ])("⭐ un rango inválido (%j) vuelve con el motivo sin llegar a la base", async (params) => {
    await expect(
      generateContentPatternReportAction(params as never)
    ).resolves.toEqual({ success: false, error: RANGO_INVALIDO });
    expect(base.operaciones).toEqual([]);
  });

  it("⭐ sin piezas publicadas en el rango vuelve con el motivo (antes, el párrafo de Next)", async () => {
    base.tablas.content_pieces = [pieza("p3", OTRA_ORG)];
    await expect(generateContentPatternReportAction({ type: "COUNT", count: 30 })).resolves.toEqual({
      success: false,
      error: SIN_PIEZAS,
    });
    expect(base.reportes).toEqual([]);
    expect(sim.prompts).toEqual([]);
  });

  it("⭐ si falla la lectura de las piezas, texto fijo y se registra", async () => {
    base.errores.content_pieces = FETCH_FAILED;
    await expect(generateContentPatternReportAction({ type: "COUNT", count: 30 })).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
    esperarFallaRegistrada("[generateContentPatternReport]");
  });

  it("si falla el guardado, texto fijo y se registra", async () => {
    base.errores["content_pattern_reports:insert"] = FETCH_FAILED;
    await expect(generateContentPatternReportAction({ type: "COUNT", count: 30 })).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
    esperarFallaRegistrada("[generateContentPatternReport]");
  });

  it("⭐ con la clave de Claude rechazada, el motivo de Ajustes y sin registrar", async () => {
    sim.claude = async () => {
      throw new Error(AI_KEY_REJECTED_MESSAGE);
    };
    await expect(generateContentPatternReportAction({ type: "COUNT", count: 30 })).resolves.toEqual({
      success: false,
      error: AI_KEY_REJECTED_MESSAGE,
    });
    expect(base.reportes).toEqual([]);
    expect(base.escrituras()).toEqual([]);
  });

  it("si Claude falla por otra cosa, texto fijo y se registra", async () => {
    sim.claude = async () => {
      throw new TypeError("fetch failed");
    };
    await expect(generateContentPatternReportAction({ type: "COUNT", count: 30 })).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
    esperarFallaRegistrada("[generateContentPatternReport]");
  });

  it("sin clave de IA (Claude devuelve null), el reporte sale sin texto, como antes", async () => {
    sim.claude = async () => null;
    const r = await generateContentPatternReportAction({ type: "COUNT", count: 30 });
    expect(r).toMatchObject({ success: true, data: { summary: "" } });
  });

  it("sin sesión, el motivo", async () => {
    base.sesion = false;
    await expect(generateContentPatternReportAction({ type: "COUNT", count: 30 })).resolves.toEqual({
      success: false,
      error: "Sesión no válida",
    });
  });
});

describe("getLatestContentPatternReportAction", () => {
  it("devuelve el último reporte de la organización", async () => {
    // El de la otra org va primero: sin el filtro por organización se tomaría ese.
    base.tablas.content_pattern_reports = [
      { id: "r-ajeno", organization_id: OTRA_ORG, generated_at: "2026-10-12" },
      { id: "r-propio", organization_id: ORG, generated_at: "2026-10-10" },
    ];
    await expect(getLatestContentPatternReportAction()).resolves.toMatchObject({
      success: true,
      data: { id: "r-propio" },
    });
    expect(base.filtrosDe("content_pattern_reports", "select")).toEqual([["organization_id", ORG]]);
  });

  it("sin reportes, null", async () => {
    await expect(getLatestContentPatternReportAction()).resolves.toEqual({ success: true, data: null });
  });

  it("⭐ si la lectura falla, texto fijo (antes lanzaba el texto crudo)", async () => {
    base.errores.content_pattern_reports = FETCH_FAILED;
    await expect(getLatestContentPatternReportAction()).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
    esperarFallaRegistrada("[getLatestContentPatternReport]");
  });

  it("sin sesión, el motivo", async () => {
    base.sesion = false;
    await expect(getLatestContentPatternReportAction()).resolves.toEqual({
      success: false,
      error: "Sesión no válida",
    });
  });
});
