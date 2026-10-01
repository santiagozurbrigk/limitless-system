/**
 * [SEC-MASTER-KEY-ROTACION] punto 5: "no se pudo descifrar" no es "no conectado".
 * Un webhook de pagos con secreto indescifrable responde 500, no 404.
 */
import { randomBytes } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  error: null as { message: string } | null,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: state.row, error: state.error }),
    };
    return { from: () => query };
  },
}));

import { encrypt } from "@/lib/security/encryption";
import { getWebhookSecret } from "../integration";
import { POST as whopPOST } from "@/app/api/webhooks/whop/route";
import { POST as fanbasisPOST } from "@/app/api/webhooks/fanbasis/route";

const ORIGINAL = process.env.ENCRYPTION_MASTER_KEY;
const ORG = "11111111-1111-1111-1111-111111111111";

function storedSecret(organizationId = ORG): string {
  return encrypt("ws_secreto", {
    field: "payment_integrations.webhook_secret_encrypted",
    organizationId,
  });
}

function integrationRow(webhookSecretEncrypted: string) {
  return {
    organization_id: ORG,
    provider: "whop",
    webhook_secret_encrypted: webhookSecretEncrypted,
    api_key_encrypted: null,
    is_active: true,
  };
}

function webhookRequest(provider: "whop" | "fanbasis"): Request {
  return new Request(`https://app.test/api/webhooks/${provider}?organizationId=${ORG}`, {
    method: "POST",
    body: "{}",
  });
}

beforeEach(() => {
  process.env.ENCRYPTION_MASTER_KEY = randomBytes(32).toString("base64");
  state.row = null;
  state.error = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  if (ORIGINAL === undefined) delete process.env.ENCRYPTION_MASTER_KEY;
  else process.env.ENCRYPTION_MASTER_KEY = ORIGINAL;
});

describe("getWebhookSecret", () => {
  it("devuelve el secreto descifrado", async () => {
    state.row = integrationRow(storedSecret());
    expect(await getWebhookSecret(ORG, "whop")).toEqual({ status: "ok", secret: "ws_secreto" });
  });

  it("no conectado si no hay integración activa", async () => {
    expect(await getWebhookSecret(ORG, "whop")).toEqual({ status: "not_connected" });
  });

  it("no disponible (no 'no conectado') si la clave maestra cambió", async () => {
    state.row = integrationRow(storedSecret());
    process.env.ENCRYPTION_MASTER_KEY = randomBytes(32).toString("base64");
    expect(await getWebhookSecret(ORG, "whop")).toEqual({
      status: "unavailable",
      reason: "decrypt_failed",
    });
  });

  it("no disponible si el secreto se copió de otra org", async () => {
    state.row = integrationRow(storedSecret("22222222-2222-2222-2222-222222222222"));
    expect(await getWebhookSecret(ORG, "whop")).toMatchObject({ status: "unavailable" });
  });

  it("no disponible si falla la consulta a la base", async () => {
    state.error = { message: "timeout" };
    expect(await getWebhookSecret(ORG, "whop")).toEqual({
      status: "unavailable",
      reason: "db_error",
    });
  });
});

describe.each([
  ["whop", whopPOST],
  ["fanbasis", fanbasisPOST],
] as const)("webhook de %s", (provider, POST) => {
  it("responde 500 si el secreto no se puede descifrar", async () => {
    state.row = integrationRow(storedSecret());
    process.env.ENCRYPTION_MASTER_KEY = randomBytes(32).toString("base64");
    const res = await POST(webhookRequest(provider));
    expect(res.status).toBe(500);
  });

  it("responde 404 si la org no tiene el proveedor conectado", async () => {
    const res = await POST(webhookRequest(provider));
    expect(res.status).toBe(404);
  });
});
