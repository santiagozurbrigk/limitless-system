import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-506: `sendAgentMessageAction` (el chat flotante) devuelve sus errores
 * esperables como valor. Antes lanzaba: en producción el cliente recibía sólo
 * un digest, así que una clave de Claude rechazada, la cuenta sin créditos o
 * el límite de pedidos se veían como "No pudimos generar la respuesta".
 *
 * Claude es el `callClaudeAgent` real (`lib/ai/anthropic.ts`) con el cliente
 * real del SDK y una red falsa (`fetch` de las opciones del cliente): el
 * status y el cuerpo del error son los que arma el SDK, no un mock del error.
 * Ningún test llama a Anthropic, a Supabase ni a Sentry.
 */

const sim = vi.hoisted(() => ({
  /** Lo que responde la API de Anthropic (red falsa), en orden; el último se repite. */
  respuestas: [] as Array<{ status: number; body: unknown }>,
  pedidosAAnthropic: [] as string[],
  /** Sin clave usable (SCRUM-7): el resolvedor no entrega cliente. */
  sinClave: false,
  /** Con qué organización se pidió cada servicio. */
  orgsPedidas: [] as Array<[string, unknown]>,
  marcadas: [] as Array<[string, unknown]>,
  sesion: "ok" as "ok" | "sin_sesion" | "lanza",
  lanzaEnSesion: null as unknown,
  limiteAgotado: false,
}));

vi.mock("@/lib/observability/reportar-falla", async () => {
  const { base } = await import("./supabase-falso");
  return {
    reportarFalla: (error: unknown, contexto: unknown) => base.reportes.push({ error, contexto }),
  };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/supabase/server", async () => {
  const { base } = await import("./supabase-falso");
  return { createClient: async () => base.cliente() };
});
vi.mock("@/lib/auth/bootstrap", async () => {
  const { ORG } = await import("./supabase-falso");
  return {
    requireOrganizationId: async () => ORG,
    tryRequireOrganizationId: async () => ORG,
    isMissingTableError: () => false,
  };
});
vi.mock("@/lib/auth/require-auth", async () => {
  const { ORG } = await import("./supabase-falso");
  return {
    // Como el real: sin sesión lanza un `Error` común "Unauthorized".
    requireAuthContext: async () => {
      if (sim.sesion === "sin_sesion") throw new Error("Unauthorized");
      if (sim.sesion === "lanza") throw sim.lanzaEnSesion;
      return { user: { id: "yo" }, orgId: ORG, role: "founder" };
    },
  };
});
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/rate-limit")>();
  return {
    ...real,
    aiRateLimit: async () => ({ allowed: !sim.limiteAgotado, remaining: 0, resetAt: Date.now() + 30_000 }),
    sopGenerateRateLimit: async () => ({ allowed: true, remaining: 1, resetAt: Date.now() }),
  };
});
vi.mock("@/lib/ai/credential-resolver", () => {
  const cliente = () =>
    new Anthropic({
      apiKey: "clave-falsa",
      baseURL: "http://anthropic.falso",
      maxRetries: 0,
      fetch: (async (url: unknown) => {
        sim.pedidosAAnthropic.push(String(url));
        const r = sim.respuestas.length > 1 ? sim.respuestas.shift()! : sim.respuestas[0]!;
        return new Response(JSON.stringify(r.body), {
          status: r.status,
          headers: { "content-type": "application/json" },
        });
      }) as never,
    });
  const resolver = async (org: unknown) => {
    sim.orgsPedidas.push(["clave", org]);
    return sim.sinClave
      ? { client: null, source: "none" as const, mode: "unconfigured" }
      : { client: cliente(), source: "api_key" as const, mode: "api_key_active" };
  };
  return {
    resolveCredentialForOrg: resolver,
    resolveClientForOrg: async (org: unknown) => {
      const r = await resolver(org);
      return { client: r.client, keySource: r.source };
    },
    invalidateOrgCredentialCache: () => {},
    marcarClaveDeOrgComoRechazada: async (org: unknown) => {
      sim.marcadas.push(["rechazada", org]);
    },
    marcarClaveDeOrgSinCreditos: async (org: unknown) => {
      sim.marcadas.push(["sin_creditos", org]);
    },
  };
});
vi.mock("@/lib/track-token-usage", () => ({ trackTokenUsage: async () => {} }));
vi.mock("@/lib/ai/org-context", () => ({
  getOrgContext: async (org: unknown) => {
    sim.orgsPedidas.push(["contexto", org]);
    return {};
  },
  buildOrgContextText: () => "",
}));
vi.mock("@/lib/agent/graph-proposal-tools", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/agent/graph-proposal-tools")>();
  return {
    ...real,
    loadProductEntityContext: async (org: unknown) => {
      sim.orgsPedidas.push(["entidades", org]);
      return {};
    },
    buildEntityContextText: () => "",
  };
});
vi.mock("@/lib/rag/search", () => ({
  searchRAG: async ({ organizationId }: { organizationId: unknown }) => {
    sim.orgsPedidas.push(["rag", organizationId]);
    return [];
  },
  buildRAGContext: () => "",
}));

