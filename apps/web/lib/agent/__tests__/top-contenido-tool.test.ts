import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-172: la tool `get_top_performing_content` le dice al agente cuántas
 * piezas quedaron fuera del ranking por no tener métricas.
 */

const sim = vi.hoisted(() => ({
  respuesta: { piezas: [] as Array<Record<string, unknown>>, sinMetricas: 0 },
  fallas: {} as Record<string, string>,
}));

// Las tres acciones de Contenido devuelven `MutationResult` (SCRUM-502).
vi.mock("@/app/marketing/content/actions", () => {
  const resultado = (nombre: string, data: unknown) =>
    sim.fallas[nombre] ? { success: false, error: sim.fallas[nombre] } : { success: true, data };
  return {
    getTopPerformingContentAction: async () => resultado("top", sim.respuesta),
    analyzeContentPieceAction: async () =>
      resultado("analizar", {
        formato: { name: "F" },
        dolor: { name: "D" },
        angulo: { name: "A" },
        why_it_worked: "W",
      }),
    createContentVariantsAction: async () => resultado("variantes", ["v1", "v2"]),
  };
});

import { createAgentToolHandler } from "../agent-tool-handler";

function handler() {
  return createAgentToolHandler({
    organizationId: "org-1",
    conversationId: "conv-1",
    supabase: {} as SupabaseClient,
    state: { canvasFromDocument: null, createdProposals: [], generatedDocuments: [] },
  });
}

beforeEach(() => {
  sim.respuesta = { piezas: [], sinMetricas: 0 };
  sim.fallas = {};
});

describe("get_top_performing_content", () => {
  it("⭐ (SCRUM-502) si la acción vuelve con error, el agente recibe el motivo", async () => {
    sim.fallas.top = "Sesión no válida";
    const json = JSON.parse(await handler()("get_top_performing_content", { metric: "views" }));
    expect(json).toEqual({
      success: false,
      error: "Sesión no válida",
      suggestion:
        "Reintentá con type_filter='all' y metric='engagement_total'. Si el error persiste, informá al usuario que no se pudo acceder a las métricas de contenido.",
    });
  });

  it("⭐ con piezas sin métricas incluye piezas_sin_metricas en la respuesta", async () => {
    sim.respuesta = { piezas: [{ id: "p1", score: 10 }], sinMetricas: 4 };
    const json = JSON.parse(await handler()("get_top_performing_content", { metric: "views" }));
    expect(json).toMatchObject({ success: true, count: 1, piezas_sin_metricas: 4 });
    expect(json.nota_sin_metricas).toContain("no tienen métricas todavía");
  });

  it("con el ranking vacío también avisa cuántas piezas no tienen métricas", async () => {
    sim.respuesta = { piezas: [], sinMetricas: 2 };
    const json = JSON.parse(await handler()("get_top_performing_content", { metric: "views" }));
    expect(json).toMatchObject({ success: true, count: 0, piezas_sin_metricas: 2 });
  });

  it("sin piezas sin métricas no agrega el campo", async () => {
    sim.respuesta = { piezas: [{ id: "p1", score: 10 }], sinMetricas: 0 };
    const json = JSON.parse(await handler()("get_top_performing_content", { metric: "views" }));
    expect(json).not.toHaveProperty("piezas_sin_metricas");
  });
});

describe("analyze_content_piece y create_content_variants (SCRUM-502)", () => {
  it("con éxito devuelven el análisis y las variantes", async () => {
    const analisis = JSON.parse(await handler()("analyze_content_piece", { content_piece_id: "p1" }));
    expect(analisis).toMatchObject({ success: true, analysis: { formato: "F", dolor: "D", angulo: "A" } });
    const variantes = JSON.parse(await handler()("create_content_variants", { source_content_id: "p1", count: 2 }));
    expect(variantes).toMatchObject({ success: true, variant_ids: ["v1", "v2"], count: 2 });
  });

  it("⭐ si la acción vuelve con error, el agente recibe el motivo", async () => {
    sim.fallas.analizar = "Esta pieza no tiene un video de Drive vinculado.";
    sim.fallas.variantes = "Ocurrió un error inesperado. Intentá de nuevo.";
    const analisis = JSON.parse(await handler()("analyze_content_piece", { content_piece_id: "p1" }));
    expect(analisis).toMatchObject({ success: false, error: "Esta pieza no tiene un video de Drive vinculado." });
    const variantes = JSON.parse(await handler()("create_content_variants", { source_content_id: "p1" }));
    expect(variantes).toEqual({ success: false, error: "Ocurrió un error inesperado. Intentá de nuevo." });
  });
});
