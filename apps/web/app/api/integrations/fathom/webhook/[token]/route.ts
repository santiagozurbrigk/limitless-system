/**
 * B · L0 — El webhook de Fathom, uno por miembro.
 *
 * ⭐ Reemplaza el escaneo que hace la ruta vieja: esa trae **todos** los
 * `fathom_integrations` de todas las organizaciones y prueba secreto por secreto
 * hasta que alguno valide. Con webhooks por miembro eso no escala, y además es un
 * patrón que cruza datos entre organizaciones sin necesidad.
 *
 * Acá el token de la URL identifica **una** integración, así que la firma se
 * verifica contra **un solo secreto**.
 *
 * ⭐ SCRUM-37 (2026-10-02): hasta acá esta ruta no podía guardar nada. Verificaba
 * una firma que Fathom no manda (ver `lib/fathom/webhook-signature.ts`) y, si
 * pasaba, escribía una columna `raw_payload` que no existe sin `title`, que es
 * obligatorio. Ahora: firma de la doc de Fathom → crudo guardado en
 * `fathom_webhook_events` → el mismo guardado que la sincronización, con el
 * dueño de la grabación y `ingest_source = 'webhook'`.
 *
 * ⚠️ El cuerpo de `new-meeting-content-ready` no está detallado en la doc de
 * Fathom: se asume que es la reunión con la forma de `GET /meetings` (o anidada
 * bajo `meeting`/`recording`/`data`). Lo que no se entiende queda en el crudo
 * con su motivo; nunca se inventa una llamada.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { upsertFathomCallFromMeeting } from "@/lib/fathom/sync";
import { leerReunionDelWebhook } from "@/lib/fathom/webhook-meeting";
import {
  readFathomWebhookHeaders,
  verifyFathomWebhookSignature,
} from "@/lib/fathom/webhook-signature";

export const runtime = "nodejs";

type IntegrationRow = {
  id: string;
  organization_id: string;
  user_id: string;
  webhook_secret: string | null;
};

type Admin = ReturnType<typeof createAdminClient>;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const rawBody = await request.text();
  const admin = createAdminClient();

  const { data } = await admin
    .from("team_member_integrations")
    .select("id, organization_id, user_id, webhook_secret")
    .eq("webhook_token", token)
    .eq("integration_type", "fathom")
    .maybeSingle();

  const integration = data as IntegrationRow | null;

  // Un token que no existe no dice nada de por qué: no se filtra si el token es
  // inválido o si la integración se borró.
  if (!integration?.webhook_secret) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const headers = readFathomWebhookHeaders(request.headers);
  if (!verifyFathomWebhookSignature(integration.webhook_secret, headers, rawBody)) {
    // Una firma inválida en un token válido sí es raro: se registra en la fila
    // para que el panel lo muestre en vez de fallar en silencio.
    await admin
      .from("team_member_integrations")
      .update({
        last_error: "Llegó un webhook con firma inválida.",
        last_error_at: new Date().toISOString(),
      })
      .eq("id", integration.id);

    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  // 1. El crudo, antes de interpretar nada. `webhook-id` viene sí o sí: sin él
  // la firma no habría validado.
  const evento = await guardarCrudo(admin, integration, headers.id!, payload);
  if (evento === "error") {
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 });
  }
  if (evento.yaProcesado) {
    // Reintento de una entrega que ya se guardó bien.
    return NextResponse.json({ ok: true, duplicate: true });
  }

  // 2. La reunión. Si no se entiende, la entrega queda guardada con el motivo y
  // se responde 200: reintentar el mismo cuerpo no lo va a arreglar.
  const meeting = leerReunionDelWebhook(payload);
  if (!meeting) {
    await cerrarEvento(admin, evento.id, {
      procesado: true,
      error: "No se encontró el id de la grabación en el cuerpo del webhook.",
    });
    return NextResponse.json({ ok: true, mapped: false });
  }

  // 3. El mismo guardado que la sincronización, con el dueño de la grabación.
  // ⭐ `user_id` es lo que hace posible la regla de privacidad: una llamada sin
  // vincular la ve sólo quien la grabó.
  const ok = await upsertFathomCallFromMeeting(admin, integration.organization_id, meeting, {
    userId: integration.user_id,
    ingestSource: "webhook",
  });

  if (!ok) {
    await cerrarEvento(admin, evento.id, {
      fathomCallId: meeting.recording_id,
      error: "No se pudo guardar la llamada.",
      procesado: false,
    });
    // 500 para que Fathom reintente; el crudo ya está guardado.
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 });
  }

  await cerrarEvento(admin, evento.id, {
    procesado: true,
    fathomCallId: meeting.recording_id,
  });

  // ⭐ `last_event_at` es LA señal del panel: un miembro cuya key murió deja de
  // aportar llamadas y todo parece funcionar bien. Esto es lo que hace visible
  // ese silencio.
  await admin
    .from("team_member_integrations")
    .update({
      last_event_at: new Date().toISOString(),
      status: "connected",
      last_error: null,
      last_error_at: null,
    })
    .eq("id", integration.id);

  return NextResponse.json({ ok: true });
}

async function guardarCrudo(
  admin: Admin,
  integration: IntegrationRow,
  webhookMessageId: string,
  payload: unknown
): Promise<{ id: string; yaProcesado: boolean } | "error"> {
  const { data, error } = await admin
    .from("fathom_webhook_events")
    .insert({
      organization_id: integration.organization_id,
      integration_id: integration.id,
      user_id: integration.user_id,
      webhook_message_id: webhookMessageId,
      payload,
    })
    .select("id")
    .single();

  if (!error && data) return { id: data.id as string, yaProcesado: false };

  // Fathom reintenta con el mismo `webhook-id`: se reusa la fila.
  if (error?.code === "23505") {
    const { data: existente } = await admin
      .from("fathom_webhook_events")
      .select("id, processed_at")
      .eq("integration_id", integration.id)
      .eq("webhook_message_id", webhookMessageId)
      .maybeSingle();
    if (existente) {
      return { id: existente.id as string, yaProcesado: Boolean(existente.processed_at) };
    }
  }

  console.error("[fathom webhook] no se pudo guardar el crudo", error?.message);
  return "error";
}

async function cerrarEvento(
  admin: Admin,
  eventoId: string,
  // `procesado: false` deja `processed_at` vacío: el reintento de Fathom con el
  // mismo `webhook-id` la vuelve a intentar.
  resultado: { procesado: boolean; fathomCallId?: string; error?: string }
): Promise<void> {
  const { error } = await admin
    .from("fathom_webhook_events")
    .update({
      fathom_call_id: resultado.fathomCallId ?? null,
      error: resultado.error ?? null,
      processed_at: resultado.procesado ? new Date().toISOString() : null,
    })
    .eq("id", eventoId);
  if (error) console.error("[fathom webhook] no se pudo cerrar el evento", error.message);
}
