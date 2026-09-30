import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import { analyzeFathomTranscript } from "@/lib/fathom/analyze-transcript";
import { generateDeepCallAnalysis } from "@/lib/fathom/deep-call-analysis";
import { extractTeamMeetingTaskProposals } from "@/lib/fathom/team-task-extraction";
import { maybeExtractOneOnOneTasks } from "@/lib/clients/client-tasks";
import { associateCallWithClients } from "@/lib/fathom/associate";
import { isManualFathomLink } from "@/lib/fathom/client-matcher";

import { fetchFathomMeetingTitle } from "@/lib/fathom/api";
import { parseFathomInvitees } from "@/lib/fathom/invitees";
import { resolveSalesCall } from "@/lib/fathom/resolve-sales-call";
import { classifyRecording } from "@/lib/fathom/classify-recording";
import { ingestDocument } from "@/lib/rag/ingest";
import {
  publishFathomAnalysisJob,
} from "@/lib/queue/qstash-client";
import type { CalendlyFormAnswer } from "@/types/closing";
import { assertClienteDeLaOrg } from "@/lib/fathom/cliente-de-la-org";

function formAnswersToRecord(
  answers: CalendlyFormAnswer[] | null | undefined
): Record<string, string> | undefined {
  if (!answers?.length) return undefined;
  const record: Record<string, string> = {};
  for (const item of answers) {
    const key = item.question?.trim() || "Pregunta";
    record[key] = item.answer?.trim() ?? "";
  }
  return record;
}

export type FathomCallRow = {
  id: string;
  organization_id: string;
  fathom_call_id: string;
  title: string;
  raw_title: string | null;
  transcript: string | null;
  status: string;
  client_id: string | null;
  association_confidence?: number | null;
  fathom_url: string | null;
  processed_after: string | null;
  duration_seconds?: number | null;
  call_date?: string | null;
  summary?: string | null;
  calendar_invitees?: unknown;
  meeting_type?: string | null;
};

async function maybeExtractTeamMeetingTasks(params: {
  callId: string;
  organizationId: string;
  /** Propósito resuelto por el clasificador, no por la IA del transcript. */
  purpose: string | null | undefined;
  transcript: string | null;
  summary?: string | null;
}): Promise<void> {
  if (params.purpose !== "team" || !params.transcript?.trim()) {
    return;
  }

  const admin = createAdminClient();

  try {
    const proposals = await extractTeamMeetingTaskProposals({
      organizationId: params.organizationId,
      transcript: params.transcript,
      summary: params.summary,
    });

    if (!proposals.length) return;

    await admin
      .from("fathom_calls")
      .update({ ai_task_proposals: proposals })
      .eq("id", params.callId);
  } catch (error) {
    console.error("Error extracting tasks from team meeting:", error);
  }
}

/**
 * Procesa la cola de llamadas pendientes, una por vez, hasta `limit` o hasta
 * agotar `budgetMs`. El presupuesto importa: cada llamada es un análisis con
 * Sonnet de decenas de segundos, y pedir 50 dentro de un maxDuration de 60 s
 * garantizaba que la lambda muriera a mitad de una llamada.
 */
export async function processPendingFathomCalls(
  limit = 20,
  budgetMs = Number.POSITIVE_INFINITY
): Promise<number> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const startedAt = Date.now();

  const { data: pending, error } = await admin
    .from("fathom_calls")
    .select("*")
    .eq("status", "pending")
    .lte("processed_after", now)
    .order("processed_after", { ascending: true })
    .limit(limit);

  if (error || !pending?.length) return 0;

  let processed = 0;
  for (const call of pending as FathomCallRow[]) {
    if (Date.now() - startedAt > budgetMs) break;
    try {
      if (await processSingleFathomCall(call)) processed++;
    } catch (e) {
      console.error("[processPendingFathomCalls]", call.id, e);
    }
  }
  return processed;
}

