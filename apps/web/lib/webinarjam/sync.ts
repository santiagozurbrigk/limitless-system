/**
 * lib/webinarjam/sync.ts
 *
 * Trae los webinars y sus registrantes desde WebinarJam / EverWebinar.
 *
 * Dos syncs distintos:
 *
 * - **Catálogo** (`syncWebinarJamWebinarsForOrg`) — la lista de webinars y sus
 *   horarios. Consulta los **dos prefijos**, porque son la misma API y no hay
 *   que averiguar cuál usa cada cliente. Los `schedule` id sólo salen del
 *   detalle, así que se pide uno por webinar.
 * - **Registrantes** (`syncWebinarJamRegistrantsForOrg`) — las personas. Es de
 *   donde salen M13, M14 y M15.
 *
 * ⚠️ **La API no acepta rangos de fecha arbitrarios**: `date_range` es una lista
 * de presets. Por eso se trae todo (`allTime`) y el recorte al período lo hace
 * el resolver del embudo sobre las fechas de cada fila.
 *
 * ⭐ **M15 se pide filtrada, no se deriva.** `attended_live=4` con
 * `attended_live_timestamp = <segundo de la oferta>` devuelve exactamente
 * "los que asistieron y se fueron después de ese segundo" — WebinarJam lo
 * calcula de su lado. Eso evita depender de `time_live`, cuya unidad la doc no
 * declara.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getWebinarJamWebinar,
  listWebinarJamRegistrants,
  listWebinarJamWebinars,
  WEBINARJAM_DATE_RANGE,
  WEBINARJAM_PRODUCTS,
  type WebinarJamProduct,
  type WebinarJamSchedule,
} from "./client";
import {
  decryptWebinarJamApiKey,
  getWebinarJamIntegrationForOrg,
} from "./integration";
import { normalizeRegistrant } from "./normalize-registrant";

export type WebinarSyncResult = {
  organizationId: string;
  webinars: number;
  /** Webinars por producto, para ver de dónde salió cada uno. */
  byProduct: Record<WebinarJamProduct, number>;
  skipped: number;
  error?: string;
};

export async function syncWebinarJamWebinarsForOrg(
  organizationId: string
): Promise<WebinarSyncResult> {
  const empty: WebinarSyncResult = {
    organizationId,
    webinars: 0,
    byProduct: { webinarjam: 0, everwebinar: 0 },
    skipped: 0,
  };

  try {
    const integration = await getWebinarJamIntegrationForOrg(organizationId);
    if (!integration) return { ...empty, error: "WebinarJam no configurado" };

    const apiKey = decryptWebinarJamApiKey(integration.api_key_encrypted, integration.organization_id);
    const admin = createAdminClient();
    const now = new Date().toISOString();

    const byProduct: Record<WebinarJamProduct, number> = { webinarjam: 0, everwebinar: 0 };
    let skipped = 0;
    const rows: Record<string, unknown>[] = [];

    for (const product of WEBINARJAM_PRODUCTS) {
      let webinars;
      try {
        webinars = await listWebinarJamWebinars(apiKey, product);
      } catch {
        // Una cuenta puede tener sólo uno de los dos productos. Que un prefijo
        // falle no invalida el otro.
        continue;
      }

      for (const webinar of webinars) {
        const webinarId = webinar.webinar_id;
        if (webinarId === undefined || webinarId === null || webinarId === "") {
          skipped += 1;
          continue;
        }

        // Los `schedule` id sólo vienen en el detalle: `/webinars` devuelve los
        // horarios como texto ("Every day, 01:00 PM"), y `/registrants` necesita
        // el id.
        let schedules: WebinarJamSchedule[] = [];
        let detail = null;
        try {
          detail = await getWebinarJamWebinar(apiKey, product, String(webinarId));
          schedules = (detail?.schedules ?? []).filter(
            (s): s is WebinarJamSchedule => typeof s === "object" && s !== null
          );
        } catch {
          // Sin detalle se guarda igual el webinar: sirve para elegirlo, sólo que
          // sin poder apuntar a una sesión concreta.
        }

        byProduct[product] += 1;
        rows.push({
          organization_id: organizationId,
          product,
          external_id: String(webinarId),
          name: webinar.name ?? null,
          title: webinar.title ?? null,
          webinar_type: webinar.type ?? null,
          timezone: webinar.timezone ?? null,
          schedules,
          raw: detail ?? webinar,
          synced_at: now,
        });
      }
    }

    if (rows.length) {
      const { error } = await admin
        .from("webinarjam_webinars")
        // `pitch_second` no va en el upsert a propósito: lo configura el usuario
        // y un sync no debe pisarlo.
        .upsert(rows, { onConflict: "organization_id,product,external_id" });
      if (error) return { ...empty, skipped, error: error.message };
    }

    await admin
      .from("webinarjam_integrations")
      .update({ webinars_synced_at: now, last_error: null })
      .eq("organization_id", organizationId);

    return { organizationId, webinars: rows.length, byProduct, skipped };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    await recordError(organizationId, message);
    return { ...empty, error: message };
  }
}

