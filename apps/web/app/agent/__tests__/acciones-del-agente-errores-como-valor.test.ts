import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-506: las acciones del Agente (`app/agent/actions.ts`) devuelven sus
 * errores esperables como valor. Antes lanzaban: en producción el usuario veía
 * el párrafo técnico de Next (o nada: la pantalla quedaba en "Cargando…"), la
 * lectura de los mensajes tomaba la tabla ausente por el texto del error y
 * escondía las fallas de la lectura de las propuestas.
 *
 * Este archivo cubre las lecturas y mutaciones de la pantalla (mensajes,
 * etapas y conversaciones); el envío de mensajes está en
 * `enviar-mensaje-errores-como-valor.test.ts`. Ningún test llama a un servicio
 * real: la base es falsa (`supabase-falso.ts`) y aplica los filtros.
 */

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
  const { base, ORG } = await import("./supabase-falso");
  const { ErrorEsperable } = await import("@/lib/server/error-esperable");
  const requireOrganizationId = async () => {
    if (base.lanzaEnSesion) throw base.lanzaEnSesion;
    // Como el real: sin sesión es un rechazo esperable.
    if (!base.sesion) throw new ErrorEsperable("Sesión no válida");
    return ORG;
  };
  return {
    requireOrganizationId,
    tryRequireOrganizationId: async () => requireOrganizationId().catch(() => null),
    isMissingTableError: () => false,
  };
});

import {
  createAgentConversationAction,
  createBusinessStageAction,
  deleteAgentConversationAction,
  deleteBusinessStageAction,
  listAgentMessagesAction,
  listAgentWorkspaceAction,
} from "../actions";
import { FallaDeLaBase } from "@/lib/server/action-result";
import { base, CACHE_CAIDA, ORG, OTRA_ORG, TEXTO_FIJO } from "./supabase-falso";

const CONVERSACION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ETAPA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MENSAJE_CON_PROPUESTAS = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const FETCH_FAILED = { message: "TypeError: fetch failed" };

function mensaje(id: string, org: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    conversation_id: CONVERSACION,
    organization_id: org,
    role: "user",
    content: org === ORG ? "mío" : "ajeno",
    attachments: null,
    action_type: null,
    action_ref_id: null,
    thinking_content: null,
    canvas_content: null,
    created_at: "2026-10-16T00:00:00Z",
    ...extra,
  };
}

function propuesta(id: string, org: string) {
  return {
    id,
    organization_id: org,
    conversation_id: CONVERSACION,
    message_id: MENSAJE_CON_PROPUESTAS,
    entity_type: "product",
    action: "create",
    entity_id: null,
    payload: {},
    status: "pending",
    created_at: "2026-10-16T00:00:00Z",
  };
}

/**
 * La fila ajena va primero y comparte el ID de la conversación (y el del
 * mensaje con propuestas): una lectura sin el filtro de la organización la
 * devuelve a ella.
 */
function cargarMensajes() {
  base.tablas.agent_messages = [
    mensaje("m-ajeno", OTRA_ORG),
    mensaje("m-1", ORG),
    mensaje(MENSAJE_CON_PROPUESTAS, ORG, { role: "assistant", action_type: "graph_proposals" }),
  ];
  base.tablas.agent_graph_proposals = [propuesta("p-ajena", OTRA_ORG), propuesta("p-mia", ORG)];
}

function etapa(id: string, org: string) {
  return {
    id,
    organization_id: org,
    name: org === ORG ? "Mía" : "Ajena",
    description: null,
    order_index: 0,
    is_active: true,
    created_at: "2026-10-16T00:00:00Z",
  };
}

function conversacion(id: string, org: string) {
  return {
    id,
    organization_id: org,
    project_id: null,
    stage_id: null,
    title: org === ORG ? "Mía" : "Ajena",
    created_at: "2026-10-16T00:00:00Z",
    updated_at: "2026-10-16T00:00:00Z",
  };
}

