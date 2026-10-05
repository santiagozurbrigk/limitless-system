import { applyClientMatchToCall } from "@/lib/fathom/apply-call-match";
import { isManualFathomLink } from "@/lib/fathom/client-matcher";
import { resolverVentanaDeSync } from "@/lib/fathom/sync-window";
import { calcularNuevoCursor, type ResultadoDeReunion } from "@/lib/fathom/cursor";
import { leerVentanaDeFathom, reportarDecisionDeCursor } from "@/lib/fathom/leer-ventana";
import { marcarDescartadas, registrarFallasDeSync } from "@/lib/fathom/fallas-de-sync";
import {
  FathomApiError,
  mensajeDeFathom,
  type FathomMeetingRecord,
} from "@/lib/fathom/api";
import {
  getFathomIntegrationDiagnostics,
} from "@/lib/fathom/diagnostics";
import { createAdminClient } from "@/lib/supabase/admin";
import { reportarFalla } from "@/lib/observability/reportar-falla";


function buildFathomCallRow(organizationId: string, meeting: FathomMeetingRecord) {
  const recordingStart =
    meeting.recording_start_time ?? meeting.scheduled_start_time ?? meeting.callDate;
  const recordingEnd = meeting.recording_end_time;

  let durationSeconds: number | null = meeting.durationSeconds ?? null;
  if (recordingEnd && recordingStart) {
    durationSeconds = Math.round(
      (new Date(recordingEnd).getTime() - new Date(recordingStart).getTime()) / 1000
    );
  }

  let transcript: string | null = null;
  if (meeting.transcriptRaw != null) {
    transcript =
      typeof meeting.transcriptRaw === "string"
        ? meeting.transcriptRaw
        : JSON.stringify(meeting.transcriptRaw);
  } else if (meeting.transcript) {
    transcript = meeting.transcript;
  }

  const processedAfter = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  return {
    organization_id: organizationId,
    fathom_call_id: String(meeting.recording_id ?? meeting.id),
    title: meeting.title || meeting.meeting_title || "Sin título",
    raw_title: meeting.meeting_title || meeting.title,
    fathom_url: meeting.url ?? null,
    call_date: recordingStart ?? new Date().toISOString(),
    duration_seconds: durationSeconds,
    transcript,
    // ⭐ Las señales con las que se clasifica. Venían en la respuesta de la API
    // desde siempre y el parser las descartaba; sin ellas, lo único que quedaba
    // para decidir qué era una llamada era el título, vacío en el 86% de los
    // casos.
    calendar_invitees: meeting.calendar_invitees ?? [],
    meeting_type: meeting.meeting_type ?? null,
    status: "pending" as const,
    processed_after: processedAfter,
    association_candidates: [] as unknown[],
    ai_next_steps: [] as string[],
    ai_problems_detected: [] as string[],
  };
}

/**
 * ⭐ El único upsert de llamadas de Fathom.
 *
 * Lo usan el sync por organización y el sync por miembro. Antes eran dos
 * implementaciones distintas del mismo guardado, y la del miembro quedó atrás:
 * no guardaba `calendar_invitees` —la señal de la que cuelga toda la
 * identificación— y devolvía a "pendiente" llamadas ya procesadas en cada
 * corrida.
 */
export type FathomCallOrigin = {
  /** Quién grabó: una llamada sin vincular la ve sólo esta persona. */
  userId?: string;
  /** Por dónde entró. Default de la columna: `'sync'`. */
  ingestSource?: "sync" | "webhook";
};

/**
 * ⭐ ¿Se vuelve a correr el matcher por título sobre una llamada que ya estaba?
 *
 * Sólo si todavía no se procesó (`processed_at` vacío, y sigue `pending` o
 * `pending_review`). El matcher pone `status = 'pending'` cuando encuentra
 * cliente, y eso mete la llamada otra vez en la cola de análisis: con una
 * llamada ya procesada se pagaba de nuevo el análisis con el modelo y se
 * duplicaban la entrada del timeline y los problemas del cliente. Pasaba cada
 * vez que una corrida volvía a traer una llamada ya guardada, y la sync la
 * vuelve a traer a propósito (el solape del cursor y los reintentos,
 * SCRUM-36).
 */
export function debeReasociarAlSincronizar(existing: {
  status: string | null;
  processed_at: string | null;
} | null): boolean {
  if (!existing) return true;
  if (existing.processed_at) return false;
  return existing.status === "pending" || existing.status === "pending_review";
}

