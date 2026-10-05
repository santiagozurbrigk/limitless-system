import { describe, expect, it } from "vitest";
import type { ContentSalesAttributed } from "@/types/content";
import {
  avisoDePiezasSinMetricas,
  rankearPiezas,
  type PiezaParaRanking,
} from "../ranking-de-contenido";

/**
 * SCRUM-172: el ranking de contenido deja afuera las piezas sin métricas (no se
 * midieron) y dice cuántas son, para que el agente no concluya sobre ellas.
 */

const piezas: PiezaParaRanking[] = [
  { id: "p1", metrics: { likes: 10, views: 500 }, sales_attributed: null },
  { id: "p2", metrics: null, sales_attributed: null },
  { id: "p3", metrics: { likes: 50, views: 100 }, sales_attributed: null },
  { id: "p4", metrics: null, sales_attributed: { total_revenue: 900, closed_count: 1 } as ContentSalesAttributed },
  { id: "p5", metrics: { likes: 0, views: 0 }, sales_attributed: null },
];

describe("rankearPiezas", () => {
  it("⭐ por una métrica, ordena sólo las piezas medidas y cuenta las que quedaron afuera", () => {
    const r = rankearPiezas(piezas, "views", 10);
    expect(r.piezas.map((p) => p.id)).toEqual(["p1", "p3", "p5"]);
    expect(r.sinMetricas).toBe(2);
  });

  it("un cero medido sí entra al ranking", () => {
    expect(rankearPiezas(piezas, "likes", 10).piezas.map((p) => p.id)).toContain("p5");
  });

  it("engagement_total pondera comentarios, guardados y compartidos", () => {
    const r = rankearPiezas(
      [
        { id: "a", metrics: { likes: 10 } },
        { id: "b", metrics: { saves: 4 } },
      ],
      "engagement_total",
      10
    );
    expect(r.piezas.map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("por sales entran todas las piezas, tengan o no métricas", () => {
    const r = rankearPiezas(piezas, "sales", 10);
    expect(r.piezas[0].id).toBe("p4");
    expect(r.piezas).toHaveLength(5);
    expect(r.sinMetricas).toBe(0);
  });

  it("respeta el límite y, con empate, el orden de entrada", () => {
    const r = rankearPiezas(
      [
        { id: "x", metrics: { likes: 1 } },
        { id: "y", metrics: { likes: 1 } },
        { id: "z", metrics: { likes: 1 } },
      ],
      "likes",
      2
    );
    expect(r.piezas.map((p) => p.id)).toEqual(["x", "y"]);
  });
});

describe("avisoDePiezasSinMetricas", () => {
  it("⭐ con piezas sin métricas agrega piezas_sin_metricas y una nota", () => {
    const aviso = avisoDePiezasSinMetricas(3);
    expect(aviso).toMatchObject({ piezas_sin_metricas: 3 });
    expect(JSON.stringify(aviso)).toContain("no tienen métricas todavía");
  });

  it("sin piezas sin métricas no agrega nada", () => {
    expect(avisoDePiezasSinMetricas(0)).toEqual({});
  });
});
