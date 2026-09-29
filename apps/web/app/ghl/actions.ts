"use server";

import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { requireAuthContext } from "@/lib/auth/require-auth";
import { runMutation, type MutationResult } from "@/lib/server/action-result";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { revalidatePath } from "next/cache";
import { paths } from "@/routes";
import {
  validateGHLApiKey,
  GHLApiError,
  type GHLCalendar,
} from "@/lib/ghl/client";
import {
  getGHLIntegrationForOrg,
  upsertGHLIntegration,
  getGHLCredentialsForOrg,
} from "@/lib/ghl/integration";
import { syncGHLOrganizationSafe } from "@/lib/ghl/sync-pipeline";
import {
  requireOrgRole,
  ROLES_CONFIG_ORG,
  SIN_PERMISO_CONFIG_ORG,
} from "@/lib/auth/require-org-role";

// ─── Status ───────────────────────────────────────────────────────────────────

export type GHLIntegrationStatus = {
  connected: boolean;
  locationId: string | null;
  defaultCalendarId: string | null;
  /** Calendarios actualmente seleccionados para sync */
  selectedCalendarIds: string[];
  connectedCalendars: GHLCalendar[];
  lastSyncAt: string | null;
};

const EMPTY_STATUS: GHLIntegrationStatus = {
  connected: false,
  locationId: null,
  defaultCalendarId: null,
  selectedCalendarIds: [],
  connectedCalendars: [],
  lastSyncAt: null,
};

export async function getGHLIntegrationStatusAction(): Promise<GHLIntegrationStatus> {
  if (!isSupabaseConfigured()) return EMPTY_STATUS;

  try {
    const organizationId = await requireOrganizationId();
    const row = await getGHLIntegrationForOrg(organizationId);
    if (!row) return EMPTY_STATUS;

    // Calcular selectedCalendarIds desde el nuevo campo con fallback al legacy
    const selectedCalendarIds =
      row.selected_calendar_ids?.length
        ? row.selected_calendar_ids
        : row.default_calendar_id
        ? [row.default_calendar_id]
        : [];

    return {
      connected: true,
      locationId: row.location_id,
      defaultCalendarId: row.default_calendar_id,
      selectedCalendarIds,
      connectedCalendars: row.connected_calendars ?? [],
      lastSyncAt: row.last_sync_at,
    };
  } catch {
    return EMPTY_STATUS;
  }
}

// ─── Conectar ─────────────────────────────────────────────────────────────────

export type GHLValidateResult =
  | { success: true; calendars: GHLCalendar[] }
  | { success: false; error: string };

/**
 * Valida la API key + location ID y devuelve los calendarios disponibles.
 * No guarda nada en DB todavía — el usuario elige los calendarios primero.
 */
export async function validateGHLKeyAction(
  apiKey: string,
  locationId: string
): Promise<GHLValidateResult> {
  if (!apiKey?.trim()) {
    return { success: false, error: "Ingresá tu Private Integration Token de GHL." };
  }
  if (!locationId?.trim()) {
    return { success: false, error: "Ingresá tu Location ID de GHL." };
  }

  try {
    const { user } = await requireAuthContext();
    const calendars = await validateGHLApiKey(apiKey.trim(), locationId.trim());
    if (!calendars.length) {
      return { success: false, error: "No se encontraron calendarios en esta ubicación." };
    }
    return { success: true, calendars };
  } catch (e) {
    if (e instanceof GHLApiError) {
      if (e.status === 401 || e.status === 403) {
        return { success: false, error: "Token inválido o sin permisos. Verificá tu Private Integration Token." };
      }
    }
    return {
      success: false,
      error: e instanceof Error ? e.message : "Error al conectar con GHL.",
    };
  }
}

/**
 * Guarda la integración GHL con los calendarios elegidos por el usuario.
 * selectedCalendarIds es un array de IDs — debe tener al menos uno.
 */
export async function connectGHLAction(
  apiKey: string,
  locationId: string,
  calendars: GHLCalendar[],
  selectedCalendarIds: string[]
): Promise<MutationResult> {
  return runMutation(async () => {
    if (!selectedCalendarIds.length) throw new Error("Seleccioná al menos un calendario.");

    const organizationId = await requireOrganizationId();
    await upsertGHLIntegration(
      organizationId,
      apiKey.trim(),
      locationId.trim(),
      calendars,
      selectedCalendarIds
    );
    revalidatePath(paths.platform.integrations);
  });
}

/**
 * Actualiza los calendarios activos sin re-validar la API key.
 * Reemplaza selected_calendar_ids y ajusta default_calendar_id al primer seleccionado.
 */
export async function updateGHLCalendarsAction(
  calendarIds: string[]
): Promise<MutationResult> {
  return runMutation(async () => {
    if (!calendarIds.length) throw new Error("Seleccioná al menos un calendario.");
    const organizationId = await requireOrganizationId();
    const admin = createAdminClient();
    const { error } = await admin
      .from("ghl_integrations")
      .update({
        selected_calendar_ids: calendarIds,
        default_calendar_id: calendarIds[0]!,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", organizationId);
    if (error) throw new Error(error.message);
    revalidatePath(paths.platform.integrations);
  });
}

// ─── Sync manual ──────────────────────────────────────────────────────────────

export type GHLSyncActionResult = {
  fetched: number;
  inserted: number;
  updated: number;
  /** Turnos cuyo estado no se tocó porque lo había cargado una persona. */
  skippedManualStatus: number;
};

export async function syncGHLAppointmentsAction(): Promise<
  MutationResult<GHLSyncActionResult>
> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    // Validar que la integración esté configurada
    await getGHLCredentialsForOrg(organizationId);
    const result = await syncGHLOrganizationSafe(organizationId);
    return {
      fetched: result.fetched,
      inserted: result.inserted,
      updated: result.updated,
      skippedManualStatus: result.skippedManualStatus,
    };
  });
}

// ─── Desconectar ──────────────────────────────────────────────────────────────

export async function disconnectGHLAction(): Promise<MutationResult> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    await requireOrgRole(ROLES_CONFIG_ORG, SIN_PERMISO_CONFIG_ORG);
    const admin = createAdminClient();
    const { error } = await admin
      .from("ghl_integrations")
      .delete()
      .eq("organization_id", organizationId);
    if (error) throw new Error(error.message);
    revalidatePath(paths.platform.integrations);
  });
}
