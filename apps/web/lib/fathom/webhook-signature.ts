/**
 * Verificación de la firma de los webhooks de Fathom.
 *
 * ⭐ Fathom firma con el esquema "Standard Webhooks"
 * (`docs/external-apis/fathom/webhooks.md`, "Verifying Webhooks"): tres headers
 * —`webhook-id`, `webhook-timestamp`, `webhook-signature`— y una firma HMAC-SHA256
 * en base64 de `${id}.${timestamp}.${body}`, con el secreto `whsec_<base64>`
 * decodificado. Antes la ruta por miembro buscaba un HMAC hex del cuerpo en
 * `x-fathom-signature`, un supuesto que nunca se probó: con la firma real de
 * Fathom rechazaba todas las entregas.
 *
 * Lógica pura, aparte de la ruta para poder testearla.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Tolerancia de la doc de Fathom: evita que se reenvíe un webhook viejo. */
export const FATHOM_WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export type FathomWebhookHeaders = {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
};

export function readFathomWebhookHeaders(headers: Headers): FathomWebhookHeaders {
  return {
    id: headers.get("webhook-id"),
    timestamp: headers.get("webhook-timestamp"),
    signature: headers.get("webhook-signature"),
  };
}

/** El secreto viene como `whsec_<base64>`; la parte después del prefijo es la clave. */
function secretBytes(secret: string): Buffer {
  const raw = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  return Buffer.from(raw, "base64");
}

export function signFathomWebhook(
  secret: string,
  id: string,
  timestamp: string,
  rawBody: string
): string {
  return createHmac("sha256", secretBytes(secret))
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");
}

export function verifyFathomWebhookSignature(
  secret: string,
  headers: FathomWebhookHeaders,
  rawBody: string,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;

  const sentAt = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(sentAt)) return false;
  if (Math.abs(nowSeconds - sentAt) > FATHOM_WEBHOOK_TOLERANCE_SECONDS) return false;

  const expected = Buffer.from(signFathomWebhook(secret, id, timestamp, rawBody));

  // El header es una lista separada por espacios, cada una con su versión
  // adelante (`v1,<firma>`). Alcanza con que una coincida.
  return signature.split(" ").some((entry) => {
    const parts = entry.split(",");
    const received = Buffer.from(parts.length > 1 ? parts[1]! : parts[0]!);
    // Longitudes distintas hacen que timingSafeEqual lance en vez de devolver false.
    if (received.length !== expected.length) return false;
    return timingSafeEqual(received, expected);
  });
}
