"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth/bootstrap";
import { callClaudeJson, callClaudeVisionJson } from "@/lib/ai/anthropic";
import {
  buildContentAnalysisPrompt,
  isImageMimeType,
  isVideoMimeType,
  toClaudeImageMediaType,
} from "@/lib/content/content-analysis-prompt";
import { transcribeAudioBuffer } from "@/lib/content/transcribe-whisper";
import { createClient } from "@/lib/supabase/server";
import type {
  ContentAnalysis,
  ContentBrief,
  ContentMetrics,
  ContentPiece,
  ContentPieceStatus,
  ContentPieceType,
  ContentPieceWithVariants,
  ContentSalesAttributed,
} from "@/types/content";
import { paths } from "@/routes";
import { computeSalesAttributionForOrg } from "@/lib/marketing/content-sales-attribution";
import { metricScore, rankearPiezas } from "@/lib/marketing/ranking-de-contenido";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import { getZernioClientForOrganization, getZernioIntegrationForOrg } from "@/lib/zernio/integration";
import { downloadDriveFileAction } from "./drive-actions";

async function requireProfileOrganizationId(): Promise<string> {
  const profile = await getCurrentProfile();
  if (!profile?.organization_id) {
    throw new Error("Sesión no válida");
  }
  return profile.organization_id;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resuelve una pieza por UUID interno o, si el ID no es UUID (ej. Instagram
 * media ID numérico como "17896293831516409"), por platform_post_id.
 */
async function resolveContentPieceRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  id: string
): Promise<ContentPiece | null> {
  const trimmed = id.trim();
  if (!trimmed) return null;

  if (UUID_RE.test(trimmed)) {
    const { data, error } = await supabase
      .from("content_pieces")
      .select("*")
      .eq("id", trimmed)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return data as ContentPiece;
  }

  // Fallback: buscar por ID de plataforma (Instagram media ID, YouTube video ID)
  const { data: byPlatformId, error: platformError } = await supabase
    .from("content_pieces")
    .select("*")
    .eq("platform_post_id", trimmed)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (platformError) throw new Error(platformError.message);
  return (byPlatformId as ContentPiece | null) ?? null;
}

export async function getContentPiecesAction(params?: {
  type?: ContentPieceType;
  status?: ContentPieceStatus;
  source?: string;
  limit?: number;
}): Promise<ContentPiece[]> {
  const organizationId = await requireProfileOrganizationId();
  const supabase = await createClient();

  let query = supabase
    .from("content_pieces")
    .select("*")
    .eq("organization_id", organizationId)
    .is("variants_of", null)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (params?.type) query = query.eq("type", params.type);
  if (params?.status) query = query.eq("status", params.status);
  if (params?.source) query = query.eq("source", params.source);
  if (params?.limit) query = query.limit(params.limit);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as ContentPiece[];
}

export async function getContentPieceAction(
  id: string
): Promise<ContentPieceWithVariants> {
  const organizationId = await requireProfileOrganizationId();
  const supabase = await createClient();

  const piece = await resolveContentPieceRow(supabase, organizationId, id);
  if (!piece) {
    throw new Error(
      "Pieza no encontrada (se buscó por UUID interno y por ID de plataforma)"
    );
  }

  const { data: variants, error } = await supabase
    .from("content_pieces")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("variants_of", piece.id)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  return {
    ...piece,
    variants: (variants ?? []) as ContentPiece[],
  };
}

type ContentPieceUpdateFields = Partial<
  Pick<
    ContentPiece,
    | "title"
    | "caption"
    | "status"
    | "analysis"
    | "transcript"
    | "analysis_generated_at"
    | "brief"
    | "metrics"
    | "metrics_updated_at"
  >
> & {
  drive_file_id?: string | null;
  drive_file_name?: string | null;
  drive_file_url?: string | null;
};

export async function updateContentPieceAction(
  id: string,
  updates: ContentPieceUpdateFields
): Promise<void> {
  const organizationId = await requireProfileOrganizationId();
  const supabase = await createClient();

  const { error } = await supabase
    .from("content_pieces")
    .update(updates)
    .eq("id", id)
    .eq("organization_id", organizationId);

  if (error) throw new Error(error.message);
}

