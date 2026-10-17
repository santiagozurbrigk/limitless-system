/**
 * SCRUM-506 (AR pasada 1, M3; reproducción de la AR, `ar-p1/ar-motivo-rancio.test.ts`):
 * el motivo de carga de una conversación no queda en el estado al pasar a una
 * vista sin conversación (otra etapa, o después de borrar la conversación
 * abierta). Antes el efecto de carga sólo hacía setMessages([]) y la vista nueva
 * mostraba "No se pudo cargar la conversación" en vez de las sugerencias.
 * Misma técnica que agente-providers-con-estado.test.ts (hooks mínimos sin DOM),
 * pero el useEffect se guarda para correrlo a mano.
 */
import { beforeEach, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => {
  let celdas: unknown[] = [];
  let i = 0;
  const efectos: Array<() => void> = [];
  return {
    efectos,
    reiniciar() { celdas = []; i = 0; efectos.length = 0; },
    empezarRender() { i = 0; efectos.length = 0; },
    useState(inicial: unknown) {
      const k = i++;
      if (!(k in celdas)) celdas[k] = typeof inicial === "function" ? (inicial as () => unknown)() : inicial;
      const set = (v: unknown) => { celdas[k] = typeof v === "function" ? (v as (x: unknown) => unknown)(celdas[k]) : v; };
      return [celdas[k], set];
    },
    useRef(inicial: unknown) { const k = i++; if (!(k in celdas)) celdas[k] = { current: inicial }; return celdas[k]; },
    useMemo(calcular: () => unknown, deps: unknown[]) {
      const k = i++;
      const g = celdas[k] as { valor: unknown; deps: unknown[] } | undefined;
      if (g && g.deps.length === deps.length && g.deps.every((d, j) => Object.is(d, deps[j]))) return g.valor;
      const valor = calcular(); celdas[k] = { valor, deps }; return valor;
    },
  };
});

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: hooks.useState,
  useRef: hooks.useRef,
  useCallback: (f: unknown, deps: unknown[]) => hooks.useMemo(() => f, deps),
  useMemo: hooks.useMemo,
  useEffect: (f: () => void) => { hooks.efectos.push(f); },
  useContext: () => null,
}));
const sim = vi.hoisted(() => ({ lectura: null as unknown }));
vi.mock("@/providers/toast-provider", () => ({ useToast: () => ({ push: () => {} }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, replace() {}, refresh() {} }) }));
vi.mock("@ai-coo/ui", () => ({ usePrefersReducedMotion: () => true }));
vi.mock("@/lib/agent/use-stream-typewriter", () => {
  const nada = () => {};
  return { useStreamTypewriter: () => ({ displayedText: "", start: nada, appendBuffer: nada, markStreamEnded: nada,
    waitForCatchUp: async () => {}, snapToBuffer: nada, reset: nada, getTextSnapshot: () => ({ buffered: "" }) }) };
});
vi.mock("@/app/agent/actions", () => ({
  listAgentMessagesAction: async () => sim.lectura,
  listAgentWorkspaceAction: async () => ({ stages: [], conversations: [] }),
  createBusinessStageAction: async () => ({ success: true, data: {} }),
  deleteAgentConversationAction: async () => ({ success: true, data: undefined }),
  deleteBusinessStageAction: async () => ({ success: true, data: undefined }),
  sendAgentMessageAction: async () => ({ success: true, data: {} }),
}));

import { AgentDataProvider, type useAgentData } from "@/providers/agent-data-provider";
import { queMostrarEnElChat } from "@/components/agent/agent-module";

const X = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function render(conversationId: string | null, filterStageId: string | null = null): ReturnType<typeof useAgentData> {
  hooks.empezarRender();
  const el = AgentDataProvider({ conversationId, filterStageId, children: null }) as { props: { value: ReturnType<typeof useAgentData> } };
  return el.props.value;
}

async function correrEfectos() {
  for (const f of [...hooks.efectos]) f();
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => { hooks.reiniciar(); vi.spyOn(console, "error").mockImplementation(() => {}); });

it("⭐ después de una carga fallida, ir a una etapa (sin conversación) muestra las sugerencias, no el motivo viejo", async () => {
  sim.lectura = { success: false, error: "Ocurrió un error inesperado. Intentá de nuevo." };
  render(X);
  await correrEfectos();                       // carga X: falla
  const enX = render(X);
  expect(enX.motivoDeCarga).toBe("Ocurrió un error inesperado. Intentá de nuevo.");

  render(null, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"); // el layout pasa a /agent/stage/S
  await correrEfectos();
  const enEtapa = render(null, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  const que = queMostrarEnElChat({ isLoading: enEtapa.isLoading, cantidadDeMensajes: enEtapa.messages.length,
    motivoDeCarga: enEtapa.motivoDeCarga, agenteOcupado: false });
  expect(enEtapa.motivoDeCarga).toBeNull();
  expect(que).toBe("vacio");
});
