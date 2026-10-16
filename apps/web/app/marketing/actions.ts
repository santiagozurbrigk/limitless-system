"use server";

import { revalidatePath } from "next/cache";
import {
  requireOrganizationId,
  tryRequireOrganizationId,
} from "@/lib/auth/bootstrap";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import {
  getSalesContentRank,
  type SalesContentRankView,
} from "@/lib/marketing/content-sales-rank";
import { getClosedBuyerJourneys } from "@/lib/marketing/closed-buyer-journeys";
import { recomputeContentAssetAttribution } from "@/lib/marketing/content-attribution";
import { analyzeContentSalesPatterns } from "@/lib/marketing/analyze-content-patterns";
import { getSocialAudienceStats } from "@/lib/marketing/social-audience";
import type { ClosedBuyerJourney, MarketingAiInsight } from "@/types/marketing-insights";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ErrorEsperable,
  FallaDeLaBase,
  mutacionConErroresEsperables,
  registrarFallaDeAccion,
  type MutationResult,
} from "@/lib/server/action-result";
import { lecturaDegradable, valorSiNoEsFalla } from "@/lib/server/lectura-degradable";
import { rechazoConocidoDeClaude } from "@/lib/ai/rechazo-de-claude";
import { firstZodError, uuidSchema } from "@/lib/validations";
import { z } from "zod";
import type { ContentLabel } from "@/lib/content/label-content";
import {
  buildDistributionStats,
  generateDistributionInsight,
} from "@/lib/content/distribution-insight";
import { paths } from "@/routes";
import { getRetentionAtCTA } from "@/lib/youtube/analytics";
import { getUTMLinksAction } from "./utm-actions";
import type { UTMLinkRow } from "@/types/utm";

export type YouTubePlatformMetadataView = {
  view_count: number;
  like_count: number;
  comment_count: number;
  favorite_count: number;
  duration_seconds: number;
  definition: string | null;
  published_at: string | null;
  thumbnail_url: string | null;
  tags: string[];
};

export type ContentAssetPlatformMetadata = {
  youtube?: YouTubePlatformMetadataView;
};

export type ContentAssetView = {
  id: string;
  externalId: string;
  platform: "instagram" | "youtube";
  title: string;
  caption: string;
  thumbnailUrl: string | null;
  contentType: string | null;
  publishedAt: string | null;
  views: number;
  viewsOrganic: number;
  viewsPaid: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  reach: number;
  reelType: "reel" | "trial_reel" | null;
  distribution: "organic" | "paid";
  storyReplies: number;
  multiplier: number;
  effectiveLabel: ContentLabel | null;
  aiLabel: ContentLabel | null;
  manualLabel: ContentLabel | null;
  aiLabelConfidence: number | null;
  aiLabelReasoning: string | null;
  conversationsGenerated: number;
  bookingsInfluenced: number;
  salesInfluenced: number;
  revenueInfluenced: number;
  ctaMinute: number | null;
  retentionAtCtaPct: number | null;
  durationSeconds: number | null;
  platformMetadata: ContentAssetPlatformMetadata | null;
  engagementRate: number | null;
};