export async function upsertFathomCallFromMeeting(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  meeting: FathomMeetingRecord,
  origin: FathomCallOrigin = {}
): Promise<boolean> {
  const recordingId = meeting.recording_id ?? meeting.id;
  console.log("[Fathom:sync] Upserting meeting:", recordingId);

  const row = buildFathomCallRow(organizationId, meeting);
  const callTitle = row.title;

  const { data: existing, error: existingError } = await admin
    .from("fathom_calls")
    .select("id, client_id, association_confidence, status, user_id, processed_at")
    .eq("organization_id", organizationId)
    .eq("fathom_call_id", row.fathom_call_id)
    .maybeSingle();

  if (existingError) {
    console.error("[Fathom:sync] Existing call lookup error:", existingError.message);
    return false;
  }

  const manualLink = isManualFathomLink(
    existing?.client_id,
    existing?.association_confidence
  );

  const syncFields = {
    title: row.title,
    raw_title: row.raw_title,
    fathom_url: row.fathom_url,
    call_date: row.call_date,
    duration_seconds: row.duration_seconds,
    transcript: row.transcript,
    // Se refrescan en cada sync: el tipo se puede asignar en Fathom después de
    // la llamada, igual que el título.
    calendar_invitees: row.calendar_invitees,
    meeting_type: row.meeting_type,
  };

  let callId: string;

  if (existing) {
    const { error } = await admin
      .from("fathom_calls")
      .update(
        // El dueño se completa si faltaba; nunca se pisa el de otra persona.
        origin.userId && !existing.user_id
          ? { ...syncFields, user_id: origin.userId }
          : syncFields
      )
      .eq("id", existing.id);

    if (error) {
      console.error("[Fathom:sync] UPDATE ERROR:", JSON.stringify(error));
      console.log("[Fathom:sync] Upsert result:", error.message);
      return false;
    }

    callId = existing.id;
    console.log("[Fathom:sync] Upsert result: OK (updated title/metadata)");
  } else {
    const { data, error } = await admin
      .from("fathom_calls")
      .insert({
        ...syncFields,
        organization_id: organizationId,
        fathom_call_id: row.fathom_call_id,
        status: "pending",
        processed_after: row.processed_after,
        association_candidates: row.association_candidates,
        ai_next_steps: row.ai_next_steps,
        ai_problems_detected: row.ai_problems_detected,
        ...(origin.userId ? { user_id: origin.userId } : {}),
        ...(origin.ingestSource ? { ingest_source: origin.ingestSource } : {}),
      })
      .select("id")
      .single();

    if (error) {
      console.error("[Fathom:sync] INSERT ERROR:", JSON.stringify(error));
      console.log("[Fathom:sync] Upsert result:", error.message);
      return false;
    }

    callId = data.id;
    console.log("[Fathom:sync] Upsert result: OK (inserted)");
  }

  if (manualLink) {
    console.log("[Fathom:sync] Skipping auto-match — manual link preserved", {
      callId,
      clientId: existing?.client_id,
    });
  } else if (!debeReasociarAlSincronizar(existing ?? null)) {
    console.log("[Fathom:sync] Skipping auto-match — call already processed", {
      callId,
      status: existing?.status,
    });
  } else {
    await applyClientMatchToCall(admin, callId, organizationId, callTitle);
  }

  console.log("[Fathom:sync] Inserted:", recordingId, callTitle);
  return true;
}

