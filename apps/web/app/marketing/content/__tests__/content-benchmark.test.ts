import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-172: el benchmark de métricas de la org promedia todas las piezas
 * medidas, aunque pasen el corte de 1.000 filas de PostgREST, y nunca las que
 * no tienen métricas.
 */

const sim = vi.hoisted(() => ({
  filas: [] as Array<Record<string, unknown>>,
  paginas: 0,
  error: null as { message: string } | null,
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/auth/bootstrap", () => ({
  getCurrentProfile: async () => ({ organization_id: "org-1" }),
}));
vi.mock("@/lib/ai/anthropic", () => ({}));
vi.mock("@/lib/content/transcribe-whisper", () => ({}));
vi.mock("@/lib/zernio/integration", () => ({}));
vi.mock("@/lib/marketing/content-sales-attribution", () => ({}));
vi.mock("@/app/marketing/content/drive-actions", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from() {
      const filtros: Array<(f: Record<string, unknown>) => boolean> = [];
      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          filtros.push((f) => f[col] === val);
          return builder;
        },
        not: (col: string, op: string, val: unknown) => {
          if (op === "is" && val === null) filtros.push((f) => f[col] !== null);
          return builder;
        },
        order: () => builder,
        range: async (from: number, to: number) => {
          sim.paginas += 1;
          if (sim.error) return { data: null, error: sim.error };
          // PostgREST: nunca devuelve más de 1.000 filas por pedido.
          const visibles = sim.filas.filter((f) => filtros.every((fn) => fn(f)));
          return { data: visibles.slice(from, Math.min(to + 1, from + 1000)), error: null };
        },
      };
      return builder;
    },
  }),
}));

import { getContentBenchmarkAction } from "@/app/marketing/content/actions";

beforeEach(() => {
  sim.filas = [];
  sim.paginas = 0;
  sim.error = null;
});

describe("getContentBenchmarkAction", () => {
  it("⭐ promedia las 1.500 piezas medidas, en dos páginas, sin truncar en 1.000", async () => {
    // Las primeras 1.000 con 100 views y las 500 siguientes con 400:
    // el promedio real es 200; truncado en 1.000 daría 100.
    for (let i = 0; i < 1500; i++) {
      sim.filas.push({
        id: `p-${String(i).padStart(5, "0")}`,
        organization_id: "org-1",
        type: "reel",
        metrics: { views: i < 1000 ? 100 : 400, likes: 10 },
      });
    }

    const r = await getContentBenchmarkAction();

    expect(r.totalPieces).toBe(1500);
    expect(r.avgViews).toBe(200);
    expect(sim.paginas).toBe(2);
  });

  it("no cuenta las piezas sin métricas ni las de otra org", async () => {
    sim.filas.push(
      { id: "a", organization_id: "org-1", type: "reel", metrics: { views: 300 } },
      { id: "b", organization_id: "org-1", type: "reel", metrics: null },
      { id: "c", organization_id: "org-2", type: "reel", metrics: { views: 9000 } }
    );

    const r = await getContentBenchmarkAction();

    expect(r.totalPieces).toBe(1);
    expect(r.avgViews).toBe(300);
  });

  it("filtra por tipo", async () => {
    sim.filas.push(
      { id: "a", organization_id: "org-1", type: "reel", metrics: { views: 300 } },
      { id: "b", organization_id: "org-1", type: "post", metrics: { views: 50 } }
    );

    const r = await getContentBenchmarkAction("post");

    expect(r).toMatchObject({ totalPieces: 1, avgViews: 50 });
  });

  it("si la base falla, lanza en vez de devolver promedios en cero", async () => {
    sim.error = { message: "la base no respondió" };

    await expect(getContentBenchmarkAction()).rejects.toThrow("la base no respondió");
  });
});
