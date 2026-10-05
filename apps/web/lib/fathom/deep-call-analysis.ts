import { callClaudeJson } from "@/lib/ai/anthropic";
import { buildOrgContextText, getOrgContext } from "@/lib/ai/org-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { fechaDeHoyEnZona, fechaDeValorGuardado } from "@/lib/fechas/calendario";
import { leerZonaHorariaDeLaOrganizacion } from "@/lib/fechas/organizacion";
import type { DeepCallAnalysis } from "@/types/call-analysis";
import type { ObjectionCategory } from "@/types/sales";
import type { ClientLinkedCall } from "@/types/clients";
import {
  buildDeepAnalysisPrompt,
  type ScriptSection,
} from "@/lib/fathom/deep-analysis-prompt";

export const DEFAULT_SCRIPT_SECTIONS: ScriptSection[] = [
  {
    id: "apertura",
    name: "Apertura y rapport",
    description:
      "Presentación, conexión con el lead, establecer agenda de la llamada",
    weight: 15,
  },
  {
    id: "diagnostico",
    name: "Diagnóstico",
    description:
      "Preguntas para entender la situación, el dolor y el objetivo del lead",
    weight: 25,
  },
  {
    id: "presentacion",
    name: "Presentación de la solución",
    description:
      "Mostrar cómo el producto resuelve el problema específico del lead, precio con contexto",
    weight: 25,
  },
  {
    id: "objeciones",
    name: "Manejo de objeciones",
    description:
      "Escuchar, validar y responder objeciones de forma empática y efectiva",
    weight: 20,
  },
  {
    id: "cta",
    name: "CTA y cierre",
    description:
      "Pedir el cierre de forma directa, confirmar compromiso, próximos pasos claros",
    weight: 15,
  },
];

type DeepAnalysisApiResult = {
  overall_score: number;
  script_adherence_pct: number;
  section_scores: Record<string, number>;
  missing_steps: string[];
  objections: Array<{
    text: string;
    category: ObjectionCategory;
    handled: boolean;
    resolution?: string;
  }>;
  power_phrases: string[];
  weak_phrases: string[];
  filler_words_count: number;
  lead_qualified?: boolean;
  booked: boolean;
  sold: boolean;
  summary?: string;
  strengths: string[];
  improvements: string[];
  form_vs_call_gap?: string;
};

function parseScriptSections(raw: unknown): ScriptSection[] {
  if (!Array.isArray(raw)) return DEFAULT_SCRIPT_SECTIONS;
  const sections = raw
    .filter(
      (s): s is Record<string, unknown> =>
        typeof s === "object" && s !== null && typeof s.id === "string"
    )
    .map((s) => ({
      id: String(s.id),
      name: String(s.name ?? s.id),
      description: String(s.description ?? ""),
      weight: typeof s.weight === "number" ? s.weight : undefined,
    }));
  return sections.length > 0 ? sections : DEFAULT_SCRIPT_SECTIONS;
}

async function loadActiveScriptSections(
  organizationId: string
): Promise<ScriptSection[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_active_sales_script", {
    org_id: organizationId,
  });

  if (error) {
    console.warn("[DeepAnalysis] RPC get_active_sales_script:", error.message);
    return DEFAULT_SCRIPT_SECTIONS;
  }

  return parseScriptSections(data);
}

function toDeepCallAnalysis(
  raw: DeepAnalysisApiResult,
  meta: { leadName?: string; durationMinutes?: number }
): DeepCallAnalysis {
  return {
    overallScore: raw.overall_score,
    scriptAdherencePct: raw.script_adherence_pct,
    sectionScores: raw.section_scores ?? {},
    missingSteps: raw.missing_steps ?? [],
    objections: (raw.objections ?? []).map((o) => ({
      text: o.text,
      category: o.category,
      handled: o.handled,
      resolution: o.resolution || undefined,
      suggestion: o.handled
        ? undefined
        : "Practicar respuesta estructurada: validar → reencuadrar → CTA",
    })),
    powerPhrases: raw.power_phrases ?? [],
    weakPhrases: raw.weak_phrases ?? [],
    fillerWordsCount: raw.filler_words_count ?? 0,
    strengths: raw.strengths ?? [],
    improvements: raw.improvements ?? [],
    leadQualified: raw.lead_qualified,
    booked: raw.booked ?? false,
    sold: raw.sold ?? false,
    leadName: meta.leadName,
    durationMinutes: meta.durationMinutes,
  };
}

function formatDurationLabel(minutes?: number): string {
  if (minutes == null || minutes <= 0) return "—";
  return `${minutes} min`;
}

/**
 * La fecha de la llamada (`YYYY-MM-DD`) que se guarda en `linked_calls`, en el
 * día de la organización. Sin fecha (o con una que no se entiende), hoy en la
 * organización. Antes las dos salían del día de UTC: una llamada de las 22:00
 * en Argentina quedaba con fecha de mañana (SCRUM-493).
 */
export function formatDateLabel(
  iso: string | null | undefined,
  zona: string | null,
  ahora: Date = new Date()
): string {
  return fechaDeValorGuardado(iso, zona) || fechaDeHoyEnZona(zona, ahora);
}

