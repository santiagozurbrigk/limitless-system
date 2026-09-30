/**
 * [EMBUDOS-WEBHOOK-PERDIDA] (SCRUM-6): un webhook de pagos o de GHL no responde
 * 200 si el evento no quedó guardado y procesado, un reintento de un evento que
 * quedó en `error` se reprocesa, y el reproceso recupera `unmapped`/`error`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { crearBaseFalsa } from "./base-falsa";

const base = vi.hoisted(() => ({ actual: null as ReturnType<typeof crearBaseFalsa> | null }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => base.actual!.cliente,
}));

vi.mock("@/lib/security/encryption", () => ({
  decrypt: (v: string) => {
    if (v === "roto") throw new Error("bad auth tag");
    return v.replace(/^enc:/, "");
  },
}));

import { ingestPaymentWebhook, statusHttpDeIngesta } from "@/lib/payments/ingest";
import { getWebhookSecret } from "@/lib/payments/integration";
import { ingestGHLOpportunityEvent } from "@/lib/ghl/ingest-opportunity-event";
import { reprocesarWebhooks } from "../reprocesar";

const ORG = "org-a";

/** Payload de Whop de la documentación (el mismo de normalize.test.ts). */
const whopPago = {
  id: "msg_1",
  type: "payment.succeeded",
  timestamp: "2026-08-10T17:03:24.291Z",
  data: {
    id: "pay_1",
    status: "paid",
    currency: "usd",
    settlement_amount: 497.5,
    paid_at: "2026-08-10T17:03:20.000Z",
    user: { id: "user_abc", email: "comprador@test.com" },
  },
};

/** Payload de GHL de la documentación (el mismo de opportunity-event.test.ts). */
const ghlEvento = {
  type: "OpportunityStageUpdate",
  webhookId: "wh_1",
  locationId: "loc_1",
  id: "opp_1",
  contactId: "c_1",
  monetaryValue: 40,
  name: "Oportunidad",
  pipelineId: "pipe_1",
  pipelineStageId: "stage_1",
  status: "open",
  dateAdded: "2021-11-26T12:41:02.193Z",
};

function eventos(tabla: string) {
  return base.actual!.filas(tabla);
}

