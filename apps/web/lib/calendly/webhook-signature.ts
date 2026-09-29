import crypto from "crypto";
import { isCalendlyWebhookUnavailable } from "@/lib/calendly/oauth-token";

/**
 * Verificación de la firma de los webhooks de Calendly.
 *
 * Calendly firma cada evento con la `signing_key` de la suscripción y manda
 * `Calendly-Webhook-Signature: t=<unix segundos>,v1=<hmac-sha256 hex>`, donde el
 * HMAC es de `"<t>.<cuerpo>"`.
 *
 * ⭐ [CALENDLY-WEBHOOK-CLAVE-CENTINELA] (SCRUM-489): cuando Calendly no deja
 * crear la suscripción (plan gratuito, fallo), la integración guarda
 * `NO_WEBHOOK_SIGNING_KEY`, una constante pública del repo. Si esa constante
 * contara como clave, cualquiera podría firmar eventos para esas
 * organizaciones y cargarles turnos en Closing. Nunca es una clave válida.
 */

/** Cuánto puede diferir `t` del reloj del servidor. Frena reenviar un evento viejo. */
export const TOLERANCIA_FIRMA_SEGUNDOS = 5 * 60;

export function parseCalendlySignature(
  headerValue: string
): { timestamp: string; v1: string } | null {
  const campos = new Map<string, string>();
  for (const parte of headerValue.split(",")) {
    const i = parte.indexOf("=");
    if (i < 0) continue;
    campos.set(parte.slice(0, i).trim(), parte.slice(i + 1).trim());
  }
  const t = campos.get("t");
  const v1 = campos.get("v1")?.toLowerCase();
  if (!t || !v1) return null;
  return { timestamp: t, v1 };
}

export function verifyCalendlySignature(
  bodyText: string,
  signatureHeader: string,
  secret: string | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!secret || isCalendlyWebhookUnavailable(secret)) return false;

  const parsed = parseCalendlySignature(signatureHeader);
  if (!parsed) return false;
  if (!/^\d+$/.test(parsed.timestamp)) return false;

  const antiguedad = Math.abs(nowMs / 1000 - Number(parsed.timestamp));
  if (antiguedad > TOLERANCIA_FIRMA_SEGUNDOS) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${parsed.timestamp}.${bodyText}`)
    .digest("hex");

  if (expected.length !== parsed.v1.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(parsed.v1, "utf8"));
}

/**
 * La organización cuya clave firma el evento, o `null`. Las integraciones sin
 * suscripción (clave vacía o `NO_WEBHOOK_SIGNING_KEY`) no se consideran.
 */
export function findOrganizationForSignature(
  integrations: { organization_id: string; webhook_signing_key: string | null }[],
  bodyText: string,
  signatureHeader: string,
  nowMs: number = Date.now()
): string | null {
  for (const integration of integrations) {
    if (verifyCalendlySignature(bodyText, signatureHeader, integration.webhook_signing_key, nowMs)) {
      return integration.organization_id;
    }
  }
  return null;
}
