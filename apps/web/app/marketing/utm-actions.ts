"use server";

import { revalidatePath } from "next/cache";
import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ErrorEsperable,
  FallaDeLaBase,
  mutacionConErroresEsperables,
  type MutationResult,
} from "@/lib/server/action-result";
import { uuidSchema } from "@/lib/validations";
import {
  buildLandingUtmUrl,
  buildManychatUrl,
  normalizeInstagramUsername,
  resolveUtmBaseUrl,
  resolveUtmLinkType,
} from "@/lib/utm/build-links";
import { slugifyCampaign } from "@/lib/utm/slugify-campaign";
import { paths } from "@/routes";
import type {
  UTMBookingAttributionRow,
  UTMLeadCaptureRow,
  UTMLinkRow,
  UTMFunnelData,
  UTMSaleAttributionRow,
} from "@/types/utm";

// ---------------------------------------------------------------------------
// Helpers privados
// ---------------------------------------------------------------------------

function rowToUTMLink(row: Record<string, unknown>): UTMLinkRow {
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    youtube_video_id: (row.youtube_video_id as string) ?? null,
    youtube_video_title: (row.youtube_video_title as string) ?? null,
    utm_source: (row.utm_source as string) ?? "youtube",
    utm_medium: (row.utm_medium as string) ?? "video",
    utm_campaign: row.utm_campaign as string,
    utm_content: (row.utm_content as string) ?? null,
    full_url: row.full_url as string,
    manychat_page_id: (row.manychat_page_id as string) ?? null,
    manychat_ref: (row.manychat_ref as string) ?? null,
    manychat_url: (row.manychat_url as string) ?? null,
    instagram_username: (row.instagram_username as string) ?? null,
    link_type:
      (row.link_type as UTMLinkRow["link_type"]) ??
      (row.manychat_url ? "both" : "landing"),
    clicks: Number(row.clicks ?? 0),
    leads_captured: Number(row.leads_captured ?? 0),
    bookings_attributed: Number(row.bookings_attributed ?? 0),
    sales_attributed: Number(row.sales_attributed ?? 0),
    revenue_attributed: Number(row.revenue_attributed ?? 0),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function rowToUTMLead(row: Record<string, unknown>): UTMLeadCaptureRow {
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    utm_link_id: (row.utm_link_id as string) ?? null,
    utm_source: (row.utm_source as string) ?? null,
    utm_medium: (row.utm_medium as string) ?? null,
    utm_campaign: (row.utm_campaign as string) ?? null,
    utm_content: (row.utm_content as string) ?? null,
    lead_email: (row.lead_email as string) ?? null,
    lead_identifier: (row.lead_identifier as string) ?? null,
    captured_at: row.captured_at as string,
    converted_to_conversation: Boolean(row.converted_to_conversation),
    converted_to_booking: Boolean(row.converted_to_booking),
    converted_to_sale: Boolean(row.converted_to_sale),
  };
}

const CONTENT_ASSET_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Si llega el UUID interno del asset, guardar el external_id de YouTube para
 * atribución. Si la lectura falla, lanza (SCRUM-520): antes se guardaba el
 * UUID interno como si fuera el id del video y la atribución se perdía.
 */
async function resolveYoutubeVideoExternalId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  videoId: string | undefined
): Promise<string | null | undefined> {
  if (!videoId?.trim()) return videoId ?? null;
  const trimmed = videoId.trim();
  if (!CONTENT_ASSET_UUID_RE.test(trimmed)) return trimmed;

  const { data, error } = await supabase
    .from("content_assets")
    .select("external_id")
    .eq("organization_id", organizationId)
    .eq("id", trimmed)
    .eq("platform", "youtube")
    .maybeSingle();

  if (error) throw new FallaDeLaBase(error);
  return data?.external_id ?? trimmed;
}

/**
 * La URL del sitio de la organización. Si la lectura falla, lanza
 * (SCRUM-520): antes la creación y la edición de un UTM armaban el link con
 * la URL por defecto como si la organización no tuviera una.
 */
