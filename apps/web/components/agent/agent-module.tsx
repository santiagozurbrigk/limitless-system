"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Edit3, Layers, Sparkles } from "lucide-react";
import { PromptInputBox } from "@/components/ui/ai-prompt-box";
import { useAgentData } from "@/providers/agent-data-provider";
import { useToast } from "@/providers/toast-provider";
import { detectCanvasIntent } from "@/lib/agent/canvas-intent";
import { isAgentBusy } from "@/lib/agent/types";
import { AgentEmptyState } from "./agent-empty-state";
import { ChatMessage } from "./chat-message";
import { CanvasPanel } from "./canvas-panel";
import { GraphCanvasPanel } from "./graph-canvas-panel";
import { AgentStatusIndicator } from "./agent-status-indicator";
import type { GraphProposal } from "@/types/agent";

type CanvasVersion = { id: string; content: string; timestamp: string };

/**
 * Qué muestra el área del chat (SCRUM-506): si no se pudieron leer los
 * mensajes de la conversación, el motivo, no la pantalla vacía con
 * sugerencias como si no hubiera mensajes.
 */
export function queMostrarEnElChat(estado: {
  isLoading: boolean;
  cantidadDeMensajes: number;
  motivoDeCarga: string | null;
  agenteOcupado: boolean;
}): "cargando" | "motivo" | "vacio" | "mensajes" {
  if (estado.isLoading && estado.cantidadDeMensajes === 0) return "cargando";
  if (estado.motivoDeCarga && estado.cantidadDeMensajes === 0) return "motivo";
  if (!estado.isLoading && estado.cantidadDeMensajes === 0 && !estado.agenteOcupado) {
    return "vacio";
  }
  return "mensajes";
}

export function MotivoDeCargaDelChat({ motivo }: { motivo: string }) {
  return (
    <div role="alert" className="text-sm text-muted-foreground">
      <p className="font-medium text-foreground">No se pudo cargar la conversación</p>
      <p>{motivo}</p>
    </div>
  );
}

