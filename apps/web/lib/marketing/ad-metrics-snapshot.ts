/**
 * lib/marketing/ad-metrics-snapshot.ts
 *
 * I-1 del plan de integraciones — ver docs/specs/FUNNELS_SOURCE_MAP.md §5.
 *
 * Captura las métricas de anuncios de Zernio y las persiste por día en
 * `ad_metrics_daily`. Es lo que hace que la etapa Spend del spine tenga
 * historia: sin esto, los ads son live-fetch y la serie no es reconstruible
 * hacia atrás (docs/specs/FUNNELS_ARCHITECTURE.md §9.3).
 *
 * Cubre las medidas M01–M04 del mapa de fuentes, que son las etapas Spend y
 * Click de los tres embudos a la vez.
 */

import { createZernioClient, type ZernioLinkedAd } from "@/lib/zernio/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { getZernioApiKeyForOrganization } from "@/lib/zernio/integration";

export type AdMetricsSnapshotResult = {
  organizationId: string;
  status: "ok" | "skipped" | "error";
  adsCaptured: number;
  reason?: string;
};

/** Fila lista para persistir. Exportada para poder testear el mapeo sin red. */
export type AdMetricsRow = {
  organization_id: string;
  metric_date: string;
  platform: string;
  ad_external_id: string;
  ad_name: string | null;
  campaign_name: string | null;
  ad_set_name: string | null;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
};

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Los números que llegan de Zernio pueden venir como string, `null` o ausentes.
 * Se normalizan a 0 porque acá un ad sin gasto SÍ gastó cero — es un dato real,
 * no un hueco. La distinción `null` vs `0` de §9.1 aplica al resolver del
 * embudo, no a la captura: si el anuncio existe y no gastó, gastó cero.
 */
function numeric(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : 0;
}

/** Mapea un anuncio de Zernio a la fila diaria. Puro: testeable sin red. */
export function mapAdToRow(
  ad: ZernioLinkedAd,
  organizationId: string,
  metricDate: string
): AdMetricsRow | null {
  if (!ad?._id) return null;

  return {
    organization_id: organizationId,
    metric_date: metricDate,
    platform: (ad.platform || "meta").toLowerCase(),
    ad_external_id: ad._id,
    ad_name: ad.name ?? null,
    campaign_name: ad.campaignName ?? null,
    ad_set_name: ad.adSetName ?? null,
    spend: numeric(ad.metrics?.spend),
    impressions: numeric(ad.metrics?.impressions),
    reach: numeric(ad.metrics?.reach),
    clicks: numeric(ad.metrics?.clicks),
  };
}

/**
 * Deduplica por anuncio quedándose con la última aparición.
 *
 * Zernio puede devolver el mismo `_id` más de una vez cuando el anuncio está en
 * varios adsets; sin esto el upsert falla por conflicto contra sí mismo dentro
 * del mismo batch.
 */
export function dedupeRows(rows: AdMetricsRow[]): AdMetricsRow[] {
  const byKey = new Map<string, AdMetricsRow>();
  for (const row of rows) {
    byKey.set(`${row.metric_date}|${row.platform}|${row.ad_external_id}`, row);
  }
  return [...byKey.values()];
}

/** Captura y persiste las métricas del día para una organización. */
export async function captureAdMetricsForOrganization(
  organizationId: string,
  targetDate: Date = new Date()
): Promise<AdMetricsSnapshotResult> {
  const apiKey = await getZernioApiKeyForOrganization(organizationId);
  if (!apiKey) {
    return {
      organizationId,
      status: "skipped",
      adsCaptured: 0,
      reason: "La organización no tiene Zernio conectado",
    };
  }

  const metricDate = toIsoDate(targetDate);
  const client = createZernioClient(apiKey);

  let ads: ZernioLinkedAd[];
  try {
    const response = await client.listAds({
      source: "all",
      limit: 200,
      fromDate: metricDate,
      toDate: metricDate,
    });
    ads = response?.ads ?? [];
  } catch (error) {
    return {
      organizationId,
      status: "error",
      adsCaptured: 0,
      reason: error instanceof Error ? error.message : "Error consultando Zernio",
    };
  }

  const rows = dedupeRows(
    ads
      .map((ad) => mapAdToRow(ad, organizationId, metricDate))
      .filter((row): row is AdMetricsRow => row !== null)
  );

  if (rows.length === 0) {
    return { organizationId, status: "ok", adsCaptured: 0 };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("ad_metrics_daily")
    .upsert(rows, { onConflict: "organization_id,metric_date,platform,ad_external_id" });

  if (error) {
    return {
      organizationId,
      status: "error",
      adsCaptured: 0,
      reason: error.message,
    };
  }

  return { organizationId, status: "ok", adsCaptured: rows.length };
}

/** Captura para todas las orgs con Zernio conectado (integración activa y con key). */
export async function captureAdMetricsForAllOrganizations(
  targetDate: Date = new Date()
): Promise<AdMetricsSnapshotResult[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("zernio_integrations")
    .select("organization_id")
    .eq("is_active", true)
    .not("api_key", "is", null);

  if (error || !data) return [];

  return Promise.all(
    data.map((row) =>
      captureAdMetricsForOrganization(row.organization_id as string, targetDate)
    )
  );
}