import { sendAgentMessageAction } from "../actions";
import { FallaDeLaBase } from "@/lib/server/action-result";
import { AI_KEY_REJECTED_MESSAGE, NO_AI_CREDENTIALS_MESSAGE } from "@/lib/ai/anthropic-auth-errors";
import { claudeNoCreditsUserMessage } from "@/lib/ai/anthropic-errors";
import { base, ORG, OTRA_ORG } from "./supabase-falso";

const CONVERSACION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ETAPA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const AGENT_ERROR_REPLY = "No pudimos generar la respuesta. Intentá de nuevo en unos segundos.";
const FETCH_FAILED = { message: "TypeError: fetch failed" };
const LO_QUE_ESCRIBIO = "¿Cómo vendo más con mi CUIT 20-12345678-9?";

function respuestaDeClaude(texto: string) {
  return {
    status: 200,
    body: {
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "claude",
      content: [{ type: "text", text: texto }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    },
  };
}

/** Claude pide la herramienta de proponer un producto (después responde con texto). */
function propuestaDeClaude() {
  return {
    status: 200,
    body: {
      id: "msg_0",
      type: "message",
      role: "assistant",
      model: "claude",
      content: [{ type: "tool_use", id: "tu_1", name: "propose_product", input: { name: "Mentoría" } }],
      stop_reason: "tool_use",
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    },
  };
}

function errorDeAnthropic(status: number, type: string, message: string) {
  return { status, body: { type: "error", error: { type, message } } };
}

function conversacion(org: string) {
  return {
    id: CONVERSACION,
    organization_id: org,
    project_id: null,
    stage_id: null,
    title: org === ORG ? "Mía" : "Ajena",
    created_at: "2026-10-16T00:00:00Z",
    updated_at: "2026-10-16T00:00:00Z",
  };
}

function mensajeAjeno() {
  return {
    id: "m-ajeno",
    conversation_id: CONVERSACION,
    organization_id: OTRA_ORG,
    role: "user",
    content: "secreto de la otra org",
    attachments: null,
    action_type: null,
    action_ref_id: null,
    thinking_content: null,
    canvas_content: null,
    created_at: "2026-10-15T00:00:00Z",
  };
}

let consolaError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  base.reiniciar();
  sim.respuestas = [respuestaDeClaude("Respuesta del agente")];
  sim.pedidosAAnthropic = [];
  sim.sinClave = false;
  sim.orgsPedidas = [];
  sim.marcadas = [];
  sim.sesion = "ok";
  sim.lanzaEnSesion = null;
  sim.limiteAgotado = false;
  // La fila ajena va primero y comparte el ID: sin el filtro de la org la toma a ella.
  base.tablas.agent_conversations = [conversacion(OTRA_ORG), conversacion(ORG)];
  base.tablas.organizations = [
    { id: OTRA_ORG, name: "Otra" },
    { id: ORG, name: "Mi negocio" },
  ];
  consolaError = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function enviar(extra: Record<string, unknown> = {}) {
  return sendAgentMessageAction({ conversationId: CONVERSACION, content: LO_QUE_ESCRIBIO, ...extra });
}

/** La falla quedó registrada con la etiqueta de la acción, sin lo que escribió el usuario. */
function registrada(error?: unknown) {
  const deLaAccion = base.reportes.filter((r) => JSON.stringify(r.contexto) === JSON.stringify({ accion: "[sendAgentMessage]" }));
  expect(deLaAccion).toHaveLength(1);
  if (error !== undefined) expect(deLaAccion[0]!.error).toBe(error);
  expect(consolaError).toHaveBeenCalledWith("[sendAgentMessage]", deLaAccion[0]!.error);
  expect(JSON.stringify(base.reportes.map((r) => [String(r.error), r.contexto]))).not.toContain("CUIT");
  return deLaAccion[0]!.error;
}

describe("sendAgentMessageAction", () => {
  it("⭐ con éxito guarda los dos mensajes en la organización y devuelve la conversación", async () => {
    base.tablas.agent_messages = [mensajeAjeno()];
    const r = await enviar();
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.conversationId).toBe(CONVERSACION);
    expect(r.data.messages.map((m) => [m.role, m.content])).toEqual([
      ["user", LO_QUE_ESCRIBIO],
      ["assistant", "Respuesta del agente"],
    ]);
    expect(base.filtrosDe("agent_conversations", "select")).toContainEqual(["organization_id", ORG]);
    const inserciones = base.escrituras().filter((o) => o.tabla === "agent_messages");
    expect(inserciones.map((o) => (o.valores as { organization_id: string }).organization_id)).toEqual([ORG, ORG]);
    // Lecturas de agent_messages, en orden: el conteo de mensajes previos (por
    // conversación, ya verificada de la organización), el historial que va a
    // Claude, los recientes de la organización y los que vuelven a la pantalla.
    expect(base.filtrosDe("agent_messages", "select", 0)).toEqual([["conversation_id", CONVERSACION]]);
    for (const n of [1, 2, 3]) {
      expect(base.filtrosDe("agent_messages", "select", n)).toContainEqual(["organization_id", ORG]);
    }
    expect(base.filtrosDe("organizations", "select")).toContainEqual(["id", ORG]);
    expect(sim.orgsPedidas.length).toBeGreaterThan(0);
    for (const [, org] of sim.orgsPedidas) expect(org).toBe(ORG);
    expect(base.reportes).toHaveLength(0);
  });

  it("⭐ sin conversación crea una en la organización", async () => {
    const r = await sendAgentMessageAction({ content: "hola" });
    expect(r.success).toBe(true);
    const creada = base.escrituras().find((o) => o.tabla === "agent_conversations" && o.op === "insert");
    expect(creada?.valores).toMatchObject({ organization_id: ORG });
    expect(r.success && r.data.conversationId).toBe(base.tablas.agent_conversations!.at(-1)!.id);
  });

  it("⭐ la etapa del contexto se lee de la organización", async () => {
    base.tablas.business_stages = [
      { id: ETAPA, organization_id: OTRA_ORG, name: "Ajena", description: null, order_index: 0, is_active: true, created_at: "" },
    ];
    const r = await enviar({ contextStageId: ETAPA });
    expect(r.success).toBe(true);
    expect(base.filtrosDe("business_stages", "select")).toContainEqual(["organization_id", ORG]);
  });

  it("una etapa con un ID que no es UUID se ignora, como antes", async () => {
    const r = await enviar({ contextStageId: "no-es-un-id" });
    expect(r.success).toBe(true);
    expect(base.operaciones.some((o) => o.tabla === "business_stages")).toBe(false);
  });

  it("⭐ sin sesión (el `Error` común de requireAuthContext) devuelve el motivo y no escribe", async () => {
    sim.sesion = "sin_sesion";
    expect(await enviar()).toEqual({ success: false, error: "Sesión no válida" });
    expect(base.operaciones).toHaveLength(0);
    expect(base.reportes).toHaveLength(0);
  });

  it("otro error de requireAuthContext es una falla: se registra y no se toma por sesión", async () => {
    sim.sesion = "lanza";
    sim.lanzaEnSesion = new TypeError("fetch failed");
    expect(await enviar()).toEqual({ success: false, error: AGENT_ERROR_REPLY });
    registrada(sim.lanzaEnSesion);
  });

  it("el redirect de requireAuthContext (cambio de contraseña) se relanza para que Next navegue", async () => {
    const { redirect } = await import("next/navigation");
    let interno: unknown;
    try {
      redirect("/force-password-change");
    } catch (e) {
      interno = e;
    }
    sim.sesion = "lanza";
    sim.lanzaEnSesion = interno;
    await expect(enviar()).rejects.toBe(interno);
    expect(base.reportes).toHaveLength(0);
  });

  it("⭐ con el límite de pedidos agotado devuelve el motivo y no llama a Claude", async () => {
    sim.limiteAgotado = true;
    const r = await enviar();
    expect(r.success).toBe(false);
    expect(!r.success && r.error).toMatch(/^Demasiadas solicitudes\. Intentá de nuevo en \d+ segundos\.$/);
    expect(sim.pedidosAAnthropic).toHaveLength(0);
    expect(base.reportes).toHaveLength(0);
  });

  it("un mensaje vacío es un rechazo de validación", async () => {
    const r = await sendAgentMessageAction({ conversationId: CONVERSACION, content: "" });
    expect(r.success).toBe(false);
    expect(!r.success && r.error).not.toBe(AGENT_ERROR_REPLY);
    expect(base.operaciones).toHaveLength(0);
    expect(base.reportes).toHaveLength(0);
  });

  it("un ID de conversación que no es UUID es un rechazo esperable", async () => {
    expect(await enviar({ conversationId: "no-es-un-id" })).toEqual({ success: false, error: "ID inválido" });
    expect(base.operaciones).toHaveLength(0);
  });

  it("⭐ la conversación de otra organización es \"Conversación no encontrada\" y no se escribe nada", async () => {
    base.tablas.agent_conversations = [conversacion(OTRA_ORG)];
    expect(await enviar()).toEqual({ success: false, error: "Conversación no encontrada" });
    expect(base.escrituras()).toHaveLength(0);
    expect(base.reportes).toHaveLength(0);
  });

  it("⭐ sin clave de Claude (no hay clave global, SCRUM-7) devuelve el motivo sin llamar a Anthropic", async () => {
    sim.sinClave = true;
    expect(await enviar()).toEqual({ success: false, error: NO_AI_CREDENTIALS_MESSAGE });
    expect(sim.pedidosAAnthropic).toHaveLength(0);
    expect(base.reportes).toHaveLength(0);
  });

  it("⭐ Anthropic rechaza la clave (401): el motivo de la clave, la org marcada y sin registro de falla", async () => {
    sim.respuestas = [errorDeAnthropic(401, "authentication_error", "invalid x-api-key")];
    expect(await enviar()).toEqual({ success: false, error: AI_KEY_REJECTED_MESSAGE });
    expect(sim.marcadas).toEqual([["rechazada", ORG]]);
    expect(base.reportes).toHaveLength(0);
  });

  it("⭐ la cuenta sin créditos (400 de facturación): el motivo de los créditos y la org marcada", async () => {
    sim.respuestas = [
      errorDeAnthropic(400, "invalid_request_error", "Your credit balance is too low to access the Anthropic API."),
    ];
    expect(await enviar()).toEqual({ success: false, error: claudeNoCreditsUserMessage() });
    expect(sim.marcadas).toEqual([["sin_creditos", ORG]]);
    expect(base.reportes).toHaveLength(0);
  });

  it("⭐ el límite de gasto de la cuenta (billing_error) es el mismo motivo de los créditos", async () => {
    sim.respuestas = [errorDeAnthropic(400, "billing_error", "spend limit reached")];
    expect(await enviar()).toEqual({ success: false, error: claudeNoCreditsUserMessage() });
    expect(base.reportes).toHaveLength(0);
  });

  it.each([
    ["429 por exceso de pedidos a Anthropic", errorDeAnthropic(429, "rate_limit_error", "rate limited")],
    ["500 de Anthropic", errorDeAnthropic(500, "api_error", "internal")],
  ])("⭐ otro error de Claude (%s) se registra y devuelve el texto de siempre del agente", async (_n, respuesta) => {
    sim.respuestas = [respuesta];
    expect(await enviar()).toEqual({ success: false, error: AGENT_ERROR_REPLY });
    const error = registrada();
    expect(error).toBeInstanceOf(Anthropic.APIError);
    expect(sim.marcadas).toHaveLength(0);
  });

  it("una respuesta vacía de Claude se registra y devuelve el texto de siempre del agente", async () => {
    sim.respuestas = [respuestaDeClaude("")];
    expect(await enviar()).toEqual({ success: false, error: AGENT_ERROR_REPLY });
    registrada();
  });

  it("un error de la base como valor de supabase-js devuelve el texto del agente y queda registrado", async () => {
    base.errores["agent_messages:insert"] = FETCH_FAILED;
    const r = await enviar();
    expect(r).toEqual({ success: false, error: AGENT_ERROR_REPLY });
    expect(JSON.stringify(r)).not.toContain("fetch failed");
    const error = registrada();
    expect(error).toBeInstanceOf(FallaDeLaBase);
  });

  it("una excepción (la red) devuelve el texto del agente y queda registrada", async () => {
    base.lanza = new TypeError("fetch failed");
    expect(await enviar()).toEqual({ success: false, error: AGENT_ERROR_REPLY });
    registrada(base.lanza);
  });

  it("⭐ una caída al leer la conversación es una falla, no \"no encontrada\"", async () => {
    base.errores["agent_conversations:select"] = { code: "XX000", message: "boom" };
    expect(await enviar()).toEqual({ success: false, error: AGENT_ERROR_REPLY });
    expect(registrada()).toBeInstanceOf(FallaDeLaBase);
  });

  it("⭐ si falla guardar la respuesta, se registra (no se pierde) y vuelve el texto del agente", async () => {
    base.erroresDesdeLaLlamada["agent_messages:insert"] = { desde: 2, error: { code: "XX000", message: "boom" } };
    expect(await enviar()).toEqual({ success: false, error: AGENT_ERROR_REPLY });
    const error = registrada() as FallaDeLaBase;
    expect(error).toBeInstanceOf(FallaDeLaBase);
    expect(error.code).toBe("XX000");
  });

  it("⭐ las lecturas secundarias que fallan no cortan el envío pero quedan registradas", async () => {
    base.errores.organizations = { code: "XX000", message: "boom" };
    const r = await enviar();
    expect(r.success).toBe(true);
    expect(base.reportes.map((x) => x.contexto)).toContainEqual({ lectura: "agente:nombre-de-la-org" });
  });

  it("⭐ una propuesta del agente se guarda y se engancha a la respuesta dentro de la organización", async () => {
    sim.respuestas = [propuestaDeClaude(), respuestaDeClaude("Te propongo un producto")];
    const r = await enviar();
    expect(r.success).toBe(true);
    if (!r.success) return;
    const propuesta = base.escrituras().find((o) => o.tabla === "agent_graph_proposals" && o.op === "insert");
    expect(propuesta?.valores).toMatchObject({ organization_id: ORG, conversation_id: CONVERSACION });
    expect(base.filtrosDe("agent_graph_proposals", "update")).toContainEqual(["organization_id", ORG]);
    expect(r.data.messages.at(-1)?.graphProposals).toHaveLength(1);
    expect(base.reportes).toHaveLength(0);
  });

  it("si no se puede enganchar la propuesta a la respuesta, la respuesta sale igual y la falla queda registrada", async () => {
    sim.respuestas = [propuestaDeClaude(), respuestaDeClaude("Te propongo un producto")];
    base.errores["agent_graph_proposals:update"] = { code: "XX000", message: "boom" };
    const r = await enviar();
    expect(r.success).toBe(true);
    const reporte = base.reportes.find(
      (x) => JSON.stringify(x.contexto) === JSON.stringify({ accion: "[sendAgentMessage] message_id de las propuestas" })
    );
    expect(reporte?.error).toBeInstanceOf(FallaDeLaBase);
  });

  it("si no se puede actualizar la fecha de la conversación, el mensaje sale igual y la falla queda registrada", async () => {
    base.errores["agent_conversations:update"] = { code: "XX000", message: "boom" };
    const r = await enviar();
    expect(r.success).toBe(true);
    expect(base.reportes.map((x) => x.contexto)).toContainEqual({ accion: "[sendAgentMessage] updated_at" });
  });
});
