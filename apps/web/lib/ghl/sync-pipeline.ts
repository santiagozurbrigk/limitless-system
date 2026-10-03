/**
 * Pipeline de sync GHL → closing_calls para una o todas las orgs.
 * Análogo a lib/calendly/sync-pipeline.ts.
 * Seguro para cron: nunca lanza, siempre devuelve resultado.
 *
 * Soporta multi-calendario: itera sobre selected_calendar_ids y combina resultados.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { listGHLAppointments } from "./client";
import { decryptGHLApiKey, getGHLIntegrationForOrg } from "./integration";
import { syncGHLAppointmentsForOrganization, type GHLSyncResult } from "./sync-appointments";
import { reportarFalla } from "@/lib/observability/reportar-falla";

// Rango: últimos 90 días + próximos 90 días
// GHL /calendars/events requiere Unix timestamps en milisegundos (no ISO 8601)
function buildSyncRange() {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 90);
  const to = new Date(now);
  to.setDate(to.getDate() + 90);
  return {
    startTime: from.getTime().toString(),
    endTime: to.getTime().toString(),
  };
}

export async function syncGHLOrganizationSafe(
  organizationId: string
): Promise<GHLSyncResult & { organizationId: string }> {
  const empty = {
    organizationId,
    inserted: 0,
    updated: 0,
    skippedManualStatus: 0,
    skippedInvalid: 0,
    fetched: 0,
  };

  try {
    const row = await getGHLIntegrationForOrg(organizationId);
    if (!row) return empty;

    // Resolver calendarios a sincronizar: multi-selección con fallback a legacy
    const calendarIds =
      row.selected_calendar_ids?.length
        ? row.selected_calendar_ids
        : row.default_calendar_id
        ? [row.default_calendar_id]
        : [];

    if (!calendarIds.length) return empty;

    const apiKey = decryptGHLApiKey(row.api_key_encrypted, row.organization_id);
    const { startTime, endTime } = buildSyncRange();

    // Fetch de todos los calendarios seleccionados en paralelo
    const appointmentsByCalendar = await Promise.all(
      calendarIds.map((calId) =>
        listGHLAppointments(apiKey, row.location_id, calId, startTime, endTime)
      )
    );

    // Aplanar y deduplicar por appointment id
    const seen = new Set<string>();
    const appointments = appointmentsByCalendar.flat().filter((a) => {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    });

    const admin = createAdminClient();
    const result = await syncGHLAppointmentsForOrganization(
      admin,
      organizationId,
      appointments,
      apiKey   // pasar apiKey para enriquecer UTMs del contacto
    );

    // Actualizar last_sync_at
    await admin
      .from("ghl_integrations")
      .update({ last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("organization_id", organizationId);

    console.info(
      `[ghl-sync] org=${organizationId} calendars=${calendarIds.length} fetched=${result.fetched} inserted=${result.inserted} updated=${result.updated}`
    );

    return { organizationId, ...result };
  } catch (e) {
    console.error(`[ghl-sync] Error org=${organizationId}:`, e);
    // Un token de GHL vencido falló 168 veces en tres semanas sin que nadie se
    // enterara (SCRUM-84): ahora va a Sentry con la org.
    reportarFalla(e, { cron: "/api/cron/ghl-sync", organizationId, provider: "ghl" });
    return empty;
  }
}

export async function syncAllGHLOrganizationsSafe(): Promise<{
  synced: number;
  orgs: Array<GHLSyncResult & { organizationId: string }>;
  inserted: number;
  updated: number;
  fetched: number;
}> {
  const admin = createAdminClient();

  // Considerar orgs con al menos un calendario seleccionado (nuevo campo) o legacy
  const { data, error } = await admin
    .from("ghl_integrations")
    .select("organization_id");

  if (error) {
    console.error("[ghl-sync] Error listando orgs:", error);
    return { synced: 0, orgs: [], inserted: 0, updated: 0, fetched: 0 };
  }

  const orgIds = (data ?? []).map((r: { organization_id: string }) => r.organization_id);

  const results = await Promise.all(orgIds.map(syncGHLOrganizationSafe));

  return {
    synced: results.length,
    orgs: results,
    inserted: results.reduce((s, r) => s + r.inserted, 0),
    updated: results.reduce((s, r) => s + r.updated, 0),
    fetched: results.reduce((s, r) => s + r.fetched, 0),
  };
}
