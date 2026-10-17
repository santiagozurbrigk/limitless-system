import Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-506 (QA final): el envío por streaming (`POST /api/agent/send`, con
 * `streamAgentMessage` y `streamClaudeAgent` reales, el SDK real y una red falsa
 * que habla el SSE de Anthropic) y la base falsa de los tests del Agente.
 *   - Cada filtro por organización de `lib/agent/stream-agent-message.ts` que el
 *     QA encontró sin test: los mensajes recientes de la org, el título de la
 *     conversación, la etapa del prompt y el vínculo de las propuestas. La fila
 *     ajena comparte el ID o la conversación: sin el filtro, se cuela.
 *   - La traducción de `[ACTION:CREATE_SOP:...]` en el stream: el límite de SOPs
 *     y el texto inválido son rechazos con su motivo y sin Sentry; la falla del
 *     insert es `FallaDeLaBase` y va a Sentry con el texto fijo.
 */

const sim = vi.hoisted(() => ({
  sentry: [] as unknown[],
  respuestas: [] as Array<() => Response>,
  pedidos: [] as string[],
  limiteDeSops: false,
}));

vi.mock("@sentry/nextjs", () => ({ captureException: (e: unknown) => sim.sentry.push(e) }));
vi.mock("@/lib/observability/reportar-falla", async () => {
  const { base } = await import("@/app/agent/__tests__/supabase-falso");
  return { reportarFalla: (error: unknown, contexto: unknown) => base.reportes.push({ error, contexto }) };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/supabase/server", async () => {
  const { base } = await import("@/app/agent/__tests__/supabase-falso");
  return { createClient: async () => base.cliente() };
});
vi.mock("@/lib/auth/bootstrap", async () => {
  const { ORG } = await import("@/app/agent/__tests__/supabase-falso");
  const r = async () => ORG;
  return { requireOrganizationId: r, tryRequireOrganizationId: r, isMissingTableError: () => false };
});
vi.mock("@/lib/auth/require-auth", async () => {
  const { ORG } = await import("@/app/agent/__tests__/supabase-falso");
  return { requireAuthContext: async () => ({ user: { id: "yo" }, orgId: ORG, role: "founder" }) };
});
vi.mock("@/lib/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/lib/rate-limit")>()),
  aiRateLimit: async () => ({ allowed: true, remaining: 1, resetAt: Date.now() + 30_000 }),
  sopGenerateRateLimit: async () => ({ allowed: !sim.limiteDeSops, remaining: 0, resetAt: Date.now() + 30_000 }),
}));
vi.mock("@/lib/ai/credential-resolver", () => {
  const resolver = async () => ({
    client: new Anthropic({
      apiKey: "clave-falsa",
      baseURL: "http://anthropic.falso",
      maxRetries: 0,
      fetch: (async (_url: unknown, init?: { body?: unknown }) => {
        sim.pedidos.push(String(init?.body ?? ""));
        const r = sim.respuestas.shift();
        if (!r) throw new Error("pedido a Anthropic no esperado");
        return r();
      }) as never,
    }),
    source: "api_key" as const,
    mode: "api_key_active",
  });
  return {
    resolveCredentialForOrg: resolver,
    resolveClientForOrg: async () => ({ client: (await resolver()).client, keySource: "api_key" }),
    invalidateOrgCredentialCache: () => {},
    marcarClaveDeOrgComoRechazada: async () => {},
    marcarClaveDeOrgSinCreditos: async () => {},
  };
});
vi.mock("@/lib/track-token-usage", () => ({ trackTokenUsage: async () => {} }));
vi.mock("@/lib/agent/jit-context", () => ({ buildJitOrgContextText: async () => "" }));
vi.mock("@/lib/agent/graph-proposal-tools", async (orig) => ({
  ...(await orig<typeof import("@/lib/agent/graph-proposal-tools")>()),
  loadProductEntityContext: async () => ({}),
  buildEntityContextText: () => "",
}));
vi.mock("@/lib/rag/search", () => ({ searchRAG: async () => [], buildRAGContext: () => "" }));

import { POST } from "../route";
import { base, ORG, OTRA_ORG } from "@/app/agent/__tests__/supabase-falso";
import { FallaDeLaBase } from "@/lib/server/action-result";
import { AGENT_ERROR_REPLY } from "@/lib/agent/errores-del-agente";

