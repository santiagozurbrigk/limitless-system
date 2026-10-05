import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-172 (reabierta): el ranking de contenido se calcula sobre todas las
 * piezas de la org (antes `.limit(100)` sin orden: 100 piezas cualquiera) y
 * devuelve cuántas quedaron afuera por no tener métricas.
 */

type Fila = {
  id: string;
  organization_id: string;
  source: string;
  type: string;
  variants_of: string | null;
  title: string;
  metrics: Record<string, number> | null;
  sales_attributed: null;
};

const sim = vi.hoisted(() => ({
  filas: [] as Array<Record<string, unknown>>,
  pedidosDeDetalle: [] as string[][],
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/auth/bootstrap", () => ({
  getCurrentProfile: async () => ({ organization_id: "org-1" }),
}));
vi.mock("@/lib/ai/anthropic", () => ({}));
vi.mock("@/lib/content/transcribe-whisper", () => ({}));
vi.mock("@/lib/zernio/integration", () => ({}));
vi.mock("@/lib/marketing/content-sales-attribution", () => ({
  computeSalesAttributionForOrg: async () => new Map(),
}));
vi.mock("@/app/marketing/content/drive-actions", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from() {
      const filtros: Array<(f: Record<string, unknown>) => boolean> = [];
      let ids: string[] | null = null;
      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          filtros.push((f) => f[col] === val);
          return builder;
        },
        is: (col: string, val: unknown) => {
          filtros.push((f) => f[col] === val);
          return builder;
        },
        order: () => builder,
        range: async (from: number, to: number) => {
          // PostgREST: nunca devuelve más de 1.000 filas por pedido.
          const visibles = sim.filas.filter((f) => filtros.every((fn) => fn(f)));
          return { data: visibles.slice(from, Math.min(to + 1, from + 1000)), error: null };
        },
        in: async (_col: string, valores: string[]) => {
          ids = valores;
          sim.pedidosDeDetalle.push(valores);
          const visibles = sim.filas.filter(
            (f) => filtros.every((fn) => fn(f)) && ids!.includes(f.id as string)
          );
          return { data: visibles, error: null };
        },
      };
      return builder;
    },
  }),
}));

import { getTopPerformingContentAction } from "@/app/marketing/content/actions";

function fila(i: number, metrics: Fila["metrics"]): Fila {
  return {
    id: `p-${String(i).padStart(5, "0")}`,
    organization_id: "org-1",
    source: "zernio",
    type: "reel",
    variants_of: null,
    title: `Pieza ${i}`,
    metrics,
    sales_attributed: null,
  };
}

beforeEach(() => {
  sim.filas = [];
  sim.pedidosDeDetalle = [];
});

describe("getTopPerformingContentAction", () => {
  it("⭐ rankea sobre todas las piezas, aunque pasen las 100 y el corte de 1.000", async () => {
    for (let i = 0; i < 1200; i++) sim.filas.push(fila(i, { views: i % 7 }));
    // La mejor pieza está muy atrás: con 100 piezas cualquiera no aparecía.
    sim.filas.push(fila(1500, { views: 999_999 }));

    const r = await getTopPerformingContentAction({ metric: "views", limit: 3 });

    expect(r.piezas[0]).toMatchObject({ id: "p-01500", title: "Pieza 1500", score: 999_999 });
    expect(r.piezas).toHaveLength(3);
    expect(sim.pedidosDeDetalle).toHaveLength(1);
    expect(sim.pedidosDeDetalle[0]).toHaveLength(3);
  });

  it("⭐ devuelve cuántas piezas quedaron afuera por no tener métricas", async () => {
    sim.filas.push(fila(1, { views: 10 }), fila(2, null), fila(3, null), fila(4, { views: 0 }));

    const r = await getTopPerformingContentAction({ metric: "views" });

    expect(r.piezas.map((p) => p.id)).toEqual(["p-00001", "p-00004"]);
    expect(r.sinMetricas).toBe(2);
  });

  it("sólo cuenta piezas de la org, de Zernio y que no son variantes", async () => {
    sim.filas.push(
      fila(1, { views: 10 }),
      { ...fila(2, null), organization_id: "org-2" },
      { ...fila(3, null), source: "manual" },
      { ...fila(4, null), variants_of: "p-00001" }
    );

    const r = await getTopPerformingContentAction({ metric: "views" });

    expect(r.piezas.map((p) => p.id)).toEqual(["p-00001"]);
    expect(r.sinMetricas).toBe(0);
  });

  it("si ninguna pieza tiene métricas devuelve la lista vacía con el conteo", async () => {
    sim.filas.push(fila(1, null), fila(2, null));

    const r = await getTopPerformingContentAction({ metric: "likes" });

    expect(r).toEqual({ piezas: [], sinMetricas: 2 });
    expect(sim.pedidosDeDetalle).toHaveLength(0);
  });
});
