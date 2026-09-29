import { describe, expect, it } from "vitest";
import {
  attachCallAnalyses,
  type CallAnalysisRow,
  type SalesCallRow,
} from "@/lib/fathom/sales-calls";

const ORG = "org-1";

function call(fathomCallId: string, overrides: Partial<SalesCallRow> = {}): SalesCallRow {
  return {
    id: `uuid-${fathomCallId}`,
    organization_id: ORG,
    fathom_call_id: fathomCallId,
    title: `Llamada ${fathomCallId}`,
    fathom_url: null,
    call_date: "2026-09-20T15:00:00Z",
    duration_seconds: 1800,
    ai_situation_summary: null,
    status: "processed",
    ...overrides,
  };
}

function analysis(
  fathomCallId: string | null,
  overrides: Partial<CallAnalysisRow> = {}
): CallAnalysisRow {
  return {
    id: `analysis-${fathomCallId}`,
    organization_id: ORG,
    fathom_call_id: fathomCallId,
    overall_score: 72,
    closer_name: "Closer",
    lead_qualified: true,
    sold: false,
    booked: true,
    summary: "Resumen",
    strengths: ["Rapport"],
    improvements: ["Cierre"],
    objections: [{ text: "Precio", handled: true }],
    ...overrides,
  };
}

describe("attachCallAnalyses", () => {
  it("une cada llamada con su análisis por el ID de grabación de Fathom, no por el id de la fila", () => {
    const [result] = attachCallAnalyses([call("829266792")], [analysis("829266792")]);

    expect(result.id).toBe("uuid-829266792");
    expect(result.call_analyses).toEqual({
      id: "analysis-829266792",
      overall_score: 72,
      closer_name: "Closer",
      lead_qualified: true,
      sold: false,
      booked: true,
      summary: "Resumen",
      strengths: ["Rapport"],
      improvements: ["Cierre"],
      objections: [{ text: "Precio", handled: true }],
    });
    expect(result).not.toHaveProperty("fathom_call_id");
    expect(result).not.toHaveProperty("organization_id");
  });

  it("conserva todas las llamadas y su orden aunque no tengan análisis", () => {
    const result = attachCallAnalyses(
      [call("3"), call("2"), call("1")],
      [analysis("2")]
    );

    expect(result.map((row) => row.id)).toEqual(["uuid-3", "uuid-2", "uuid-1"]);
    expect(result.map((row) => row.call_analyses?.id ?? null)).toEqual([
      null,
      "analysis-2",
      null,
    ]);
  });

  it("no atribuye análisis sin ID de grabación ni de otra organización", () => {
    const result = attachCallAnalyses(
      [call("1")],
      [analysis(null), analysis("1", { organization_id: "otra-org" })]
    );

    expect(result[0].call_analyses).toBeNull();
  });

  it("normaliza columnas JSON con forma inesperada en vez de romper la tarjeta", () => {
    const [result] = attachCallAnalyses(
      [call("1")],
      [
        analysis("1", {
          sold: null,
          booked: null,
          strengths: "no es una lista",
          improvements: ["Ok", 3, null],
          objections: [{ text: "Tiempo" }, { handled: true }, "suelta", null],
        }),
      ]
    );

    expect(result.call_analyses).toMatchObject({
      sold: false,
      booked: false,
      strengths: [],
      improvements: ["Ok"],
      objections: [{ text: "Tiempo", handled: false }],
    });
  });

  it("devuelve una lista vacía sin llamadas", () => {
    expect(attachCallAnalyses([], [analysis("1")])).toEqual([]);
  });
});
