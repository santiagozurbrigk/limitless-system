import { describe, expect, it } from "vitest";
import type { ContentMetrics } from "@/types/content";
import { ordenarPiezas } from "../orden-de-piezas";

/**
 * SCRUM-172: en la grilla de contenido, al ordenar por views o engagement, las
 * piezas sin métricas van siempre al final y no se mezclan con los ceros medidos.
 */

function pieza(id: string, metrics: ContentMetrics | null, published_at: string | null = null) {
  return { id, metrics, published_at, created_at: "2026-10-01T00:00:00.000Z" };
}

const PIEZAS = [
  pieza("sin-medir-1", null, "2026-10-04T00:00:00.000Z"),
  pieza("cero-medido", { views: 0, likes: 0 }, "2026-10-01T00:00:00.000Z"),
  pieza("muchas", { views: 900, likes: 5, comments: 1 }, "2026-09-01T00:00:00.000Z"),
  pieza("sin-medir-2", null, "2026-10-03T00:00:00.000Z"),
  pieza("pocas", { views: 50, likes: 40, saves: 10 }, "2026-09-15T00:00:00.000Z"),
];

const ids = (lista: Array<{ id: string }>) => lista.map((p) => p.id);

describe("ordenarPiezas", () => {
  it("⭐ por views, las piezas sin métricas van al final, después del cero medido", () => {
    expect(ids(ordenarPiezas(PIEZAS, "views"))).toEqual([
      "muchas",
      "pocas",
      "cero-medido",
      "sin-medir-1",
      "sin-medir-2",
    ]);
  });

  it("⭐ por engagement, las piezas sin métricas van al final, después del cero medido", () => {
    expect(ids(ordenarPiezas(PIEZAS, "engagement"))).toEqual([
      "pocas",
      "muchas",
      "cero-medido",
      "sin-medir-1",
      "sin-medir-2",
    ]);
  });

  it("por reciente ordena por publicación (o creación) sin mirar métricas", () => {
    const sinPublicar = pieza("borrador", null);
    expect(ids(ordenarPiezas([...PIEZAS, sinPublicar], "reciente"))).toEqual([
      "sin-medir-1",
      "sin-medir-2",
      "cero-medido",
      "borrador",
      "pocas",
      "muchas",
    ]);
  });

  it("no modifica la lista recibida", () => {
    const copia = [...PIEZAS];
    ordenarPiezas(PIEZAS, "views");
    expect(PIEZAS).toEqual(copia);
  });
});
