/**
 * Sync de llamadas de Calendly por closer individual.
 *
 * Cada closer tiene su propio token en team_member_integrations.
 * Fetcheamos sus eventos filtrando por su calendly_user_uri, luego
 * asignamos closer_id en closing_calls.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchCalendlyScheduledEventPayloads,
  statusDeLaApiDeCalendly,
} from "@/lib/calendly/fetch-scheduled-events";
import { FallaDeLaBase } from "@/lib/server/action-result";
import { repairClosingConversationLinks } from "@/lib/conversations/repair-links";
import { syncMayOverwriteStatus } from "@/lib/closing/call-status";
import type { ClosingCallStatus } from "@/types/closing";
import { attributeBookingToUTM } from "@/lib/utm/attribute-booking";
import type { CalendlyEventSyncPayload } from "@/types/calendly";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type CloserCalendlyConfig = {
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  calendly_user_uri: string;
};

type CloserIntegrationRow = {
  user_id: string;
  organization_id: string;
  config: CloserCalendlyConfig;
  last_sync_at: string | null;
};

export type CloserSyncResult = {
  profileId: string;
  organizationId: string;
  inserted: number;
  updated: number;
  skippedManualStatus: number;
  fetched: number;
  skipped?: boolean;
  reason?: string;
};

/**
 * Calendly rechazó la conexión del closer o limitó las consultas. No es una
 * falla del sistema: la sync manual (`syncCloserCalendlyAction`) lo devuelve
 * con un motivo claro y la del cron lo anota como `reason`, igual que antes.
 *   - `conexion_vencida`: el refresh token ya no sirve (400 `invalid_grant`)
 *     o la API rechaza el access token (401). Hay que volver a conectar
 *     Calendly. Un 403 no: es una falla.
 *   - `limite_de_consultas`: la API respondió 429.
 * El mensaje es el detalle de Calendly, para el log; el usuario no lo ve.
 */
export class RechazoDeCalendly extends Error {
  readonly motivo: "conexion_vencida" | "limite_de_consultas";
  constructor(motivo: RechazoDeCalendly["motivo"], detalle: string) {
    super(detalle);
    this.name = "RechazoDeCalendly";
    this.motivo = motivo;
  }
}

// ─── Token refresh para closers ────────────────────────────────────────────────

async function refreshCloserToken(
  config: CloserCalendlyConfig
): Promise<CloserCalendlyConfig> {
  const clientId = process.env.CALENDLY_CLIENT_ID;
  const clientSecret = process.env.CALENDLY_CLIENT_SECRET;
  const tokenUrl = process.env.CALENDLY_AUTH_TOKEN ?? "https://auth.calendly.com/oauth/token";

  if (!clientId || !clientSecret) throw new Error("Faltan CALENDLY_CLIENT_ID / CALENDLY_CLIENT_SECRET");

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: config.refresh_token,
    }),
  });

  const json = await resp.json().catch(() => null);
  const detalle = json?.message ?? "No se pudo renovar el token del closer";
  // OAuth 2.0: un refresh token vencido o revocado vuelve 400 `invalid_grant`
  // (verificado contra auth.calendly.com el 2026-10-08). Un 401
  // `invalid_client` es la configuración de la app, no del closer: falla.
  if (resp.status === 400 && json?.error === "invalid_grant") {
    throw new RechazoDeCalendly("conexion_vencida", detalle);
  }
  if (!resp.ok || !json?.access_token) {
    throw new Error(detalle);
  }

  return {
    ...config,
    access_token: String(json.access_token),
    refresh_token: String(json.refresh_token ?? config.refresh_token),
    token_expires_at: new Date(Date.now() + Number(json.expires_in ?? 7200) * 1000).toISOString(),
  };
}

