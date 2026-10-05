import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

/**
 * SCRUM-172: las tools del agente que resumen contenido no tratan "sin dato"
 * como cero. Promedian sólo sobre piezas medidas, marcan "sin métricas" en el
 * top y dicen cuántas piezas no tienen dato.
 */

vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));

import {
  handleGetBusinessSnapshot,
  handleGetMarketingOverview,
} from "../data-reader-handlers";

const PIEZAS = [
  { id: "p1", title: "Reel medido", type: "reel", metrics: { likes: 100, comments: 20, reach: 900 } },
  { id: "p2", title: "Historia sin medir", type: "story", metrics: null },
  { id: "p3", title: "Post medido", type: "post", metrics: { likes: 40, saves: 8 } },
  { id: "p4", title: "Otra sin medir", type: "story", metrics: null },
  { id: "p5", title: "Cero medido", type: "reel", metrics: { likes: 0, comments: 0 } },
];

/** Supabase falso: cada tabla devuelve sus filas, sin importar los filtros. */
function supabaseFalso(tablas: Record<string, unknown[]>): SupabaseClient {
  return {
    from: (tabla: string) => {
      const consulta: Record<string, unknown> = {};
      for (const metodo of ["select", "eq", "neq", "gte", "lte", "order", "limit", "in", "is", "not"]) {
        consulta[metodo] = () => consulta;
      }
      consulta.then = (resolver: (r: { data: unknown[]; error: null }) => unknown) =>
        resolver({ data: tablas[tabla] ?? [], error: null });
      return consulta;
    },
  } as unknown as SupabaseClient;
}

describe("handleGetMarketingOverview", () => {
  it("⭐ el promedio de engagement sale sólo de las piezas medidas", async () => {
    const json = JSON.parse(
      await handleGetMarketingOverview(
        { organizationId: "org-1", supabase: supabaseFalso({ content_pieces: PIEZAS }) },
        {}
      )
    );
    // 120 + 48 + 0 = 168 sobre 3 piezas medidas (antes 168 / 5 = 34).
    expect(json.contenido.engagement_total).toBe("168");
    expect(json.contenido.engagement_promedio).toBe("56");
    expect(json.contenido.piezas_con_metricas).toBe(3);
    expect(json.contenido.piezas_sin_metricas).toBe(2);
  });

  it("⭐ el top 5 no inventa ceros: las piezas sin métricas van al final y marcadas", async () => {
    const json = JSON.parse(
      await handleGetMarketingOverview(
        { organizationId: "org-1", supabase: supabaseFalso({ content_pieces: PIEZAS }) },
        {}
      )
    );
    const top = json.contenido.top_5_piezas as Array<Record<string, unknown>>;
    expect(top.map((p) => p.titulo)).toEqual([
      "Reel medido",
      "Post medido",
      "Cero medido",
      "Historia sin medir",
      "Otra sin medir",
    ]);
    expect(top[3]).toEqual({ titulo: "Historia sin medir", tipo: "story", metricas: "sin métricas", url: null });
    expect(top[3]).not.toHaveProperty("likes");
    expect(top[2]).toMatchObject({ engagement: 0, likes: 0 });
  });

  it("sin ninguna pieza medida no da un promedio de cero", async () => {
    const json = JSON.parse(
      await handleGetMarketingOverview(
        {
          organizationId: "org-1",
          supabase: supabaseFalso({ content_pieces: [PIEZAS[1], PIEZAS[3]] }),
        },
        {}
      )
    );
    expect(json.contenido.engagement_promedio).toBe("sin métricas");
    expect(json.contenido.engagement_total).toBe("sin métricas");
  });
});

describe("handleGetBusinessSnapshot", () => {
  it("⭐ el engagement de marketing suma sólo piezas medidas e informa las que no tienen dato", async () => {
    const json = JSON.parse(
      await handleGetBusinessSnapshot(
        { organizationId: "org-1", supabase: supabaseFalso({ content_pieces: PIEZAS }) },
        {}
      )
    );
    expect(json.marketing).toEqual({
      piezas_de_contenido_periodo: 5,
      engagement_total: "168",
      piezas_sin_metricas: 2,
    });
  });
});