export async function deleteContentPieceAction(id: string): Promise<void> {
  const organizationId = await requireProfileOrganizationId();
  const supabase = await createClient();

  const { error } = await supabase
    .from("content_pieces")
    .delete()
    .eq("id", id)
    .eq("organization_id", organizationId);

  if (error) throw new Error(error.message);
}

export async function analyzeContentPieceAction(
  contentPieceId: string
): Promise<ContentAnalysis> {
  const organizationId = await requireProfileOrganizationId();
  const supabase = await createClient();

  const piece = await resolveContentPieceRow(
    supabase,
    organizationId,
    contentPieceId
  );

  if (!piece) {
    throw new Error(
      "Pieza no encontrada (se buscó por UUID interno y por ID de plataforma)"
    );
  }

  if (!piece.drive_file_id) {
    throw new Error(
      "Esta pieza no tiene un video de Drive vinculado. Para analizarla, primero vinculá el archivo de Drive desde el panel de la pieza y luego volvé a intentarlo."
    );
  }

  const { buffer, mimeType } = await downloadDriveFileAction(piece.drive_file_id);

  let transcript: string | null = null;
  const visionImages: Array<{
    base64: string;
    mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  }> = [];

  if (isVideoMimeType(mimeType)) {
    const { processVideoForAnalysis } = await import("@/lib/content/video-processor");
    const { audioBuffer, frames } = await processVideoForAnalysis(buffer, mimeType);
    transcript = await transcribeAudioBuffer(audioBuffer);
    visionImages.push(
      ...frames.map((frame) => ({
        base64: frame.toString("base64"),
        mediaType: "image/jpeg" as const,
      }))
    );
  } else if (isImageMimeType(mimeType)) {
    visionImages.push({
      base64: buffer.toString("base64"),
      mediaType: toClaudeImageMediaType(mimeType),
    });
  } else {
    throw new Error(`Tipo de archivo no soportado para análisis: ${mimeType}`);
  }

  const metrics = piece.metrics as ContentMetrics | null | undefined;

  const analysisPrompt = buildContentAnalysisPrompt({
    caption: piece.caption,
    hashtags: piece.hashtags,
    metrics,
    transcript,
    hasImages: visionImages.length > 0,
  });

  const analysis = await callClaudeVisionJson<ContentAnalysis>({
    organizationId,
    task: "analyze_content_piece",
    feature: "marketing_content",
    text: analysisPrompt,
    images: visionImages,
    maxTokens: 1500,
  });

  if (!analysis) {
    throw new Error("El análisis IA no devolvió resultado");
  }

  // Extraer campos de clasificación estructurada del JSON devuelto
  const formatType = analysis.format_type ?? null;
  const hookType = analysis.hook_type ?? null;
  const ctaType = analysis.cta_type ?? null;

  const { error: updateError } = await supabase
    .from("content_pieces")
    .update({
      transcript: transcript ?? null,
      analysis,
      analysis_generated_at: new Date().toISOString(),
      format_type: formatType,
      hook_type: hookType,
      cta_type: ctaType,
    })
    .eq("id", piece.id)
    .eq("organization_id", organizationId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return analysis;
}

type GeneratedVariantBrief = Pick<
  ContentBrief,
  "formato" | "dolor" | "angulo" | "structure"
>;

export async function createContentVariantsAction({
  sourceContentId,
  count,
  instructions,
}: {
  sourceContentId: string;
  count: number;
  instructions?: string;
}): Promise<string[]> {
  const organizationId = await requireProfileOrganizationId();
  const supabase = await createClient();
  const variantCount = Math.min(Math.max(count, 1), 5);

  const source = await resolveContentPieceRow(
    supabase,
    organizationId,
    sourceContentId
  );

  if (!source) {
    throw new Error(
      "Pieza fuente no encontrada (se buscó por UUID interno y por ID de plataforma)"
    );
  }

  const sourceAnalysis = source.analysis as ContentAnalysis | null | undefined;
  const sourceMetrics = source.metrics as ContentMetrics | null | undefined;

  const sourceContext = [
    source.caption ? `Caption original: "${source.caption}"` : null,
    sourceAnalysis
      ? `Análisis de la pieza original:
- Formato: ${sourceAnalysis.formato.name} — ${sourceAnalysis.formato.description}
- Dolor: ${sourceAnalysis.dolor.name} — ${sourceAnalysis.dolor.description}
- Ángulo: ${sourceAnalysis.angulo.name} — ${sourceAnalysis.angulo.description}
- Por qué funcionó: ${sourceAnalysis.why_it_worked}`
      : "La pieza no tiene análisis previo.",
    sourceMetrics
      ? `Métricas: ${sourceMetrics.likes ?? 0} likes, ${sourceMetrics.comments ?? 0} comentarios, ${sourceMetrics.saves ?? 0} guardados, ${sourceMetrics.reach ?? 0} reach`
      : null,
    instructions ? `Instrucciones adicionales del usuario: ${instructions}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const prompt = `Sos un estratega de contenido experto. Tenés que crear ${variantCount} variante(s) de una pieza de contenido exitosa.

DEFINICIONES:
- FORMATO: La estructura/forma de grabación (el "cómo se ve"). Ejemplos: "grabación de pantalla con celular", "talking head directo a cámara", "videollamada entre dos personas".
- DOLOR: El problema real del cliente ideal en su día a día. Es el tema, no el envase.
- ÁNGULO: La perspectiva específica desde donde se entra al dolor — el gancho único. El mismo dolor puede tener múltiples ángulos.

PIEZA FUENTE:
${sourceContext}

Generá exactamente ${variantCount} variante(s) distintas. Cada variante debe tener una combinación de Formato + Dolor + Ángulo diferente a las otras y a la original. Podés mantener el mismo dolor pero cambiar el ángulo, o cambiar el formato, o explorar un dolor relacionado.

Para cada variante, también generá la estructura completa del video (hook, desarrollo, cierre/CTA) con guión de ejemplo.

Respondé con este JSON exacto:
{
  "variants": [
    {
      "formato": { "name": "...", "description": "..." },
      "dolor": { "name": "...", "description": "..." },
      "angulo": { "name": "...", "description": "..." },
      "structure": [
        { "part": "Hook (0-3s)", "description": "...", "example_script": "..." },
        { "part": "Desarrollo (3-45s)", "description": "...", "example_script": "..." },
        { "part": "Cierre / CTA (45-60s)", "description": "...", "example_script": "..." }
      ]
    }
  ]
}`;

  const result = await callClaudeJson<{ variants: GeneratedVariantBrief[] }>({
    organizationId,
    task: "create_content_variants",
    feature: "marketing_content",
    user: prompt,
    maxTokens: 3000,
  });

  if (!result?.variants?.length) {
    throw new Error("Respuesta inválida de la IA");
  }

  const insertRows = result.variants.slice(0, variantCount).map((variant) => ({
    organization_id: organizationId,
    type: source.type as ContentPieceType,
    source: "ai_generated" as const,
    platform: source.platform,
    variants_of: source.id,
    brief: variant as ContentBrief,
    status: "draft" as const,
  }));

  const { data: inserted, error: insertError } = await supabase
    .from("content_pieces")
    .insert(insertRows)
    .select("id");

  if (insertError) {
    throw new Error(insertError.message);
  }

  revalidatePath(paths.platform.marketing.content);
  revalidatePath(paths.platform.marketing.contentDetail(source.id));

  return (inserted ?? []).map((row) => row.id as string);
}

// ─── Borradores de contenido ──────────────────────────────────────────────────

export type ContentDraftWithParent = ContentPiece & {
  parent_piece: Pick<ContentPiece, "id" | "title" | "type" | "caption"> | null;
};

/**
 * Devuelve todas las variantes generadas por IA para la organización
 * (content_pieces donde variants_of IS NOT NULL), con la pieza padre adjunta.
 */
export async function getContentDraftsAction(params?: {
  limit?: number;
}): Promise<ContentDraftWithParent[]> {
  const organizationId = await requireProfileOrganizationId();
  const supabase = await createClient();

  const limit = params?.limit ?? 100;

  const { data: variants, error } = await supabase
    .from("content_pieces")
    .select("*")
    .eq("organization_id", organizationId)
    .not("variants_of", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  if (!variants?.length) return [];

  // Batch-fetch parent pieces
  const parentIds = [...new Set(variants.map((v) => v.variants_of as string))];
  const { data: parents } = await supabase
    .from("content_pieces")
    .select("id, title, type, caption")
    .eq("organization_id", organizationId)
    .in("id", parentIds);

  const parentMap = Object.fromEntries(
    (parents ?? []).map((p) => [p.id, p as Pick<ContentPiece, "id" | "title" | "type" | "caption">])
  );

  return (variants as ContentPiece[]).map((v) => ({
    ...v,
    parent_piece: v.variants_of ? (parentMap[v.variants_of] ?? null) : null,
  }));
}

export type TopPerformingContentResult = {
  id: string;
  type: string;
  title?: string;
  platform_post_url?: string;
  published_at?: string;
  metrics?: ContentMetrics;
  sales_attributed?: ContentSalesAttributed;
  analysis_summary: {
    formato?: string;
    dolor?: string;
    angulo?: string;
  } | null;
  score: number;
};

/**
 * Ranking de contenido y cuántas piezas quedaron afuera por no tener métricas
 * (SCRUM-172): un ranking por métrica no puede incluir piezas que no se midieron,
 * pero quien lo lee tiene que saber que existen.
 */
export type TopPerformingContentResponse = {
  piezas: TopPerformingContentResult[];
  sinMetricas: number;
};

export async function updateSalesAttributionAction(
  contentPieceIds?: string[]
): Promise<void> {
  const organizationId = await requireProfileOrganizationId();
  const supabase = await createClient();

  const attributionMap = await computeSalesAttributionForOrg(
    supabase,
    organizationId
  );

  let pieceIds = [...attributionMap.keys()];
  if (contentPieceIds?.length) {
    pieceIds = pieceIds.filter((id) => contentPieceIds.includes(id));
  }

  await Promise.all(
    pieceIds.map(async (pieceId) => {
      const salesAttributed = attributionMap.get(pieceId);
      if (!salesAttributed) return;

      const { error } = await supabase
        .from("content_pieces")
        .update({ sales_attributed: salesAttributed })
        .eq("id", pieceId)
        .eq("organization_id", organizationId);

      if (error) throw new Error(error.message);
    })
  );
}

export async function getTopPerformingContentAction({
  metric,
  limit = 10,
  typeFilter = "all",
}: {
  metric: string;
  limit?: number;
  typeFilter?: string;
}): Promise<TopPerformingContentResponse> {
  const organizationId = await requireProfileOrganizationId();
  const supabase = await createClient();

  if (metric === "sales") {
    await updateSalesAttributionAction();
  }

  // ⭐ El ranking se calcula sobre TODAS las piezas de la org (antes `.limit(100)`
  // sin orden: 100 piezas cualquiera). Se ordena en JS porque `engagement_total`
  // pondera varias claves del jsonb y `sales` sale de otra columna; ordenar en
  // SQL pediría una RPC. Primero se traen sólo las columnas del puntaje,
  // paginando, y después el detalle de las ganadoras.
  type PiezaRankeable = {
    id: string;
    metrics: ContentMetrics | null;
    sales_attributed: ContentSalesAttributed | null;
  };

  const { rows, error } = await fetchAllRows<PiezaRankeable>((from, to) => {
    let query = supabase
      .from("content_pieces")
      .select("id, metrics, sales_attributed")
      .eq("organization_id", organizationId)
      .eq("source", "zernio")
      .is("variants_of", null);
    if (typeFilter !== "all") {
      query = query.eq("type", typeFilter);
    }
    return query.order("id", { ascending: true }).range(from, to);
  });
  if (error) {
    throw new Error(error);
  }

  const ranking = rankearPiezas(rows, metric, limit);
  if (ranking.piezas.length === 0) {
    return { piezas: [], sinMetricas: ranking.sinMetricas };
  }

  type DetallePieza = {
    id: string;
    type: string;
    title?: string | null;
    caption?: string | null;
    platform_post_url?: string | null;
    published_at?: string | null;
    analysis?: ContentAnalysis | null;
  };

  const { data: detalles, error: detalleError } = await supabase
    .from("content_pieces")
    .select("id, type, title, caption, platform_post_url, published_at, analysis")
    .eq("organization_id", organizationId)
    .in(
      "id",
      ranking.piezas.map((p) => p.id)
    );
  if (detalleError) {
    throw new Error(detalleError.message);
  }
  const detallePorId = new Map(
    ((detalles ?? []) as DetallePieza[]).map((d) => [d.id, d])
  );

  const piezas = ranking.piezas.flatMap((piece) => {
    const detalle = detallePorId.get(piece.id);
    if (!detalle) return [];
    const metrics = piece.metrics ?? undefined;
    const analysis = detalle.analysis ?? undefined;
    const salesAttributed = piece.sales_attributed ?? undefined;

    return [
      {
        id: piece.id,
        type: detalle.type,
        title: detalle.title ?? detalle.caption?.slice(0, 60) ?? undefined,
        platform_post_url: detalle.platform_post_url ?? undefined,
        published_at: detalle.published_at ?? undefined,
        metrics,
        sales_attributed: salesAttributed,
        analysis_summary: analysis
          ? {
              formato: analysis.formato?.name,
              dolor: analysis.dolor?.name,
              angulo: analysis.angulo?.name,
            }
          : null,
        score: metricScore(metric, metrics ?? {}, salesAttributed),
      },
    ];
  });

  return { piezas, sinMetricas: ranking.sinMetricas };
}

export async function generateVariantCaptionAction(
  variantId: string
): Promise<string> {
  const organizationId = await requireProfileOrganizationId();
  const supabase = await createClient();

  const { data: variant, error } = await supabase
    .from("content_pieces")
    .select("*")
    .eq("id", variantId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !variant) {
    throw new Error("Variante no encontrada");
  }

  const brief = variant.brief as ContentBrief | null;
  if (!brief) {
    throw new Error("La variante no tiene brief");
  }

  let sourceCaption: string | null = null;
  if (variant.variants_of) {
    const { data: sourcePiece } = await supabase
      .from("content_pieces")
      .select("caption")
      .eq("id", variant.variants_of)
      .eq("organization_id", organizationId)
      .maybeSingle();
    sourceCaption = (sourcePiece?.caption as string | null) ?? null;
  }

  const prompt = `Generá un caption para Instagram en español (máximo 150 palabras) a partir de este brief de contenido.

Ángulo (usar como hook): ${brief.angulo.name} — ${brief.angulo.description}
Dolor: ${brief.dolor.name} — ${brief.dolor.description}
Formato: ${brief.formato.name} — ${brief.formato.description}
${sourceCaption ? `Caption original de referencia: "${sourceCaption}"` : ""}

Estructura del guión:
${brief.structure
  .map(
    (section) =>
      `- ${section.part}: ${section.description}${section.example_script ? ` (ej: ${section.example_script})` : ""}`
  )
  .join("\n")}

El caption debe sonar natural, abrir con el ángulo como gancho, desarrollar el dolor y cerrar con un CTA suave. Sin hashtags.

Respondé con JSON: { "caption": "..." }`;

  const result = await callClaudeJson<{ caption: string }>({
    organizationId,
    task: "create_content_variants",
    feature: "marketing_content",
    user: prompt,
    maxTokens: 800,
  });

  const caption = result?.caption?.trim();
  if (!caption) {
    throw new Error("No se pudo generar el caption");
  }

  return caption;
}

export async function publishVariantAsZernioDraftAction(
  variantId: string,
  caption: string
): Promise<{ postId: string; caption: string; platformPostUrl?: string }> {
  const organizationId = await requireProfileOrganizationId();
  const supabase = await createClient();
  const trimmedCaption = caption.trim();

  if (!trimmedCaption) {
    throw new Error("El caption no puede estar vacío");
  }

  const { data: variant, error } = await supabase
    .from("content_pieces")
    .select("*")
    .eq("id", variantId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !variant) {
    throw new Error("Variante no encontrada");
  }

  if (!variant.brief) {
    throw new Error("La variante no tiene brief");
  }

  if (!variant.variants_of) {
    throw new Error("Esta pieza no es una variante");
  }

  const { data: sourcePiece, error: sourceError } = await supabase
    .from("content_pieces")
    .select("platform, type")
    .eq("id", variant.variants_of)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (sourceError || !sourcePiece) {
    throw new Error("Pieza fuente no encontrada");
  }

  const integration = await getZernioIntegrationForOrg(organizationId);
  if (!integration?.connected_accounts.length) {
    throw new Error("Zernio no está conectado");
  }

  const platform =
    sourcePiece.platform ??
    integration.connected_accounts.find((a) => a.platform === "instagram")
      ?.platform ??
    integration.connected_accounts[0]?.platform ??
    "instagram";

  const accountId =
    integration.connected_accounts.find(
      (account) => account.platform === platform
    )?.accountId ?? integration.connected_accounts[0]?.accountId;

  const client = await getZernioClientForOrganization(organizationId);

  const created = await client.createPost({
    profileId: integration.zernio_profile_id,
    platform,
    postType: sourcePiece.type === "reel" ? "reel" : sourcePiece.type,
    status: "draft",
    content: trimmedCaption,
    accountId,
  });

  const post = created.post ?? created;
  const postId = String(post.id ?? post._id ?? "");
  if (!postId) {
    throw new Error("Zernio no devolvió ID del post");
  }

  const platformPostUrl =
    post.platformPostUrl ??
    created.platformPostUrl ??
    `https://zernio.com/posts/${postId}`;

  const { error: updateError } = await supabase
    .from("content_pieces")
    .update({
      status: "draft",
      platform,
      platform_post_id: postId,
      platform_post_url: platformPostUrl,
      caption: trimmedCaption,
    })
    .eq("id", variantId)
    .eq("organization_id", organizationId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  revalidatePath(paths.platform.marketing.content);
  if (variant.variants_of) {
    revalidatePath(paths.platform.marketing.contentDetail(variant.variants_of));
  }

  return { postId, caption: trimmedCaption, platformPostUrl };
}

// ─── Benchmark de métricas de la org ─────────────────────────────────────────

export type ContentBenchmark = {
  avgLikes: number;
  avgComments: number;
  avgShares: number;
  avgSaves: number;
  avgReach: number;
  avgImpressions: number;
  avgViews: number;
  avgEngagementRate: number;
  avgSaveRate: number;
  totalPieces: number;
};

export async function getContentBenchmarkAction(
  type?: string
): Promise<ContentBenchmark> {
  const organizationId = await requireProfileOrganizationId();
  const supabase = await createClient();

  // ⭐ Paginado: PostgREST corta en 1.000 filas sin avisar y el promedio
  // saldría de una parte de las piezas medidas. Sólo piezas con métricas: una
  // pieza sin medir no es un cero (SCRUM-172).
  const { rows: pieces, error } = await fetchAllRows<{
    id: string;
    metrics: Record<string, number> | null;
  }>((from, to) => {
    let query = supabase
      .from("content_pieces")
      .select("id, metrics")
      .eq("organization_id", organizationId)
      .not("metrics", "is", null);
    if (type && type !== "all") {
      query = query.eq("type", type);
    }
    return query.order("id", { ascending: true }).range(from, to);
  });
  if (error) {
    // Antes un error devolvía promedios en cero como si fueran datos.
    throw new Error(error);
  }
  const total = pieces.length;

  if (total === 0) {
    return {
      avgLikes: 0, avgComments: 0, avgShares: 0, avgSaves: 0,
      avgReach: 0, avgImpressions: 0, avgViews: 0,
      avgEngagementRate: 0, avgSaveRate: 0, totalPieces: 0,
    };
  }

  const sum = pieces.reduce(
    (acc, p) => {
      const m = p.metrics ?? {};
      acc.likes += (m.likes ?? 0);
      acc.comments += (m.comments ?? 0);
      acc.shares += (m.shares ?? 0);
      acc.saves += (m.saves ?? 0);
      acc.reach += (m.reach ?? 0);
      acc.impressions += (m.impressions ?? 0);
      acc.views += (m.views ?? 0);
      return acc;
    },
    { likes: 0, comments: 0, shares: 0, saves: 0, reach: 0, impressions: 0, views: 0 }
  );

  const avgViews = sum.views / total;
  const avgInteractions = (sum.likes + sum.comments + sum.shares) / total;
  const avgSaves = sum.saves / total;
  const avgEngagementRate = avgViews > 0 ? (avgInteractions / avgViews) * 100 : 0;
  const avgSaveRate = avgViews > 0 ? (avgSaves / avgViews) * 100 : 0;

  return {
    avgLikes: Math.round(sum.likes / total),
    avgComments: Math.round(sum.comments / total),
    avgShares: Math.round(sum.shares / total),
    avgSaves: Math.round(avgSaves),
    avgReach: Math.round(sum.reach / total),
    avgImpressions: Math.round(sum.impressions / total),
    avgViews: Math.round(avgViews),
    avgEngagementRate: Math.round(avgEngagementRate * 10) / 10,
    avgSaveRate: Math.round(avgSaveRate * 10) / 10,
    totalPieces: total,
  };
}