export function AgentModule() {
  const {
    conversationId,
    filterStageId,
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
    setInputValue,
    sendMessage,
    cancelSend,
    retryLastMessage,
  } = useAgentData();

  const { push } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [canvasVersions, setCanvasVersions] = useState<CanvasVersion[]>([]);
  const [showCanvas, setShowCanvas] = useState(false);
  const [canvasPending, setCanvasPending] = useState(false);

  const pendingProposals = useMemo<GraphProposal[]>(() => {
    return messages.flatMap((m) =>
      m.graphProposals?.filter((p) => p.status === "pending") ?? []
    );
  }, [messages]);

  const showGraphCanvas =
    showCanvas && pendingProposals.length > 0 && conversationId != null;

  const conversation = useMemo(
    () => workspace.conversations.find((c) => c.id === conversationId) ?? null,
    [workspace.conversations, conversationId]
  );

  const currentStage = useMemo(() => {
    if (!filterStageId) return null;
    return workspace.stages.find((s) => s.id === filterStageId) ?? null;
  }, [workspace.stages, filterStageId]);

  useEffect(() => {
    let hasPendingProposals = false;
    for (const msg of messages) {
      if (msg.role === "assistant" && msg.canvasContent) {
        setCanvasVersions((prev) => {
          const alreadyExists = prev.some((v) => v.id === msg.id);
          if (alreadyExists) return prev;
          return [
            ...prev,
            { id: msg.id, content: msg.canvasContent!, timestamp: msg.createdAt },
          ];
        });
        setShowCanvas(true);
        setCanvasPending(false);
      }
      if (msg.graphProposals?.some((p) => p.status === "pending")) {
        hasPendingProposals = true;
      }
    }
    if (hasPendingProposals) {
      setShowCanvas(true);
    }
  }, [messages]);

  useEffect(() => {
    if (!isSending && canvasPending && canvasVersions.length === 0) {
      setCanvasPending(false);
    }
  }, [isSending, canvasPending, canvasVersions.length]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isSending, agentStatus]);

  const placeholder = currentStage
    ? `Preguntale sobre "${currentStage.name}"...`
    : "Preguntale algo a tu agente...";

  const contenidoDelChat = queMostrarEnElChat({
    isLoading,
    cantidadDeMensajes: messages.length,
    motivoDeCarga,
    agenteOcupado: isAgentBusy(agentStatus),
  });

  const inputDisabled = isAgentBusy(agentStatus);

  return (
    <div data-tour="agent-module" className="flex min-h-0 flex-1">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-transparent px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-brand-500/30 bg-brand-600/15">
              <Sparkles className="h-4 w-4 text-brand-500 dark:text-brand-400" />
            </div>
            {currentStage ? (
              <div className="flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-blue-400" />
                <span className="text-xs text-blue-400/70">{currentStage.name}</span>
              </div>
            ) : null}
            <h2 className="truncate text-sm font-medium text-foreground">
              {conversation?.title || "Nueva conversación"}
            </h2>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Editar título"
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto bg-transparent px-6 py-4">
          {contenidoDelChat === "cargando" ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : contenidoDelChat === "motivo" && motivoDeCarga ? (
            <MotivoDeCargaDelChat motivo={motivoDeCarga} />
          ) : contenidoDelChat === "vacio" ? (
            <AgentEmptyState onSuggestion={setInputValue} />
          ) : (
            messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                role={msg.role}
                content={
                  msg.id === streamingMessageId ? streamingDisplayedText : msg.content
                }
                actionType={msg.actionType}
                actionRefId={msg.actionRefId}
                isLiveStreaming={msg.id === streamingMessageId}
                cancelled={
                  agentStatus === "cancelled" && msg.id === streamingMessageId
                }
                thinkingContent={msg.thinkingContent}
                attachments={msg.attachments}
                graphProposals={msg.graphProposals}
              />
            ))
          )}

          <AgentStatusIndicator
            status={agentStatus}
            activeToolName={activeToolName}
            onRetry={() => void retryLastMessage()}
          />
        </div>

        <div
          className="shrink-0 border-t border-border px-6 py-4"
          style={{ opacity: inputDisabled ? 0.5 : 1 }}
        >
          <PromptInputBox
            value={inputValue}
            onValueChange={setInputValue}
            agentStatus={agentStatus}
            onCancel={cancelSend}
            onSend={(msg, _files, flags) => {
              const willUseCanvas = Boolean(
                flags?.useCanvas || detectCanvasIntent(msg)
              );
              if (willUseCanvas) {
                setShowCanvas(true);
                setCanvasPending(true);
              }
              void (async () => {
                try {
                  const result = await sendMessage(msg, {
                    conversationId,
                    contextStageId: filterStageId,
                    flags,
                  });

                  if (result.openCanvas) {
                    setShowCanvas(true);
                    setCanvasPending(true);
                  }
                } catch {
                  push({
                    title: "No se pudo enviar el mensaje",
                    description:
                      "Revisá tu conexión o la API de Claude e intentá de nuevo.",
                    variant: "default",
                  });
                }
              })();
            }}
            isLoading={isSending}
            inputDisabled={inputDisabled}
            placeholder={placeholder}
          />
        </div>
      </div>

      {showGraphCanvas && conversationId ? (
        <div className="w-[480px] shrink-0">
          <GraphCanvasPanel
            conversationId={conversationId}
            pendingProposals={pendingProposals}
            onClose={() => setShowCanvas(false)}
          />
        </div>
      ) : showCanvas && (canvasVersions.length > 0 || canvasPending) ? (
        <div className="w-[420px] shrink-0">
          <CanvasPanel
            versions={canvasVersions}
            isLoading={canvasPending && canvasVersions.length === 0}
            onClose={() => {
              setShowCanvas(false);
              setCanvasPending(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
