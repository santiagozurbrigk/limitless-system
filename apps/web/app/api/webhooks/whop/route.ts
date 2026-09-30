import { NextResponse } from "next/server";
import { getWebhookSecret } from "@/lib/payments/integration";
import { ingestPaymentWebhook, statusHttpDeIngesta } from "@/lib/payments/ingest";
import { verifyStandardWebhook } from "@/lib/payments/verify-signature";

export const runtime = "nodejs";

/**
 * Webhook de Whop — I-2 del plan de integraciones.
 *
 * Whop es uno de los dos proveedores que el documento fuente asigna a la etapa
 * Cash (§05: "Whop / Fanbasis — AOV, cash collected, refunds").
 *
 * La URL a registrar en Whop incluye la org:
 *   https://<app>/api/webhooks/whop?organizationId=<uuid>
 *
 * El `organizationId` de la URL NO autentica nada — sólo dice contra qué secreto
 * verificar. Lo que prueba que el evento es legítimo es la firma.
 *
 * VERIFICADO el 2026-08-30: Standard Webhooks con el secreto `ws_...` usado
 * literalmente como clave HMAC.
 *
 * La entrega de Whop es at-least-once y reintenta ~3 días, así que un mismo
 * evento puede llegar varias veces con el mismo `webhook-id`. La deduplicación
 * vive en `payment_webhook_events`.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");

  if (!organizationId) {
    return NextResponse.json(
      { ok: false, error: "Falta organizationId" },
      { status: 400 }
    );
  }

  // El cuerpo crudo, sin parsear: la firma se calcula sobre los bytes exactos.
  const rawBody = await request.text();

  // [EMBUDOS-WEBHOOK-PERDIDA] (SCRUM-6): si no se pudo leer o descifrar el
  // secreto, la falla es nuestra: 500 para que el proveedor reintente.
  let secret: string | null;
  try {
    secret = await getWebhookSecret(organizationId, "whop");
  } catch (error) {
    console.error("[whop] no se pudo obtener el secreto:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { ok: false, error: "No se pudo leer la integración" },
      { status: 500 }
    );
  }
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "La organización no tiene Whop conectado" },
      { status: 404 }
    );
  }

  const check = verifyStandardWebhook(
    rawBody,
    {
      id: request.headers.get("webhook-id"),
      timestamp: request.headers.get("webhook-timestamp"),
      signature: request.headers.get("webhook-signature"),
    },
    secret
  );

  if (!check.ok) {
    console.warn("[whop] firma rechazada:", check.reason);
    return NextResponse.json({ ok: false, error: "Firma inválida" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const result = await ingestPaymentWebhook("whop", organizationId, body);

  // Un evento que no se supo interpretar (`unmapped`) responde 200: quedó
  // guardado y reintentarlo no cambiaría el resultado. [EMBUDOS-WEBHOOK-PERDIDA]
  // (SCRUM-6): si falló de nuestro lado (`error`), 500 para que Whop reintente
  // (lo hace ~3 días) y el reintento lo reprocese.
  const status = statusHttpDeIngesta(result);
  return NextResponse.json({ ok: status === 200, ...result }, { status });
}