function rowToView(row: Record<string, unknown>): ContentAssetView {
  const caption = (row.caption as string) ?? "";
  const title =
    (row.title as string)?.trim() ||
    caption.trim().slice(0, 80) ||
    "Sin título";
  const platform = row.platform as "instagram" | "youtube";
  const likes = Number(row.likes ?? 0);
  const comments = Number(row.comments ?? 0);
  const shares = Number(row.shares ?? 0);
  const saves = Number(row.saves ?? 0);
  const reach = Number(row.reach ?? 0);
  const platformMetadata =
    (row.platform_metadata as ContentAssetPlatformMetadata | null) ?? null;
  const durationSeconds =
    row.duration_seconds != null
      ? Number(row.duration_seconds)
      : (platformMetadata?.youtube?.duration_seconds ?? null);

  const engagementRate =
    platform === "instagram" && reach > 0
      ? Math.round(((likes + comments + saves + shares) / reach) * 1000) / 10
      : null;

  return {
    id: row.id as string,
    externalId: (row.external_id as string) ?? "",
    platform,
    title,
    caption: (row.caption as string) ?? "",
    thumbnailUrl: (row.thumbnail_url as string) ?? null,
    contentType: (row.content_type as string) ?? null,
    publishedAt: (row.published_at as string) ?? null,
    views: Number(row.views ?? 0),
    viewsOrganic: Number(row.views_organic ?? row.views ?? 0),
    viewsPaid: Number(row.views_paid ?? 0),
    likes,
    comments,
    shares,
    saves,
    reach,
    reelType: (row.reel_type as "reel" | "trial_reel") ?? null,
    distribution:
      row.distribution === "paid"
        ? "paid"
        : "organic",
    storyReplies: Number(row.story_replies ?? 0),
    multiplier: Number(row.multiplier ?? 0),
    effectiveLabel: (row.effective_label as ContentLabel) ?? null,
    aiLabel: (row.ai_content_label as ContentLabel) ?? null,
    manualLabel: (row.manual_content_label as ContentLabel) ?? null,
    aiLabelConfidence:
      row.ai_label_confidence != null
        ? Number(row.ai_label_confidence)
        : null,
    aiLabelReasoning: (row.ai_label_reasoning as string) ?? null,
    conversationsGenerated: Number(row.conversations_generated ?? 0),
    bookingsInfluenced: Number(row.bookings_influenced ?? 0),
    salesInfluenced: Number(row.sales_influenced ?? 0),
    revenueInfluenced: Number(row.revenue_influenced ?? 0),
    ctaMinute: row.cta_minute != null ? Number(row.cta_minute) : null,
    retentionAtCtaPct:
      row.retention_at_cta_pct != null
        ? Number(row.retention_at_cta_pct)
        : null,
    durationSeconds,
    platformMetadata,
    engagementRate,
  };
}

/*
 * Errores como valor (SCRUM-519): las acciones de este archivo que estaban en
 * el conteo de `[ACTIONS-ERRORES-EN-PRODUCCION]` devuelven `MutationResult`
 * con `mutacionConErroresEsperables`. Sin sesión, un id inválido o un video
 * que no es de la organización vuelven con su motivo; una falla de la base va
 * a la consola y a Sentry y vuelve con el texto fijo. Antes, las lecturas
 * devolvían `[]`, `null` o "no conectado" ante una falla.
 */

const ID_DE_CONTENIDO_INVALIDO = "ID inválido";
const CONTENIDO_NO_ENCONTRADO = "No encontramos ese contenido.";

function validarIdDeContenido(assetId: unknown): string {
  const parsed = uuidSchema.safeParse(assetId);
  if (!parsed.success) throw new ErrorEsperable(ID_DE_CONTENIDO_INVALIDO);
  return parsed.data;
}

/** Los videos y posts de la organización; si la base falla, lanza. */
async function leerActivosDeContenido(organizationId: string): Promise<ContentAssetView[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("content_assets")
    .select("*")
    .eq("organization_id", organizationId)
    .order("published_at", { ascending: false });

  if (error) throw new FallaDeLaBase(error);
  return (data ?? []).map(rowToView);
}

export async function listContentAssetsAction(): Promise<MutationResult<ContentAssetView[]>> {
  return mutacionConErroresEsperables("[listContentAssets]", async () =>
    leerActivosDeContenido(await requireOrganizationId())
  );
}

/** El video o post de la organización; `null` si no existe o es de otra. */
export async function getContentAssetByIdAction(
  assetId: string
): Promise<MutationResult<ContentAssetView | null>> {
  return mutacionConErroresEsperables("[getContentAssetById]", async () => {
    const id = validarIdDeContenido(assetId);
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("content_assets")
      .select("*")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (error) throw new FallaDeLaBase(error);
    if (!data) return null;
    return rowToView(data as Record<string, unknown>);
  });
}

export type MarketingOverviewContext = {
  hasContentAssets: boolean;
  hasUtmAttributions: boolean;
  assets: ContentAssetView[];
  utmLinks: UTMLinkRow[];
  utmSummary: {
    totalBookings: number;
    totalSales: number;
    totalRevenue: number;
    totalClicks: number;
  };
  socialAudience: {
    followers: number;
    newFollowers: number;
  };
};

/**
 * El resumen de Marketing (escondido para el release, SCRUM-490). Si falla la
 * lectura del contenido, de la audiencia, de los turnos o de los UTMs
 * (SCRUM-520), el resumen entero vuelve con el texto fijo: antes mostraba
 * ceros como si fueran datos.
 */
export async function getMarketingOverviewContextAction(): Promise<
  MutationResult<MarketingOverviewContext>
