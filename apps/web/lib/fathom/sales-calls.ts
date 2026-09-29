/**
 * Unión de las llamadas de venta (`fathom_calls`) con su análisis profundo
 * (`call_analyses`) para Ventas → Llamadas.
 *
 * No hay FK entre las dos tablas: `call_analyses.fathom_call_id` guarda el ID de
 * la grabación en Fathom (el mismo texto que `fathom_calls.fathom_call_id`), no
 * el `id` de la fila. Por eso PostgREST no puede embeber una en la otra y la
 * unión se hace acá, por organización + ID de grabación.
 */

export type SalesCallAnalysis = {
  id: string;
  overall_score: number | null;
  closer_name: string | null;
  lead_qualified: boolean | null;
  sold: boolean;
  booked: boolean;
  summary: string | null;
  strengths: string[];
  improvements: string[];
  objections: Array<{ text: string; handled: boolean }>;
};

export type SalesCall = {
  id: string;
  title: string;
  fathom_url: string | null;
  call_date: string | null;
  duration_seconds: number | null;
  ai_situation_summary: string | null;
  status: string;
  call_analyses: SalesCallAnalysis | null;
};

export type SalesCallRow = Omit<SalesCall, "call_analyses"> & {
  organization_id: string;
  fathom_call_id: string;
};

export type CallAnalysisRow = {
  id: string;
  organization_id: string;
  fathom_call_id: string | null;
  overall_score: number | null;
  closer_name: string | null;
  lead_qualified: boolean | null;
  sold: boolean | null;
  booked: boolean | null;
  summary: string | null;
  strengths: unknown;
  improvements: unknown;
  objections: unknown;
};

/** Las columnas JSONB pueden venir con cualquier forma: sólo se aceptan strings. */
function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function toObjections(value: unknown): Array<{ text: string; handled: boolean }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const { text, handled } = item as { text?: unknown; handled?: unknown };
    if (typeof text !== "string" || !text.trim()) return [];
    return [{ text, handled: handled === true }];
  });
}

function analysisKey(organizationId: string, fathomCallId: string): string {
  return `${organizationId}:${fathomCallId}`;
}

/**
 * Devuelve cada llamada con su análisis, o `null` si no tiene. Conserva el orden
 * y la cantidad de `calls`: una llamada sin análisis se muestra igual.
 */
export function attachCallAnalyses(
  calls: SalesCallRow[],
  analyses: CallAnalysisRow[]
): SalesCall[] {
  const byCall = new Map<string, CallAnalysisRow>();
  for (const analysis of analyses) {
    if (!analysis.fathom_call_id) continue;
    byCall.set(analysisKey(analysis.organization_id, analysis.fathom_call_id), analysis);
  }

  return calls.map(({ organization_id, fathom_call_id, ...call }) => {
    const analysis = byCall.get(analysisKey(organization_id, fathom_call_id));
    return {
      ...call,
      call_analyses: analysis
        ? {
            id: analysis.id,
            overall_score: analysis.overall_score,
            closer_name: analysis.closer_name,
            lead_qualified: analysis.lead_qualified,
            sold: analysis.sold === true,
            booked: analysis.booked === true,
            summary: analysis.summary,
            strengths: toStringList(analysis.strengths),
            improvements: toStringList(analysis.improvements),
            objections: toObjections(analysis.objections),
          }
        : null,
    };
  });
}
