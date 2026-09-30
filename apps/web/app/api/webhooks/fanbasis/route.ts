import { NextResponse } from "next/server";
import { getWebhookSecret } from "@/lib/payments/integration";
import { ingestPaymentWebhook } from "@/lib/payments/ingest";
import { verifyHmacWebhook } from "@/lib/payments/verify-signature";

export const runtime = "nodejs";

/**
 * Webhook de Fanbasis — I-2 del plan de integraciones.
 *
 * El otro proveedor que el documento asigna a la etapa Cash (§05).
 *
 * URL a registrar en Fanbasis:
 *   https://<app>/api/webhooks/fanbasis?organizationId=<uuid>
 *
 * Fanbasis pasó a llamarse **Commas**, pero su API se sigue sirviendo desde
 * `fanbasis.com`, así que el id de proveedor no cambia.
 *
 * VERIFICADO el 2026-08-30: la cabecera de firma es `x-webhook-signature` y el
 * algoritmo HMAC-SHA256 en hex sobre el cuerpo crudo.
 *
 * ⚠️ **La entrega es at-most-once: un envío fallido se registra y NUNCA se
 * reintenta.** Por eso esta ruta responde 200 ante cualquier evento con firma
 * válida, incluso si no se supo interpretar — devolver un error perdería el
 * evento para siempre. El crudo ya quedó guardado y se puede reprocesar.
 */
const SIGNATURE_HEADERS = [
  "x-webhook-signature",
  "x-fanbasis-signature",
  "x-signature",
  "signature",
];

export async function POST(request: Request) {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");

  if (!organizationId) {
    return NextResponse.json(
      { ok: false, error: "Falta organizationId" },
      { status: 400 }
    );
  }

  const rawBody = await request.text();

  const lookup = await getWebhookSecret(organizationId, "fanbasis");
  if (lookup.status === "not_connected") {
    return NextResponse.json(
      { ok: false, error: "La organización no tiene Fanbasis conectado" },
      { status: 404 }
    );
  }
  if (lookup.status === "unavailable") {
    // 500 y no 404: está conectado pero no se pudo leer el secreto. Así el
    // proveedor lo registra como falla nuestra (y reintenta, si reintenta).
    return NextResponse.json(
      { ok: false, error: "No se pudo verificar el webhook" },
      { status: 500 }
    );
  }
  const secret = lookup.secret;

  const signature = SIGNATURE_HEADERS.map((h) => request.headers.get(h)).find(Boolean) ?? null;

  const check = verifyHmacWebhook(rawBody, signature, secret);
  if (!check.ok) {
    console.warn("[fanbasis] firma rechazada:", check.reason);
    return NextResponse.json({ ok: false, error: "Firma inválida" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const result = await ingestPaymentWebhook("fanbasis", organizationId, body);
  return NextResponse.json({ ok: true, ...result });
}