async function leerUrlDelSitio(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("organizations")
    .select("website_url")
    .eq("id", organizationId)
    .maybeSingle();

  if (error) throw new FallaDeLaBase(error);
  return (data?.website_url as string | null) ?? null;
}

const ID_INVALIDO = "ID inválido";
const UTM_NO_ENCONTRADO = "UTM no encontrado.";
const CAMPANA_OBLIGATORIA = "La campaña UTM es obligatoria.";
const CAMPANA_REPETIDA = "Ya existe un UTM con esa campaña.";

function validarId(id: unknown): string {
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) throw new ErrorEsperable(ID_INVALIDO);
  return parsed.data;
}

/** El rechazo de un insert o update de `utm_links`: la campaña repetida es esperable. */
function rechazoAlGuardar(error: { message: string; code?: string | null }): Error {
  if (error.code === "23505") return new ErrorEsperable(CAMPANA_REPETIDA);
  return new FallaDeLaBase(error);
}

function mapClosingCallEmbed(
  raw: unknown
): UTMBookingAttributionRow["closing_calls"] {
  if (!raw) return null;
  const embedded = Array.isArray(raw) ? raw[0] : raw;
  if (!embedded || typeof embedded !== "object") return null;
  const row = embedded as Record<string, unknown>;
  return {
    lead_name: (row.lead_name as string) ?? "",
    scheduled_at: (row.scheduled_at as string) ?? "",
    status: (row.status as string) ?? "",
  };
}

function mapClientEmbed(raw: unknown): UTMSaleAttributionRow["clients"] {
  if (!raw) return null;
  const embedded = Array.isArray(raw) ? raw[0] : raw;
  if (!embedded || typeof embedded !== "object") return null;
  const row = embedded as Record<string, unknown>;
  return {
    name: (row.name as string) ?? "",
    status: (row.status as string) ?? "",
  };
}

// ---------------------------------------------------------------------------
// Acciones exportadas
// ---------------------------------------------------------------------------
//
// Errores como valor (SCRUM-520): un rechazo esperable (sin sesión, id
// inválido, campaña vacía o repetida, UTM inexistente o de otra organización)
// vuelve con su mensaje; cualquier otra falla se registra con la etiqueta de la
// acción y vuelve con el texto fijo.

/** La URL del sitio de la organización; si la lectura falla, el motivo y no `null`. */
export async function getOrganizationWebsiteAction(): Promise<MutationResult<string | null>> {
  return mutacionConErroresEsperables("[getOrganizationWebsite]", async () => {
    const organizationId = await requireOrganizationId();
    return leerUrlDelSitio(await createClient(), organizationId);
  });
}

/** URL base para previews de UTM (org o fallback Limitless). */
export async function getUtmBaseUrlAction(): Promise<MutationResult<string>> {
  return mutacionConErroresEsperables("[getUtmBaseUrl]", async () => {
    const organizationId = await requireOrganizationId();
    return resolveUtmBaseUrl(await leerUrlDelSitio(await createClient(), organizationId));
  });
}

/**
 * Los UTMs de la organización. Si la base falla, el motivo y no una lista
 * vacía (SCRUM-520): antes `/marketing/utms` decía "Todavía no creaste UTMs"
 * y el resumen de Marketing sumaba ceros.
 */
export async function getUTMLinksAction(): Promise<MutationResult<UTMLinkRow[]>> {
  return mutacionConErroresEsperables("[getUTMLinks]", async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("utm_links")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (error) throw new FallaDeLaBase(error);
    return (data ?? []).map((row) =>
      rowToUTMLink(row as Record<string, unknown>)
    );
  });
}

export async function getUTMLeadsAction(
  utmLinkId: string
): Promise<MutationResult<UTMLeadCaptureRow[]>> {
  return mutacionConErroresEsperables("[getUTMLeads]", async () => {
    const linkId = validarId(utmLinkId);
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("utm_lead_captures")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("utm_link_id", linkId)
      .order("captured_at", { ascending: false });

    if (error) throw new FallaDeLaBase(error);
    return (data ?? []).map((row) =>
      rowToUTMLead(row as Record<string, unknown>)
    );
  });
}

