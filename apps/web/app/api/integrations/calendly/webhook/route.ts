import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestIp, rateLimitExceeded, webhookRateLimit } from "@/lib/rate-limit";
import { syncCalendlyEventsForOrganization } from "@/lib/calendly/sync-events";
import { findOrganizationForSignature } from "@/lib/calendly/webhook-signature";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { CalendlyWebhookBody, CalendlyWebhookInviteePayload } from "@/types/calendly";

export const runtime = "nodejs";

function uriFromField(
  field: string | { uri?: string } | undefined
): string | null {
  if (!field) return null;
  if (typeof field === "string") return field;
  return field.uri ?? null;
}

function extractStartTime(payload: CalendlyWebhookInviteePayload): string | null {
  const nested = payload.scheduled_event?.start_time;
  if (nested) return nested;

  const eventField = payload.event;
  if (eventField && typeof eventField === "object" && "start_time" in eventField) {
    const start = eventField.start_time;
    if (start) return start;
  }

  return payload.start_time ?? null;
}

function extractInviteeName(payload: CalendlyWebhookInviteePayload): string | null {
  if (payload.name) return String(payload.name);

  const first = payload.first_name ?? payload.firstName;
  const last = payload.last_name ?? payload.lastName;
  if (first || last) return `${first ?? ""} ${last ?? ""}`.trim();

  return null;
}

function extractEventId(payload: CalendlyWebhookInviteePayload): string | null {
  return (
    payload.uri ??
    uriFromField(payload.invitee) ??
    (typeof payload.event === "string" ? payload.event : payload.event?.uri) ??
    uriFromField(payload.routing_form_submission) ??
    null
  );
}

function extractQuestionsAndAnswers(payload: CalendlyWebhookInviteePayload) {
  const qas = payload.questions_and_answers;
  if (!Array.isArray(qas)) return [];
  const mapped = qas.map((qa) => {
    const question = qa?.question ?? null;
    const answer = qa?.answer ?? null;
    if (!question || answer == null) return null;
    return { question: String(question), answer: String(answer) };
  });

  return mapped.filter(
    (v): v is { question: string; answer: string } => v != null
  );
}

/**
 * Un `invitee.canceled` es una cancelación, no una inasistencia: la llamada
 * nunca ocurrió. Guardarlo como `no_show` inflaba la tasa de inasistencia y
 * hacía invisible el evento que el seguimiento del lead tiene que registrar.
 */
function mapStatusHint(
  eventType: string
): "scheduled" | "no_show" | "cancelled" {
  if (eventType === "invitee.created") return "scheduled";
  if (eventType === "invitee_no_show.created") return "no_show";
  if (eventType === "invitee.canceled") return "cancelled";
  if (eventType === "invitee_no_show.deleted") return "scheduled";
  return "scheduled";
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase no configurado" }, { status: 500 });
  }

  const ip = getRequestIp(req);
  const { allowed, resetAt } = await webhookRateLimit(`calendly:${ip}`);
  if (!allowed) return rateLimitExceeded(resetAt);

  try {
    const bodyText = await req.text();
    const signature =
      req.headers.get("Calendly-Webhook-Signature") ??
      req.headers.get("calendly-webhook-signature");

    if (!signature) {
      return NextResponse.json(
        { error: "Falta header de firma de Calendly" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const { data: integrations } = await supabase
      .from("calendly_integrations")
      .select("organization_id, webhook_signing_key");

    const list = (integrations ?? []) as {
      organization_id: string;
      webhook_signing_key: string;
    }[];

    // Nunca acepta la clave de "sin webhook" ni un evento fuera de la ventana
    // de tiempo ([CALENDLY-WEBHOOK-CLAVE-CENTINELA], SCRUM-489).
    const matchedOrgId = findOrganizationForSignature(list, bodyText, signature);

    if (!matchedOrgId) {
      return NextResponse.json({ error: "Firma de Calendly inválida" }, { status: 401 });
    }

    // El cuerpo se interpreta recién con la firma verificada.
    const body = JSON.parse(bodyText) as CalendlyWebhookBody;
    const eventType = String(body.event ?? "");
    const payload: CalendlyWebhookInviteePayload = body.payload ?? {};

    const eventId = extractEventId(payload);
    const startTime = extractStartTime(payload) ?? new Date().toISOString();
    const inviteeName = extractInviteeName(payload);
    if (!eventId || !inviteeName) {
      return NextResponse.json(
        { error: "Payload incompleto para sincronizar" },
        { status: 400 }
      );
    }

    const questionsAndAnswers = extractQuestionsAndAnswers(payload);

    const admin = createAdminClient();
    await syncCalendlyEventsForOrganization(admin, matchedOrgId, [
      {
        eventId,
        startTime,
        inviteeName,
        inviteeEmail: payload.email,
        url: payload.uri,
        questionsAndAnswers,
        statusHint: mapStatusHint(eventType),
      },
    ]);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[calendly/webhook]", e);
    return NextResponse.json(
      { error: "No se pudo procesar el evento de Calendly" },
      { status: 500 }
    );
  }
}
