import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-506: los llamadores de las acciones del Agente usan el resultado como
 * valor. Antes, la pantalla del Agente guardaba en el estado lo que devolvía la
 * lectura de mensajes sin mirar si era un error (y si la acción lanzaba, quedaba
 * en "Cargando…" con una promesa sin atender), crear o borrar una etapa o una
 * conversación fallaba sin aviso, y el chat flotante mostraba siempre el mismo
 * texto aunque el motivo fuera la falta de clave de Claude.
 */

const sim = vi.hoisted(() => ({
  resultado: null as unknown,
  lanza: null as unknown,
  llamadas: [] as Array<[string, unknown[]]>,
}));

vi.mock("@/app/agent/actions", () => {
  const accion =
    (nombre: string) =>
    async (...args: unknown[]) => {
      sim.llamadas.push([nombre, args]);
      if (sim.lanza) throw sim.lanza;
      return sim.resultado;
    };
  return {
    listAgentMessagesAction: accion("listAgentMessagesAction"),
    listAgentWorkspaceAction: accion("listAgentWorkspaceAction"),
    createBusinessStageAction: accion("createBusinessStageAction"),
    deleteAgentConversationAction: accion("deleteAgentConversationAction"),
    deleteBusinessStageAction: accion("deleteBusinessStageAction"),
    sendAgentMessageAction: accion("sendAgentMessageAction"),
  };
});

import {
  crearEtapaDelAgente,
  eliminarConversacionDelAgente,
  eliminarEtapaDelAgente,
  leerMensajesDelAgente,
} from "../agent-data-provider";
import { enviarAlAgente } from "../floating-chat-provider";
import { ERROR_INESPERADO } from "@/lib/client/correr-accion";

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DIGEST = new Error("An error occurred in the Server Components render. digest 123");

let consolaError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  sim.resultado = null;
  sim.lanza = null;
  sim.llamadas = [];
  consolaError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("leerMensajesDelAgente (pantalla del Agente)", () => {
  it("con éxito devuelve los mensajes", async () => {
    sim.resultado = { success: true, data: [{ id: "m-1" }] };
    expect(await leerMensajesDelAgente(ID)).toEqual({ ok: true, data: [{ id: "m-1" }] });
    expect(sim.llamadas).toEqual([["listAgentMessagesAction", [ID]]]);
  });

  it("⭐ con un error devuelto como valor da el motivo, no lo guarda como mensajes", async () => {
    sim.resultado = { success: false, error: "ID inválido" };
    expect(await leerMensajesDelAgente(ID)).toEqual({ ok: false, motivo: "ID inválido" });
  });

  it("⭐ si la acción lanza (en producción, un digest) el motivo es el texto fijo y se registra", async () => {
    sim.lanza = DIGEST;
    expect(await leerMensajesDelAgente(ID)).toEqual({ ok: false, motivo: ERROR_INESPERADO });
    expect(consolaError).toHaveBeenCalledWith("[Agente] leer mensajes", DIGEST);
  });
});

describe.each([
  {
    nombre: "crearEtapaDelAgente",
    correr: (avisar: (a: unknown) => void) => crearEtapaDelAgente({ name: "Crecer" }, avisar),
    accion: "createBusinessStageAction",
    args: [{ name: "Crecer" }],
    titulo: "No se pudo crear la etapa",
    etiqueta: "[Agente] crear etapa",
  },
  {
    nombre: "eliminarConversacionDelAgente",
    correr: (avisar: (a: unknown) => void) => eliminarConversacionDelAgente(ID, avisar),
    accion: "deleteAgentConversationAction",
    args: [ID],
    titulo: "No se pudo eliminar la conversación",
    etiqueta: "[Agente] eliminar conversación",
  },
  {
    nombre: "eliminarEtapaDelAgente",
    correr: (avisar: (a: unknown) => void) => eliminarEtapaDelAgente(ID, avisar),
    accion: "deleteBusinessStageAction",
    args: [ID],
    titulo: "No se pudo eliminar la etapa",
    etiqueta: "[Agente] eliminar etapa",
  },
])("$nombre", ({ correr, accion, args, titulo, etiqueta }) => {
  it("con éxito devuelve true y no avisa", async () => {
    sim.resultado = { success: true, data: undefined };
    const avisar = vi.fn();
    expect(await correr(avisar)).toBe(true);
    expect(avisar).not.toHaveBeenCalled();
    expect(sim.llamadas).toEqual([[accion, args]]);
  });

  it("⭐ con un error devuelto como valor avisa el motivo y devuelve false", async () => {
    sim.resultado = { success: false, error: "Sesión no válida" };
    const avisar = vi.fn();
    expect(await correr(avisar)).toBe(false);
    expect(avisar).toHaveBeenCalledTimes(1);
    expect(avisar).toHaveBeenCalledWith({ title: titulo, description: "Sesión no válida", variant: "default" });
  });

  it("⭐ si la acción lanza avisa el texto fijo, lo registra y devuelve false", async () => {
    sim.lanza = DIGEST;
    const avisar = vi.fn();
    expect(await correr(avisar)).toBe(false);
    expect(avisar).toHaveBeenCalledTimes(1);
    expect(avisar).toHaveBeenCalledWith({ title: titulo, description: ERROR_INESPERADO, variant: "default" });
    expect(consolaError).toHaveBeenCalledWith(etiqueta, DIGEST);
  });
});

describe("enviarAlAgente (chat flotante)", () => {
  const input = { content: "hola", pageContext: null };

  it("con éxito pasa la conversación y no muestra error", async () => {
    sim.resultado = { success: true, data: { conversationId: ID, messages: [], openCanvas: false } };
    const alResponder = vi.fn();
    const alFallar = vi.fn();
    await enviarAlAgente(input, "[sendFromFloating]", alResponder, alFallar);
    expect(alResponder).toHaveBeenCalledWith(ID);
    expect(alFallar).not.toHaveBeenCalled();
    expect(sim.llamadas).toEqual([["sendAgentMessageAction", [input]]]);
  });

  it("⭐ con un error devuelto como valor muestra el motivo (sin clave de Claude), no el texto genérico", async () => {
    const motivo = "Las funciones de IA están desactivadas: falta la clave de Claude de tu organización.";
    sim.resultado = { success: false, error: motivo };
    const alResponder = vi.fn();
    const alFallar = vi.fn();
    await enviarAlAgente(input, "[sendFromFloating]", alResponder, alFallar);
    expect(alFallar).toHaveBeenCalledWith(motivo);
    expect(alResponder).not.toHaveBeenCalled();
  });

  it("⭐ si la acción lanza muestra el texto fijo y lo registra con la etiqueta", async () => {
    sim.lanza = DIGEST;
    const alResponder = vi.fn();
    const alFallar = vi.fn();
    await enviarAlAgente(input, "[simulateReply]", alResponder, alFallar);
    expect(alFallar).toHaveBeenCalledWith(ERROR_INESPERADO);
    expect(alResponder).not.toHaveBeenCalled();
    expect(consolaError).toHaveBeenCalledWith("[simulateReply]", DIGEST);
  });
});