> {
  return mutacionConErroresEsperables("[getMarketingOverviewContext]", async () => {
    const organizationId = await requireOrganizationId();

    // El recálculo de la atribución es previo a la lectura: si falla, el resumen
    // sigue con la atribución que había y la falla se registra (antes, sólo en
    // la consola).
    await recomputeContentAssetAttribution(organizationId).catch((err) => {
      registrarFallaDeAccion("[getMarketingOverviewContext] recálculo de atribución", err);
    });

    const admin = createAdminClient();
    // La consulta armada en el lugar va primera: si `from()` lanza al armarse,
    // las lecturas async de atrás todavía no empezaron (SCRUM-504 y SCRUM-517).
    const [bookingsCount, assets, utmLinks, socialAudience] = await Promise.all([
      admin
        .from("closing_calls")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .then(({ count, error }) => {
          if (error) throw new FallaDeLaBase(error);
          return count ?? 0;
        }),
      leerActivosDeContenido(organizationId),
      // El motivo ya viene para el usuario (y si fue una falla, ya quedó
      // registrada con la etiqueta de `getUTMLinks`): pasa tal cual. Antes una
      // falla de los UTMs sumaba ceros (SCRUM-520).
      getUTMLinksAction().then((links) => {
        if (!links.success) throw new ErrorEsperable(links.error);
        return links.data;
      }),
      getSocialAudienceStats(organizationId),
    ]);

    const utmSummary = utmLinks.reduce(
      (acc, link) => ({
        totalBookings: acc.totalBookings + link.bookings_attributed,
        totalSales: acc.totalSales + link.sales_attributed,
        totalRevenue: acc.totalRevenue + link.revenue_attributed,
        totalClicks: acc.totalClicks + link.clicks,
      }),
      { totalBookings: 0, totalSales: 0, totalRevenue: 0, totalClicks: 0 }
    );

    const totalBookings = Math.max(utmSummary.totalBookings, bookingsCount);

    const hasUtmAttributions =
      utmSummary.totalBookings > 0 ||
      utmSummary.totalSales > 0 ||
      utmSummary.totalRevenue > 0;

    return {
      hasContentAssets: assets.length > 0,
      hasUtmAttributions,
      assets,
      utmLinks,
      utmSummary: { ...utmSummary, totalBookings },
      socialAudience,
    };
  });
}

const etiquetaSchema = z
  .enum(["AUTORIDAD", "ATRACCION", "NUTRICION", "VENTA"], { error: "Etiqueta inválida." })
  .nullable();

/**
 * Cambia la etiqueta manual de un video o post. Si el id no es de la
 * organización, no se escribe nada y vuelve el motivo (antes respondía éxito
 * sin haber cambiado nada).
 */
export async function updateContentLabelAction(
  assetId: string,
  label: ContentLabel | null
): Promise<MutationResult> {
  return mutacionConErroresEsperables("[updateContentLabel]", async () => {
    const id = validarIdDeContenido(assetId);
    const etiqueta = etiquetaSchema.safeParse(label);
    if (!etiqueta.success) throw new ErrorEsperable(firstZodError(etiqueta.error));

    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("content_assets")
      .update({ manual_content_label: etiqueta.data })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select("id");

    if (error) throw new FallaDeLaBase(error);
    if (!data?.length) throw new ErrorEsperable(CONTENIDO_NO_ENCONTRADO);
    revalidatePath(paths.platform.marketing.content);
    revalidatePath(paths.platform.marketing.overview);
  });
}

const segundoDelCtaSchema = z
  .number({ error: "Indicá en qué segundo ocurre el CTA." })
  .int("Indicá en qué segundo ocurre el CTA.")
  .positive("Indicá en qué segundo ocurre el CTA.");

export async function updateCTAMinuteAction(
  assetId: string,
  ctaSecond: number
): Promise<MutationResult<{ retentionAtCtaPct: number }>> {
  return mutacionConErroresEsperables("[updateCTAMinute]", async () => {
    const id = validarIdDeContenido(assetId);
    const segundo = segundoDelCtaSchema.safeParse(ctaSecond);
    if (!segundo.success) throw new ErrorEsperable(firstZodError(segundo.error));

    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data: asset, error: fetchError } = await supabase
      .from("content_assets")
      .select("duration_seconds, platform_metadata, external_id")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (fetchError) throw new FallaDeLaBase(fetchError);
    if (!asset) throw new ErrorEsperable("Video no encontrado");

    const metadata = (asset.platform_metadata ?? {}) as ContentAssetPlatformMetadata;
    const durationSeconds =
      asset.duration_seconds != null
        ? Number(asset.duration_seconds)
        : (metadata.youtube?.duration_seconds ?? 0);

    const videoId = (asset.external_id as string | null) ?? null;
    const retentionAtCtaPct = await getRetentionAtCTA(
      organizationId,
      videoId,
      segundo.data,
      durationSeconds
    );

    const { error } = await supabase
      .from("content_assets")
      .update({
        cta_minute: segundo.data,
        retention_at_cta_pct: retentionAtCtaPct,
      })
      .eq("id", id)
      .eq("organization_id", organizationId);

    if (error) throw new FallaDeLaBase(error);

    revalidatePath(paths.platform.marketing.content);
    revalidatePath(`${paths.platform.marketing.content}/${id}`);
    revalidatePath(paths.platform.marketing.overview);

    return { retentionAtCtaPct };
  });
}

