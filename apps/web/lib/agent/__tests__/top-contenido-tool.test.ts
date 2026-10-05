import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-172: la tool `get_top_performing_content` le dice al agente cuántas
 * piezas quedaron fuera del ranking por no tener métricas.
 */

const sim = vi.hoisted(() => ({
  respuesta: { piezas: [] as Array<Record<string, unknown>>, sinMetricas: 0 },
}));

vi.mock("@/app/marketing/content/actions", () => ({
  getTopPerformingContentAction: async () => sim.respuesta,
}));

import { createAgentToolHandler } from "../agent-tool-handler";

function handler() {
  return createAgentToolHandler({
    organizationId: "org-1",
    conversationId: "conv-1",
    supabase: {} as SupabaseClient,
    state: { canvasFromDocument: null, createdProposals: [], generatedDocuments: [] },
  });
}

describe("get_top_performing_content", () => {
  beforeEach(() => {
    sim.respuesta = { piezas: [], sinMetricas: 0 };
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