const CONV = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTRA_CONV = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ETAPA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function sse(eventos: Array<Record<string, unknown>>): () => Response {
  const cuerpo = eventos.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
  return () => new Response(cuerpo, { status: 200, headers: { "content-type": "text/event-stream" } });
}
const inicio = {
  type: "message_start",
  message: { id: "msg_1", type: "message", role: "assistant", model: "claude", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } },
};
function texto(t: string) {
  return sse([
    inicio,
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: t } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } },
    { type: "message_stop" },
  ]);
}
const pideTool = sse([
  inicio,
  { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tu_1", name: "propose_product", input: {} } },
  { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{\"name\":\"Mentoría\"}" } },
  { type: "content_block_stop", index: 0 },
  { type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 1 } },
  { type: "message_stop" },
]);
/** La respuesta (no streaming) del título de la conversación. */
const titulo = () =>
  new Response(
    JSON.stringify({
      id: "msg_t", type: "message", role: "assistant", model: "claude",
      content: [{ type: "text", text: "Plan de ventas" }],
      stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );

function mensaje(id: string, org: string, conversacion: string, contenido: string) {
  return {
    id, conversation_id: conversacion, organization_id: org, role: "user", content: contenido,
    attachments: null, action_type: null, action_ref_id: null, thinking_content: null, canvas_content: null,
    created_at: "2026-10-15T00:00:00Z",
  };
}

async function enviar(extra: Record<string, unknown> = {}) {
  const res = await POST(
    new Request("http://x/api/agent/send", {
      method: "POST",
      body: JSON.stringify({ conversationId: CONV, content: "hola", ...extra }),
    })
  );
  return res.text();
}

function eventoError(t: string) {
  const b = t.split("\n\n").find((x) => x.startsWith("event: error"));
  return b ? (JSON.parse(b.split("\n")[1]!.slice(6)) as { message: string }).message : null;
}

/** El título se guarda después del `done`, sin esperar: se le da tiempo. */
async function esperarTitulo() {
  for (let k = 0; k < 20; k++) await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  base.reiniciar();
  // La conversación ajena va primero y comparte el ID.
  base.tablas.agent_conversations = [
    { id: CONV, organization_id: OTRA_ORG, title: "Ajena" },
    { id: CONV, organization_id: ORG, title: null },
  ];
  sim.sentry = [];
  sim.respuestas = [];
  sim.pedidos = [];
  sim.limiteDeSops = false;
  for (const m of ["error", "warn", "info", "log"] as const) vi.spyOn(console, m).mockImplementation(() => {});
});

describe("filtros por organización del envío por streaming", () => {
  it("⭐ los mensajes recientes que van al prompt son sólo los de la organización", async () => {
    base.tablas.agent_messages = [
      mensaje("r-ajeno", OTRA_ORG, OTRA_CONV, "secreto-de-la-otra-org"),
      mensaje("r-propio", ORG, OTRA_CONV, "contexto-de-mi-org"),
    ];
    sim.respuestas = [texto("Listo"), titulo];
    const t = await enviar();
    expect(t).toContain("event: done");
    expect(sim.pedidos[0]).toContain("contexto-de-mi-org");
    expect(sim.pedidos[0]).not.toContain("secreto-de-la-otra-org");
  });

  it("⭐ el título se guarda sólo en la conversación de la organización", async () => {
    sim.respuestas = [texto("Listo"), titulo];
    await enviar();
    await esperarTitulo();
    expect(base.tablas.agent_conversations!.map((c) => [c.organization_id, c.title])).toEqual([
      [OTRA_ORG, "Ajena"],
      [ORG, "Plan de ventas"],
    ]);
  });

  it("⭐ la etapa del prompt se lee de la organización (la ajena con el mismo ID no entra)", async () => {
    base.tablas.business_stages = [
      { id: ETAPA, organization_id: OTRA_ORG, name: "Etapa-de-la-otra-org", description: null, order_index: 0, is_active: true, created_at: "" },
    ];
    sim.respuestas = [texto("Listo"), titulo];
    await enviar({ contextStageId: ETAPA });
    expect(sim.pedidos[0]).not.toContain("Etapa-de-la-otra-org");
    expect(base.filtrosDe("business_stages", "select")).toContainEqual(["organization_id", ORG]);
  });

  it("⭐ el vínculo de las propuestas con la respuesta sólo toca las de la organización", async () => {
    // Una propuesta ajena con el ID que la base falsa le va a dar a la nueva
    // (inserts en orden: el mensaje del usuario, nuevo-1; la propuesta, nuevo-2).
    base.tablas.agent_graph_proposals = [{ id: "nuevo-2", organization_id: OTRA_ORG, message_id: null }];
    sim.respuestas = [pideTool, texto("Te propongo un producto"), titulo];
    const t = await enviar();
    expect(t).toContain("event: done");
    const [ajena, propia] = base.tablas.agent_graph_proposals!;
    expect(propia).toMatchObject({ id: "nuevo-2", organization_id: ORG });
    expect(propia!.message_id).toBeTruthy();
    expect(ajena!.message_id).toBeNull();
    expect(base.filtrosDe("agent_graph_proposals", "update")).toContainEqual(["organization_id", ORG]);
  });
});

describe("filtros por organización del envío por streaming (barrido de la parte 5)", () => {
  it("⭐ el nombre del negocio del prompt es el de la organización", async () => {
    base.tablas.organizations = [
      { id: OTRA_ORG, name: "Nombre-de-la-otra-org" },
      { id: ORG, name: "Nombre-de-mi-org" },
    ];
    sim.respuestas = [texto("Listo"), titulo];
    await enviar();
    expect(sim.pedidos[0]).toContain("Nombre-de-mi-org");
    expect(sim.pedidos[0]).not.toContain("Nombre-de-la-otra-org");
  });

  it("⭐ el mensaje del usuario y la respuesta se guardan en la organización", async () => {
    sim.respuestas = [texto("Listo"), titulo];
    await enviar();
    const guardados = base.escrituras().filter((o) => o.tabla === "agent_messages" && o.op === "insert");
    expect(guardados.map((o) => [(o.valores as { role: string }).role, (o.valores as { organization_id: string }).organization_id])).toEqual([
      ["user", ORG],
      ["assistant", ORG],
    ]);
  });
});

describe("CREATE_SOP dentro del stream", () => {
  const CON_SOP = 'Listo [ACTION:CREATE_SOP:{"title":"Onboarding","content":"Paso 1: dar la bienvenida.","goal":"Ordenar el ingreso"}]';

  it("con éxito se crea en la organización y el envío termina", async () => {
    sim.respuestas = [texto(CON_SOP), titulo];
    const t = await enviar();
    expect(t).toContain("event: done");
    const sop = base.escrituras().find((o) => o.tabla === "sops");
    expect(sop?.valores).toMatchObject({ organization_id: ORG, title: "Onboarding" });
  });

  it("⭐ con el límite de SOPs agotado el motivo llega en el evento error, sin Sentry", async () => {
    sim.limiteDeSops = true;
    sim.respuestas = [texto(CON_SOP)];
    const t = await enviar();
    expect(eventoError(t)).toMatch(/^Demasiadas solicitudes\. Intentá de nuevo en \d+ segundos\.$/);
    expect(sim.sentry).toHaveLength(0);
  });

  it("⭐ un SOP con un texto inválido es un rechazo con su motivo, sin Sentry", async () => {
    const titulo501 = "x".repeat(501);
    sim.respuestas = [texto(`Listo [ACTION:CREATE_SOP:{"title":"${titulo501}","content":"Paso 1.","goal":"Meta"}]`)];
    const t = await enviar();
    expect(eventoError(t)).toBe("Máximo 500 caracteres");
    expect(sim.sentry).toHaveLength(0);
  });

  it("⭐ si la base no puede guardar el SOP es una falla: texto fijo y FallaDeLaBase con su código a Sentry", async () => {
    base.errores.sops = { code: "XX000", message: "boom en la tabla" };
    sim.respuestas = [texto(CON_SOP)];
    const t = await enviar();
    expect(eventoError(t)).toBe(AGENT_ERROR_REPLY);
    expect(t).not.toContain("boom");
    expect(sim.sentry).toHaveLength(1);
    expect(sim.sentry[0]).toBeInstanceOf(FallaDeLaBase);
    expect((sim.sentry[0] as FallaDeLaBase).code).toBe("XX000");
  });
});