export async function getContentLabelDistributionAction(): Promise<
  MutationResult<Record<ContentLabel, number>>
> {
  return mutacionConErroresEsperables("[getContentLabelDistribution]", async () => {
    const assets = await leerActivosDeContenido(await requireOrganizationId());
    const base: Record<ContentLabel, number> = {
      AUTORIDAD: 0,
      ATRACCION: 0,
      NUTRICION: 0,
      VENTA: 0,
    };
    for (const a of assets) {
      if (a.effectiveLabel) base[a.effectiveLabel]++;
    }
    return base;
  });
}

/**
 * Mapea los campos de análisis de content_pieces (hook_type, cta_type)
 * a la taxonomía ContentLabel (AUTORIDAD / ATRACCION / NUTRICION / VENTA).
 *
 * Reglas de negocio:
 * - CTA de conversión directa (dm, comment_word) → VENTA
 * - Hook contrarian o prueba_social sin CTA de venta → AUTORIDAD
 * - Hook de curiosidad sin CTA de venta → ATRACCION
 * - Hook de dolor directo o resultado sin CTA de venta → NUTRICION
 * - Sin datos suficientes → null (se omite)
 */
function mapContentPieceAnalysisToLabel(analysis: {
  hook_type?: string | null;
  cta_type?: string | null;
}): ContentLabel | null {
  const { hook_type, cta_type } = analysis;
  if (!hook_type && !cta_type) return null;
  if (cta_type === "dm" || cta_type === "comment_word") return "VENTA";
  if (hook_type === "contrarian" || hook_type === "prueba_social") return "AUTORIDAD";
  if (hook_type === "curiosidad") return "ATRACCION";
  if (hook_type === "dolor_directo" || hook_type === "resultado") return "NUTRICION";
  return null;
}

export type DistribucionDeContenido = {
  counts: Record<ContentLabel, number>;
  total: number;
  insight: string | null;
  hasContentAssets: boolean;
};

/**
 * La frase de la IA sobre la distribución es opcional: si Claude falla, el
 * gráfico sale igual sin ella. Una clave rechazada o sin créditos no se
 * registra (el usuario ya lo ve en Ajustes); cualquier otra falla se registra
 * con el tag `lectura_degradada`.
 */
function leerInsightDeDistribucion(
  organizationId: string,
  stats: ReturnType<typeof buildDistributionStats>
): Promise<string | null> {
  return lecturaDegradable(
    "marketing:insight-de-distribucion",
    () =>
      generateDistributionInsight({ organizationId, stats }).catch((error: unknown) => {
        throw rechazoConocidoDeClaude(error);
      }),
    null
  ).catch((error) => valorSiNoEsFalla(error, null));
}

export async function getContentDistributionDataAction(): Promise<
  MutationResult<DistribucionDeContenido>
