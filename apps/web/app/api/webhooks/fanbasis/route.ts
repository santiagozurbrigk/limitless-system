import { NextResponse } from "next/server";
import { getWebhookSecret } from "@/lib/payments/integration";
import { ingestPaymentWebhook, statusHttpDeIngesta } from "@/lib/payments/ingest";
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
 * reintenta.** Por eso un evento con firma válida que no se supo interpretar
 * responde 200: el crudo quedó guardado y se puede reprocesar. Cuando falla de
 * nuestro lado responde 500 como los demás (SCRUM-6), pero eso no trae el
 * evento de vuelta: si no se llegó a guardar, lo que queda es el log
 * `[ALERTA][fanbasis]` con el payload, para cargarlo a mano.
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
    // 500 y no 404: está conectado pero no se pudo leer el secreto
    // ([EMBUDOS-WEBHOOK-PERDIDA], SCRUM-86). Commas no reintenta: sin este log el
    // evento se pierde sin rastro. La firma no se pudo verificar, así que el
    // payload queda marcado como tal.
    console.error(
      "[ALERTA][fanbasis] evento de pago NO guardado (firma sin verificar: no se pudo leer el secreto); Commas no reintenta.",
      JSON.stringify({ organizationId, reason: lookup.reason, payload: rawBody })
    );
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

  // [EMBUDOS-WEBHOOK-PERDIDA] (SCRUM-6): Commas no reintenta. Si el evento no
  // se llegó a guardar, el log con el payload es la única copia: queda como
  // alerta para cargarlo a mano. Si se guardó y falló después, lo recupera
  // `scripts/reprocesar-webhooks.ts`.
  if (!result.stored && result.status === "error") {
    console.error(
      "[ALERTA][fanbasis] evento de pago NO guardado; Commas no reintenta.",
      JSON.stringify({ organizationId, detail: result.detail, payload: body })
    );
  }
  const status = statusHttpDeIngesta(result);
  return NextResponse.json({ ok: status === 200, ...result }, { status });
}
