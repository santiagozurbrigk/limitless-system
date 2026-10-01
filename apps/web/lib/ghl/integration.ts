/**
 * Helpers para leer y escribir la integración GHL por organización.
 * Similar a lib/zernio/integration.ts — solo se usa con createAdminClient()
 * para leer la API key cifrada (la tabla no tiene RLS SELECT).
 */

import { readStoredSecret, encrypt } from "@/lib/security/encryption";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  listGHLCalendars,
  type GHLCalendar,
} from "./client";

export type GHLIntegrationRow = {
  organization_id: string;
  api_key_encrypted: string;
  location_id: string;
  /** Primer calendario seleccionado — se mantiene para backward compat con sync legacy. */
  default_calendar_id: string | null;
  /** Calendarios activos para sync (multi-selección). */
  selected_calendar_ids: string[];
  connected_calendars: GHLCalendar[];
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
};

// ─── Cifrado ─────────────────────────────────────────────────────────────────

/**
 * Sin fallback a texto plano: si falta ENCRYPTION_MASTER_KEY, `encrypt` tira y
 * no se guarda nada. Antes se guardaba la clave en claro sin avisar.
 */
const API_KEY_FIELD = "ghl_integrations.api_key_encrypted";
const WEBHOOK_SECRET_FIELD = "ghl_integrations.webhook_secret_encrypted";

export function encryptGHLApiKey(plainKey: string, organizationId: string): string {
  return encrypt(plainKey, { field: API_KEY_FIELD, organizationId });
}

export function decryptGHLApiKey(stored: string, organizationId: string): string {
  return readStoredSecret(stored, { field: API_KEY_FIELD, organizationId });
}

// ─── Lectura ──────────────────────────────────────────────────────────────────

export async function getGHLIntegrationForOrg(
  organizationId: string
): Promise<GHLIntegrationRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ghl_integrations")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as GHLIntegrationRow | null) ?? null;
}

/**
 * Devuelve { apiKey (plano), locationId, calendarIds } listos para usar.
 * calendarIds contiene todos los calendarios activos (multi-selección).
 * Lanza si no hay integración configurada.
 */
export async function getGHLCredentialsForOrg(organizationId: string): Promise<{
  apiKey: string;
  locationId: string;
  /** @deprecated usar calendarIds */
  calendarId: string;
  calendarIds: string[];
}> {
  const row = await getGHLIntegrationForOrg(organizationId);
  if (!row) throw new Error("GHL no configurado para esta organización");

  // Resolver calendarios activos: preferir selected_calendar_ids, fallback a default_calendar_id
  const calendarIds =
    row.selected_calendar_ids?.length
      ? row.selected_calendar_ids
      : row.default_calendar_id
      ? [row.default_calendar_id]
      : [];

  if (!calendarIds.length) {
    throw new Error("No hay calendario GHL seleccionado");
  }
  return {
    apiKey: decryptGHLApiKey(row.api_key_encrypted, organizationId),
    locationId: row.location_id,
    calendarId: calendarIds[0]!,
    calendarIds,
  };
}

/**
 * Guarda o actualiza la integración GHL (upsert).
 * selectedCalendarIds define qué calendarios se sincronizan (multi-selección).
 * default_calendar_id se fija en el primer seleccionado para backward compat.
 */
