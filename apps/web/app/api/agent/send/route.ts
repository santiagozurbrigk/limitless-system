import * as Sentry from "@sentry/nextjs";
import { streamAgentMessage } from "@/lib/agent/stream-agent-message";
import { createSseEmitter, formatSseEvent } from "@/lib/agent/sse";
import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { AGENT_ERROR_REPLY, FallaYaRegistrada } from "@/lib/agent/errores-del-agente";
import { esErrorEsperable } from "@/lib/server/error-esperable";
import type { AgentFlags } from "@/types/agent";
import type { PageContextState } from "@/lib/agent/page-context";

export const runtime = "nodejs";
export const maxDuration = 300;

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
};

export async function POST(req: Request) {
  // Auth gate — must happen before the stream is created
  let organizationId: string;
  try {
    organizationId = await requireOrganizationId();
  } catch (error) {
    // Sin sesión o cuenta desactivada: rechazo esperable, sin Sentry. Una falla
    // al resolver la organización se reporta y no se toma por "no autenticado".
    if (!esErrorEsperable(error)) {
      Sentry.captureException(error, {
        tags: { feature: "agent", route: "api/agent/send" },
      });
      return new Response(formatSseEvent("error", { message: AGENT_ERROR_REPLY }), {
        status: 500,
        headers: SSE_HEADERS,
      });
    }
    return new Response(formatSseEvent("error", { message: "No autenticado" }), {
      status: 401,
      headers: SSE_HEADERS,
    });
  }

  if (req.signal.aborted) {
    return new Response(formatSseEvent("error", { message: "Cancelled" }), {
      status: 499,
      headers: SSE_HEADERS,
    });
  }

  let body: {
    conversationId?: string | null;
    content: string;
    contextStageId?: string | null;
    pageContext?: PageContextState | null;
    flags?: AgentFlags;
  };

  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new Response(formatSseEvent("error", { message: "JSON inválido" }), {
      status: 400,
      headers: SSE_HEADERS,
    });
  }

  if (!body.content?.trim()) {
    return new Response(formatSseEvent("error", { message: "Mensaje vacío" }), {
      status: 400,
      headers: SSE_HEADERS,
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const enqueue = (chunk: string) => {
        if (req.signal.aborted) return;
        controller.enqueue(encoder.encode(chunk));
      };
      const emitter = createSseEmitter(enqueue);

      void streamAgentMessage({
        conversationId: body.conversationId,
        content: body.content,
        contextStageId: body.contextStageId,
        pageContext: body.pageContext ?? null,
        flags: body.flags,
        emitter,
        signal: req.signal,
      })
        .then(() => {
          if (!req.signal.aborted) {
            controller.close();
          }
        })
        .catch((error) => {
          if (req.signal.aborted) {
            emitter.emit("error", { message: "Cancelled" });
          } else if (esErrorEsperable(error)) {
            // Rechazo esperable (SCRUM-506): su motivo, sin Sentry.
            emitter.emit("error", { message: error.message });
          } else {
            // Falla: a Sentry (salvo que ya la haya registrado una acción) y un
            // texto fijo; nunca el texto de la base ni de Anthropic.
            if (!(error instanceof FallaYaRegistrada)) {
              Sentry.captureException(error, {
                tags: { feature: "agent", route: "api/agent/send" },
                extra: { organizationId, conversationId: body.conversationId },
              });
            }
            emitter.emit("error", { message: AGENT_ERROR_REPLY });
          }
          controller.close();
        });
    },
    cancel() {
      // Client disconnected
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