async function getValidCloserToken(row: CloserIntegrationRow): Promise<CloserCalendlyConfig> {
  const config = row.config;
  const expiresAt = config.token_expires_at ? new Date(config.token_expires_at).getTime() : 0;
  const needsRefresh = !expiresAt || expiresAt < Date.now() + 60_000;

  if (!needsRefresh) return config;

  const refreshed = await refreshCloserToken(config);

  const admin = createAdminClient();
  const { error } = await admin
    .from("team_member_integrations")
    .update({
      config: refreshed,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", row.organization_id)
    .eq("user_id", row.user_id)
    .eq("integration_type", "calendly");

  // Calendly rota el refresh token: si no se guarda, el próximo sync falla con
  // `invalid_grant` y parecería que la conexión venció. Es una falla de la
  // base y se dice como tal (AR de SCRUM-504).
  if (error) throw new FallaDeLaBase(error);

  return refreshed;
}

// ─── Sync de un closer ────────────────────────────────────────────────────────

/**
 * Fetch + upsert de closing_calls para un closer específico.
 * Los eventos se filtran por su calendly_user_uri y se asigna closer_id.
 *
 * Lanza: un `RechazoDeCalendly` si Calendly rechaza la conexión o limita las
 * consultas, y cualquier otra excepción si algo falla (la red, la base, un
 * bug). La usa la sync manual, que distingue los dos casos; el cron usa
 * `syncCloserCalendlyEvents`, que no lanza.
 */
export async function sincronizarEventosDelCloser(
  row: CloserIntegrationRow
): Promise<CloserSyncResult> {
  const { user_id: profileId, organization_id: organizationId } = row;

  const config = await getValidCloserToken(row);
  const { calendly_user_uri: calendlyUserUri } = config;

  if (!calendlyUserUri) {
    return { profileId, organizationId, inserted: 0, updated: 0, skippedManualStatus: 0, fetched: 0, skipped: true, reason: "no_user_uri" };
  }

  // Fetch eventos del closer (la API de Calendly permite filtrar por user)
  let events: CalendlyEventSyncPayload[];
  try {
    events = await fetchCalendlyScheduledEventPayloads(
      config.access_token,
      calendlyUserUri, // pasamos el userUri como "orgUri" — Calendly acepta user URI aquí también
      {}
    );
  } catch (err) {
    const status = statusDeLaApiDeCalendly(err);
    const detalle = err instanceof Error ? err.message : String(err);
    // Sólo el 401 está verificado contra Calendly ("The access token is
    // invalid"). Un 403 puede ser un permiso o el plan de la app: es una falla
    // y va a Sentry (AR de SCRUM-504, MENOR-3).
    if (status === 401) throw new RechazoDeCalendly("conexion_vencida", detalle);
    if (status === 429) throw new RechazoDeCalendly("limite_de_consultas", detalle);
    throw err;
  }

  if (!events.length) {
    return { profileId, organizationId, inserted: 0, updated: 0, skippedManualStatus: 0, fetched: 0 };
  }

  // Upsert en closing_calls con closer_id asignado
  const result = await upsertClosingCallsForCloser(
    organizationId,
    profileId,
    calendlyUserUri,
    events
  );

  // Actualizar last_sync_at
  const admin = createAdminClient();
  await admin
    .from("team_member_integrations")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("user_id", profileId)
    .eq("integration_type", "calendly");

  return { profileId, organizationId, ...result, fetched: events.length };
}

/**
 * Lo mismo para el cron: no lanza. Un error (también un rechazo de Calendly)
 * se registra y vuelve como `skipped` con el mensaje en `reason`.
 */
export async function syncCloserCalendlyEvents(
  row: CloserIntegrationRow
): Promise<CloserSyncResult> {
  const { user_id: profileId, organization_id: organizationId } = row;

  try {
    return await sincronizarEventosDelCloser(row);
  } catch (err) {
    console.error(`[closer-sync] Error (profile=${profileId}):`, err);
    return {
      profileId,
      organizationId,
      inserted: 0,
      updated: 0,
      skippedManualStatus: 0,
      fetched: 0,
      skipped: true,
      reason: err instanceof Error ? err.message : "unexpected_error",
    };
  }
}

async function upsertClosingCallsForCloser(
  organizationId: string,
  profileId: string,
  calendlyHostUri: string,
  events: CalendlyEventSyncPayload[]
): Promise<{ inserted: number; updated: number; skippedManualStatus: number }> {
  const admin = createAdminClient();

  const normalized = events
    .map((e) => ({
      eventId: e.eventId?.trim(),
      startTime: e.startTime,
      inviteeName: e.inviteeName?.trim(),
      inviteeEmail: e.inviteeEmail,
      url: e.url,
      questionsAndAnswers: e.questionsAndAnswers ?? [],
      statusHint: e.statusHint,
    }))
    .filter((e) => e.eventId && e.inviteeName && e.startTime);

  if (!normalized.length) return { inserted: 0, updated: 0, skippedManualStatus: 0 };

  const uniqueEventIds = Array.from(new Set(normalized.map((e) => e.eventId)));

  const { data: existing, error: existingError } = await admin
    .from("closing_calls")
    .select("id, status, status_source, calendly_event_id, closer_id")
    .eq("organization_id", organizationId)
    .in("calendly_event_id", uniqueEventIds);

  if (existingError) throw new Error(existingError.message);

  type ExistingRow = {
    id: string;
    status: ClosingCallStatus;
    status_source: string | null;
    calendly_event_id: string | null;
    closer_id: string | null;
  };
  const existingRows = (existing ?? []) as ExistingRow[];
  const byEventId = new Map<string, ExistingRow>();
  for (const row of existingRows) {
    if (row.calendly_event_id) byEventId.set(row.calendly_event_id, row);
  }

  const toInsert = normalized.filter((e) => !byEventId.has(e.eventId));
  const toUpdate = normalized.filter((e) => byEventId.has(e.eventId));
  let skippedManualStatus = 0;

  // Insertar nuevas llamadas con closer_id
  if (toInsert.length > 0) {
    const toInsertRows = toInsert.map((e) => ({
      organization_id: organizationId,
      calendly_event_id: e.eventId,
      calendly_url: e.url ?? null,
      calendly_host_uri: calendlyHostUri,
      closer_id: profileId,
      lead_name: e.inviteeName,
      lead_email: e.inviteeEmail?.trim() || null,
      scheduled_at: e.startTime,
      status: e.statusHint ?? "scheduled",
      cancelled_by: e.statusHint === "cancelled" ? "unknown" : null,
      form_answers: e.questionsAndAnswers,
      conversation_id: null,
    }));

    const { data: insertedRows, error: insertError } = await admin
      .from("closing_calls")
      .insert(toInsertRows)
      .select("id, calendly_event_id, lead_name");

    if (insertError) throw new Error(insertError.message);

    // Atribución UTM
    for (const row of insertedRows ?? []) {
      const event = toInsert.find((e) => e.eventId === row.calendly_event_id);
      await attributeBookingToUTM({
        organizationId,
        closingCallId: row.id,
        leadName: row.lead_name ?? event?.inviteeName,
        leadEmail: event?.inviteeEmail,
      }).catch((err) => {
        console.error("[closer-sync] UTM attribution error:", err);
      });
    }
  }

  // Actualizar existentes (y asignar closer_id si no tenía)
  for (const e of toUpdate) {
    const row = byEventId.get(e.eventId);
    if (!row) continue;

    const patch: Record<string, unknown> = {
      calendly_url: e.url ?? null,
      calendly_host_uri: calendlyHostUri,
      closer_id: profileId,        // asignar/actualizar el closer
      lead_name: e.inviteeName,
      lead_email: e.inviteeEmail?.trim() || null,
      scheduled_at: e.startTime,
      form_answers: e.questionsAndAnswers,
      updated_at: new Date().toISOString(),
    };

    if (syncMayOverwriteStatus({ status: row.status, statusSource: row.status_source })) {
      const next = e.statusHint ?? "scheduled";
      patch.status = next;
      patch.cancelled_by = next === "cancelled" ? "unknown" : null;
    } else {
      skippedManualStatus++;
    }

    await admin.from("closing_calls").update(patch).eq("id", row.id);
  }

  await repairClosingConversationLinks(admin, organizationId);

  return { inserted: toInsert.length, updated: toUpdate.length, skippedManualStatus };
}

// ─── Sync de todos los closers de una org ─────────────────────────────────────

export async function syncAllClosersForOrganization(
  organizationId: string
): Promise<CloserSyncResult[]> {
  const admin = createAdminClient();

  const { data: rows, error } = await admin
    .from("team_member_integrations")
    .select("user_id, organization_id, config, last_sync_at")
    .eq("organization_id", organizationId)
    .eq("integration_type", "calendly");

  if (error) {
    console.error("[closer-sync] No se pudo listar integraciones:", error.message);
    return [];
  }

  const results: CloserSyncResult[] = [];
  for (const row of rows ?? []) {
    const config = row.config as CloserCalendlyConfig | null;
    if (!config?.access_token || !config?.calendly_user_uri) continue;

    const result = await syncCloserCalendlyEvents({
      user_id: row.user_id,
      organization_id: row.organization_id,
      config,
      last_sync_at: row.last_sync_at,
    });
    results.push(result);
  }

  return results;
}

// ─── Sync de todos los closers de todas las orgs (para cron global) ───────────

export async function syncAllClosersGlobal(): Promise<{ orgs: number; results: CloserSyncResult[] }> {
  const admin = createAdminClient();

  const { data: rows, error } = await admin
    .from("team_member_integrations")
    .select("user_id, organization_id, config, last_sync_at")
    .eq("integration_type", "calendly");

  if (error) {
    console.error("[closer-sync] Error global:", error.message);
    return { orgs: 0, results: [] };
  }

  const integrations = (rows ?? []).filter((r) => {
    const c = r.config as CloserCalendlyConfig | null;
    return c?.access_token && c?.calendly_user_uri;
  });

  const orgIds = new Set(integrations.map((r) => r.organization_id));
  const results: CloserSyncResult[] = [];

  for (const row of integrations) {
    const config = row.config as CloserCalendlyConfig;
    const result = await syncCloserCalendlyEvents({
      user_id: row.user_id,
      organization_id: row.organization_id,
      config,
      last_sync_at: row.last_sync_at,
    });
    results.push(result);
  }

  return { orgs: orgIds.size, results };
}

// ─── Helper público: leer integración de un closer ────────────────────────────

export async function getCloserCalendlyIntegration(
  organizationId: string,
  profileId: string
): Promise<{ connected: boolean; calendlyUserUri?: string; lastSyncAt?: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("team_member_integrations")
    .select("config, last_sync_at")
    .eq("organization_id", organizationId)
    .eq("user_id", profileId)
    .eq("integration_type", "calendly")
    .maybeSingle();

  // Una falla de la base no es "No conectado" (AR de SCRUM-504, MENOR-4).
  if (error) throw new FallaDeLaBase(error);
  if (!data) return { connected: false };

  const config = data.config as CloserCalendlyConfig | null;
  if (!config?.access_token) return { connected: false };

  return {
    connected: true,
    calendlyUserUri: config.calendly_user_uri,
    lastSyncAt: data.last_sync_at ?? undefined,
  };
}

export async function disconnectCloserCalendly(
  organizationId: string,
  profileId: string
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("team_member_integrations")
    .delete()
    .eq("organization_id", organizationId)
    .eq("user_id", profileId)
    .eq("integration_type", "calendly");

  // Si el borrado falla, la integración sigue conectada: no se puede avisar
  // "Calendly desconectado" (SCRUM-504).
  if (error) throw new FallaDeLaBase(error);
}