export type RegistrantSyncResult = {
  organizationId: string;
  registrants: number;
  /** Registrantes marcados como "se quedaron hasta la oferta". */
  stayedPastPitch: number;
  /** Webinars que no tienen `pitch_second` configurado: en esos M15 queda null. */
  webinarsWithoutPitch: number;
  skipped: number;
  error?: string;
};

export async function syncWebinarJamRegistrantsForOrg(
  organizationId: string
): Promise<RegistrantSyncResult> {
  const empty: RegistrantSyncResult = {
    organizationId,
    registrants: 0,
    stayedPastPitch: 0,
    webinarsWithoutPitch: 0,
    skipped: 0,
  };

  try {
    const integration = await getWebinarJamIntegrationForOrg(organizationId);
    if (!integration) return { ...empty, error: "WebinarJam no configurado" };

    const apiKey = decryptWebinarJamApiKey(integration.api_key_encrypted, integration.organization_id);
    const admin = createAdminClient();
    const now = new Date().toISOString();

    const { data: webinars } = await admin
      .from("webinarjam_webinars")
      .select("product, external_id, pitch_second")
      .eq("organization_id", organizationId);

    if (!webinars?.length) {
      return { ...empty, error: "Todavía no hay webinars sincronizados" };
    }

    let registrantCount = 0;
    let stayedCount = 0;
    let withoutPitch = 0;
    let skipped = 0;

    for (const webinar of webinars) {
      const product = webinar.product as WebinarJamProduct;
      const webinarId = webinar.external_id as string;
      const pitchSecond = webinar.pitch_second as number | null;

      let raw;
      try {
        raw = await listWebinarJamRegistrants(apiKey, product, {
          webinarId,
          dateRange: WEBINARJAM_DATE_RANGE.allTime,
        });
      } catch {
        skipped += 1;
        continue;
      }

      // M15: se pide filtrada al servidor con el segundo de la oferta. Sin
      // `pitch_second` no se puede preguntar, y `stayed_past_pitch` queda `null`
      // para todos — que es "no se sabe", no "no se quedaron".
      let stayedEmails: Set<string> | null = null;
      if (pitchSecond && pitchSecond > 0) {
        try {
          const stayed = await listWebinarJamRegistrants(apiKey, product, {
            webinarId,
            attendedLive: 4,
            attendedLiveTimestamp: pitchSecond,
            dateRange: WEBINARJAM_DATE_RANGE.allTime,
          });
          stayedEmails = new Set(
            stayed
              .map((r) => (typeof r.email === "string" ? r.email.trim().toLowerCase() : null))
              .filter((email): email is string => Boolean(email))
          );
        } catch {
          // La consulta filtrada falló: mejor dejar M15 sin dato que marcar a
          // todos como que no se quedaron.
          stayedEmails = null;
        }
      } else {
        withoutPitch += 1;
      }

      const rows = raw.flatMap((entry) => {
        const normalized = normalizeRegistrant(entry);
        if (!normalized) {
          skipped += 1;
          return [];
        }

        const stayed = stayedEmails ? stayedEmails.has(normalized.email) : null;
        if (stayed) stayedCount += 1;

        return [
          {
            organization_id: organizationId,
            product,
            webinar_external_id: webinarId,
            schedule_external_id: normalized.scheduleId,
            email: normalized.email,
            first_name: normalized.firstName,
            last_name: normalized.lastName,
            signup_at: normalized.signupAt,
            attended_live: normalized.attendedLive,
            attended_replay: normalized.attendedReplay,
            live_watched_at: normalized.liveWatchedAt,
            replay_watched_at: normalized.replayWatchedAt,
            stayed_past_pitch: stayed,
            purchased_live: normalized.purchasedLive,
            purchased_replay: normalized.purchasedReplay,
            utm_source: normalized.utmSource,
            utm_medium: normalized.utmMedium,
            utm_campaign: normalized.utmCampaign,
            raw: entry,
            synced_at: now,
          },
        ];
      });

      if (rows.length) {
        const { error } = await admin.from("webinarjam_registrants").upsert(rows, {
          onConflict: "organization_id,product,webinar_external_id,schedule_external_id,email",
        });
        if (error) return { ...empty, skipped, error: error.message };
        registrantCount += rows.length;
      }
    }

    await admin
      .from("webinarjam_integrations")
      .update({ registrants_synced_at: now, last_error: null })
      .eq("organization_id", organizationId);

    return {
      organizationId,
      registrants: registrantCount,
      stayedPastPitch: stayedCount,
      webinarsWithoutPitch: withoutPitch,
      skipped,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    await recordError(organizationId, message);
    return { ...empty, error: message };
  }
}

async function recordError(organizationId: string, message: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("webinarjam_integrations")
    .update({ last_error: message })
    .eq("organization_id", organizationId);
}
