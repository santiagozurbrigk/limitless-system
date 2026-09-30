/**
 * lib/payments/ingest.ts
 *
 * Recibe un webhook ya verificado, lo persiste crudo y lo intenta interpretar.
 *
 * El orden importa: **primero se guarda el evento crudo, después se interpreta**.
 * Si el mapeo falla, el evento no se pierde: queda en `payment_webhook_events`
 * con estado `unmapped` y se puede reprocesar cuando el mapeo se corrija con
 * payloads reales.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeWebhook, extractEventId, extractEventType } from "./normalize";
import type { PaymentProvider } from "./types";
import { reclamarEvento } from "@/lib/webhooks/reclamar";

export type IngestResult = {
  stored: boolean;
  status: "processed" | "unmapped" | "duplicate" | "error";
  detail?: string;
};

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * [EMBUDOS-WEBHOOK-PERDIDA] (SCRUM-6): un evento que terminó en `error` se
 * responde con 500 para que el proveedor lo reintente. Si no se llegó a guardar,
 * el reintento es la única copia; si se guardó pero falló después, el reintento
 * lo reprocesa (ver `lib/webhooks/reclamar.ts`). `unmapped` no se reintenta:
 * volvería a dar lo mismo, y queda guardado para el reproceso.
 */
export function statusHttpDeIngesta(result: { status: IngestResult["status"] }): 200 | 500 {
  return result.status === "error" ? 500 : 200;
}

export async function ingestPaymentWebhook(
  provider: PaymentProvider,
  organizationId: string,
  body: Record<string, unknown>
): Promise<IngestResult> {
  const admin = createAdminClient();
  const eventId = extractEventId(body);
  const eventType = extractEventType(body);

  // 1) Guardar crudo. El índice único sobre (provider, external_event_id)
  //    descarta reentregas del mismo evento.
  const { data: stored, error: storeError } = await admin
    .from("payment_webhook_events")
    .insert({
      organization_id: organizationId,
      provider,
      event_type: eventType,
      external_event_id: eventId,
      payload: body,
    })
    .select("id")
    .maybeSingle();

  if (storeError) {
    // 23505 = unique_violation: el evento ya se había recibido. Si aquella vez
    // quedó en `error` o trabado en `pending`, este reintento es la oportunidad
    // de procesarlo (SCRUM-6, ver `lib/webhooks/reclamar.ts`).
    if (storeError.code === "23505") {
      const previo = eventId
        ? await reclamarEvento<{ id: string; payload: Record<string, unknown> }>(
            admin,
            "payment_webhook_events",
            { provider, external_event_id: eventId, organization_id: organizationId },
            "id, payload"
          )
        : null;
      if (!previo) return { stored: false, status: "duplicate" };
      return procesarEventoDePago(admin, previo.id, provider, organizationId, previo.payload);
    }
    console.error("[payments] no se pudo guardar el evento", storeError.message);
    return { stored: false, status: "error", detail: storeError.message };
  }

  return procesarEventoDePago(admin, stored?.id as string | undefined, provider, organizationId, body);
}

/**
 * Interpreta un evento ya guardado y deja su estado final en
 * `payment_webhook_events`. La usan el webhook y el reproceso
 * (`scripts/reprocesar-webhooks.ts`).
 */
export async function procesarEventoDePago(
  admin: AdminClient,
  eventRowId: string | undefined,
  provider: PaymentProvider,
  organizationId: string,
  body: Record<string, unknown>
): Promise<IngestResult> {
  const normalized = normalizeWebhook(provider, body);

  const finish = async (status: string, errorMessage?: string) => {
    if (!eventRowId) return;
    await admin
      .from("payment_webhook_events")
      .update({
        status,
        error_message: errorMessage ?? null,
        processed_at: new Date().toISOString(),
      })
      .eq("id", eventRowId);
  };

  if (normalized.kind === "unmapped") {
    await finish("unmapped", normalized.reason);
    return { stored: true, status: "unmapped", detail: normalized.reason };
  }

  try {
    if (normalized.kind === "order") {
      const o = normalized.order;
      const { error } = await admin.from("payment_orders").upsert(
        {
          organization_id: organizationId,
          provider,
          external_id: o.externalId,
          customer_external_id: o.customerExternalId,
          customer_email: o.customerEmail,
          contract_value: o.contractValue,
          currency: o.currency,
          product_name: o.productName,
          is_recurring: o.isRecurring,
          status: o.status,
          ordered_at: o.orderedAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,provider,external_id" }
      );
      if (error) throw new Error(error.message);
    } else {
      const t = normalized.transaction;
      const { error } = await admin.from("payment_transactions").upsert(
        {
          organization_id: organizationId,
          provider,
          external_id: t.externalId,
          order_external_id: t.orderExternalId,
          customer_external_id: t.customerExternalId,
          customer_email: t.customerEmail,
          kind: t.kind,
          amount: t.amount,
          currency: t.currency,
          occurred_at: t.occurredAt,
        },
        { onConflict: "organization_id,provider,external_id" }
      );
      if (error) throw new Error(error.message);
    }

    await admin
      .from("payment_integrations")
      .update({ last_event_at: new Date().toISOString() })
      .eq("organization_id", organizationId)
      .eq("provider", provider);

    await finish("processed");
    return { stored: true, status: "processed" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    await finish("error", message);
    return { stored: true, status: "error", detail: message };
  }
}
