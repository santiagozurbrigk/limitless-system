import { beforeEach, describe, expect, it, vi } from "vitest";
import { signFathomWebhook } from "@/lib/fathom/webhook-signature";

/**
 * SCRUM-37 · [FATHOM-WEBHOOK-MIEMBRO-ROTO]: el webhook de Fathom por miembro
 * guarda la grabación. Base y guardado simulados: el test falla si la ruta
 * vuelve a verificar otra firma, si interpreta antes de guardar el crudo o si
 * la llamada no queda a nombre del miembro con `ingest_source = 'webhook'`.
 */

const SECRET = "whsec_5WbX5kEWLlfzsGNjH64I8lOOqUB6e8FH";
const INTEGRACION = {
  id: "int-1",
  organization_id: "org-1",
  user_id: "user-1",
  webhook_secret: SECRET,
};

const sim = vi.hoisted(() => ({
  integracion: null as Record<string, unknown> | null,
  eventos: [] as Array<Record<string, unknown>>,
  updates: [] as Array<{ table: string; row: Record<string, unknown> }>,
  orden: [] as string[],
  upsertOk: true,
  upsert: vi.fn(),
}));

vi.mock("@/lib/fathom/sync", () => ({
  upsertFathomCallFromMeeting: (...args: unknown[]) => {
    sim.orden.push("upsert");
    sim.upsert(...args);
    return Promise.resolve(sim.upsertOk);
  },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(table: string) {
      const filtros: Record<string, unknown> = {};
      let insertado: Record<string, unknown> | null = null;
      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          filtros[col] = val;
          return builder;
        },
        maybeSingle: async () => {
          if (table === "team_member_integrations") {
            return { data: filtros.webhook_token === "tok" ? sim.integracion : null };
          }
          const ev = sim.eventos.find(
            (e) => e.webhook_message_id === filtros.webhook_message_id
          );
          return { data: ev ?? null };
        },
        insert: (row: Record<string, unknown>) => {
          sim.orden.push(`insert:${table}`);
          const dup = sim.eventos.some(
            (e) => e.webhook_message_id === row.webhook_message_id
          );
          if (!dup) {
            insertado = { id: `ev-${sim.eventos.length + 1}`, processed_at: null, ...row };
            sim.eventos.push(insertado);
          }
          return {
            select: () => ({
              single: async () =>
                dup
                  ? { data: null, error: { code: "23505", message: "duplicate" } }
                  : { data: { id: insertado!.id }, error: null },
            }),
          };
        },
        update: (row: Record<string, unknown>) => ({
          eq: async (_col: string, id: unknown) => {
            sim.updates.push({ table, row });
            const ev = sim.eventos.find((e) => e.id === id);
            if (table === "fathom_webhook_events" && ev) Object.assign(ev, row);
            return { error: null };
          },
        }),
      };
      return builder;
    },
  }),
}));

import { POST } from "@/app/api/integrations/fathom/webhook/[token]/route";

const PAYLOAD = {
  recording_id: 4242,
  title: "Llamada de venta con Ana",
  recording_start_time: "2026-10-02T15:00:00Z",
  recording_end_time: "2026-10-02T15:30:00Z",
  calendar_invitees: [{ email: "ana@cliente.com", name: "Ana", is_external: true }],
  transcript: [{ text: "Hola Ana" }],
};

function firmar(body: string, id = "msg_1", timestamp = String(Math.floor(Date.now() / 1000))) {
  return new Headers({
    "webhook-id": id,
    "webhook-timestamp": timestamp,
    "webhook-signature": `v1,${signFathomWebhook(SECRET, id, timestamp, body)}`,
  });
}

function post(body: string, headers: Headers, token = "tok") {
  return POST(new Request("https://app.test/api/integrations/fathom/webhook/tok", {
    method: "POST",
    body,
    headers,
  }), { params: Promise.resolve({ token }) });
}

beforeEach(() => {
  sim.integracion = { ...INTEGRACION };
  sim.eventos = [];
  sim.updates = [];
  sim.orden = [];
  sim.upsertOk = true;
  sim.upsert.mockReset();
});

describe("POST /api/integrations/fathom/webhook/[token]", () => {
  it("guarda el crudo, después la llamada a nombre del miembro y responde 200", async () => {
    const body = JSON.stringify(PAYLOAD);
    const res = await post(body, firmar(body));

    expect(res.status).toBe(200);
    expect(sim.orden).toEqual(["insert:fathom_webhook_events", "upsert"]);
    expect(sim.eventos[0]).toMatchObject({
      organization_id: "org-1",
      integration_id: "int-1",
      user_id: "user-1",
      webhook_message_id: "msg_1",
      payload: PAYLOAD,
      fathom_call_id: "4242",
      error: null,
    });
    expect(sim.eventos[0]!.processed_at).toBeTruthy();

    const [, org, meeting, origen] = sim.upsert.mock.calls[0]!;
    expect(org).toBe("org-1");
    expect(meeting).toMatchObject({
      recording_id: "4242",
      title: "Llamada de venta con Ana",
      calendar_invitees: [expect.objectContaining({ email: "ana@cliente.com" })],
    });
    expect(origen).toEqual({ userId: "user-1", ingestSource: "webhook" });

    const integracion = sim.updates.find((u) => u.table === "team_member_integrations");
    expect(integracion?.row).toMatchObject({ status: "connected", last_error: null });
  });

  it("rechaza con 401 una firma que no es la de Fathom y no guarda nada", async () => {
    const body = JSON.stringify(PAYLOAD);
    const headers = new Headers({ "x-fathom-signature": "a".repeat(64) });
    const res = await post(body, headers);

    expect(res.status).toBe(401);
    expect(sim.eventos).toHaveLength(0);
    expect(sim.upsert).not.toHaveBeenCalled();
    expect(sim.updates[0]?.row.last_error).toMatch(/firma inválida/);
  });

  it("rechaza con 401 un token desconocido", async () => {
    const body = JSON.stringify(PAYLOAD);
    const res = await post(body, firmar(body), "otro");
    expect(res.status).toBe(401);
    expect(sim.eventos).toHaveLength(0);
  });

  it("sin id de grabación deja el crudo con el motivo y no inventa una llamada", async () => {
    const body = JSON.stringify({ title: "sin id" });
    const res = await post(body, firmar(body));

    expect(res.status).toBe(200);
    expect(sim.upsert).not.toHaveBeenCalled();
    expect(sim.eventos[0]!.error).toMatch(/id de la grabación/);
  });

  it("si la llamada no se guarda responde 500 y el reintento la vuelve a intentar", async () => {
    const body = JSON.stringify(PAYLOAD);
    sim.upsertOk = false;
    expect((await post(body, firmar(body))).status).toBe(500);
    expect(sim.eventos[0]!.processed_at).toBeNull();

    sim.upsertOk = true;
    const res = await post(body, firmar(body));
    expect(res.status).toBe(200);
    expect(sim.eventos).toHaveLength(1);
    expect(sim.upsert).toHaveBeenCalledTimes(2);
    expect(sim.eventos[0]!.processed_at).toBeTruthy();
  });

  it("un reintento de una entrega ya guardada no la procesa de nuevo", async () => {
    const body = JSON.stringify(PAYLOAD);
    await post(body, firmar(body));
    const res = await post(body, firmar(body));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ duplicate: true });
    expect(sim.upsert).toHaveBeenCalledTimes(1);
  });
});
