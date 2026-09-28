import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `getSalesCallsAction` de punta a punta contra una base simulada: qué consulta
 * manda, cómo une llamadas con análisis y qué devuelve cuando algo falla.
 *
 * La base simulada rechaza cualquier select con embed `call_analyses(...)` con
 * el mismo error que devuelve PostgREST en producción (PGRST200, verificado el
 * 2026-09-28): así el test falla si alguien vuelve a embeber.
 */

const ORG = "org-activa";

type Result = { data: unknown[] | null; error: { code?: string; message: string } | null };
type Query = {
  table: string;
  select: string;
  filters: Array<[string, string, unknown]>;
};

const db = vi.hoisted(() => ({
  responses: {} as Record<string, Result>,
  queries: [] as Query[],
}));

vi.mock("@/lib/auth/bootstrap", () => ({
  requireOrganizationId: vi.fn(async () => ORG),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from(table: string) {
      const query: Query = { table, select: "", filters: [] };
      db.queries.push(query);
      const builder = {
        select(columns: string) {
          query.select = columns;
          return builder;
        },
        eq(column: string, value: unknown) {
          query.filters.push(["eq", column, value]);
          return builder;
        },
        in(column: string, values: unknown) {
          query.filters.push(["in", column, values]);
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        then(resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) {
          if (/call_analyses\s*\(/.test(query.select)) {
            return Promise.resolve({
              data: null,
              error: {
                code: "PGRST200",
                message: `Could not find a relationship between '${table}' and 'call_analyses' in the schema cache`,
              },
            }).then(resolve, reject);
          }
          const response = db.responses[table] ?? { data: [], error: null };
          return Promise.resolve(response).then(resolve, reject);
        },
      };
      return builder;
    },
  })),
}));

import { getSalesCallsAction } from "@/app/fathom/actions";

function callRow(fathomCallId: string) {
  return {
    id: `uuid-${fathomCallId}`,
    organization_id: ORG,
    fathom_call_id: fathomCallId,
    title: `Cierre ${fathomCallId}`,
    fathom_url: `https://fathom.video/calls/${fathomCallId}`,
    call_date: "2026-09-20T15:00:00Z",
    duration_seconds: 2400,
    ai_situation_summary: null,
    status: "processed",
  };
}

function analysisRow(fathomCallId: string, score: number) {
  return {
    id: `analysis-${fathomCallId}`,
    organization_id: ORG,
    fathom_call_id: fathomCallId,
    overall_score: score,
    closer_name: "Closer",
    lead_qualified: true,
    sold: true,
    booked: true,
    summary: "Resumen",
    strengths: ["Rapport"],
    improvements: [],
    objections: [{ text: "Precio", handled: true }],
  };
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  db.responses = {};
  db.queries = [];
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe("getSalesCallsAction", () => {
  it("lista todas las llamadas de venta de la org, con su análisis cuando existe", async () => {
    db.responses.fathom_calls = {
      data: ["111", "222", "333"].map(callRow),
      error: null,
    };
    db.responses.call_analyses = {
      data: [analysisRow("222", 81)],
      error: null,
    };

    const result = await getSalesCallsAction();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.calls).toHaveLength(3);
    expect(result.calls.map((call) => call.call_analyses?.overall_score ?? null)).toEqual([
      null,
      81,
      null,
    ]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("no embebe call_analyses y busca los análisis por ID de grabación dentro de la org", async () => {
    db.responses.fathom_calls = { data: ["111", "222"].map(callRow), error: null };

    await getSalesCallsAction();

    const [calls, analyses] = db.queries;
    expect(calls.table).toBe("fathom_calls");
    expect(calls.select).not.toMatch(/call_analyses/);
    expect(calls.filters).toEqual(
      expect.arrayContaining([
        ["eq", "organization_id", ORG],
        ["eq", "purpose", "sales"],
      ])
    );
    expect(analyses.table).toBe("call_analyses");
    expect(analyses.filters).toEqual(
      expect.arrayContaining([
        ["eq", "organization_id", ORG],
        ["in", "fathom_call_id", ["111", "222"]],
      ])
    );
  });

  it("sin llamadas no consulta análisis", async () => {
    db.responses.fathom_calls = { data: [], error: null };

    const result = await getSalesCallsAction();

    expect(result).toEqual({ ok: true, calls: [] });
    expect(db.queries.map((query) => query.table)).toEqual(["fathom_calls"]);
  });

  it("si falla la lectura de llamadas, lo loguea y avisa en vez de devolver una lista vacía", async () => {
    db.responses.fathom_calls = {
      data: null,
      error: { code: "42501", message: "permission denied" },
    };

    const result = await getSalesCallsAction();

    expect(result).toEqual({ ok: false, error: "No se pudieron cargar las llamadas." });
    expect(consoleError).toHaveBeenCalledWith(
      "[getSalesCallsAction] fathom_calls",
      expect.objectContaining({ message: "permission denied" })
    );
  });

  it("si falla la lectura de análisis, muestra las llamadas igual y lo loguea", async () => {
    db.responses.fathom_calls = { data: ["111"].map(callRow), error: null };
    db.responses.call_analyses = {
      data: null,
      error: { message: "timeout" },
    };

    const result = await getSalesCallsAction();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0].call_analyses).toBeNull();
    expect(consoleError).toHaveBeenCalledWith(
      "[getSalesCallsAction] call_analyses",
      expect.objectContaining({ message: "timeout" })
    );
  });
});
