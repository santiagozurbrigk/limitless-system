"use server";

import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { createClient } from "@/lib/supabase/server";
import { callClaudeText } from "@/lib/ai/anthropic";
import {
  buildPatternPrompt,
  rankItems,
  type PatternRankedItem,
} from "@/lib/marketing/patrones-de-contenido";
import type {
  ContentFormatType,
  ContentHookType,
  ContentCtaType,
  ContentPiece,
} from "@/types/content";

// ─── Tipos públicos ────────────────────────────────────────────────────────────

// El tipo vive en lib junto con los cálculos (un "use server" sólo exporta async).
export type { PatternRankedItem };

export type ContentPatternReport = {
  id: string;
  organization_id: string;
  range_type: "COUNT" | "DATE_RANGE";
  range_value: string;
  content_ids: string[];
  top_formats: PatternRankedItem[];
  top_hooks: PatternRankedItem[];
  top_topics: PatternRankedItem[];
  summary: string;
  suggestions: string;
  sample_size_notes: string;
  generated_at: string;
};

export type GeneratePatternReportParams =
  | { type: "COUNT"; count: 30 | 60 | 90 | "all" }
  | { type: "DATE_RANGE"; from: string; to: string };

// ─── Labels legibles ───────────────────────────────────────────────────────────

const FORMAT_LABELS: Record<ContentFormatType, string> = {
  storytime: "Storytime",
  talking_head: "Talking Head",
  pov: "POV",
  listicle: "Listicle",
  green_screen: "Green Screen",
  hot_take: "Hot Take",
  carousel: "Carrusel",
  otro: "Otro",
};

const HOOK_LABELS: Record<ContentHookType, string> = {
  dolor_directo: "Dolor directo",
  curiosidad: "Curiosidad",
  contrarian: "Contrarian",
  prueba_social: "Prueba social",
  resultado: "Resultado",
};

const CTA_LABELS: Record<ContentCtaType, string> = {
  dm: "Pedir DM",
  comment_word: "Comentar palabra",
  link: "Link en bio",
  none: "Sin CTA",
};

// ─── Action principal ──────────────────────────────────────────────────────────

export async function generateContentPatternReportAction(
  params: GeneratePatternReportParams
): Promise<ContentPatternReport> {
  const organizationId = await requireOrganizationId();
  const supabase = await createClient();

  // 1. Determinar filtro de rango
  let query = supabase
    .from("content_pieces")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "published")
    .is("variants_of", null)
    .order("published_at", { ascending: false, nullsFirst: false });

  let rangeDescription: string;
  let rangeType: "COUNT" | "DATE_RANGE";
  let rangeValue: string;

  if (params.type === "COUNT") {
    rangeType = "COUNT";
    if (params.count !== "all") {
      query = query.limit(params.count);
      rangeDescription = `las últimas ${params.count} piezas publicadas`;
      rangeValue = String(params.count);
    } else {
      rangeDescription = "todas las piezas publicadas";
      rangeValue = "all";
    }
  } else {
    rangeType = "DATE_RANGE";
    query = query
      .gte("published_at", params.from)
      .lte("published_at", params.to);
    rangeDescription = `del ${params.from} al ${params.to}`;
    rangeValue = `${params.from}:${params.to}`;
  }

  const { data: pieces, error } = await query;
  if (error) throw new Error(error.message);

  const typedPieces = (pieces ?? []) as ContentPiece[];

  if (typedPieces.length === 0) {
    throw new Error(
      "No hay piezas publicadas en el rango seleccionado. Probá con un rango más amplio."
    );
  }

  // 2. Calcular rankings
  const topFormats = rankItems<ContentFormatType>(
    typedPieces,
    "format_type",
    FORMAT_LABELS
  );
  const topHooks = rankItems<ContentHookType>(
    typedPieces,
    "hook_type",
    HOOK_LABELS
  );
  const topCtas = rankItems<ContentCtaType>(typedPieces, "cta_type", CTA_LABELS);

  // 3. Extraer temas/dolores
  const dolorCounts = new Map<string, { count: number; ids: string[] }>();
  for (const piece of typedPieces) {
    const dolor = piece.analysis?.dolor?.name?.trim();
    if (!dolor) continue;
    const existing = dolorCounts.get(dolor) ?? { count: 0, ids: [] };
    existing.count += 1;
    existing.ids.push(piece.id);
    dolorCounts.set(dolor, existing);
  }
  const topTopics = Array.from(dolorCounts.entries())
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 8)
    .map(([topic, stats]) => ({
      value: topic,
      label: topic,
      count: stats.count,
    }));

  // 4. Llamada a Claude para el análisis textual
  const prompt = buildPatternPrompt(
    typedPieces,
    topFormats,
    topHooks,
    rangeDescription
  );

  const rawJson = await callClaudeText({
    organizationId,
    task: "content_pattern_report",
    feature: "marketing_content",
    messages: [{ role: "user", content: prompt }],
    maxTokens: 1500,
  });

  let summary = "";
  let suggestions = "";
  let sampleSizeNotes = "";

  if (rawJson) {
    try {
      // Claude puede envolver el JSON en ```json ... ```
      const cleaned = rawJson.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "").trim();
      const parsed = JSON.parse(cleaned);
      summary = parsed.summary ?? "";
      suggestions = parsed.suggestions ?? "";
      sampleSizeNotes = parsed.sample_size_notes ?? "";
    } catch {
      // Si falla el parseo, usar el texto crudo como summary
      summary = rawJson;
    }
  }

  // Agregar advertencia automática si muestra pequeña
  const withFormatType = typedPieces.filter((p) => p.format_type).length;
  const pctClassified =
    typedPieces.length > 0
      ? Math.round((withFormatType / typedPieces.length) * 100)
      : 0;

  if (pctClassified < 30 && !sampleSizeNotes) {
    sampleSizeNotes = `Solo el ${pctClassified}% de las piezas en este rango tiene clasificación IA. Para obtener patrones más precisos, analizá más piezas desde la biblioteca de contenido.`;
  }

  // 5. Persistir en content_pattern_reports
  const contentIds = typedPieces.map((p) => p.id);

  const { data: insertedRow, error: insertError } = await supabase
    .from("content_pattern_reports")
    .insert({
      organization_id: organizationId,
      range_type: rangeType,
      range_value: rangeValue,
      content_ids: contentIds,
      top_formats: topFormats,
      top_hooks: topHooks,
      top_topics: topTopics,
      summary,
      suggestions,
      sample_size_notes: sampleSizeNotes,
    })
    .select()
    .single();

  if (insertError) throw new Error(insertError.message);

  const row = insertedRow as ContentPatternReport & {
    top_formats: PatternRankedItem[];
    top_hooks: PatternRankedItem[];
    top_topics: PatternRankedItem[];
  };

  return {
    id: row.id,
    organization_id: row.organization_id,
    range_type: row.range_type,
    range_value: row.range_value,
    content_ids: row.content_ids,
    top_formats: topFormats,
    top_hooks: topHooks,
    top_topics: topTopics,
    summary,
    suggestions,
    sample_size_notes: sampleSizeNotes,
    generated_at: row.generated_at,
  };
}

export async function getLatestContentPatternReportAction(): Promise<ContentPatternReport | null> {
  const organizationId = await requireOrganizationId();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("content_pattern_reports")
    .select("*")
    .eq("organization_id", organizationId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return data as ContentPatternReport;
}