export async function getUTMFunnelAction(
  utmLinkId: string
): Promise<MutationResult<UTMFunnelData>> {
  return mutacionConErroresEsperables("[getUTMFunnel]", async () => {
    const linkId = validarId(utmLinkId);
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const [captures, bookings, sales] = await Promise.all([
      supabase
        .from("utm_lead_captures")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("utm_link_id", linkId)
        .order("captured_at", { ascending: false }),

      supabase
        .from("utm_booking_attributions")
        .select("id, lead_name, lead_email, booked_at, closing_calls(lead_name, scheduled_at, status)")
        .eq("organization_id", organizationId)
        .eq("utm_link_id", linkId)
        .order("booked_at", { ascending: false }),

      supabase
        .from("utm_sale_attributions")
        .select("id, revenue, sold_at, clients(name, status)")
        .eq("organization_id", organizationId)
        .eq("utm_link_id", linkId)
        .order("sold_at", { ascending: false }),
    ]);

    if (captures.error) throw new FallaDeLaBase(captures.error);
    if (bookings.error) throw new FallaDeLaBase(bookings.error);
    if (sales.error) throw new FallaDeLaBase(sales.error);

    const salesRows = sales.data ?? [];

    return {
      leads: (captures.data ?? []).map((row) =>
        rowToUTMLead(row as Record<string, unknown>)
      ),
      bookings: (bookings.data ?? []).map((row) => ({
        id: row.id as string,
        lead_name: (row.lead_name as string | null) ?? null,
        lead_email: (row.lead_email as string | null) ?? null,
        booked_at: row.booked_at as string,
        closing_calls: mapClosingCallEmbed(row.closing_calls),
      })),
      sales: salesRows.map((row) => ({
        id: row.id as string,
        revenue: Number(row.revenue ?? 0),
        sold_at: row.sold_at as string,
        clients: mapClientEmbed(row.clients),
      })),
      totalRevenue: salesRows.reduce(
        (sum, s) => sum + Number(s.revenue ?? 0),
        0
      ),
    };
  });
}

export async function createUTMLinkAction(data: {
  youtube_video_id?: string;
  youtube_video_title?: string;
  utm_campaign: string;
  utm_content?: string;
  instagram_username?: string;
  manychat_page_id?: string;
}): Promise<MutationResult<UTMLinkRow>> {
  return mutacionConErroresEsperables("[createUTMLink]", async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const campaign =
      data.utm_campaign.trim() ||
      (data.youtube_video_title
        ? slugifyCampaign(data.youtube_video_title)
        : "");

    if (!campaign) {
      throw new ErrorEsperable(CAMPANA_OBLIGATORIA);
    }

    const baseUrl = resolveUtmBaseUrl(await leerUrlDelSitio(supabase, organizationId));
    const full_url = buildLandingUtmUrl(
      campaign,
      data.utm_content,
      baseUrl
    );
    const instagramUsername = data.instagram_username
      ? normalizeInstagramUsername(data.instagram_username)
      : null;
    const { ref: manychat_ref, url: manychat_url } = buildManychatUrl({
      utmCampaign: campaign,
      instagramUsername,
      manychatPageId: data.manychat_page_id,
    });
    const link_type = resolveUtmLinkType(manychat_url);

    const youtubeVideoId = await resolveYoutubeVideoExternalId(
      supabase,
      organizationId,
      data.youtube_video_id
    );

    const { data: utmLink, error } = await supabase
      .from("utm_links")
      .insert({
        organization_id: organizationId,
        youtube_video_id: youtubeVideoId ?? null,
        youtube_video_title: data.youtube_video_title ?? null,
        utm_source: "youtube",
        utm_medium: "video",
        utm_campaign: campaign,
        utm_content: data.utm_content ?? null,
        full_url,
        manychat_ref,
        manychat_url,
        instagram_username: instagramUsername,
        manychat_page_id: data.manychat_page_id?.trim() || null,
        link_type,
      })
      .select()
      .single();

    if (error) throw rechazoAlGuardar(error);

    revalidatePath(paths.platform.marketing.utms);
    return rowToUTMLink(utmLink as Record<string, unknown>);
  });
}