/** Devuelve `false` si otra corrida ya había tomado la llamada. */
export async function processSingleFathomCall(call: FathomCallRow): Promise<boolean> {
  const admin = createAdminClient();

  /*
   * ⭐ Toma atómica: sólo pasa a `processing` si nadie la tomó. Antes se leía
   * `pending` y se escribía `processing` sin condición, y dos corridas
   * superpuestas analizaban la misma llamada dos veces (doble costo de IA y
   * entradas duplicadas en el timeline y en problemas del cliente).
   */
  const { data: claimed, error: claimError } = await admin
    .from("fathom_calls")
    .update({
      status: "processing",
      // Sin esta marca no hay forma de distinguir una llamada que se está
      // procesando ahora de una que quedó colgada a mitad de camino.
      processing_started_at: new Date().toISOString(),
    })
    .eq("id", call.id)
    .neq("status", "processing")
    .select("id");

  if (claimError) throw new Error(claimError.message);
  if (!claimed?.length) return false;

  let title = call.title;
  const { data: integration } = await admin
    .from("fathom_integrations")
    .select("api_key")
    .eq("organization_id", call.organization_id)
    .maybeSingle();

  if (integration?.api_key) {
    const updatedTitle = await fetchFathomMeetingTitle(
      integration.api_key,
      call.fathom_call_id
    );
    if (updatedTitle) title = updatedTitle;
  }

  // ⭐ ¿Es una llamada de venta? Es la única pregunta que el módulo responde hoy.
  //
  // Limitless registra únicamente llamadas de venta: una grabación lo es cuando el
  // mail de alguno de sus participantes coincide con el del lead de un turno
  // agendado y el horario corresponde. Lo que no cruza —una reunión de equipo,
  // una sesión con un cliente— existe igual en `fathom_calls`, pero no entra al
  // módulo de ventas. No es un error.
  //
  // Corre después de refrescar el título (la espera de 30 minutos existe para
  // que alguien pueda renombrar la reunión) y antes de cualquier análisis.
  const salesCall = await resolveSalesCall({
    organizationId: call.organization_id,
    invitees: parseFathomInvitees(call.calendar_invitees),
    recordingStart: call.call_date ?? null,
  });

  /**
   * ⭐ Quién estaba del otro lado, y por lo tanto qué era esta llamada.
   *
   * Hasta el 2026-09-11 acá se escribía `purpose: sales | null`: lo que no
   * cruzaba un turno quedaba sin clasificar, y una sesión 1-1 con un cliente era
   * indistinguible de una reunión de equipo. Por eso no existía "última call
   * 1-1".
   *
   * El cruce con la agenda no se pierde: entra como el peldaño 4 del resolvedor.
   * Un cliente reconocido por mail **que además** tiene turno agendado es un
   * upsell —venta con un cliente—, y el modelo puede decir las dos cosas porque
   * `counterparty` y `purpose` son columnas separadas.
   */
  const classification = await classifyRecording({
    organizationId: call.organization_id,
    calendarInvitees: call.calendar_invitees,
    hasCalendarCrossing: salesCall.isSalesCall,
    calendarLeadId: null,
  });

  await admin
    .from("fathom_calls")
    .update({
      purpose: classification.purpose,
      counterparty: classification.counterparty,
      resolution_method: classification.resolutionMethod,
      counterparty_lead_id: classification.leadId,
      counterparty_speaker_name: classification.speakerName,
      closing_call_id: salesCall.appointmentId,
      appointment_match: salesCall.match,
      /**
       * ⭐ El `client_id` sólo se pisa cuando el resolvedor **no necesita
       * confirmación**. Escribir un candidato acá metería la llamada en la ficha
       * de otro cliente sin que nadie lo haya dicho, y dos personas que se
       * llaman igual alcanzan para que pase.
       *
       * `undefined` deja la columna como estaba: el vínculo que ya existiera
       * —manual, o del matcher por título— no se toca.
       */
      ...(classification.clientId && !classification.needsConfirmation
        ? { client_id: classification.clientId }
        : {}),
    })
    .eq("id", call.id);

  const { data: callState } = await admin
    .from("fathom_calls")
    .select("client_id, association_confidence")
    .eq("id", call.id)
    .single();

  const linkedClientId = callState?.client_id ?? call.client_id;
  const linkConfidence = Number(
    callState?.association_confidence ?? call.association_confidence ?? 0
  );

  if (
    linkedClientId &&
    (linkConfidence >= 0.75 || isManualFathomLink(linkedClientId, linkConfidence))
  ) {
    await finalizeAssociatedCall({
      callId: call.id,
      organizationId: call.organization_id,
      clientId: linkedClientId,
      fathomCallId: call.fathom_call_id,
      title,
      rawTitle: call.raw_title ?? call.title,
      transcript: call.transcript,
      fathomUrl: call.fathom_url,
      confidence: linkConfidence,
      durationSeconds: call.duration_seconds,
      callDate: call.call_date,
      purpose: classification.purpose,
    });
    return true;
  }

  // Todos los clientes, paginado: con el techo de 1000 filas de PostgREST, una
  // org más grande nunca asociaba llamadas a los clientes que quedaban afuera.
  const { rows: clients, error: clientsError } = await fetchAllRows<{
    id: string;
    name: string;
    nickname: string | null;
  }>((from, to) =>
    admin
      .from("clients")
      .select("id, name, nickname")
      .eq("organization_id", call.organization_id)
      .order("id", { ascending: true })
      .range(from, to)
  );
  if (clientsError) throw new Error(clientsError);

  const association = associateCallWithClients(
    title,
    (clients ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      nickname: c.nickname ?? null,
    }))
  );

  if (association.status === "unmatched") {
    if (call.transcript?.trim()) {
      const analysis = await analyzeFathomTranscript({
        organizationId: call.organization_id,
        clientName: "Equipo interno",
        transcript: call.transcript,
        previousCallsSummary: "",
      });

      await admin
        .from("fathom_calls")
        .update({
          title,
          raw_title: call.raw_title ?? call.title,
          status: "unmatched",
          ai_situation_summary: analysis?.situation_summary ?? null,
          ai_next_steps: analysis?.next_steps ?? [],
          ai_problems_detected: analysis?.problems_detected ?? [],
          processed_at: new Date().toISOString(),
        })
        .eq("id", call.id);

      await maybeExtractTeamMeetingTasks({
        callId: call.id,
        organizationId: call.organization_id,
        purpose: classification.purpose,
        transcript: call.transcript,
        summary: analysis?.situation_summary ?? call.summary ?? null,
      });
    } else {
      await admin
        .from("fathom_calls")
        .update({
          title,
          raw_title: call.raw_title ?? call.title,
          status: "unmatched",
          processed_at: new Date().toISOString(),
        })
        .eq("id", call.id);
    }
    return true;
  }

  if (association.status === "pending_review") {
    await admin
      .from("fathom_calls")
      .update({
        title,
        raw_title: call.raw_title ?? call.title,
        status: "pending_review",
        association_candidates: association.candidates,
        processed_at: new Date().toISOString(),
      })
      .eq("id", call.id);
    return true;
  }

  await finalizeAssociatedCall({
    callId: call.id,
    organizationId: call.organization_id,
    clientId: association.clientId,
    fathomCallId: call.fathom_call_id,
    title,
    rawTitle: call.raw_title ?? call.title,
    transcript: call.transcript,
    fathomUrl: call.fathom_url,
    confidence: association.confidence,
    durationSeconds: call.duration_seconds,
    callDate: call.call_date,
    purpose: classification.purpose,
  });

  return true;
}