let consolaError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  base.reiniciar();
  consolaError = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** La falla quedó registrada en la consola y en el reporte con la etiqueta de la acción. */
function registrada(etiqueta: string) {
  expect(base.reportes).toHaveLength(1);
  expect(base.reportes[0]!.contexto).toEqual({ accion: etiqueta });
  expect(consolaError).toHaveBeenCalledWith(etiqueta, base.reportes[0]!.error);
}

describe("listAgentMessagesAction", () => {
  it("⭐ con éxito devuelve sólo los mensajes de la organización, con sus propuestas", async () => {
    cargarMensajes();
    const r = await listAgentMessagesAction(CONVERSACION);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.map((m) => m.id)).toEqual(["m-1", MENSAJE_CON_PROPUESTAS]);
    expect(r.data[1]!.graphProposals?.map((p) => p.id)).toEqual(["p-mia"]);
    expect(base.filtrosDe("agent_messages", "select")).toContainEqual(["organization_id", ORG]);
    expect(base.filtrosDe("agent_graph_proposals", "select")).toContainEqual(["organization_id", ORG]);
    expect(base.reportes).toHaveLength(0);
  });

  it("un ID que no es UUID es un rechazo esperable y no consulta la base", async () => {
    const r = await listAgentMessagesAction("no-es-un-id");
    expect(r).toEqual({ success: false, error: "ID inválido" });
    expect(base.operaciones).toHaveLength(0);
    expect(base.reportes).toHaveLength(0);
  });

  it("sin sesión devuelve vacío, como siempre, sin registrar nada", async () => {
    base.sesion = false;
    expect(await listAgentMessagesAction(CONVERSACION)).toEqual({ success: true, data: [] });
    expect(base.operaciones).toHaveLength(0);
    expect(base.reportes).toHaveLength(0);
  });

  it("⭐ una falla al resolver la organización ya no se esconde como vacío: texto fijo y registro", async () => {
    base.lanzaEnSesion = new TypeError("fetch failed");
    expect(await listAgentMessagesAction(CONVERSACION)).toEqual({ success: false, error: TEXTO_FIJO });
    registrada("[listAgentMessages]");
  });

  it("antes de la migración (tabla ausente, por código) devuelve vacío sin registrar", async () => {
    base.errores.agent_messages = { code: "42P01", message: 'relation "agent_messages" does not exist' };
    expect(await listAgentMessagesAction(CONVERSACION)).toEqual({ success: true, data: [] });
    expect(base.reportes).toHaveLength(0);
  });

  it("⭐ la caída de la caché de PostgREST (dice \"schema cache\") es una falla, no una tabla ausente", async () => {
    base.errores.agent_messages = CACHE_CAIDA;
    expect(await listAgentMessagesAction(CONVERSACION)).toEqual({ success: false, error: TEXTO_FIJO });
    registrada("[listAgentMessages]");
    expect(base.reportes[0]!.error).toBeInstanceOf(FallaDeLaBase);
    expect((base.reportes[0]!.error as FallaDeLaBase).code).toBe("PGRST002");
  });

  it("un error de la base como valor de supabase-js devuelve el texto fijo y queda registrado", async () => {
    base.errores.agent_messages = FETCH_FAILED;
    const r = await listAgentMessagesAction(CONVERSACION);
    expect(r).toEqual({ success: false, error: TEXTO_FIJO });
    expect(JSON.stringify(r)).not.toContain("fetch failed");
    registrada("[listAgentMessages]");
    expect(base.reportes[0]!.error).toBeInstanceOf(FallaDeLaBase);
  });

  it("una excepción (la red) devuelve el texto fijo y queda registrada", async () => {
    base.lanza = new TypeError("fetch failed");
    expect(await listAgentMessagesAction(CONVERSACION)).toEqual({ success: false, error: TEXTO_FIJO });
    registrada("[listAgentMessages]");
  });

  it("⭐ si falla la lectura de las propuestas, los mensajes se muestran igual y la falla queda registrada", async () => {
    cargarMensajes();
    base.errores.agent_graph_proposals = { code: "XX000", message: "boom" };
    const r = await listAgentMessagesAction(CONVERSACION);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.map((m) => m.id)).toEqual(["m-1", MENSAJE_CON_PROPUESTAS]);
    expect(r.data[1]!.graphProposals).toBeNull();
    expect(base.reportes).toHaveLength(1);
    expect(base.reportes[0]!.contexto).toEqual({ lectura: "agente:propuestas-de-los-mensajes" });
    expect(base.reportes[0]!.error).toBeInstanceOf(FallaDeLaBase);
  });

  it("sin la tabla de propuestas (por código) los mensajes van sin propuestas y sin registro", async () => {
    cargarMensajes();
    base.errores.agent_graph_proposals = { code: "PGRST205", message: "Could not find the table" };
    const r = await listAgentMessagesAction(CONVERSACION);
    expect(r.success && r.data[1]!.graphProposals).toBeNull();
    expect(base.reportes).toHaveLength(0);
  });

  it("un error interno de Next (redirect) se relanza para que Next navegue", async () => {
    const { redirect } = await import("next/navigation");
    let interno: unknown;
    try {
      redirect("/login");
    } catch (e) {
      interno = e;
    }
    base.lanzaEnSesion = interno;
    await expect(listAgentMessagesAction(CONVERSACION)).rejects.toBe(interno);
    expect(base.reportes).toHaveLength(0);
  });
});

