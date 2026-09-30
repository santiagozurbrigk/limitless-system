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

  // [EMBUDOS-WEBHOOK-PERDIDA] (SCRUM-6): si no se pudo leer o descifrar el
  // secreto, la falla es nuestra: 500 para que el proveedor reintente.
  let secret: string | null;
  try {
    secret = await getWebhookSecret(organizationId, "fanbasis");
  } catch (error) {
    console.error("[fanbasis] no se pudo obtener el secreto:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { ok: false, error: "No se pudo leer la integración" },
      { status: 500 }
    );
  }
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "La organización no tiene Fanbasis conectado" },
      { status: 404 }
    );
  }

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
