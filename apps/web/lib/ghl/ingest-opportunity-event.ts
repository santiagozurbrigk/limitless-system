/**
 * lib/ghl/ingest-opportunity-event.ts
 *
 * Recibe un webhook de oportunidad ya verificado, lo persiste crudo y recién
 * después lo interpreta.
 *
 * El orden es el mismo que en `lib/payments/ingest.ts` y por la misma razón: la
 * documentación de GHL no expande el objeto `opportunity`, así que el payload
 * real es lo único que permite corregir el mapeo. Si el mapeo falla hoy, el
 * evento queda como `unmapped` y se puede reprocesar mañana.
 *
 * Sólo servidor: usa el service role.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  extractGHLEventId,
  extractGHLEventType,
  normalizeOpportunityEvent,
} from "./opportunity-event";
import { deriveTransition, type KnownOpportunityState } from "./stage-transition";
import type { GHLAuthPath } from "./verify-webhook";
import { ErrorDeBase, esErrorPermanente, reclamarEvento } from "@/lib/webhooks/reclamar";

export type GHLIngestResult = {
  stored: boolean;
  status: "processed" | "unmapped" | "duplicate" | "error";
  /** `true` si el evento generó una fila en `ghl_stage_transitions`. */
  transitionRecorded?: boolean;
  detail?: string;
  /** Igual que en `IngestResult` de pagos: `false` si reintentar no sirve. */
  reintentable?: boolean;
};

type AdminClient = ReturnType<typeof createAdminClient>;

export async function ingestGHLOpportunityEvent(
  organizationId: string,
  body: Record<string, unknown>,
  authPath: GHLAuthPath,
  receivedAt: string = new Date().toISOString()
): Promise<GHLIngestResult> {
  const admin = createAdminClient();

  const eventId = extractGHLEventId(body);

  // 1) Guardar crudo. El índice único sobre external_event_id descarta
  //    reentregas: GHL reintenta y el orden no está garantizado.
  const { data: stored, error: storeError } = await admin
    .from("ghl_webhook_events")
    .insert({
      organization_id: organizationId,
      event_type: extractGHLEventType(body),
      external_event_id: eventId,
      auth_path: authPath,
      payload: body,
    })
    .select("id")
    .maybeSingle();

  if (storeError) {
    // [EMBUDOS-WEBHOOK-PERDIDA] (SCRUM-6): si el evento previo quedó en
    // `error` o trabado en `pending`, este reintento lo reprocesa en vez de
    // volver `duplicate` (ver `lib/webhooks/reclamar.ts`).
    if (storeError.code === "23505") {
      if (!eventId) return { stored: false, status: "duplicate" };
      const reclamo = await reclamarEvento<{
        id: string;
        payload: Record<string, unknown>;
        received_at: string;
      }>(
        admin,
        "ghl_webhook_events",
        { external_event_id: eventId, organization_id: organizationId },
        "id, payload, received_at"
      );
      if (reclamo.tipo === "terminado") return { stored: false, status: "duplicate" };
      if (reclamo.tipo === "en_curso") {
        return { stored: false, status: "error", detail: "El evento se está procesando" };
      }
      const { fila } = reclamo;
      return procesarEventoGHL(admin, fila.id, organizationId, fila.payload, fila.received_at, {
        esReproceso: true,
      });
    }
    console.error("[ghl] no se pudo guardar el evento", storeError.message);
    return { stored: false, status: "error", detail: storeError.message };
  }

  return procesarEventoGHL(admin, stored?.id as string | undefined, organizationId, body, receivedAt);
}

/**
 * Interpreta un evento ya guardado y deja su estado final en
 * `ghl_webhook_events`. La usan el webhook y el reproceso
 * (`scripts/reprocesar-webhooks.ts`). `receivedAt` es cuándo llegó el evento
 * la primera vez: de ahí sale la fecha de la transición de etapa.
 *
 * `esReproceso`: el evento ya se había intentado antes (reintento o script).
 * Si mientras tanto se aplicó un evento más nuevo de la misma oportunidad, éste
 * no se aplica: volvería la oportunidad a una etapa vieja y registraría una
 * transición que no pasó.
 */
