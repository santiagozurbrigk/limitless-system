import { syncCalendlyEventsForOrganization } from "@/lib/calendly/sync-events";
import { fetchCalendlyScheduledEventPayloads } from "@/lib/calendly/fetch-scheduled-events";
import {
  getCalendlyIntegrationForOrganization,
  getValidCalendlyAccessToken,
} from "@/lib/calendly/oauth-token";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CalendlyEventSyncPayload } from "@/types/calendly";
import { reportarFalla } from "@/lib/observability/reportar-falla";
import { anotarOrganizacion } from "@/lib/observability/corrida-en-curso";

export type CalendlyOrgSyncResult = {
  organizationId: string;
  synced: number;
  inserted: number;
  updated: number;
  skippedManualStatus: number;
  fetched: number;
  skipped?: boolean;
  reason?: string;
};

export type CalendlyBulkSyncResult = {
  orgs: number;
  synced: number;
  inserted: number;
  updated: number;
  skippedManualStatus: number;
  fetched: number;
  results: CalendlyOrgSyncResult[];
};

const EMPTY_ORG_RESULT = (
  organizationId: string,
  reason: string
): CalendlyOrgSyncResult => ({
  organizationId,
  synced: 0,
  inserted: 0,
  updated: 0,
  skippedManualStatus: 0,
  fetched: 0,
  skipped: true,
  reason,
});

/** Sincroniza una org desde Calendly API → closing_calls. No lanza al caller. */
export async function syncCalendlyOrganizationSafe(
  organizationId: string
): Promise<CalendlyOrgSyncResult> {
  try {
    const row = await getCalendlyIntegrationForOrganization(organizationId);
    if (!row?.access_token) {
      return EMPTY_ORG_RESULT(organizationId, "not_connected");
    }

    let accessToken: string;
    let orgUri: string;
    try {
      const valid = await getValidCalendlyAccessToken(organizationId);
      accessToken = valid.accessToken;
      orgUri = valid.orgUri;
    } catch (e) {
      console.error(
        `[calendly/sync] Token inválido o expirado (org=${organizationId}):`,
        e
      );
      reportarFalla(e, {
        cron: "/api/cron/calendly-sync",
        organizationId,
        provider: "calendly",
        extra: { etapa: "token_error" },
      });
      return EMPTY_ORG_RESULT(organizationId, "token_error");
    }

    let events: CalendlyEventSyncPayload[];
    try {
      events = await fetchCalendlyScheduledEventPayloads(accessToken, orgUri);
    } catch (e) {
      console.error(
        `[calendly/sync] Error al listar eventos (org=${organizationId}):`,
        e
      );
      reportarFalla(e, {
        cron: "/api/cron/calendly-sync",
        organizationId,
        provider: "calendly",
        extra: { etapa: "fetch_error" },
      });
      return EMPTY_ORG_RESULT(organizationId, "fetch_error");
    }

    const admin = createAdminClient();
    const result = await syncCalendlyEventsForOrganization(
      admin,
      organizationId,
      events
    );

    await admin
      .from("calendly_integrations")
      .update({ updated_at: new Date().toISOString() })
      .eq("organization_id", organizationId);

    const synced = result.inserted + result.updated;
    anotarOrganizacion(organizationId, "ok");
    return {
      organizationId,
      synced,
      inserted: result.inserted,
      updated: result.updated,
      skippedManualStatus: result.skippedManualStatus,
      fetched: events.length,
    };
  } catch (e) {
    console.error(
      `[calendly/sync] Error inesperado (org=${organizationId}):`,
      e
    );
    // Sin esto la org fallaba sin Sentry y sin quedar en el registro de corridas.
    reportarFalla(e, {
      cron: "/api/cron/calendly-sync",
      organizationId,
      provider: "calendly",
      extra: { etapa: "unexpected_error" },
    });
    return EMPTY_ORG_RESULT(organizationId, "unexpected_error");
  }
}

/** Sincroniza eventos ya obtenidos (p. ej. webhook batch). */
export async function applyCalendlyEventsSafe(
  organizationId: string,
  events: CalendlyEventSyncPayload[]
): Promise<CalendlyOrgSyncResult> {
  try {
    const row = await getCalendlyIntegrationForOrganization(organizationId);
    if (!row?.access_token) {
      return EMPTY_ORG_RESULT(organizationId, "not_connected");
    }

    const admin = createAdminClient();
    const result = await syncCalendlyEventsForOrganization(
      admin,
      organizationId,
      events
    );
    const synced = result.inserted + result.updated;
    return {
      organizationId,
      synced,
      inserted: result.inserted,
      updated: result.updated,
      skippedManualStatus: result.skippedManualStatus,
      fetched: events.length,
    };
  } catch (e) {
    console.error(
      `[calendly/sync] Error aplicando eventos (org=${organizationId}):`,
      e
    );
    return EMPTY_ORG_RESULT(organizationId, "apply_error");
  }
}

/** Todas las orgs con integración Calendly activa. */
export async function syncAllCalendlyOrganizationsSafe(): Promise<CalendlyBulkSyncResult> {
  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("calendly_integrations")
    .select("organization_id, access_token")
    .not("access_token", "is", null);

  if (error) {
    console.error("[calendly/sync] No se pudo listar integraciones:", error.message);
    return {
      orgs: 0,
      synced: 0,
      inserted: 0,
      updated: 0,
      skippedManualStatus: 0,
      fetched: 0,
      results: [],
    };
  }

  const integrations = (rows ?? []).filter((r) => r.access_token);
  if (!integrations.length) {
    return {
      orgs: 0,
      synced: 0,
      inserted: 0,
      updated: 0,
      skippedManualStatus: 0,
      fetched: 0,
      results: [],
    };
  }

  const results: CalendlyOrgSyncResult[] = [];
  let synced = 0;
  let inserted = 0;
  let updated = 0;
  let skippedManualStatus = 0;
  let fetched = 0;

  for (const row of integrations) {
    const r = await syncCalendlyOrganizationSafe(row.organization_id);
    results.push(r);
    synced += r.synced;
    inserted += r.inserted;
    updated += r.updated;
    skippedManualStatus += r.skippedManualStatus;
    fetched += r.fetched;
  }

  return {
    orgs: integrations.length,
    synced,
    inserted,
    updated,
    skippedManualStatus,
    fetched,
    results,
  };
}