export async function syncFathomMeetingsForOrganization(
  organizationId: string,
  options?: { debug?: boolean }
): Promise<number> {
  console.log("[Fathom] syncFathomMeetingsForOrganization start:", organizationId);

  const admin = createAdminClient();
  const { data: integration, error } = await admin
    .from("fathom_integrations")
    .select("api_key, last_sync_at, status, connected_at")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("[Fathom] Early return: DB error loading integration:", error.message);
    throw new Error(error.message);
  }

  if (!integration) {
    console.log("[Fathom] Early return: no fathom_integrations row for org", organizationId);
    throw new Error("Fathom no está conectado para esta organización.");
  }

  if (!integration.api_key?.trim()) {
    console.log("[Fathom] Early return: api_key null or empty for org", {
      organizationId,
      status: integration.status,
      hasApiKey: false,
    });
    throw new Error("Fathom no tiene API key configurada.");
  }

  if (integration.status !== "connected") {
    console.log("[Fathom] Early return: status is not connected", {
      organizationId,
      status: integration.status,
    });
    throw new Error("Fathom no está conectado para esta organización.");
  }

  /**
   * ⭐ Desde la conexión en adelante, no el historial.
   *
   * Antes esto barría los últimos 90 días en la primera corrida. La regla, y el
   * porqué, viven ahora en `resolverVentanaDeSync` — una sola para la
   * sincronización de la organización y la del miembro.
   */
  const ventana = resolverVentanaDeSync(
    integration.last_sync_at as string | null,
    integration.connected_at as string | null
  );
  const createdAfter = ventana.desde ?? undefined;

  console.log("[Fathom:sync] Date filter:", {
    organizationId,
    createdAfter,
    last_sync_at: integration.last_sync_at,
    connected_at: integration.connected_at,
    motivo: ventana.motivo,
  });

  console.log("[Fathom:sync] Calling Fathom API...", {
    organizationId,
    createdAfter,
    apiKeyLength: integration.api_key.trim().length,
  });

  const ahora = new Date();
  let lectura;
  try {
    lectura = await leerVentanaDeFathom(integration.api_key.trim(), {
      desde: ventana.desde,
      ahora,
      maxPages: 20,
      opciones: {
        includeTranscript: true,
        debug: options?.debug,
        debugContext: `sync:${organizationId.slice(0, 8)}`,
      },
    });
  } catch (e) {
    console.error("[Fathom:sync] listFathomMeetings failed:", e);
    if (e instanceof FathomApiError) throw new Error(mensajeDeFathom(e));
    throw e;
  }

  const meetings = lectura.meetings;
  console.log("[Fathom:sync] Meetings received:", meetings.length, {
    cortada: lectura.cortada,
    completaHasta: lectura.completaHasta,
  });

  if (!meetings.length) {
    console.log(
      "[Fathom:sync] No meetings to upsert — insert loop skipped (check Date filter or mapFathomMeeting)"
    );
  }

  let ingested = 0;
  const resultados: ResultadoDeReunion[] = [];
  for (const meeting of meetings) {
    console.log("[Fathom] Inserting call:", {
      organization_id: organizationId,
      title: meeting.title,
      recording_id: meeting.recording_id ?? meeting.id,
      call_date:
        meeting.recording_start_time ??
        meeting.scheduled_start_time ??
        meeting.callDate,
    });
    const ok = await upsertFathomCallFromMeeting(admin, organizationId, meeting);
    resultados.push({ meeting, guardada: ok });
    if (ok) ingested++;
  }

  console.log("[Fathom] sync complete:", { organizationId, ingested, total: meetings.length });

  /**
   * ⭐ El cursor avanza sobre lo leído y guardado, con el `created_at` de
   * Fathom, nunca con la hora del servidor (SCRUM-36). Antes bastaba con
   * guardar una llamada para escribir `new Date()`, y las que habían fallado
   * quedaban atrás para siempre.
   */
  // Cuenta las fallas por reunión desde la primera (`fathom_sync_fallas`): con
  // eso se decide cuándo dejar de reintentar una que falla siempre.
  const conexion = { organizationId, userId: null };
  const conFallas = await registrarFallasDeSync(admin, conexion, resultados, ahora);
  const decision = calcularNuevoCursor({
    cursorAnterior: ventana.desde,
    lectura,
    resultados: conFallas,
    ahora,
  });
  await marcarDescartadas(admin, conexion, decision.descartadas, ahora);
  reportarDecisionDeCursor(decision, { organizationId, conexion: "organizacion" });

  if (decision.avanza) {
    const { error: cursorError } = await admin
      .from("fathom_integrations")
      .update({ last_sync_at: decision.cursor })
      .eq("organization_id", organizationId);
    if (cursorError) {
      // Sin avanzar, la próxima corrida vuelve a pedir lo mismo: no se pierde nada.
      console.error("[Fathom:sync] last_sync_at update error:", cursorError.message);
    }
  }
  console.log("[Fathom] last_sync_at:", {
    organizationId,
    avanza: decision.avanza,
    cursor: decision.cursor,
    motivo: decision.motivo,
  });

  return ingested;
}

export async function syncAllFathomIntegrations(options?: {
  debug?: boolean;
}): Promise<{
  organizations: number;
  ingested: number;
  skippedOrgs: string[];
  orgResults: Array<{
    organizationId: string;
    ingested: number;
    error?: string;
  }>;
}> {
  console.log("[Fathom:sync] syncAllFathomIntegrations called");

  const diagnostics = await getFathomIntegrationDiagnostics();
  if (diagnostics.queryError) {
    throw new Error(diagnostics.queryError);
  }

  const orgs = diagnostics.rows.filter(
    (r) => r.status === "connected" && r.has_key
  );
  const organizationIds = orgs.map((r) => r.organization_id);

  console.log(
    "[Fathom:sync] Orgs from DB:",
    orgs.length,
    orgs.map((o) => o.organization_id)
  );

  if (organizationIds.length === 0) {
    console.log("[Fathom:sync] Early return: zero eligible orgs, skipping all fetches");
    return { organizations: 0, ingested: 0, skippedOrgs: [], orgResults: [] };
  }

  let ingested = 0;
  const skippedOrgs: string[] = [];
  const orgResults: Array<{
    organizationId: string;
    ingested: number;
    error?: string;
  }> = [];

  for (const organizationId of organizationIds) {
    console.log("[Fathom:sync] Processing org:", organizationId);
    try {
      const orgIngested = await syncFathomMeetingsForOrganization(organizationId, {
        debug: options?.debug,
      });
      ingested += orgIngested;
      orgResults.push({ organizationId, ingested: orgIngested });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.error("[Fathom:sync] Org sync failed:", organizationId, error, e);
      reportarFalla(e, {
        cron: "/api/integrations/fathom/sync",
        organizationId,
        provider: "fathom",
      });
      skippedOrgs.push(organizationId);
      orgResults.push({ organizationId, ingested: 0, error });
    }
  }

  const result = {
    organizations: organizationIds.length,
    ingested,
    skippedOrgs,
    orgResults,
  };
  console.log("[Fathom:sync] syncAllFathomIntegrations done:", JSON.stringify(result));
  return result;
}