export async function procesarEventoGHL(
  admin: AdminClient,
  eventRowId: string | undefined,
  organizationId: string,
  body: Record<string, unknown>,
  receivedAt: string,
  { esReproceso = false }: { esReproceso?: boolean } = {}
): Promise<GHLIngestResult> {
  const finish = async (status: string, errorMessage?: string) => {
    if (!eventRowId) return;
    await admin
      .from("ghl_webhook_events")
      .update({
        status,
        error_message: errorMessage ?? null,
        processed_at: new Date().toISOString(),
      })
      .eq("id", eventRowId);
  };

  // 2) Recién ahora, interpretar.
  const normalized = normalizeOpportunityEvent(body);
  if (normalized.kind === "unmapped") {
    await finish("unmapped", normalized.reason);
    return { stored: true, status: "unmapped", detail: normalized.reason };
  }

  const event = normalized.event;

  try {
    // 3) Última etapa conocida — es contra esto que se deriva la transición,
    //    porque el webhook no trae la etapa anterior.
    const { data: existing, error: existingError } = await admin
      .from("ghl_opportunities")
      .select("stage_external_id, status, updated_at")
      .eq("organization_id", organizationId)
      .eq("external_id", event.opportunityId)
      .maybeSingle();
    if (existingError) throw new ErrorDeBase(existingError.message, existingError.code);

    // [EMBUDOS-WEBHOOK-PERDIDA] (SCRUM-6): sólo el webhook escribe
    // `ghl_opportunities`, así que `updated_at` es cuándo se aplicó el último
    // evento. Si es posterior a la llegada de éste, éste es viejo.
    const aplicadoDespues =
      typeof existing?.updated_at === "string" && existing.updated_at > receivedAt;
    if (esReproceso && aplicadoDespues) {
      const detail = "superseded: ya se aplicó un evento más nuevo de esta oportunidad";
      await finish("processed", detail);
      return { stored: true, status: "processed", transitionRecorded: false, detail };
    }

    const previous: KnownOpportunityState | null = existing
      ? {
          stageId: (existing.stage_external_id as string | null) ?? null,
          status: (existing.status as string | null) ?? null,
        }
      : null;

    const transition = deriveTransition(previous, event, receivedAt);

    if (transition) {
      const { error: transitionError } = await admin.from("ghl_stage_transitions").insert({
        organization_id: organizationId,
        opportunity_external_id: transition.opportunityId,
        pipeline_external_id: transition.pipelineId,
        from_stage_external_id: transition.fromStageId,
        to_stage_external_id: transition.toStageId,
        kind: transition.kind,
        status: transition.status,
        occurred_at: transition.occurredAt,
        // Sin id de GHL (payload de Workflow armado por el cliente), la clave
        // de deduplicación es la fila del evento crudo, que no cambia entre
        // reprocesos. Si no, reprocesar sumaría la misma transición otra vez.
        external_event_id: transition.eventId ?? (eventRowId ? `fila:${eventRowId}` : null),
      });

      // 23505: el mismo evento ya había dejado su transición. No es un error.
      if (transitionError && transitionError.code !== "23505") {
        throw new ErrorDeBase(transitionError.message, transitionError.code);
      }
    }

    // 4) Estado actual. Una baja se marca, no se borra: las transiciones que ya
    //    ocurrieron siguen siendo ciertas y siguen contando en su período.
    const { error: upsertError } = await admin.from("ghl_opportunities").upsert(
      {
        organization_id: organizationId,
        external_id: event.opportunityId,
        location_id: event.locationId,
        contact_id: event.contactId,
        pipeline_external_id: event.pipelineId,
        stage_external_id: event.stageId,
        status: event.isDelete ? "deleted" : event.status,
        name: event.name,
        source: event.source,
        monetary_value: event.monetaryValue,
        date_added: event.dateAdded,
        last_stage_change_at: transition ? transition.occurredAt : undefined,
        raw: body,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,external_id" }
    );
    if (upsertError) throw new ErrorDeBase(upsertError.message, upsertError.code);

    // 5) Marcar el borde del período ciego la primera vez.
    //
    //    A partir de acá los conteos por etapa son válidos; antes, no. Se
    //    escribe una sola vez y nunca se mueve hacia adelante: correrlo
    //    invalidaría historial ya observado.
    await admin
      .from("ghl_integrations")
      .update({ stage_history_since: receivedAt })
      .eq("organization_id", organizationId)
      .is("stage_history_since", null);

    await finish("processed");
    return { stored: true, status: "processed", transitionRecorded: transition !== null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    await finish("error", message);
    // Sin id de GHL, el reintento no encuentra esta fila: guarda una nueva y
    // procesa todo otra vez. Ese caso queda en `error` para el reproceso.
    const reintentable = !esErrorPermanente(error) && extractGHLEventId(body) !== null;
    return { stored: true, status: "error", detail: message, reintentable };
  }
}

/**
 * Resuelve la organización dueña de un evento a partir del `locationId` del
 * payload.
 *
 * Hace falta para la vía de app del Marketplace, donde el evento no puede traer
 * el `organizationId` en la URL: la URL la configura Limitless una sola vez para todas
 * las sub-cuentas instaladas.
 */
export async function resolveOrganizationByLocation(
  locationId: string
): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ghl_integrations")
    .select("organization_id")
    .eq("location_id", locationId)
    .maybeSingle();

  if (error || !data) return null;
  return data.organization_id as string;
}