describe("listAgentWorkspaceAction (QA final: filtros por organización)", () => {
  it("⭐ devuelve sólo las etapas y las conversaciones de la organización", async () => {
    base.tablas.business_stages = [etapa("e-ajena", OTRA_ORG), etapa(ETAPA, ORG)];
    base.tablas.agent_conversations = [conversacion("c-ajena", OTRA_ORG), conversacion(CONVERSACION, ORG)];
    const r = await listAgentWorkspaceAction();
    expect(r.stages.map((e) => e.id)).toEqual([ETAPA]);
    expect(r.conversations.map((c) => c.id)).toEqual([CONVERSACION]);
    expect(base.filtrosDe("business_stages", "select")).toContainEqual(["organization_id", ORG]);
    expect(base.filtrosDe("agent_conversations", "select")).toContainEqual(["organization_id", ORG]);
  });
});

describe("createBusinessStageAction", () => {
  it("⭐ con éxito crea la etapa en la organización, al final de las suyas", async () => {
    base.tablas.business_stages = [etapa("e-ajena-1", OTRA_ORG), etapa("e-ajena-2", OTRA_ORG), etapa(ETAPA, ORG)];
    const r = await createBusinessStageAction({ name: "  Crecer  ", description: " x " });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toMatchObject({ organizationId: ORG, name: "Crecer", description: "x", orderIndex: 1 });
    expect(base.filtrosDe("business_stages", "select")).toContainEqual(["organization_id", ORG]);
    expect(base.escrituras()[0]!.valores).toMatchObject({ organization_id: ORG, order_index: 1 });
  });

  it("sin sesión devuelve el motivo y no escribe", async () => {
    base.sesion = false;
    expect(await createBusinessStageAction({ name: "Crecer" })).toEqual({ success: false, error: "Sesión no válida" });
    expect(base.escrituras()).toHaveLength(0);
    expect(base.reportes).toHaveLength(0);
  });

  it("⭐ si falla el conteo no crea la etapa con un orden inventado: texto fijo y registro", async () => {
    base.errores["business_stages:select"] = { code: "XX000", message: "boom" };
    expect(await createBusinessStageAction({ name: "Crecer" })).toEqual({ success: false, error: TEXTO_FIJO });
    expect(base.escrituras()).toHaveLength(0);
    registrada("[createBusinessStage]");
  });

  it("un error de la base al insertar devuelve el texto fijo y queda registrado", async () => {
    base.errores["business_stages:insert"] = FETCH_FAILED;
    expect(await createBusinessStageAction({ name: "Crecer" })).toEqual({ success: false, error: TEXTO_FIJO });
    registrada("[createBusinessStage]");
    expect(base.reportes[0]!.error).toBeInstanceOf(FallaDeLaBase);
  });

  it("una excepción (la red) devuelve el texto fijo y queda registrada", async () => {
    base.lanza = new TypeError("fetch failed");
    expect(await createBusinessStageAction({ name: "Crecer" })).toEqual({ success: false, error: TEXTO_FIJO });
    registrada("[createBusinessStage]");
  });
});

