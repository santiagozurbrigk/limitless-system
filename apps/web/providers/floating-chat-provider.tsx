"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { sendAgentMessageAction } from "@/app/agent/actions";
import { leerConMotivo } from "@/lib/client/correr-accion";
import { useOptionalPageContext } from "@/providers/page-context-provider";

export type AgentChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

type FloatingChatContextValue = {
  isOpen: boolean;
  isMinimized: boolean;
  isExpanding: boolean;
  inputValue: string;
  messages: AgentChatMessage[];
  isLoading: boolean;
  hasNewMessage: boolean;
  open: () => void;
  close: () => void;
  minimize: () => void;
  toggle: () => void;
  setInputValue: (v: string) => void;
  setIsExpanding: (v: boolean) => void;
  sendFromFloating: (message: string) => void;
  sendFromAgent: (message: string) => Promise<void>;
  applySuggestion: (text: string) => void;
  markMessagesRead: () => void;
  needsAgentReply: boolean;
  clearNeedsAgentReply: () => void;
  runAgentReply: () => Promise<void>;
  pendingConversationId: string | null;
  clearPendingConversationId: () => void;
};

const FloatingChatCtx = createContext<FloatingChatContextValue | null>(null);

function newId() {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Envía un mensaje al agente (SCRUM-506). La acción devuelve su error como
 * valor: el motivo (sin clave de Claude, límite de pedidos, el texto de
 * siempre del agente ante una falla) llega a `alFallar` para mostrarlo como
 * respuesta. Si la acción lanza (en producción el cliente sólo recibe un
 * digest), se registra en la consola y el motivo es el texto fijo.
 */
export async function enviarAlAgente(
  input: Parameters<typeof sendAgentMessageAction>[0],
  etiqueta: string,
  alResponder: (conversationId: string) => void,
  alFallar: (motivo: string) => void
): Promise<void> {
  const resultado = await leerConMotivo(() => sendAgentMessageAction(input), etiqueta);
  if (resultado.ok) alResponder(resultado.data.conversationId);
  else alFallar(resultado.motivo);
}

export function FloatingChatProvider({ children }: { children: ReactNode }) {
  const { pageContext } = useOptionalPageContext() ?? { pageContext: null };
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isExpanding, setIsExpanding] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const [needsAgentReply, setNeedsAgentReply] = useState(false);
  const [pendingConversationId, setPendingConversationId] = useState<string | null>(null);

  const open = useCallback(() => {
    setIsOpen(true);
    setIsMinimized(false);
  }, []);
  const close = useCallback(() => {
    setIsOpen(false);
    setIsMinimized(false);
  }, []);
  const minimize = useCallback(() => setIsMinimized(true), []);
  const toggle = useCallback(() => {
    setIsOpen((open) => {
      if (!open) {
        setIsMinimized(false);
        return true;
      }
      setIsMinimized((min) => !min);
      return true;
    });
  }, []);
  const markMessagesRead = useCallback(() => setHasNewMessage(false), []);

  const appendUserMessage = useCallback((content: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: newId(),
        role: "user",
        content,
        timestamp: new Date().toISOString(),
      },
    ]);
  }, []);

  const appendAssistantMessage = useCallback((content: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: newId(),
        role: "assistant",
        content,
        timestamp: new Date().toISOString(),
      },
    ]);
    setHasNewMessage(true);
  }, []);

  const simulateReply = useCallback(async () => {
    setIsLoading(true);
    try {
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      if (!lastUser?.content.trim()) return;
      await enviarAlAgente(
        { content: lastUser.content, pageContext },
        "[simulateReply]",
        () => {},
        (motivo) => {
          appendAssistantMessage(motivo);
          setHasNewMessage(true);
        }
      );
    } finally {
      setIsLoading(false);
    }
  }, [appendAssistantMessage, messages, pageContext]);

  const clearNeedsAgentReply = useCallback(() => setNeedsAgentReply(false), []);

  const clearPendingConversationId = useCallback(
    () => setPendingConversationId(null),
    []
  );

  const sendFromFloating = useCallback(
    async (message: string) => {
      const trimmed = message.trim();
      if (!trimmed) return;
      setInputValue("");
      setIsOpen(false);
      setIsMinimized(false);
      setIsExpanding(true);
      setPendingConversationId(null);
      await enviarAlAgente(
        { content: trimmed, pageContext },
        "[sendFromFloating]",
        (conversationId) => setPendingConversationId(conversationId),
        (motivo) => {
          setIsExpanding(false);
          appendUserMessage(trimmed);
          appendAssistantMessage(motivo);
          setHasNewMessage(true);
        }
      );
    },
    [appendUserMessage, appendAssistantMessage, pageContext]
  );

  const sendFromAgent = useCallback(
    async (message: string) => {
      const trimmed = message.trim();
      if (!trimmed || isLoading) return;
      appendUserMessage(trimmed);
      setInputValue("");
      await simulateReply();
    },
    [appendUserMessage, isLoading, simulateReply]
  );

  const applySuggestion = useCallback((text: string) => {
    setInputValue(text);
  }, []);

  const value = useMemo(
    () => ({
      isOpen,
      isMinimized,
      isExpanding,
      inputValue,
      messages,
      isLoading,
      hasNewMessage,
      open,
      close,
      minimize,
      toggle,
      setInputValue,
      setIsExpanding,
      sendFromFloating,
      sendFromAgent,
      applySuggestion,
      markMessagesRead,
      needsAgentReply,
      clearNeedsAgentReply,
      runAgentReply: simulateReply,
      pendingConversationId,
      clearPendingConversationId,
    }),
    [
      isOpen,
      isMinimized,
      isExpanding,
      inputValue,
      messages,
      isLoading,
      hasNewMessage,
      open,
      close,
      minimize,
      toggle,
      sendFromFloating,
      sendFromAgent,
      applySuggestion,
      markMessagesRead,
      needsAgentReply,
      clearNeedsAgentReply,
      simulateReply,
      pendingConversationId,
      clearPendingConversationId,
    ]
  );

  return (
    <FloatingChatCtx.Provider value={value}>{children}</FloatingChatCtx.Provider>
  );
}

export function useFloatingChat() {
  const ctx = useContext(FloatingChatCtx);
  if (!ctx) {
    throw new Error("useFloatingChat must be used within FloatingChatProvider");
  }
  return ctx;
}
