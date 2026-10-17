import Anthropic from "@anthropic-ai/sdk";
import { beforeEach, expect, it, vi } from "vitest";

/**
 * SCRUM-506, AR pasada 2 (reproducción de la AR, `ar-p2/ar-p2-ruta.test.ts`):
 * la ruta real, el streamAgentMessage real y el streamClaudeAgent real con el
 * SDK real y una red falsa que habla el SSE de Anthropic (para que el modelo
 * pida una tool). Nada real.
 *   - n1: el evento `tool_end` ya no lleva el resultado de la tool al navegador
 *     (traía el texto crudo de la base); el modelo lo sigue recibiendo.
 *   - n2: un redirect de Next dentro del stream es "Sesión no válida", sin Sentry.
 *   - n3: un 401 en la compactación de un historial largo es el motivo de la clave.
 */

const sim = vi.hoisted(() => ({
  sentry: [] as unknown[],
  sesion: "ok" as "ok" | "redirect",
  respuestas: [] as Array<() => Response>,
  /** El cuerpo de cada pedido a Anthropic, para ver qué recibe el modelo. */
  pedidos: [] as string[],
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
  const { redirect } = await import("next/navigation");
  return {
    requireAuthContext: async () => {
      // Como el real con la contraseña temporal vencida o el cambio obligatorio.
      if (sim.sesion === "redirect") redirect("/auth/force-password-change");
      return { user: { id: "yo" }, orgId: ORG, role: "founder" };
    },
  };
});
vi.mock("@/lib/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/lib/rate-limit")>()),
  aiRateLimit: async () => ({ allowed: true, remaining: 1, resetAt: Date.now() + 30_000 }),
}));
vi.mock("@/lib/ai/credential-resolver", () => {
  const resolver = async () => ({
    client: new Anthropic({
      apiKey: "clave-falsa",
      baseURL: "http://anthropic.falso",
      maxRetries: 0,
      fetch: (async (_url: unknown, init?: { body?: unknown }) => {
        sim.pedidos.push(String(init?.body ?? ""));
        return sim.respuestas.shift()!();
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
import { base, ORG } from "@/app/agent/__tests__/supabase-falso";
import { AI_KEY_REJECTED_MESSAGE } from "@/lib/ai/anthropic-auth-errors";

const CONV = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function sse(eventos: Array<Record<string, unknown>>): () => Response {
  const cuerpo = eventos.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
  return () => new Response(cuerpo, { status: 200, headers: { "content-type": "text/event-stream" } });
}
const inicio = { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude",
  content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } };
const pideTool = sse([
  inicio,
  { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tu_1", name: "propose_product", input: {} } },
  { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{\"name\":\"Mentoría\"}" } },
  { type: "content_block_stop", index: 0 },
  { type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 1 } },
  { type: "message_stop" },
]);
const responde = sse([
  inicio,
  { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "No pude guardar la propuesta." } },
  { type: "content_block_stop", index: 0 },
  { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } },
  { type: "message_stop" },
]);

async function enviar() {
  const res = await POST(new Request("http://x/api/agent/send", { method: "POST", body: JSON.stringify({ conversationId: CONV, content: "hola" }) }));
  return res.text();
}

beforeEach(() => {
  base.reiniciar();
  base.tablas.agent_conversations = [{ id: CONV, organization_id: ORG }];
  sim.sentry = [];
  sim.sesion = "ok";
  sim.respuestas = [];
  sim.pedidos = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

function bloque(texto: string, evento: string) {
  return texto.split("\n\n").find((b) => b.startsWith(`event: ${evento}`)) ?? "";
}

it("⭐ n1: una tool que falla en la base no manda su texto al navegador en tool_end; el modelo lo recibe igual", async () => {
  base.errores["agent_graph_proposals:insert"] = { code: "42501", message: "permission denied for table agent_graph_proposals" };
  sim.respuestas = [pideTool, responde];
  const texto = await enviar();
  const toolEnd = bloque(texto, "tool_end");
  expect(toolEnd).toContain('"toolName":"propose_product"');
  expect(toolEnd).not.toContain("result");
  expect(texto).not.toContain("permission denied");
  expect(texto).toContain("event: done");
  // Lo que recibe el modelo no cambia (lo sigue `[AGENTE-TOOLS-ERROR-CRUDO]`).
  expect(sim.pedidos[1]).toContain("permission denied for table agent_graph_proposals");
});

it("⭐ n2: un redirect de requireAuthContext dentro del stream es \"Sesión no válida\", sin Sentry", async () => {
  sim.sesion = "redirect";
  const texto = await enviar();
  expect(bloque(texto, "error")).toBe('event: error\ndata: {"message":"Sesión no válida"}');
  expect(texto).not.toContain("NEXT_REDIRECT");
  expect(sim.sentry).toHaveLength(0);
});

it("⭐ n3: un 401 en la compactación de un historial largo es el motivo de la clave, sin Sentry", async () => {
  base.tablas.agent_messages = Array.from({ length: 22 }, (_, k) => ({
    id: `m-${k}`,
    conversation_id: CONV,
    organization_id: ORG,
    role: k % 2 ? "assistant" : "user",
    content: `mensaje ${k}`,
    attachments: null,
    action_type: null,
    action_ref_id: null,
    thinking_content: null,
    canvas_content: null,
    created_at: "2026-10-16T00:00:00Z",
  }));
  sim.respuestas = [
    () =>
      new Response(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
  ];
  const texto = await enviar();
  expect(sim.pedidos).toHaveLength(1);
  expect(sim.pedidos[0]).toContain("Summarize this conversation history");
  expect(bloque(texto, "error")).toContain(JSON.stringify({ message: AI_KEY_REJECTED_MESSAGE }));
  expect(sim.sentry).toHaveLength(0);
});
