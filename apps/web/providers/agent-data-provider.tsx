"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { resolveAgentFlags } from "@/lib/agent/canvas-intent";
import { EnvioRechazado, TITULO_SIN_ACTUALIZAR } from "@/lib/agent/motivo-del-envio";
import { parseSseBuffer } from "@/lib/agent/sse";
import { useStreamTypewriter } from "@/lib/agent/use-stream-typewriter";
import type { AgentStatus } from "@/lib/agent/types";
import { usePrefersReducedMotion } from "@ai-coo/ui";
import {
  createBusinessStageAction,
  deleteAgentConversationAction,
  deleteBusinessStageAction,
  listAgentMessagesAction,
  listAgentWorkspaceAction,
} from "@/app/agent/actions";
import {
  correrMutacion,
  leerConMotivo,
  type Aviso,
  type Lectura,
} from "@/lib/client/correr-accion";
import type { MutationResult } from "@/lib/server/action-result";
import { useOptionalPageContext } from "@/providers/page-context-provider";
import { useToast } from "@/providers/toast-provider";
import { paths } from "@/routes/paths";
import type {
  AgentConversation,
  AgentFlags,
  AgentMessage,
  AgentWorkspaceData,
  BusinessStage,
} from "@/types/agent";

type SendMessageResult = {
  conversationId: string | null;
  openCanvas: boolean;
};

type AgentDataContextValue = {
  conversationId: string | null;
  filterStageId: string | null;
  workspace: AgentWorkspaceData;
  messages: AgentMessage[];
  /** Por qué no se pudieron leer los mensajes de la conversación (SCRUM-506). */
  motivoDeCarga: string | null;
  streamingMessageId: string | null;
  streamingDisplayedText: string;
  activeToolName: string | null;
  agentStatus: AgentStatus;
  isLoading: boolean;
  isSending: boolean;
  inputValue: string;
  setInputValue: (v: string) => void;
  refresh: () => Promise<void>;
  loadConversation: (conversationId: string | null) => Promise<void>;
  sendMessage: (
    content: string,
    opts?: { conversationId?: string | null; contextStageId?: string | null; flags?: AgentFlags }
  ) => Promise<SendMessageResult>;
  cancelSend: () => void;
  retryLastMessage: () => Promise<void>;
  /** `true` si la etapa se creó; si no, ya se avisó el motivo. */
  createStage: (input: { name: string; description?: string }) => Promise<boolean>;
  deleteConversation: (id: string) => Promise<void>;
  deleteStage: (id: string) => Promise<void>;
  startNewConversation: () => void;
};

const AgentDataCtx = createContext<AgentDataContextValue | null>(null);

/*
 * Las acciones del Agente devuelven sus errores esperables como valor
 * (SCRUM-506). Estas funciones son la parte del provider que las llama: se
 * exportan para probarlas sin montar el provider.
 */

/** Los mensajes de una conversación o el motivo para mostrar en el chat. */
export function leerMensajesDelAgente(
  conversationId: string
): Promise<Lectura<AgentMessage[]>> {
  return leerConMotivo(
    () => listAgentMessagesAction(conversationId),
    "[Agente] leer mensajes"
  );
}

/** Corre una mutación del Agente; con un error avisa el motivo. `true` si salió bien. */
async function mutacionDelAgente(opciones: {
  accion: () => Promise<MutationResult<unknown>>;
  avisar: (aviso: Aviso) => void;
  tituloError: string;
  etiqueta: string;
}): Promise<boolean> {
  let salioBien = false;
  await correrMutacion({
    ...opciones,
    alExito: () => {
      salioBien = true;
    },
  });
  return salioBien;
}

export function crearEtapaDelAgente(
  input: { name: string; description?: string },
  avisar: (aviso: Aviso) => void
): Promise<boolean> {
  return mutacionDelAgente({
    accion: () => createBusinessStageAction(input),
    avisar,
    tituloError: "No se pudo crear la etapa",
    etiqueta: "[Agente] crear etapa",
  });
}