export async function upsertGHLIntegration(
  organizationId: string,
  apiKey: string,
  locationId: string,
  calendars: GHLCalendar[],
  selectedCalendarIds: string[]
): Promise<void> {
  const admin = createAdminClient();

  const finalSelectedIds = selectedCalendarIds.length
    ? selectedCalendarIds
    : (await getGHLIntegrationForOrg(organizationId))?.selected_calendar_ids ?? [];

  const defaultCalendarId = finalSelectedIds[0] ?? null;

  const { error } = await admin.from("ghl_integrations").upsert(
    {
      organization_id: organizationId,
      api_key_encrypted: encryptGHLApiKey(apiKey, organizationId),
      location_id: locationId,
      default_calendar_id: defaultCalendarId,
      selected_calendar_ids: finalSelectedIds,
      connected_calendars: calendars,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" }
  );

  if (error) throw new Error(error.message);
}


/**
 * Obtiene un cliente GHL con las credenciales de la org, listo para hacer fetch.
 */
export async function getGHLClientForOrg(organizationId: string): Promise<{
  apiKey: string;
  locationId: string;
  calendarId: string;
  calendarIds: string[];
  calendars: GHLCalendar[];
}> {
  const row = await getGHLIntegrationForOrg(organizationId);
  if (!row) throw new Error("GHL no configurado para esta organización");

  const calendarIds =
    row.selected_calendar_ids?.length
      ? row.selected_calendar_ids
      : row.default_calendar_id
      ? [row.default_calendar_id]
      : [];

  if (!calendarIds.length) throw new Error("No hay calendario GHL seleccionado");

  return {
    apiKey: decryptGHLApiKey(row.api_key_encrypted, organizationId),
    locationId: row.location_id,
    calendarId: calendarIds[0]!,
    calendarIds,
    calendars: row.connected_calendars ?? [],
  };
}

/**
 * Refresca la lista de calendarios desde la API y la guarda en DB.
 */
export async function refreshGHLCalendars(
  organizationId: string
): Promise<GHLCalendar[]> {
  const row = await getGHLIntegrationForOrg(organizationId);
  if (!row) throw new Error("GHL no configurado");

  const apiKey = decryptGHLApiKey(row.api_key_encrypted, organizationId);
  const calendars = await listGHLCalendars(apiKey, row.location_id);

  const admin = createAdminClient();
  await admin
    .from("ghl_integrations")
    .update({ connected_calendars: calendars, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId);

  return calendars;
}

// ─── Webhook de oportunidades (I-4) ───────────────────────────────────────────

/**
 * Secreto compartido de la vía de Workflow.
 *
 * Sólo se usa cuando el evento NO trae firma de plataforma. Ver
 * `lib/ghl/verify-webhook.ts` para por qué existen las dos vías.
 *
 * Devuelve `null` si la org no tiene uno configurado: en ese caso los eventos
 * sin firma se rechazan, que es lo correcto.
 */
export async function getGHLWebhookSecret(
  organizationId: string
): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ghl_integrations")
    .select("webhook_secret_encrypted")
    .eq("organization_id", organizationId)
    .maybeSingle();

  // [EMBUDOS-WEBHOOK-PERDIDA] (SCRUM-6): una falla al leer se lanza (el webhook
  // responde 500 y GHL reintenta) en vez de parecer "sin secreto" y dar 401.
  if (error) throw new Error(`No se pudo leer la integración de GHL: ${error.message}`);
  if (!data?.webhook_secret_encrypted) return null;
  return readStoredSecret(data.webhook_secret_encrypted as string, {
    field: WEBHOOK_SECRET_FIELD,
    organizationId,
  });
}

/** Guarda (o borra, con `null`) el secreto compartido de la vía de Workflow. */
export async function setGHLWebhookSecret(
  organizationId: string,
  secret: string | null
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("ghl_integrations")
    .update({
      webhook_secret_encrypted: secret
        ? encrypt(secret, { field: WEBHOOK_SECRET_FIELD, organizationId })
        : null,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId);

  if (error) throw new Error(error.message);
}

/**
 * Borde del período ciego: desde cuándo Limitless tiene historial de etapas.
 *
 * `null` significa que todavía no llegó ningún webhook de oportunidad. El
 * resolver del embudo lo usa para devolver `null` en vez de `0` para cualquier
 * período anterior — un cero ahí diría "no pasó nada" cuando la verdad es "no
 * lo estábamos mirando".
 */
export async function getGHLStageHistorySince(
  organizationId: string
): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ghl_integrations")
    .select("stage_history_since")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) return null;
  return (data.stage_history_since as string | null) ?? null;
}