describe("createAgentConversationAction", () => {
  it("con éxito crea la conversación en la organización", async () => {
    const r = await createAgentConversationAction({ title: "Plan" });
    expect(r).toMatchObject({ success: true, data: { organizationId: ORG, title: "Plan" } });
    expect(base.escrituras()[0]!.valores).toMatchObject({ organization_id: ORG, title: "Plan" });
  });

  it("sin sesión devuelve el motivo", async () => {
    base.sesion = false;
    expect(await createAgentConversationAction()).toEqual({ success: false, error: "Sesión no válida" });
    expect(base.escrituras()).toHaveLength(0);
  });

  it("un error de la base devuelve el texto fijo y queda registrado", async () => {
    base.errores.agent_conversations = FETCH_FAILED;
    expect(await createAgentConversationAction()).toEqual({ success: false, error: TEXTO_FIJO });
    registrada("[createAgentConversation]");
    expect(base.reportes[0]!.error).toBeInstanceOf(FallaDeLaBase);
  });

  it("una excepción (la red) devuelve el texto fijo y queda registrada", async () => {
    base.lanza = new TypeError("fetch failed");
    expect(await createAgentConversationAction()).toEqual({ success: false, error: TEXTO_FIJO });
    registrada("[createAgentConversation]");
  });
});

describe.each([
  {
    nombre: "deleteAgentConversationAction",
    accion: deleteAgentConversationAction,
    tabla: "agent_conversations",
    etiqueta: "[deleteAgentConversation]",
    fila: conversacion,
  },
  {
    nombre: "deleteBusinessStageAction",
    accion: deleteBusinessStageAction,
    tabla: "business_stages",
    etiqueta: "[deleteBusinessStage]",
    fila: etapa,
  },
])("$nombre", ({ accion, tabla, etiqueta, fila }) => {
  const ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

  it("⭐ con éxito borra sólo la fila de la organización", async () => {
    base.tablas[tabla] = [fila(ID, OTRA_ORG), fila(ID, ORG)];
    expect(await accion(ID)).toEqual({ success: true, data: undefined });
    expect(base.tablas[tabla]!.map((f) => f.organization_id)).toEqual([OTRA_ORG]);
    expect(base.filtrosDe(tabla, "delete")).toContainEqual(["organization_id", ORG]);
  });

  it("un ID que no es UUID es un rechazo esperable y no borra nada", async () => {
    expect(await accion("no-es-un-id")).toEqual({ success: false, error: "ID inválido" });
    expect(base.operaciones).toHaveLength(0);
  });

  it("sin sesión devuelve el motivo", async () => {
    base.sesion = false;
    expect(await accion(ID)).toEqual({ success: false, error: "Sesión no válida" });
    expect(base.operaciones).toHaveLength(0);
    expect(base.reportes).toHaveLength(0);
  });

  it("un error de la base devuelve el texto fijo y queda registrado", async () => {
    base.errores[tabla] = FETCH_FAILED;
    expect(await accion(ID)).toEqual({ success: false, error: TEXTO_FIJO });
    registrada(etiqueta);
    expect(base.reportes[0]!.error).toBeInstanceOf(FallaDeLaBase);
  });

  it("una excepción (la red) devuelve el texto fijo y queda registrada", async () => {
    base.lanza = new TypeError("fetch failed");
    expect(await accion(ID)).toEqual({ success: false, error: TEXTO_FIJO });
    registrada(etiqueta);
  });
});