export function eliminarConversacionDelAgente(
  id: string,
  avisar: (aviso: Aviso) => void
): Promise<boolean> {
  return mutacionDelAgente({
    accion: () => deleteAgentConversationAction(id),
    avisar,
    tituloError: "No se pudo eliminar la conversación",
    etiqueta: "[Agente] eliminar conversación",
  });
}

export function eliminarEtapaDelAgente(
  id: string,
  avisar: (aviso: Aviso) => void
): Promise<boolean> {
  return mutacionDelAgente({
    accion: () => deleteBusinessStageAction(id),
    avisar,
    tituloError: "No se pudo eliminar la etapa",
    etiqueta: "[Agente] eliminar etapa",
  });
}

function buildOptimisticAssistantMessage(
  id: string,
  conversationId: string | null
): AgentMessage {
  return {
    id,
    conversationId: conversationId ?? "pending",
    organizationId: "",
    role: "assistant",
    content: "",
    attachments: null,
    actionType: null,
    actionRefId: null,
    thinkingContent: null,
    canvasContent: null,
    graphProposals: null,
    createdAt: new Date().toISOString(),
  };
}

function buildOptimisticUserMessage(
  content: string,
  conversationId: string | null
): AgentMessage {
  return {
    id: `optimistic-${crypto.randomUUID()}`,
    conversationId: conversationId ?? "pending",
    organizationId: "",
    role: "user",
    content,
    attachments: null,
    actionType: null,
    actionRefId: null,
    thinkingContent: null,
    canvasContent: null,
    graphProposals: null,
    createdAt: new Date().toISOString(),
  };
}