export async function updateUTMLinkAction(
  id: string,
  data: {
    youtube_video_id?: string;
    youtube_video_title?: string;
    utm_campaign?: string;
    utm_content?: string;
    instagram_username?: string;
    manychat_page_id?: string;
  }
): Promise<MutationResult<UTMLinkRow>> {
  return mutacionConErroresEsperables("[updateUTMLink]", async () => {
    const linkId = validarId(id);
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data: existing, error: readError } = await supabase
      .from("utm_links")
      .select("*")
      .eq("id", linkId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    // Antes una falla de la lectura se mostraba como "UTM no encontrado.".
    if (readError) throw new FallaDeLaBase(readError);
    if (!existing) throw new ErrorEsperable(UTM_NO_ENCONTRADO);

    const campaign =
      data.utm_campaign?.trim() ||
      (existing.utm_campaign as string) ||
      "";

    if (!campaign) {
      throw new ErrorEsperable(CAMPANA_OBLIGATORIA);
    }

    const baseUrl = resolveUtmBaseUrl(await leerUrlDelSitio(supabase, organizationId));
    const utmContent =
      data.utm_content !== undefined
        ? data.utm_content || null
        : (existing.utm_content as string | null);
    const full_url = buildLandingUtmUrl(campaign, utmContent ?? undefined, baseUrl);

    const instagramUsername = data.instagram_username
      ? normalizeInstagramUsername(data.instagram_username)
      : (existing.instagram_username as string | null);

    const { ref: manychat_ref, url: manychat_url } = buildManychatUrl({
      utmCampaign: campaign,
      instagramUsername,
      manychatPageId:
        data.manychat_page_id?.trim() ||
        (existing.manychat_page_id as string | null),
    });
    const link_type = resolveUtmLinkType(manychat_url);

    const youtubeVideoId =
      data.youtube_video_id !== undefined
        ? await resolveYoutubeVideoExternalId(
            supabase,
            organizationId,
            data.youtube_video_id
          )
        : (existing.youtube_video_id as string | null);

    const { data: updated, error } = await supabase
      .from("utm_links")
      .update({
        youtube_video_id: youtubeVideoId ?? null,
        youtube_video_title:
          data.youtube_video_title !== undefined
            ? data.youtube_video_title ?? null
            : (existing.youtube_video_title as string | null),
        utm_campaign: campaign,
        utm_content: utmContent,
        full_url,
        manychat_ref,
        manychat_url,
        instagram_username: instagramUsername,
        manychat_page_id:
          data.manychat_page_id?.trim() ||
          (existing.manychat_page_id as string | null),
        link_type,
        updated_at: new Date().toISOString(),
      })
      .eq("id", linkId)
      .eq("organization_id", organizationId)
      .select()
      .single();

    // PGRST116: el update no encontró la fila (se borró entre la lectura y la
    // escritura).
    if (error?.code === "PGRST116") throw new ErrorEsperable(UTM_NO_ENCONTRADO);
    if (error) throw rechazoAlGuardar(error);

    revalidatePath(paths.platform.marketing.utms);
    return rowToUTMLink(updated as Record<string, unknown>);
  });
}

/**
 * Borra un UTM de la organización. Si el id no es de la organización, no se
 * borra nada y vuelve el motivo (antes respondía éxito sin haber borrado).
 */
export async function deleteUTMLinkAction(id: string): Promise<MutationResult> {
  return mutacionConErroresEsperables("[deleteUTMLink]", async () => {
    const linkId = validarId(id);
    const organizationId = await requireOrganizationId();
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("utm_links")
      .delete()
      .eq("id", linkId)
      .eq("organization_id", organizationId)
      .select("id");

    if (error) throw new FallaDeLaBase(error);
    if (!data?.length) throw new ErrorEsperable(UTM_NO_ENCONTRADO);
    revalidatePath(paths.platform.marketing.utms);
  });
}
