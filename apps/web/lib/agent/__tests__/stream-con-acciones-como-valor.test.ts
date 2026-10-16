import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-506: el envío por streaming (`streamAgentMessage`, la ruta SSE
 * `/api/agent/send` de la pantalla del Agente) usa `createAgentConversationAction`
 * y `listAgentMessagesAction`, que ahora devuelven su error como valor. El
 * protocolo de la ruta no cambia: el motivo sale como el mensaje del error, que
 * la ruta manda en el evento `error`. Antes se habría tomado el
 * `{ success: false }` como una conversación o como el historial.
 */

const sim = vi.hoisted(() => ({
  creada: null as unknown,
  historial: null as unknown,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/agent/actions", () => ({
  createAgentConversationAction: async () => sim.creada,
  listAgentMessagesAction: async () => sim.historial,
}));
vi.mock("@/lib/supabase/server", async () => {
  const { base } = await import("@/app/agent/__tests__/supabase-falso");
  return { createClient: async () => base.cliente() };
});
vi.mock("@/lib/auth/require-auth", async () => {
  const { ORG } = await import("@/app/agent/__tests__/supabase-falso");
  return { requireAuthContext: async () => ({ user: { id: "yo" }, orgId: ORG }) };
});
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  aiRateLimit: async () => ({ allowed: true, remaining: 1, resetAt: Date.now() }),
}));

import { streamAgentMessage } from "../stream-agent-message";
import { base, ORG } from "@/app/agent/__tests__/supabase-falso";

const CONVERSACION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const emitter = { emit: vi.fn() } as never;

beforeEach(() => {
  base.reiniciar();
  base.tablas.agent_conversations = [{ id: CONVERSACION, organization_id: ORG }];
  sim.creada = { success: true, data: { id: CONVERSACION } };
  sim.historial = { success: true, data: [] };
});

describe("streamAgentMessage con las acciones como valor", () => {
  it("⭐ si no se puede crear la conversación, el motivo es el mensaje del error del stream", async () => {
    sim.creada = { success: false, error: "Sesión no válida" };
    await expect(streamAgentMessage({ content: "hola", emitter })).rejects.toThrow("Sesión no válida");
    expect(base.escrituras()).toHaveLength(0);
  });

  it("⭐ si no se puede leer el historial, el motivo es el mensaje del error y no se llama a Claude", async () => {
    sim.historial = { success: false, error: "Ocurrió un error inesperado. Intentá de nuevo." };
    await expect(
      streamAgentMessage({ conversationId: CONVERSACION, content: "hola", emitter })
    ).rejects.toThrow("Ocurrió un error inesperado. Intentá de nuevo.");
  });

  it("con la conversación creada sigue con su ID", async () => {
    sim.historial = { success: false, error: "corte para el test" };
    await expect(streamAgentMessage({ content: "hola", emitter })).rejects.toThrow("corte para el test");
    const insert = base.escrituras().find((o) => o.tabla === "agent_messages");
    expect(insert?.valores).toMatchObject({ conversation_id: CONVERSACION, organization_id: ORG });
  });
});
