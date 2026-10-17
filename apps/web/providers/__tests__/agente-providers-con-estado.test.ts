/**
 * SCRUM-506: los providers del Agente con su estado de verdad. Las piezas
 * puras están en `agente-providers-errores.test.ts`; éste prueba que el
 * provider las conecta: que la pantalla guarda el motivo de la lectura de
 * mensajes (y no un `{ success: false }` como mensajes), que crear o borrar no
 * refresca ni navega si la acción devolvió un error, y que el chat flotante
 * muestra el motivo como respuesta.
 *
 * Sin DOM no hay React que guarde el estado entre renders, así que los hooks
 * se reemplazan por unos mínimos que sí lo guardan (la misma técnica que
 * `workboard-provider-confirmacion.test.ts`, SCRUM-503): cada "render" es
 * llamar al provider y leer el `value` del contexto.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => {
  let celdas: unknown[] = [];
  let i = 0;
  return {
    reiniciar() {
      celdas = [];
      i = 0;
    },
    empezarRender() {
      i = 0;
    },
    useState(inicial: unknown) {
      const k = i++;
      if (!(k in celdas)) celdas[k] = typeof inicial === "function" ? (inicial as () => unknown)() : inicial;
      const set = (v: unknown) => {
        celdas[k] = typeof v === "function" ? (v as (x: unknown) => unknown)(celdas[k]) : v;
      };
      return [celdas[k], set];
    },
    useRef(inicial: unknown) {
      const k = i++;
      if (!(k in celdas)) celdas[k] = { current: inicial };
      return celdas[k];
    },
    useMemo(calcular: () => unknown, deps: unknown[]) {
      const k = i++;
      const guardado = celdas[k] as { valor: unknown; deps: unknown[] } | undefined;
      if (
        guardado &&
        guardado.deps.length === deps.length &&
        guardado.deps.every((d, j) => Object.is(d, deps[j]))
      ) {
        return guardado.valor;
      }
      const valor = calcular();
      celdas[k] = { valor, deps };
      return valor;
    },
  };
});

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: hooks.useState,
  useRef: hooks.useRef,
  useCallback: (f: unknown, deps: unknown[]) => hooks.useMemo(() => f, deps),
  useMemo: hooks.useMemo,
  // La carga inicial no corre: cada test llama a lo que quiere probar.
  useEffect: () => {},
  useContext: () => null,
}));

const sim = vi.hoisted(() => ({
  push: (aviso: { title: string; description?: string }) => sim.avisos.push(aviso),
  avisos: [] as Array<{ title: string; description?: string }>,
  acciones: {} as Record<string, (...args: unknown[]) => Promise<unknown>>,
  llamadas: [] as string[],
  router: {
    push: (ruta: string) => sim.llamadas.push(`router.push ${ruta}`),
    replace: (ruta: string) => sim.llamadas.push(`router.replace ${ruta}`),
    refresh: () => sim.llamadas.push("router.refresh"),
  },
}));

vi.mock("@/providers/toast-provider", () => ({ useToast: () => ({ push: sim.push }) }));
vi.mock("next/navigation", () => ({ useRouter: () => sim.router }));
vi.mock("@ai-coo/ui", () => ({ usePrefersReducedMotion: () => true }));
vi.mock("@/lib/agent/use-stream-typewriter", () => {
  const nada = () => {};
  return {
    useStreamTypewriter: () => ({
      displayedText: "",
      start: nada,
      appendBuffer: nada,
      markStreamEnded: nada,
      waitForCatchUp: async () => {},
      snapToBuffer: nada,
      reset: nada,
      getTextSnapshot: () => ({ buffered: "" }),
    }),
  };
});
vi.mock("@/app/agent/actions", () => {
  const nombres = [
    "listAgentMessagesAction",
    "listAgentWorkspaceAction",
    "createBusinessStageAction",
    "deleteAgentConversationAction",
    "deleteBusinessStageAction",
    "sendAgentMessageAction",
  ];
  return Object.fromEntries(
    nombres.map((n) => [
      n,
      (...args: unknown[]) => {
        sim.llamadas.push(n);
        return sim.acciones[n]!(...args);
      },
    ])
  );
});

import { AgentDataProvider, type useAgentData } from "@/providers/agent-data-provider";
import { FloatingChatProvider, type useFloatingChat } from "@/providers/floating-chat-provider";

const CONVERSACION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MENSAJE = { id: "m-1", role: "user", content: "hola" };

function renderPantalla(): ReturnType<typeof useAgentData> {
  hooks.empezarRender();
  const elemento = AgentDataProvider({ conversationId: CONVERSACION, children: null }) as {
    props: { value: ReturnType<typeof useAgentData> };
  };
  return elemento.props.value;
}

function renderFlotante(): ReturnType<typeof useFloatingChat> {
  hooks.empezarRender();
  const elemento = FloatingChatProvider({ children: null }) as {
    props: { value: ReturnType<typeof useFloatingChat> };
  };
  return elemento.props.value;
}

beforeEach(() => {
  hooks.reiniciar();
  sim.avisos = [];
  sim.llamadas = [];
  sim.acciones = {
    listAgentWorkspaceAction: async () => ({ stages: [], conversations: [] }),
    listAgentMessagesAction: async () => ({ success: true, data: [MENSAJE] }),
    createBusinessStageAction: async () => ({ success: true, data: {} }),
    deleteAgentConversationAction: async () => ({ success: true, data: undefined }),
    deleteBusinessStageAction: async () => ({ success: true, data: undefined }),
    sendAgentMessageAction: async () => ({
      success: true,
      data: { conversationId: CONVERSACION, messages: [], openCanvas: false },
    }),
  };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AgentDataProvider con estado", () => {
  it("con éxito guarda los mensajes y no hay motivo", async () => {
    await renderPantalla().loadConversation(CONVERSACION);
    const despues = renderPantalla();
    expect(despues.messages).toEqual([MENSAJE]);
    expect(despues.motivoDeCarga).toBeNull();
  });

  it("⭐ con la lectura rechazada guarda el motivo y ningún mensaje (antes, el error como mensajes)", async () => {
    sim.acciones.listAgentMessagesAction = async () => ({ success: false, error: "ID inválido" });
    await renderPantalla().loadConversation(CONVERSACION);
    const despues = renderPantalla();
    expect(despues.messages).toEqual([]);
    expect(despues.motivoDeCarga).toBe("ID inválido");
  });

  it("⭐ una lectura buena después de una fallida borra el motivo", async () => {
    sim.acciones.listAgentMessagesAction = async () => ({ success: false, error: "ID inválido" });
    await renderPantalla().loadConversation(CONVERSACION);
    sim.acciones.listAgentMessagesAction = async () => ({ success: true, data: [MENSAJE] });
    await renderPantalla().loadConversation(CONVERSACION);
    expect(renderPantalla().motivoDeCarga).toBeNull();
  });

  it("⭐ crear una etapa rechazada avisa el motivo, devuelve false y no refresca", async () => {
    sim.acciones.createBusinessStageAction = async () => ({ success: false, error: "Sesión no válida" });
    expect(await renderPantalla().createStage({ name: "Crecer" })).toBe(false);
    expect(sim.avisos).toEqual([{ title: "No se pudo crear la etapa", description: "Sesión no válida", variant: "default" }]);
    expect(sim.llamadas).toEqual(["createBusinessStageAction"]);
  });

  it("crear una etapa con éxito devuelve true, refresca la lista y la página", async () => {
    expect(await renderPantalla().createStage({ name: "Crecer" })).toBe(true);
    expect(sim.llamadas).toEqual(["createBusinessStageAction", "listAgentWorkspaceAction", "router.refresh"]);
    expect(sim.avisos).toEqual([]);
  });

  it("⭐ borrar la conversación abierta rechazado avisa el motivo y no navega", async () => {
    sim.acciones.deleteAgentConversationAction = async () => ({ success: false, error: "ID inválido" });
    await renderPantalla().deleteConversation(CONVERSACION);
    expect(sim.avisos.map((a) => a.description)).toEqual(["ID inválido"]);
    expect(sim.llamadas).toEqual(["deleteAgentConversationAction"]);
  });

  it("borrar la conversación abierta con éxito refresca y vuelve al Agente", async () => {
    await renderPantalla().deleteConversation(CONVERSACION);
    expect(sim.llamadas).toEqual(["deleteAgentConversationAction", "listAgentWorkspaceAction", "router.push /agent"]);
  });

  it("⭐ borrar una etapa rechazado avisa el motivo y no refresca", async () => {
    sim.acciones.deleteBusinessStageAction = async () => ({ success: false, error: "Sesión no válida" });
    await renderPantalla().deleteStage(CONVERSACION);
    expect(sim.avisos.map((a) => [a.title, a.description])).toEqual([["No se pudo eliminar la etapa", "Sesión no válida"]]);
    expect(sim.llamadas).toEqual(["deleteBusinessStageAction"]);
  });
});

describe("FloatingChatProvider con estado", () => {
  const SIN_CLAVE =
    "Las funciones de IA están desactivadas: falta la clave de Claude de tu organización. Cargala en Ajustes → IA (o pedíselo a quien administra la cuenta).";

  it("⭐ enviar con un rechazo muestra el mensaje del usuario y el motivo como respuesta", async () => {
    sim.acciones.sendAgentMessageAction = async () => ({ success: false, error: SIN_CLAVE });
    await renderFlotante().sendFromFloating("hola");
    const despues = renderFlotante();
    expect(despues.messages.map((m) => [m.role, m.content])).toEqual([
      ["user", "hola"],
      ["assistant", SIN_CLAVE],
    ]);
    expect(despues.pendingConversationId).toBeNull();
    expect(despues.isExpanding).toBe(false);
  });

  it("enviar con éxito deja la conversación pendiente para abrirla", async () => {
    await renderFlotante().sendFromFloating("hola");
    const despues = renderFlotante();
    expect(despues.pendingConversationId).toBe(CONVERSACION);
    expect(despues.messages).toEqual([]);
  });

  it("⭐ si la acción lanza, la respuesta es el texto fijo", async () => {
    sim.acciones.sendAgentMessageAction = async () => {
      throw new Error("digest 123");
    };
    await renderFlotante().sendFromFloating("hola");
    expect(renderFlotante().messages.at(-1)?.content).toBe("Ocurrió un error inesperado. Intentá de nuevo.");
  });

  it("⭐ la respuesta del agente desde la pantalla muestra el motivo devuelto", async () => {
    sim.acciones.sendAgentMessageAction = async () => ({ success: false, error: "Conversación no encontrada" });
    await renderFlotante().sendFromAgent("hola");
    renderFlotante();
    await renderFlotante().runAgentReply();
    const contenidos = renderFlotante().messages.map((m) => m.content);
    expect(contenidos).toContain("Conversación no encontrada");
  });
});