async function syncClientLinkedCalls(params: {
  organizationId: string;
  clientId: string;
  fathomCallId: string;
  fathomUrl: string | null;
  title: string;
  callDate: string | null;
  durationMinutes?: number;
  closerName?: string;
  analysis: DeepCallAnalysis;
}): Promise<void> {
  const admin = createAdminClient();

  const [{ data: client }, zona] = await Promise.all([
    admin
      .from("clients")
      .select("linked_calls")
      .eq("id", params.clientId)
      .eq("organization_id", params.organizationId)
      .maybeSingle(),
    leerZonaHorariaDeLaOrganizacion(admin, params.organizationId),
  ]);

  // SCRUM-43: nunca sumar la llamada a un cliente de otra organización.
  if (!client) return;

  const currentLinkedCalls = (client?.linked_calls ??
    []) as ClientLinkedCall[];

  const linkedEntry: ClientLinkedCall = {
    id: params.fathomCallId,
    fathomCallId: params.fathomCallId,
    title: params.title,
    date: formatDateLabel(params.callDate, zona),
    duration: formatDurationLabel(params.durationMinutes),
    url: params.fathomUrl ?? "#",
    closerName: params.closerName,
    analysis: params.analysis,
  };

  const matchIndex = currentLinkedCalls.findIndex(
    (call) =>
      call.fathomCallId === params.fathomCallId ||
      call.id === params.fathomCallId ||
      (params.fathomUrl && call.url === params.fathomUrl)
  );

  const updatedLinkedCalls =
    matchIndex >= 0
      ? currentLinkedCalls.map((call, i) =>
          i === matchIndex ? { ...call, ...linkedEntry } : call
        )
      : [...currentLinkedCalls, linkedEntry];

  await admin
    .from("clients")
    .update({ linked_calls: updatedLinkedCalls })
    .eq("id", params.clientId)
    .eq("organization_id", params.organizationId);
}

export async function generateDeepCallAnalysis({
  organizationId,
  fathomCallId,
  transcript,
  closerName,
  leadName,
  durationMinutes,
  formAnswers,
  callTitle,
  callDate,
  fathomUrl,
  clientId,
}: {
  organizationId: string;
  fathomCallId: string;
  transcript: string;
  closerName?: string;
  leadName?: string;
  durationMinutes?: number;
  formAnswers?: Record<string, string>;
  callTitle?: string;
  callDate?: string | null;
  fathomUrl?: string | null;
  clientId?: string | null;
}): Promise<void> {
  const admin = createAdminClient();

  try {
    const scriptSections = await loadActiveScriptSections(organizationId);

    const prompt = buildDeepAnalysisPrompt(transcript, scriptSections, {
      closerName,
      leadName,
      duration: durationMinutes,
      formAnswers,
    });

    const orgContext = await getOrgContext(organizationId);
    const orgContextText = buildOrgContextText(orgContext);

    const analysis = await callClaudeJson<DeepAnalysisApiResult>({
      organizationId,
      task: "call_analysis",
      feature: "deep_call_analysis",
      cachedSystemPrompt: orgContextText,
      system:
        "Eres un experto en análisis de llamadas de ventas de alto ticket. Responde ÚNICAMENTE con JSON válido en español.",
      user: prompt,
      maxTokens: 2000,
    });

    if (!analysis) {
      console.warn(
        `[DeepAnalysis] Sin respuesta IA para call ${fathomCallId}`
      );
      return;
    }

    const resolvedCallDate = callDate ?? new Date().toISOString();

    const { error: upsertError } = await admin.from("call_analyses").upsert(
      {
        organization_id: organizationId,
        fathom_call_id: fathomCallId,
        closer_name: closerName ?? null,
        call_date: resolvedCallDate,
        duration_minutes: durationMinutes ?? null,
        overall_score: analysis.overall_score,
        script_adherence_pct: analysis.script_adherence_pct,
        section_scores: analysis.section_scores ?? {},
        missing_steps: analysis.missing_steps ?? [],
        objections: analysis.objections ?? [],
        power_phrases: analysis.power_phrases ?? [],
        weak_phrases: analysis.weak_phrases ?? [],
        filler_words_count: analysis.filler_words_count ?? 0,
        lead_qualified: analysis.lead_qualified ?? null,
        booked: analysis.booked ?? false,
        sold: analysis.sold ?? false,
        summary: analysis.summary ?? null,
        strengths: analysis.strengths ?? [],
        improvements: analysis.improvements ?? [],
      },
      { onConflict: "fathom_call_id" }
    );

    if (upsertError) {
      console.error("[DeepAnalysis] upsert call_analyses:", upsertError.message);
      return;
    }

    const deepAnalysis = toDeepCallAnalysis(analysis, {
      leadName,
      durationMinutes,
    });

    let resolvedClientId = clientId ?? null;
    let resolvedTitle = callTitle ?? "Llamada Fathom";
    let resolvedUrl = fathomUrl ?? null;
    let resolvedDate = callDate ?? resolvedCallDate;

    if (!resolvedClientId || !resolvedUrl) {
      const { data: fathomCall } = await admin
        .from("fathom_calls")
        .select("client_id, fathom_url, title, call_date")
        .eq("fathom_call_id", fathomCallId)
        .eq("organization_id", organizationId)
        .maybeSingle();

      resolvedClientId = resolvedClientId ?? fathomCall?.client_id ?? null;
      resolvedTitle = callTitle ?? fathomCall?.title ?? resolvedTitle;
      resolvedUrl = fathomUrl ?? fathomCall?.fathom_url ?? null;
      resolvedDate = callDate ?? fathomCall?.call_date ?? resolvedDate;
    }

    if (resolvedClientId) {
      await syncClientLinkedCalls({
        organizationId,
        clientId: resolvedClientId,
        fathomCallId,
        fathomUrl: resolvedUrl,
        title: resolvedTitle,
        callDate: resolvedDate,
        durationMinutes,
        closerName,
        analysis: deepAnalysis,
      });
    }

    console.log(
      `[DeepAnalysis] ✅ Análisis profundo completado para call ${fathomCallId}`
    );
  } catch (err) {
    console.error(
      `[DeepAnalysis] ❌ Error en análisis profundo para call ${fathomCallId}:`,
      err
    );
  }
}