export function AgentDataProvider({
  children,
  conversationId,
  filterStageId,
}: {
  children: ReactNode;
  conversationId?: string | null;
  filterStageId?: string | null;
}) {
  const router = useRouter();
  const { push } = useToast();
  const reducedMotion = usePrefersReducedMotion();
  const pageContext = useOptionalPageContext()?.pageContext ?? null;
  const resolvedConversationId = conversationId ?? null;
  const resolvedFilterStageId = filterStageId ?? null;

  const skipLoadForConversationRef = useRef<string | null>(null);
  const initialLoadDoneRef = useRef(false);
  const isSendingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastSendRef = useRef<{ content: string; flags?: AgentFlags; conversationId: string | null } | null>(null);
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const streamTypewriter = useStreamTypewriter({ instant: reducedMotion });
  const {
    displayedText: streamingDisplayedText,
    start: startStreamTypewriter,
    appendBuffer: appendStreamBuffer,
    markStreamEnded: markStreamEnded,
    waitForCatchUp: waitForStreamCatchUp,
    snapToBuffer: snapStreamToBuffer,
    reset: resetStreamTypewriter,
    getTextSnapshot,
  } = streamTypewriter;

  const [workspace, setWorkspace] = useState<AgentWorkspaceData>({
    stages: [],
    conversations: [],
  });
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [motivoDeCarga, setMotivoDeCarga] = useState<string | null>(null);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [activeToolName, setActiveToolName] = useState<string | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>("idle");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const clearCompleteTimer = useCallback(() => {
    if (completeTimerRef.current) {
      clearTimeout(completeTimerRef.current);
      completeTimerRef.current = null;
    }
  }, []);

  const refresh = useCallback(async () => {
    const data = await listAgentWorkspaceAction();
    setWorkspace(data);
  }, []);

  const loadConversation = useCallback(async (id: string | null) => {
    if (!id) {
      setMessages([]);
      setMotivoDeCarga(null);
      setStreamingMessageId(null);
      setActiveToolName(null);
      return;
    }
    const lectura = await leerMensajesDelAgente(id);
    if (lectura.ok) {
      setMessages(lectura.data);
      setMotivoDeCarga(null);
    } else {
      setMessages([]);
      setMotivoDeCarga(lectura.motivo);
    }
    setStreamingMessageId(null);
    setActiveToolName(null);
  }, []);

  useEffect(() => {
    const skipId = skipLoadForConversationRef.current;
    if (skipId && skipId === resolvedConversationId) {
      skipLoadForConversationRef.current = null;
      return;
    }

    let cancelled = false;
    (async () => {
      if (!initialLoadDoneRef.current) {
        setIsLoading(true);
      }
      await refresh();
      if (resolvedConversationId) {
        await loadConversation(resolvedConversationId);
      } else if (!isSendingRef.current) {
        setMessages([]);
        // Sin conversación no queda el motivo de una carga anterior (SCRUM-506).
        setMotivoDeCarga(null);
      }
      if (!cancelled) {
        setIsLoading(false);
        initialLoadDoneRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resolvedConversationId, refresh, loadConversation]);

  const cancelSend = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    isSendingRef.current = false;
    setIsSending(false);
    setStreamingMessageId(null);
    resetStreamTypewriter();
    setActiveToolName(null);
    setAgentStatus("cancelled");
    clearCompleteTimer();
    setTimeout(() => setAgentStatus("idle"), 1200);
  }, [clearCompleteTimer, resetStreamTypewriter]);

  const markComplete = useCallback(() => {
    setAgentStatus("complete");
    clearCompleteTimer();
    completeTimerRef.current = setTimeout(() => {
      setAgentStatus("idle");
      completeTimerRef.current = null;
    }, 1000);
  }, [clearCompleteTimer]);

  const sendMessage = useCallback(
    async (
      content: string,
      opts?: { conversationId?: string | null; contextStageId?: string | null; flags?: AgentFlags }
    ): Promise<SendMessageResult> => {
      const trimmed = content.trim();
      if (!trimmed) return { conversationId: null, openCanvas: false };

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const targetConversationId =
        opts?.conversationId ?? resolvedConversationId ?? null;

      const flags = resolveAgentFlags(trimmed, opts?.flags);
      lastSendRef.current = { content: trimmed, flags, conversationId: targetConversationId };

      setInputValue("");
      setMessages((prev) => [
        ...prev,
        buildOptimisticUserMessage(trimmed, targetConversationId),
      ]);
      setIsSending(true);
      isSendingRef.current = true;
      setStreamingMessageId(null);
      setActiveToolName(null);
      setAgentStatus("thinking");
      clearCompleteTimer();
      startStreamTypewriter();

      const streamingId = `streaming-${crypto.randomUUID()}`;
      let receivedDelta = false;
      let receivedDone = false;
      let resultConversationId: string | null = targetConversationId;
      let openCanvas = false;

      try {
        const res = await fetch("/api/agent/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            conversationId: targetConversationId,
            content: trimmed,
            contextStageId: opts?.contextStageId ?? resolvedFilterStageId ?? null,
            pageContext,
            flags,
          }),
        });

        if (controller.signal.aborted) {
          return { conversationId: null, openCanvas: false };
        }

        const reader = res.body?.getReader();
        if (!reader) {
          throw new Error("Stream no disponible");
        }

        const decoder = new TextDecoder();
        let buffer = "";
        let streamError: string | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (controller.signal.aborted) {
            await reader.cancel();
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const parsed = parseSseBuffer(buffer);
          buffer = parsed.rest;

          for (const evt of parsed.events) {
            if (evt.event === "delta" && evt.data.type === "text") {
              const chunk = String(evt.data.content ?? "");
              if (!chunk) continue;

              if (!receivedDelta) {
                receivedDelta = true;
                setAgentStatus("generating");
                setStreamingMessageId(streamingId);
                setMessages((prev) => [
                  ...prev,
                  buildOptimisticAssistantMessage(streamingId, resultConversationId),
                ]);
              }

              appendStreamBuffer(chunk);
            }

            if (evt.event === "tool_start") {
              const toolName = String(evt.data.toolName ?? "");
              if (toolName) setActiveToolName(toolName);

              if (!receivedDelta) {
                receivedDelta = true;
                setAgentStatus("generating");
                setStreamingMessageId(streamingId);
                setMessages((prev) => {
                  if (prev.some((message) => message.id === streamingId)) return prev;
                  return [
                    ...prev,
                    buildOptimisticAssistantMessage(streamingId, resultConversationId),
                  ];
                });
              }
            }

            if (evt.event === "tool_end") {
              setActiveToolName(null);
            }

            if (evt.event === "done") {
              receivedDone = true;
              resultConversationId = String(evt.data.conversationId ?? resultConversationId);
              openCanvas = Boolean(evt.data.openCanvas);
            }

            if (evt.event === "error") {
              streamError = String(evt.data.message ?? "Error al enviar");
            }
          }
        }

        if (streamError) {
          // La ruta manda un texto para el usuario (el motivo o un texto fijo,
          // nunca el técnico): se muestra tal cual (SCRUM-506).
          throw new EnvioRechazado(streamError);
        }

        if (!receivedDone) {
          markStreamEnded();
          await waitForStreamCatchUp();
          snapStreamToBuffer();

          if (receivedDelta) {
            const { buffered } = getTextSnapshot();
            setMessages((prev) =>
              prev.map((message) =>
                message.id === streamingId
                  ? { ...message, content: buffered || message.content }
                  : message
              )
            );
            setStreamingMessageId(null);
            resetStreamTypewriter();
            setActiveToolName(null);
            markComplete();
            void refresh();
            return {
              conversationId: resultConversationId ?? targetConversationId,
              openCanvas: false,
            };
          }

          if (!res.ok) {
            throw new Error("Error al enviar");
          }
          throw new Error("Stream terminó sin respuesta completa");
        }

        if (!res.ok && !receivedDelta) {
          throw new Error("Error al enviar");
        }

        if (!resultConversationId) {
          throw new Error("Respuesta inválida del agente");
        }

        markStreamEnded();
        await waitForStreamCatchUp();
        snapStreamToBuffer();

        const lecturaFinal = await leerMensajesDelAgente(resultConversationId);
        if (lecturaFinal.ok) {
          setMessages(lecturaFinal.data);
        } else {
          // El envío salió y la respuesta está guardada: no se saca de la vista
          // ni se dice "No se pudo enviar" (el usuario reintentaría y se
          // enviaría y cobraría dos veces). Queda lo que llegó por el stream.
          const { buffered } = getTextSnapshot();
          setMessages((prev) =>
            prev.map((message) =>
              message.id === streamingId
                ? { ...message, content: buffered || message.content }
                : message
            )
          );
          push({ title: TITULO_SIN_ACTUALIZAR, description: lecturaFinal.motivo, variant: "default" });
        }
        setStreamingMessageId(null);
        resetStreamTypewriter();
        setActiveToolName(null);
        markComplete();

        const navigatedAway =
          !resolvedConversationId ||
          resolvedConversationId !== resultConversationId;

        if (navigatedAway) {
          skipLoadForConversationRef.current = resultConversationId;
          router.replace(paths.platform.agent.conversation(resultConversationId), {
            scroll: false,
          });
        }

        void refresh();
        return {
          conversationId: resultConversationId,
          openCanvas,
        };
      } catch (error) {
        if (controller.signal.aborted) {
          setStreamingMessageId(null);
          resetStreamTypewriter();
          setActiveToolName(null);
          setAgentStatus("cancelled");
          setTimeout(() => setAgentStatus("idle"), 1200);
          return { conversationId: null, openCanvas: false };
        }

        setMessages((prev) =>
          prev.filter(
            (message) =>
              !message.id.startsWith("optimistic-") &&
              !message.id.startsWith("streaming-")
          )
        );
        setStreamingMessageId(null);
        resetStreamTypewriter();
        setActiveToolName(null);
        setAgentStatus("error");
        throw error;
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        isSendingRef.current = false;
        setIsSending(false);
      }
    },
    [
      resolvedConversationId,
      resolvedFilterStageId,
      pageContext,
      push,
      refresh,
      router,
      clearCompleteTimer,
      markComplete,
      startStreamTypewriter,
      appendStreamBuffer,
      markStreamEnded,
      waitForStreamCatchUp,
      snapStreamToBuffer,
      resetStreamTypewriter,
      getTextSnapshot,
    ]
  );

  const retryLastMessage = useCallback(async () => {
    const last = lastSendRef.current;
    if (!last) return;
    setAgentStatus("idle");
    await sendMessage(last.content, {
      conversationId: last.conversationId,
      flags: last.flags,
    });
  }, [sendMessage]);

  const createStage = useCallback(
    async (input: { name: string; description?: string }) => {
      const creada = await crearEtapaDelAgente(input, push);
      if (!creada) return false;
      await refresh();
      router.refresh();
      return true;
    },
    [push, refresh, router]
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      if (!(await eliminarConversacionDelAgente(id, push))) return;
      await refresh();
      if (resolvedConversationId === id) {
        router.push(
          resolvedFilterStageId
            ? paths.platform.agent.stage(resolvedFilterStageId)
            : paths.platform.agent.root
        );
      }
    },
    [push, resolvedConversationId, resolvedFilterStageId, refresh, router]
  );

  const deleteStage = useCallback(
    async (id: string) => {
      if (!(await eliminarEtapaDelAgente(id, push))) return;
      await refresh();
      router.refresh();
      if (resolvedFilterStageId === id) {
        router.push(paths.platform.agent.root);
      }
    },
    [push, resolvedFilterStageId, refresh, router]
  );

  const startNewConversation = useCallback(() => {
    skipLoadForConversationRef.current = null;
    router.push(
      resolvedFilterStageId
        ? paths.platform.agent.stage(resolvedFilterStageId)
        : paths.platform.agent.root
    );
    setMessages([]);
    setMotivoDeCarga(null);
    setStreamingMessageId(null);
    setActiveToolName(null);
    setAgentStatus("idle");
  }, [resolvedFilterStageId, router]);

  useEffect(() => () => clearCompleteTimer(), [clearCompleteTimer]);

  const value = useMemo(
    () => ({
      conversationId: resolvedConversationId,
      filterStageId: resolvedFilterStageId,
      workspace,
      messages,
      motivoDeCarga,
      streamingMessageId,
      streamingDisplayedText: streamingDisplayedText,
      activeToolName,
      agentStatus,
      isLoading,
      isSending,
      inputValue,
      setInputValue,
      refresh,
      loadConversation,
      sendMessage,
      cancelSend,
      retryLastMessage,
      createStage,
      deleteConversation,
      deleteStage,
      startNewConversation,
    }),
    [
      resolvedConversationId,
      resolvedFilterStageId,
      workspace,
      messages,
      motivoDeCarga,
      streamingMessageId,
      streamingDisplayedText,
      activeToolName,
      agentStatus,
      isLoading,
      isSending,
      inputValue,
      refresh,
      loadConversation,
      sendMessage,
      cancelSend,
      retryLastMessage,
      createStage,
      deleteConversation,
      deleteStage,
      startNewConversation,
    ]
  );

  return (
    <AgentDataCtx.Provider value={value}>{children}</AgentDataCtx.Provider>
  );
}

export function useAgentData() {
  const ctx = useContext(AgentDataCtx);
  if (!ctx) {
    throw new Error("useAgentData must be used within AgentDataProvider");
  }
  return ctx;
}

export type { AgentConversation, AgentFlags, BusinessStage };