export async function finalizeAssociatedCall(params: {
  callId: string;
  organizationId: string;
  clientId: string;
  fathomCallId: string;
  title: string;
  rawTitle: string;
  transcript: string | null;
  fathomUrl: string | null;
  confidence: number;
  durationSeconds?: number | null;
  callDate?: string | null;
  /** Propósito ya resuelto por el clasificador. */
  purpose?: string | null;
}): Promise<void> {
  const admin = createAdminClient();

  // SCRUM-43: el cliente tiene que ser de esta organización. Va antes de
  // cualquier escritura; si no, lanza y no se asocia nada.
  const client = await assertClienteDeLaOrg(admin, params.clientId, params.organizationId);

  const leadName = client.name ?? "Cliente";

  const { data: previousCalls } = await admin
    .from("fathom_calls")
    .select("title, ai_situation_summary, call_date")
    .eq("organization_id", params.organizationId)
    .eq("client_id", params.clientId)
    .eq("status", "associated")
    .order("call_date", { ascending: false })
    .limit(3);

  const previousSummary = (previousCalls ?? [])
    .map(
      (c) =>
        `${c.title}: ${c.ai_situation_summary ?? "sin resumen"}`
    )
    .join("\n");

  let analysis = null;
  if (params.transcript?.trim()) {
    analysis = await analyzeFathomTranscript({
      organizationId: params.organizationId,
      clientName: client?.name ?? "Cliente",
      transcript: params.transcript,
      previousCallsSummary: previousSummary,
    });
  }

  const nextSteps = analysis?.next_steps ?? [];
  const problems = analysis?.problems_detected ?? [];

  await admin
    .from("fathom_calls")
    .update({
      title: params.title,
      raw_title: params.rawTitle,
      status: "associated",
      client_id: params.clientId,
      association_confidence: params.confidence,
      ai_situation_summary: analysis?.situation_summary ?? null,
      ai_next_steps: nextSteps,
      ai_problems_detected: problems,
      ai_progress_vs_previous: analysis?.progress_vs_previous ?? null,
      processed_at: new Date().toISOString(),
    })
    .eq("id", params.callId);

  await maybeExtractTeamMeetingTasks({
    callId: params.callId,
    organizationId: params.organizationId,
    purpose: params.purpose ?? null,
    transcript: params.transcript,
    summary: analysis?.situation_summary ?? null,
  });

  /**
   * ⭐ El hermano del anterior para el otro tipo de reunión.
   *
   * Va acá, en el finalizador que comparten todos los caminos, y no en el flujo
   * de subida manual: así los compromisos de una 1-1 quedan registrados tanto si
   * alguien pegó el link como si la llamada entró sola por la sincronización y
   * se asoció después.
   */
  await maybeExtractOneOnOneTasks({
    callId: params.callId,
    organizationId: params.organizationId,
    clientId: params.clientId,
    purpose: params.purpose ?? null,
    transcript: params.transcript,
    callDate: params.callDate ?? null,
  });

  await admin.from("client_timeline_entries").insert({
    organization_id: params.organizationId,
    client_id: params.clientId,
    entry_type: "fathom_call",
    fathom_call_id: params.callId,
    title: params.title,
    situation_summary: analysis?.situation_summary ?? null,
    next_steps: nextSteps,
    problems_detected: problems,
    progress_indicator: analysis?.progress_indicator ?? "unknown",
    raw_data: { fathom_url: params.fathomUrl },
  });

  for (const problem of problems) {
    await admin.from("client_problems").insert({
      organization_id: params.organizationId,
      client_id: params.clientId,
      problem_description: problem,
      detected_from: "fathom_call",
      source_id: params.callId,
      status: "active",
    });
  }

  const durationMinutes =
    params.durationSeconds != null
      ? Math.max(1, Math.round(params.durationSeconds / 60))
      : undefined;

  if (params.transcript?.trim() && durationMinutes && durationMinutes >= 10) {
    const { data: closingCall } = await admin
      .from("closing_calls")
      .select("form_answers")
      .eq("organization_id", params.organizationId)
      .ilike("lead_name", `%${leadName}%`)
      .order("scheduled_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const deepAnalysisPayload = {
      organizationId: params.organizationId,
      fathomCallId: params.fathomCallId,
      transcript: params.transcript,
      leadName,
      durationMinutes,
      formAnswers: formAnswersToRecord(
        closingCall?.form_answers as CalendlyFormAnswer[] | null
      ),
      callTitle: params.title,
      callDate: params.callDate,
      fathomUrl: params.fathomUrl,
      clientId: params.clientId,
    };

    // Intentar encolar en QStash para garantizar ejecución
    // (evita que Vercel mate el análisis cuando la función cron termina)
    const enqueued = await publishFathomAnalysisJob(deepAnalysisPayload).catch(() => false);

    if (!enqueued) {
      // Fallback: ejecutar inline si QStash no está configurado
      console.log("[ProcessCall] QStash no disponible — ejecutando deep analysis inline");
      void generateDeepCallAnalysis(deepAnalysisPayload).catch((err) => {
        console.error("[ProcessCall] Error en deep analysis inline:", err);
      });
    }
  }

  if (params.transcript?.trim()) {
    void ingestDocument({
      organizationId: params.organizationId,
      sourceType: "fathom_call",
      sourceId: params.fathomCallId,
      title: params.title,
      data: {
        title: params.title,
        call_date: params.callDate,
        transcript: params.transcript,
        ai_situation_summary: analysis?.situation_summary,
        ai_next_steps: nextSteps,
        summary: analysis?.situation_summary,
      },
      tags: ["fathom", "call"],
    }).catch((err) => console.error("[RAG] Error ingestando call:", err));
  }
}

