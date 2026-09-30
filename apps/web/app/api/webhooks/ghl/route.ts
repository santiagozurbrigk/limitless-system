import { NextResponse } from "next/server";
import {
  ingestGHLOpportunityEvent,
  resolveOrganizationByLocation,
} from "@/lib/ghl/ingest-opportunity-event";
import { getGHLWebhookSecret } from "@/lib/ghl/integration";
import { extractGHLEventType } from "@/lib/ghl/opportunity-event";
import { verifyGHLWebhook } from "@/lib/ghl/verify-webhook";
import { statusHttpDeIngesta } from "@/lib/payments/ingest";

export const runtime = "nodejs";

/**
 * Webhook de oportunidades de GoHighLevel — I-4 del plan de integraciones.
 *
 * Es la única fuente posible de M21, M22, M23 y M25: la API v3 no expone
 * historial de cambios de etapa, así que el historial lo construye Limitless con
 * estos eventos (ver docs/external-apis/gohighlevel/RESUMEN-LIMITLESS.md §4).
 *
 * ⭐ DOS VÍAS DE ENTREGA
 *
 * 1. **App del Marketplace** — GHL firma con Ed25519 (`X-GHL-Signature`) y
 *    manda el `locationId` en el payload, con el que se resuelve la org. No
 *    necesita nada en la URL:
 *      https://<app>/api/webhooks/ghl
 *    Requiere que Limitless tenga app aprobada; hoy no la tiene.
 *
 * 2. **Workflow de la sub-cuenta** — el cliente agrega una acción "Webhook" en
 *    un Workflow de GHL apuntando a Limitless. No hay firma de plataforma, así que se
 *    autentica con un secreto por organización:
 *      https://<app>/api/webhooks/ghl?organizationId=<uuid>&secret=<secreto>
 *    Es la vía que funciona hoy, sin depender de la aprobación del Marketplace.
 *
 * El `organizationId` de la URL NO autentica nada: sólo dice contra qué secreto
 * verificar. Lo que autoriza es la firma o el secreto.
 *
 * ⚠️ El payload de la vía 2 lo arma quien configura el workflow y NO está
 * documentado. El normalizador busca los campos en varias capas y persiste el
 * evento crudo antes de interpretarlo — ver `docs/integraciones/apis-sin-documentacion.md`.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const rawBody = await request.text();

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  // La org sale de la URL (vía workflow) o del locationId del payload (vía
  // plataforma, donde la URL es una sola para todas las sub-cuentas).
  const locationId = typeof body.locationId === "string" ? body.locationId : null;
  const organizationId =
    url.searchParams.get("organizationId") ??
    (locationId ? await resolveOrganizationByLocation(locationId) : null);

  if (!organizationId) {
    return NextResponse.json(
      { ok: false, error: "No se pudo resolver la organización del evento" },
      { status: 404 }
    );
  }

  // [EMBUDOS-WEBHOOK-PERDIDA] (SCRUM-6): si no se pudo leer el secreto, la
  // falla es nuestra: 500 para que GHL reintente.
  let sharedSecret: string | null;
  try {
    sharedSecret = await getGHLWebhookSecret(organizationId);
  } catch (error) {
    console.error("[ghl-webhook] no se pudo obtener el secreto:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { ok: false, error: "No se pudo leer la integración" },
      { status: 500 }
    );
  }
  const providedSecret =
    url.searchParams.get("secret") ?? request.headers.get("x-otc-webhook-secret");

  const check = verifyGHLWebhook(
    rawBody,
    {
      ghl: request.headers.get("x-ghl-signature"),
      legacy: request.headers.get("x-wh-signature"),
    },
    sharedSecret,
    providedSecret
  );

  if (!check.ok) {
    console.warn("[ghl-webhook] rechazado:", check.reason);
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  /*
   * ⭐ La firma de plataforma prueba que el evento lo firmó GHL, no a qué
   * sub-cuenta pertenece: la clave pública es una sola para todo GHL. En esa vía
   * la org sale sólo del `locationId` firmado. Si se aceptaba `?organizationId=`,
   * cualquiera con un evento firmado de su propia sub-cuenta lo reenviaba al
   * embudo de otra org.
   */
  if (check.authPath !== "workflow_shared_secret") {
    const signedOrg = locationId
      ? await resolveOrganizationByLocation(locationId)
      : null;
    if (!signedOrg || signedOrg !== organizationId) {
      console.warn("[ghl-webhook] locationId firmado no corresponde a la org");
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
    }
  }

  // GHL manda muchos tipos de evento por el mismo endpoint. Los que no son de
  // oportunidad se descartan sin guardar: no aportan al embudo y traen datos
  // personales que no hace falta almacenar.
  const eventType = extractGHLEventType(body) ?? "";
  if (!eventType.startsWith("Opportunity")) {
    return NextResponse.json({ ok: true, ignored: eventType || "sin tipo" });
  }

  const result = await ingestGHLOpportunityEvent(organizationId, body, check.authPath);

  // 200 aunque no se haya sabido interpretar (`unmapped`): quedó guardado y
  // reintentarlo no cambiaría el resultado. 500 si falló de nuestro lado
  // (`error`), para que GHL reintente y el reintento lo reprocese (SCRUM-6).
  const status = statusHttpDeIngesta(result);
  return NextResponse.json({ ok: status === 200, ...result }, { status });
}
