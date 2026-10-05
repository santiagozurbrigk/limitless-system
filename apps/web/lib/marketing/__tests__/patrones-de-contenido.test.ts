import { describe, expect, it } from "vitest";
import type { ContentMetrics, ContentPiece } from "@/types/content";
import { buildPatternPrompt, rankItems } from "../patrones-de-contenido";

/**
 * SCRUM-172: el reporte de patrones no trata "sin dato" como cero. Los promedios
 * salen de las piezas medidas y a la IA se le dice "sin métricas todavía".
 */

// En la base `metrics` llega como null cuando la pieza no se midió.
type CambiosDePieza = Partial<Omit<ContentPiece, "metrics">> & { metrics?: ContentMetrics | null };

function pieza(id: string, cambios: CambiosDePieza): ContentPiece {
  return { id, metrics: null, ...cambios } as unknown as ContentPiece;
}

const LABELS = { storytime: "Storytime", pov: "POV" } as const;

describe("rankItems", () => {
  it("⭐ promedia views y guardados sólo sobre las piezas con métricas", () => {
    const items = rankItems<"storytime" | "pov">(
      [
        pieza("a", { format_type: "storytime", metrics: { views: 5000, saves: 40 } }),
        pieza("b", { format_type: "storytime", metrics: null }),
        pieza("c", { format_type: "pov", metrics: { views: 0, saves: 0 } }),
      ],
      "format_type",
      LABELS
    );
    expect(items[0]).toEqual({
      value: "storytime",
      label: "Storytime",
      count: 2,
      con_metricas: 1,
      avg_views: 5000,
      avg_saves: 40,
    });
    // Un cero medido sí es un promedio.
    expect(items[1]).toMatchObject({ value: "pov", count: 1, con_metricas: 1, avg_views: 0 });
  });

  it("un ítem sin ninguna pieza medida no tiene promedio", () => {
    const [item] = rankItems<"pov">(
      [pieza("a", { format_type: "pov" })],
      "format_type",
      { pov: "POV" }
    );
    expect(item).toEqual({ value: "pov", label: "POV", count: 1, con_metricas: 0 });
  });
});

describe("buildPatternPrompt", () => {
  const analisis = (dolor: string) =>
    ({ dolor: { name: dolor }, angulo: { name: `A-${dolor}` } }) as ContentPiece["analysis"];

  const piezas = [
    pieza("medida-baja", { analysis: analisis("D1"), metrics: { views: 100, saves: 1, likes: 2 } }),
    pieza("sin-medir", { analysis: analisis("D2"), metrics: null }),
    pieza("medida-alta", { analysis: analisis("D3"), metrics: { views: 9000, saves: 50, likes: 80 } }),
  ];

  it("⭐ una pieza sin métricas dice 'sin métricas todavía', no ceros", () => {
    const prompt = buildPatternPrompt(piezas, [], [], "de prueba");
    expect(prompt).toContain('"D2" / "A-D2" → sin métricas todavía');
    expect(prompt).not.toMatch(/"D2" \/ "A-D2" → 0 views/);
    expect(prompt).toContain("Piezas con métricas: 2 de 3");
  });

  it("⭐ el top ordena sólo entre las medidas y deja las sin métricas al final", () => {
    const prompt = buildPatternPrompt(piezas, [], [], "de prueba");
    const d3 = prompt.indexOf('"D3"');
    const d1 = prompt.indexOf('"D1"');
    const d2 = prompt.indexOf('"D2"');
    expect(d3).toBeLessThan(d1);
    expect(d1).toBeLessThan(d2);
  });

  it("un formato sin piezas medidas dice 'sin métricas todavía' en vez de un promedio", () => {
    const prompt = buildPatternPrompt(
      piezas,
      [
        { value: "pov", label: "POV", count: 2, con_metricas: 0 },
        { value: "storytime", label: "Storytime", count: 3, con_metricas: 2, avg_views: 1500 },
      ],
      [],
      "de prueba"
    );
    expect(prompt).toContain("- POV: 2 piezas, sin métricas todavía");
    expect(prompt).toContain("Storytime: 3 piezas, 1.500 views promedio (promedio de 2 con métricas)");
  });
});
