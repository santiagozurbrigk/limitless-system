import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-506 (AR pasada 1, M1): qué manda `POST /api/agent/send` en el evento
 * `error` y qué llega a Sentry. Corre la ruta real con el `streamAgentMessage`
 * real, las acciones reales, la base falsa de los tests del Agente y Claude con
 * el SDK real y una red falsa. Antes la ruta mandaba el texto de la base o de
 * Anthropic y reportaba a Sentry también los rechazos esperables. El protocolo
 * no cambia: un evento `error` con `{ message }`.
 */

const sim = vi.hoisted(() => ({
  sentry: [] as unknown[],
  limite: false,
  sesion: "ok" as "ok" | "sin_sesion" | "falla_org" | "auth_rechaza",
  sinClave: false,
  anthropic: { status: 200, body: {} as unknown },
  pedidosAAnthropic: 0,
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: (e: unknown) => sim.sentry.push(e),
}));
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
  const { ErrorEsperable } = await import("@/lib/server/error-esperable");
  const requireOrganizationId = async () => {
    if (sim.sesion === "sin_sesion") throw new ErrorEsperable("Sesión no válida");
    if (sim.sesion === "falla_org") throw new TypeError("fetch failed");
    return ORG;
  };
  return { requireOrganizationId, tryRequireOrganizationId: requireOrganizationId, isMissingTableError: () => false };
});
vi.mock("@/lib/auth/require-auth", async () => {
  const { ORG } = await import("@/app/agent/__tests__/supabase-falso");
  return {
    requireAuthContext: async () => {
      if (sim.sesion === "sin_sesion" || sim.sesion === "auth_rechaza") throw new Error("Unauthorized");
      return { user: { id: "yo" }, orgId: ORG, role: "founder" };
    },
  };
});
vi.mock("@/lib/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/lib/rate-limit")>()),
  aiRateLimit: async () => ({ allowed: !sim.limite, remaining: 0, resetAt: Date.now() + 30_000 }),
}));
vi.mock("@/lib/ai/credential-resolver", () => {
  const resolver = async () =>
    sim.sinClave
      ? { client: null, source: "none" as const, mode: "unconfigured" }
      : {
          client: new Anthropic({
            apiKey: "clave-falsa",
            baseURL: "http://anthropic.falso",
            maxRetries: 0,
            fetch: (async () => {
              sim.pedidosAAnthropic++;
              return new Response(JSON.stringify(sim.anthropic.body), {
                status: sim.anthropic.status,
                headers: { "content-type": "application/json" },
              });
            }) as never,
          }),
          source: "api_key" as const,
          mode: "api_key_active",
        };
  return {
    resolveCredentialForOrg: resolver,
    resolveClientForOrg: async () => {
      const r = await resolver();
      return { client: r.client, keySource: r.source };
    },
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
import { AI_KEY_REJECTED_MESSAGE, NO_AI_CREDENTIALS_MESSAGE } from "@/lib/ai/anthropic-auth-errors";
import { claudeNoCreditsUserMessage } from "@/lib/ai/anthropic-errors";
import { AGENT_ERROR_REPLY } from "@/lib/agent/errores-del-agente";

const CONV = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

async function enviar(conversationId: string, content = "hola") {
  const res = await POST(
    new Request("http://x/api/agent/send", { method: "POST", body: JSON.stringify({ conversationId, content }) })
  );
  const texto = await res.text();
  const lineas = texto.split("\n");
  const i = lineas.indexOf("event: error");
  expect(i, texto).toBeGreaterThanOrEqual(0);
  return { status: res.status, message: (JSON.parse(lineas[i + 1]!.slice(6)) as { message: string }).message, texto };
}

function errorDeAnthropic(status: number, type: string, message: string) {
  return { status, body: { type: "error", error: { type, message } } };
}

beforeEach(() => {
  base.reiniciar();
  base.tablas.agent_conversations = [{ id: CONV, organization_id: ORG }];
  sim.sentry = [];
  sim.limite = false;
  sim.sesion = "ok";
  sim.sinClave = false;
  sim.anthropic = errorDeAnthropic(500, "api_error", "internal");
  sim.pedidosAAnthropic = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/agent/send: rechazos esperables, con su motivo y sin Sentry", () => {
  it.each([
    [
      "la conversación de otra organización (o borrada)",
      () => {
        base.tablas.agent_conversations = [{ id: CONV, organization_id: OTRA_ORG }];
      },
      "Conversación no encontrada",
    ],
    ["el límite de pedidos", () => (sim.limite = true), /^Demasiadas solicitudes\. Intentá de nuevo en \d+ segundos\.$/],
    ["sin clave de Claude", () => (sim.sinClave = true), NO_AI_CREDENTIALS_MESSAGE],
    [
      "la clave rechazada por Anthropic (401)",
      () => (sim.anthropic = errorDeAnthropic(401, "authentication_error", "invalid x-api-key")),
      AI_KEY_REJECTED_MESSAGE,
    ],
    [
      "la cuenta sin créditos",
      () =>
        (sim.anthropic = errorDeAnthropic(
          400,
          "invalid_request_error",
          "Your credit balance is too low to access the Anthropic API."
        )),
      claudeNoCreditsUserMessage(),
    ],
    ["sin sesión, antes del stream", () => (sim.sesion = "sin_sesion"), "No autenticado"],
    [
      "el \"Unauthorized\" de requireAuthContext dentro del stream",
      () => (sim.sesion = "auth_rechaza"),
      "Sesión no válida",
    ],
  ])("⭐ %s", async (_n, preparar, esperado) => {
    preparar();
    const { message } = await enviar(CONV);
    if (typeof esperado === "string") expect(message).toBe(esperado);
    else expect(message).toMatch(esperado);
    expect(sim.sentry).toHaveLength(0);
    expect(base.reportes).toHaveLength(0);
  });

  it("⭐ un ID de conversación que no es UUID es \"ID inválido\" y no llega a la base", async () => {
    const { message } = await enviar("no-es-uuid");
    expect(message).toBe("ID inválido");
    expect(base.operaciones.filter((o) => o.tabla === "agent_conversations")).toHaveLength(0);
    expect(sim.sentry).toHaveLength(0);
  });

  it("un texto no permitido es el rechazo de validación", async () => {
    const res = await POST(
      new Request("http://x/api/agent/send", {
        method: "POST",
        body: JSON.stringify({ conversationId: CONV, content: "<script>alert(1)</script>" }),
      })
    );
    const texto = await res.text();
    expect(texto).toContain('"message":"Contenido no permitido"');
    expect(sim.sentry).toHaveLength(0);
  });
});

describe("POST /api/agent/send: fallas, con un texto fijo y a Sentry", () => {
  it.each([
    ["la base al guardar el mensaje", () => (base.errores["agent_messages:insert"] = { code: "XX000", message: "boom en la tabla" }), "boom"],
    ["la base al leer la conversación", () => (base.errores["agent_conversations:select"] = { code: "XX000", message: "boom en la tabla" }), "boom"],
    ["un 429 de Anthropic", () => (sim.anthropic = errorDeAnthropic(429, "rate_limit_error", "rate limited")), "rate_limit"],
    ["un 500 de Anthropic", () => (sim.anthropic = errorDeAnthropic(500, "api_error", "internal")), "api_error"],
  ])("⭐ %s: AGENT_ERROR_REPLY, 1 evento y nada técnico en la respuesta", async (_n, preparar, tecnico) => {
    preparar();
    const { message, texto } = await enviar(CONV);
    expect(message).toBe(AGENT_ERROR_REPLY);
    expect(texto).not.toContain(tecnico);
    expect(sim.sentry).toHaveLength(1);
  });

  it("⭐ una falla que ya registró la acción del historial no se reporta otra vez desde la ruta", async () => {
    base.errores["agent_messages:select"] = { code: "XX000", message: "boom en la tabla" };
    const { message, texto } = await enviar(CONV);
    expect(message).toBe(AGENT_ERROR_REPLY);
    expect(texto).not.toContain("boom");
    expect(base.reportes.map((r) => r.contexto)).toEqual([{ accion: "[listAgentMessages]" }]);
    expect(sim.sentry).toHaveLength(0);
  });

  it("una falla al resolver la organización antes del stream va a Sentry y no se toma por \"No autenticado\"", async () => {
    sim.sesion = "falla_org";
    const { status, message } = await enviar(CONV);
    expect(status).toBe(500);
    expect(message).toBe(AGENT_ERROR_REPLY);
    expect(sim.sentry).toHaveLength(1);
  });
});