export async function ingestFathomWebhookCall(params: {
  organizationId: string;
  fathomCallId: string;
  title: string;
  transcript?: string;
  summary?: string;
  durationSeconds?: number;
  callDate?: string;
  fathomUrl?: string;
}): Promise<string> {
  const admin = createAdminClient();
  const processedAfter = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const callData = {
    organization_id: params.organizationId,
    fathom_call_id: params.fathomCallId,
    title: params.title,
    raw_title: params.title,
    transcript: params.transcript ?? null,
    summary: params.summary ?? null,
    duration_seconds: params.durationSeconds ?? null,
    call_date: params.callDate ?? new Date().toISOString(),
    fathom_url: params.fathomUrl ?? null,
    status: "pending" as const,
    processed_after: processedAfter,
    association_candidates: [] as unknown[],
    ai_next_steps: [] as string[],
    ai_problems_detected: [] as string[],
  };

  console.log("[Fathom] Inserting call:", {
    organization_id: callData.organization_id,
    title: callData.title,
    recording_id: callData.fathom_call_id,
    call_date: callData.call_date,
    has_transcript: Boolean(callData.transcript),
  });

  const { data, error } = await admin
    .from("fathom_calls")
    .upsert(callData, { onConflict: "organization_id,fathom_call_id" })
    .select("id")
    .single();

  if (error) {
    console.error(
      "[Fathom] Insert error:",
      error.message,
      error.details,
      error.hint,
      error.code
    );
    throw new Error(error.message);
  }

  console.log("[Fathom] Insert OK:", { id: data.id, fathom_call_id: callData.fathom_call_id });
  return data.id;
}