beforeEach(() => {
  base.actual = crearBaseFalsa();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("statusHttpDeIngesta", () => {
  it("⭐ 500 sólo cuando falló de nuestro lado", () => {
    expect(statusHttpDeIngesta({ status: "error" })).toBe(500);
    expect(statusHttpDeIngesta({ status: "processed" })).toBe(200);
    expect(statusHttpDeIngesta({ status: "unmapped" })).toBe(200);
    expect(statusHttpDeIngesta({ status: "duplicate" })).toBe(200);
  });
});

describe("pagos (Whop / Commas)", () => {
  it("⭐ si no se pudo guardar el evento crudo, devuelve error (el webhook responde 500)", async () => {
    base.actual!.fallas["payment_webhook_events:insert"] = { message: "read-only transaction" };
    const r = await ingestPaymentWebhook("whop", ORG, whopPago);
    expect(r).toMatchObject({ stored: false, status: "error" });
    expect(statusHttpDeIngesta(r)).toBe(500);
  });

  it("⭐ el reintento de un evento que quedó en error se reprocesa en vez de volver duplicate", async () => {
    base.actual!.fallas["payment_transactions:upsert"] = { message: "timeout" };
    const primero = await ingestPaymentWebhook("whop", ORG, whopPago);
    expect(primero).toMatchObject({ stored: true, status: "error" });
    expect(eventos("payment_webhook_events")[0]!.status).toBe("error");

    delete base.actual!.fallas["payment_transactions:upsert"];
    const reintento = await ingestPaymentWebhook("whop", ORG, whopPago);
    expect(reintento.status).toBe("processed");
    expect(eventos("payment_webhook_events")).toHaveLength(1);
    expect(eventos("payment_webhook_events")[0]!.status).toBe("processed");
    expect(eventos("payment_transactions")).toHaveLength(1);
  });

  it("un reintento de un evento ya procesado sigue siendo duplicate", async () => {
    await ingestPaymentWebhook("whop", ORG, whopPago);
    const reintento = await ingestPaymentWebhook("whop", ORG, whopPago);
    expect(reintento.status).toBe("duplicate");
    expect(eventos("payment_transactions")).toHaveLength(1);
  });

  it("un evento en error de otra org no se reprocesa con este reintento", async () => {
    base.actual!.fallas["payment_transactions:upsert"] = { message: "timeout" };
    await ingestPaymentWebhook("whop", "org-b", whopPago);
    delete base.actual!.fallas["payment_transactions:upsert"];

    const r = await ingestPaymentWebhook("whop", ORG, whopPago);
    expect(r.status).toBe("duplicate");
    expect(eventos("payment_webhook_events")[0]!.status).toBe("error");
  });
});

describe("eventos trabados en pending (el proceso se cortó a mitad)", () => {
  function trabado(recibido: string, procesado: string | null = null) {
    base.actual!.filas("payment_webhook_events").push({
      id: "trabado",
      organization_id: ORG,
      provider: "whop",
      external_event_id: whopPago.id,
      payload: whopPago,
      status: "pending",
      received_at: recibido,
      processed_at: procesado,
    });
  }
  const haceUnaHora = () => new Date(Date.now() - 60 * 60_000).toISOString();

  it("⭐ un reintento retoma un evento que lleva más de 5 minutos en pending", async () => {
    trabado(haceUnaHora());
    const r = await ingestPaymentWebhook("whop", ORG, whopPago);
    expect(r.status).toBe("processed");
    expect(eventos("payment_transactions")).toHaveLength(1);
  });

  it("⭐ no pisa un evento que se está procesando ahora mismo", async () => {
    trabado(new Date().toISOString());
    const r = await ingestPaymentWebhook("whop", ORG, whopPago);
    expect(r.status).toBe("duplicate");
    expect(eventos("payment_transactions")).toHaveLength(0);
  });

  it("⭐ dos reintentos seguidos de un evento trabado: sólo el primero lo toma", async () => {
    trabado(haceUnaHora());
    base.actual!.fallas["payment_transactions:upsert"] = { message: "timeout" };
    // El primero lo reclama (processed_at = ahora) y falla: queda en error.
    // Simulamos que el proceso murió antes de `finish()` volviéndolo a pending.
    await ingestPaymentWebhook("whop", ORG, whopPago);
    const fila = eventos("payment_webhook_events")[0]!;
    fila.status = "pending";
    delete base.actual!.fallas["payment_transactions:upsert"];

    const segundo = await ingestPaymentWebhook("whop", ORG, whopPago);
    expect(segundo.status).toBe("duplicate");
  });
});

describe("GHL", () => {
  it("⭐ si no se pudo guardar el evento crudo, devuelve error (el webhook responde 500)", async () => {
    base.actual!.fallas["ghl_webhook_events:insert"] = { message: "connection refused" };
    const r = await ingestGHLOpportunityEvent(ORG, ghlEvento, "workflow_shared_secret");
    expect(r).toMatchObject({ stored: false, status: "error" });
  });

  it("⭐ el reintento de un evento que quedó en error se reprocesa", async () => {
    base.actual!.fallas["ghl_opportunities:upsert"] = { message: "timeout" };
    const primero = await ingestGHLOpportunityEvent(ORG, ghlEvento, "workflow_shared_secret");
    expect(primero.status).toBe("error");

    delete base.actual!.fallas["ghl_opportunities:upsert"];
    const reintento = await ingestGHLOpportunityEvent(ORG, ghlEvento, "workflow_shared_secret");
    expect(reintento.status).toBe("processed");
    expect(eventos("ghl_webhook_events")).toHaveLength(1);
    expect(eventos("ghl_webhook_events")[0]!.status).toBe("processed");
  });
});

describe("reprocesarWebhooks", () => {
  it("⭐ sin --aplicar sólo cuenta y no cambia nada", async () => {
    base.actual!.fallas["payment_transactions:upsert"] = { message: "timeout" };
    await ingestPaymentWebhook("whop", ORG, whopPago);
    delete base.actual!.fallas["payment_transactions:upsert"];

    const [pagos] = await reprocesarWebhooks(base.actual!.cliente as never, { aplicar: false, limite: 100 });
    expect(pagos).toMatchObject({ encontrados: 1, procesados: 0 });
    expect(eventos("payment_webhook_events")[0]!.status).toBe("error");
  });

  it("⭐ con --aplicar deja en processed lo que ahora se puede interpretar", async () => {
    base.actual!.fallas["payment_transactions:upsert"] = { message: "timeout" };
    base.actual!.fallas["ghl_opportunities:upsert"] = { message: "timeout" };
    await ingestPaymentWebhook("whop", ORG, whopPago);
    await ingestGHLOpportunityEvent(ORG, ghlEvento, "workflow_shared_secret");
    // Un evento que hoy no se sabe interpretar sigue igual.
    await ingestPaymentWebhook("whop", ORG, { id: "msg_2", type: "algo.raro", data: {} });
    delete base.actual!.fallas["payment_transactions:upsert"];
    delete base.actual!.fallas["ghl_opportunities:upsert"];

    const [pagos, ghl] = await reprocesarWebhooks(base.actual!.cliente as never, { aplicar: true, limite: 100 });
    expect(pagos).toMatchObject({ encontrados: 2, procesados: 1, siguenSinInterpretar: 1, conError: 0 });
    expect(ghl).toMatchObject({ encontrados: 1, procesados: 1 });
    expect(eventos("payment_webhook_events").map((f) => f.status).sort()).toEqual(["processed", "unmapped"]);
  });

  it("filtra por organización", async () => {
    base.actual!.fallas["payment_transactions:upsert"] = { message: "timeout" };
    await ingestPaymentWebhook("whop", "org-b", whopPago);
    delete base.actual!.fallas["payment_transactions:upsert"];

    const [pagos] = await reprocesarWebhooks(base.actual!.cliente as never, {
      aplicar: true,
      organizationId: ORG,
      limite: 100,
    });
    expect(pagos.encontrados).toBe(0);
  });
});

describe("getWebhookSecret", () => {
  const integracion = (secreto: string) =>
    base.actual!.filas("payment_integrations").push({
      organization_id: ORG,
      provider: "whop",
      webhook_secret_encrypted: secreto,
      api_key_encrypted: null,
      is_active: true,
    });

  it("devuelve el secreto, o null si la org no tiene el proveedor conectado", async () => {
    integracion("enc:ws_123");
    await expect(getWebhookSecret(ORG, "whop")).resolves.toBe("ws_123");
    await expect(getWebhookSecret("org-sin-whop", "whop")).resolves.toBeNull();
  });

  it("⭐ un secreto que no se puede descifrar lanza (500), no parece 'no conectado' (404)", async () => {
    integracion("roto");
    await expect(getWebhookSecret(ORG, "whop")).rejects.toThrow(/descifrar/);
  });

  it("⭐ una falla de la base al leer la integración lanza (500)", async () => {
    base.actual!.fallas["payment_integrations:select"] = { message: "connection refused" };
    await expect(getWebhookSecret(ORG, "whop")).rejects.toThrow(/No se pudo leer/);
  });
});