> {
  return mutacionConErroresEsperables("[getContentDistributionData]", async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    // 1. Piezas legacy (content_assets) — ya etiquetadas con ContentLabel
    const assets = await leerActivosDeContenido(organizationId);

    // 2. Piezas Zernio (content_pieces) — mapear desde analysis.hook_type/cta_type
    const { data: pieces, error } = await supabase
      .from("content_pieces")
      .select("analysis")
      .eq("organization_id", organizationId)
      .not("analysis", "is", null);

    if (error) throw new FallaDeLaBase(error);

    const zernioItems = (pieces ?? [])
      .map((p) => {
        const a = p.analysis as { hook_type?: string | null; cta_type?: string | null } | null;
        if (!a) return null;
        const effectiveLabel = mapContentPieceAnalysisToLabel(a);
        return effectiveLabel
          ? { effectiveLabel, conversationsGenerated: 0, bookingsInfluenced: 0, salesInfluenced: 0 }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    // 3. Combinar ambas fuentes para las estadísticas
    const combined = [...assets, ...zernioItems];
    const stats = buildDistributionStats(combined);
    const insight = await leerInsightDeDistribucion(organizationId, stats);

    return {
      counts: stats.counts,
      total: stats.total,
      insight,
      hasContentAssets: combined.length > 0,
    };
  });
}

export type EstadoDeYoutube = {
  connected: boolean;
  channelName: string | null;
  lastSyncAt: string | null;
};

/**
 * Si la lectura falla, el motivo (texto fijo) y no "no conectado": la pantalla
 * de Integraciones lo muestra como un estado que no se pudo leer (SCRUM-519).
 */
export async function getYoutubeIntegrationStatusAction(): Promise<
  MutationResult<EstadoDeYoutube>
> {
  return mutacionConErroresEsperables("[getYoutubeIntegrationStatus]", async () => {
    const organizationId = await requireOrganizationId();
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("youtube_integrations")
      .select("status, channel_name, last_sync_at")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (error) throw new FallaDeLaBase(error);

    return {
      connected: data?.status === "connected",
      channelName: data?.channel_name ?? null,
      lastSyncAt: data?.last_sync_at ?? null,
    };
  });
}

export type EstadoDeInstagram = {
  connected: boolean;
  username: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
  status: "active" | "error" | "disconnected" | null;
};

export async function getInstagramIntegrationStatusAction(): Promise<
  MutationResult<EstadoDeInstagram>
> {
  return mutacionConErroresEsperables("[getInstagramIntegrationStatus]", async () => {
    const organizationId = await requireOrganizationId();
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("instagram_integrations")
      .select(
        "status, instagram_username, connected_at, last_sync_at"
      )
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (error) throw new FallaDeLaBase(error);

    const status =
      (data?.status as "active" | "error" | "disconnected" | undefined) ?? null;

    return {
      connected: status === "active",
      username: data?.instagram_username ?? null,
      connectedAt: data?.connected_at ?? null,
      lastSyncAt: data?.last_sync_at ?? null,
      status,
    };
  });
}

export async function getSalesContentRankAction(): Promise<
  SalesContentRankView[]
> {
  if (!isSupabaseConfigured()) return [];
  const organizationId = await tryRequireOrganizationId();
  if (!organizationId) return [];
  try {
    return await getSalesContentRank(organizationId);
  } catch (error) {
    console.error("[getSalesContentRank]", error);
    return [];
  }
}

export async function getClosedBuyerJourneysAction(): Promise<
  ClosedBuyerJourney[]
> {
  if (!isSupabaseConfigured()) return [];
  const organizationId = await tryRequireOrganizationId();
  if (!organizationId) return [];
  try {
    return await getClosedBuyerJourneys(organizationId);
  } catch (error) {
    console.error("[getClosedBuyerJourneys]", error);
    return [];
  }
}

export async function getContentPatternsAnalysisAction(): Promise<
  MarketingAiInsight[]
> {
  if (!isSupabaseConfigured()) return [];
  const organizationId = await tryRequireOrganizationId();
  if (!organizationId) return [];

  try {
    const [rank, journeys, assets] = await Promise.all([
      getSalesContentRank(organizationId),
      getClosedBuyerJourneys(organizationId),
      leerActivosDeContenido(organizationId),
    ]);

    if (rank.length === 0 && journeys.length === 0) return [];

    const rankSummary = rank
      .map(
        (r) =>
          `- ${r.title} (${r.type}): ${r.salesCount} ventas, $${r.revenue}`
      )
      .join("\n");

    const journeysSummary = journeys
      .slice(0, 8)
      .map(
        (j) =>
          `${j.leadName}: ${j.steps.map((s) => s.label).join(" → ")} ($${j.closedAmount})`
      )
      .join("\n");

    const assetsSummary = assets
      .slice(0, 20)
      .map(
        (a) =>
          `- ${a.title} [${a.contentType ?? "?"}] label=${a.effectiveLabel ?? "—"} conv=${a.conversationsGenerated} ventas=${a.salesInfluenced}`
      )
      .join("\n");

    const insights = await analyzeContentSalesPatterns({
      organizationId,
      rankSummary: rankSummary || "Sin ranking todavía",
      journeysSummary: journeysSummary || "Sin journeys todavía",
      assetsSummary: assetsSummary || "Sin contenido importado",
    });

    return insights ?? [];
  } catch (error) {
    console.error("[getContentPatternsAnalysis]", error);
    return [];
  }
}
