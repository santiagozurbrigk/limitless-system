import Anthropic from "@anthropic-ai/sdk";
import {
  esClaveRechazada,
  getModelForTask,
  registrarFallaDeClave,
  type AITask,
  type ClaudeModel,
} from "@/lib/ai/anthropic";
import { mapAnthropicCallError } from "@/lib/ai/anthropic-errors";
import {
  AI_KEY_REJECTED_MESSAGE,
  NO_AI_CREDENTIALS_MESSAGE,
} from "@/lib/ai/anthropic-auth-errors";
import { resolveCredentialForOrg } from "@/lib/ai/credential-resolver";
import { trackTokenUsage } from "@/lib/track-token-usage";
import {
  resolveAgentMaxTokens,
  resolveAgentThinkingBudget,
} from "@/lib/agent/max-tokens";
import type { AgentSseEmitter } from "@/lib/agent/sse";

const PROMPT_CACHING_BETA = "prompt-caching-2024-07-31";

const API_MODEL_ALIASES: Record<string, string> = {
  "claude-sonnet-4-6": "claude-sonnet-4-5-20250929",
};

const LEGACY_MODEL_MAP: Record<string, string> = {
  "claude-haiku-4-5": "claude-haiku-4-5-20251001",
  "claude-sonnet-4-5": "claude-sonnet-4-5-20250929",
  "claude-sonnet-4-6": "claude-sonnet-4-6",
};

type CachedSystemBlock = {
  type: "text";
  text: string;
  cache_control: { type: "ephemeral" };
};

type SystemBlock = CachedSystemBlock | { type: "text"; text: string };

function resolveLogicalModel(opts: {
  task?: AITask;
  model?: ClaudeModel | string;
}): string {
  if (opts.model) {
    if (opts.model in LEGACY_MODEL_MAP) {
      return LEGACY_MODEL_MAP[opts.model]!;
    }
    return opts.model;
  }
  if (opts.task) return getModelForTask(opts.task);
  return getModelForTask("agent_simple");
}

function resolveApiModelId(logicalModel: string): string {
  return API_MODEL_ALIASES[logicalModel] ?? logicalModel;
}

function buildSystemParam(
  cachedSystemPrompt?: string,
  system?: string
): string | SystemBlock[] | undefined {
  if (cachedSystemPrompt?.trim()) {
    const blocks: SystemBlock[] = [
      {
        type: "text",
        text: cachedSystemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ];
    if (system?.trim()) {
      blocks.push({ type: "text", text: system });
    }
    return blocks;
  }
  return system;
}

async function trackUsage(
  organizationId: string,
  logicalModel: string,
  feature: string,
  usage: Anthropic.Usage
) {
  await trackTokenUsage({
    organizationId,
    model: logicalModel,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
    feature,
  }).catch(() => {});
}

export type StreamClaudeAgentRequest = {
  organizationId: string;
  task?: AITask;
  model?: ClaudeModel | string;
  feature: string;
  system?: string;
  cachedSystemPrompt?: string;
  messages: { role: "user" | "assistant"; content: string }[];
  maxTokens?: number;
  enableWebSearch?: boolean;
  enableThinking?: boolean;
  useCanvas?: boolean;
  thinkingBudget?: number;
  tools?: Anthropic.Tool[];
  onToolCall?: (name: string, input: Record<string, unknown>) => Promise<string>;
  emitter: AgentSseEmitter;
  signal?: AbortSignal;
};

export type StreamClaudeAgentResult = {
  text: string;
  thinkingContent: string | null;
};

const MAX_AGENT_ITERATIONS = 4;

function extractThinkingContent(message: Anthropic.Message): string | null {
  const thinkingBlocks = message.content.filter((b) => b.type === "thinking");
  if (thinkingBlocks.length === 0) return null;
  return JSON.stringify(
    thinkingBlocks.map((b) =>
      b.type === "thinking"
        ? { text: (b as { type: "thinking"; thinking: string }).thinking }
        : {}
    )
  );
}

function extractAllText(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function getToolUseBlocks(message: Anthropic.Message): Anthropic.ToolUseBlock[] {
  return message.content.filter(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
  );
}

async function runStreamTurn(
  client: Anthropic,
  params: {
    apiModel: string;
    maxTokens: number;
    systemParam: string | SystemBlock[] | undefined;
    messages: Anthropic.MessageParam[];
    tools: Anthropic.Tool[];
    enableThinking: boolean;
    thinkingBudget: number;
    usePromptCaching: boolean;
    emitter: AgentSseEmitter;
    onTextDelta: (chunk: string) => void;
    signal?: AbortSignal;
  }
): Promise<Anthropic.Message> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requestBase: Record<string, any> = {
    model: params.apiModel,
    max_tokens: params.maxTokens,
    messages: params.messages,
    ...(params.systemParam !== undefined && { system: params.systemParam }),
    ...(params.tools.length > 0 && { tools: params.tools }),
    ...(params.enableThinking && {
      thinking: { type: "enabled", budget_tokens: params.thinkingBudget },
    }),
  };

  if (params.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const stream = params.usePromptCaching
    ? client.beta.messages.stream({
        ...requestBase,
        betas: [PROMPT_CACHING_BETA],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
    : client.messages.stream(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        requestBase as any
      );

  stream.on("text", (textDelta) => {
    if (!textDelta) return;
    params.onTextDelta(textDelta);
    params.emitter.emit("delta", { type: "text", content: textDelta });
  });

  if (params.signal) {
    const onAbort = () => stream.abort();
    params.signal.addEventListener("abort", onAbort, { once: true });
    try {
      return await stream.finalMessage();
    } finally {
      params.signal.removeEventListener("abort", onAbort);
    }
  }

  return stream.finalMessage();
}

export async function streamClaudeAgent(
  req: StreamClaudeAgentRequest
): Promise<StreamClaudeAgentResult | null> {
  const logicalModel = resolveLogicalModel(req);
  const apiModel = resolveApiModelId(logicalModel);
  const maxTokens =
    req.maxTokens ??
    resolveAgentMaxTokens({
      enableThinking: req.enableThinking,
      useCanvas: req.useCanvas,
    });
  const thinkingBudget =
    req.thinkingBudget ?? resolveAgentThinkingBudget(req.enableThinking);

  const resolution = await resolveCredentialForOrg(req.organizationId);
  // Sin clave propia, no hay IA (SCRUM-7): el usuario ve por qué y qué hacer,
  // en vez del genérico "No pudimos generar la respuesta".
  if (!resolution.client || resolution.source === "none") {
    throw new Error(NO_AI_CREDENTIALS_MESSAGE);
  }

  try {
    const client = resolution.client;
    const systemParam = buildSystemParam(req.cachedSystemPrompt, req.system);
    const usePromptCaching = Boolean(req.cachedSystemPrompt?.trim());

    const tools: Anthropic.Tool[] = [...(req.tools ?? [])];
    if (req.enableWebSearch) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools.push({ type: "web_search_20260209", name: "web_search" } as any);
    }

    const messages: Anthropic.MessageParam[] = req.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    let streamedText = "";

    const appendStreamedText = (chunk: string) => {
      streamedText += chunk;
    };

    let currentResponse = await runStreamTurn(client, {
      apiModel,
      maxTokens,
      systemParam,
      messages,
      tools,
      enableThinking: Boolean(req.enableThinking),
      thinkingBudget,
      usePromptCaching,
      emitter: req.emitter,
      onTextDelta: appendStreamedText,
      signal: req.signal,
    });

    await trackUsage(
      req.organizationId,
      logicalModel,
      req.feature,
      currentResponse.usage
    );

    const thinkingContent = extractThinkingContent(currentResponse);
    let accumulatedTurnText = extractAllText(currentResponse);
    let iteration = 0;

    while (iteration < MAX_AGENT_ITERATIONS) {
      if ((currentResponse.stop_reason as string | null) === "pause_turn") {
        messages.push({ role: "assistant", content: currentResponse.content });

        currentResponse = await runStreamTurn(client, {
          apiModel,
          maxTokens,
          systemParam,
          messages,
          tools,
          enableThinking: false,
          thinkingBudget,
          usePromptCaching: false,
          emitter: req.emitter,
          onTextDelta: appendStreamedText,
          signal: req.signal,
        });

        await trackUsage(
          req.organizationId,
          logicalModel,
          req.feature,
          currentResponse.usage
        );

        accumulatedTurnText += extractAllText(currentResponse);
        iteration++;
        continue;
      }

      if (!req.onToolCall) break;

      const toolUseBlocks = getToolUseBlocks(currentResponse);
      if (toolUseBlocks.length === 0) break;

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const tb of toolUseBlocks) {
        req.emitter.emit("tool_start", {
          type: "tool_start",
          toolName: tb.name,
        });

        const resultStr = await req.onToolCall(
          tb.name,
          tb.input as Record<string, unknown>
        );

        req.emitter.emit("tool_end", {
          type: "tool_end",
          toolName: tb.name,
          result: resultStr.slice(0, 200),
        });

        toolResults.push({
          type: "tool_result",
          tool_use_id: tb.id,
          content: resultStr,
        });
      }

      messages.push({ role: "assistant", content: currentResponse.content });
      messages.push({ role: "user", content: toolResults });

      currentResponse = await runStreamTurn(client, {
        apiModel,
        maxTokens,
        systemParam,
        messages,
        tools,
        enableThinking: false,
        thinkingBudget,
        usePromptCaching: false,
        emitter: req.emitter,
        onTextDelta: appendStreamedText,
        signal: req.signal,
      });

      await trackUsage(
        req.organizationId,
        logicalModel,
        req.feature,
        currentResponse.usage
      );

      if (currentResponse.stop_reason === "max_tokens") {
        console.warn("[streamClaudeAgent] Respuesta truncada (max_tokens)", {
          iteration,
          maxTokens,
        });
      }

      accumulatedTurnText += extractAllText(currentResponse);
      iteration++;
    }

    if (currentResponse.stop_reason === "max_tokens") {
      console.warn("[streamClaudeAgent] Respuesta truncada por max_tokens", {
        maxTokens,
        enableThinking: req.enableThinking,
      });
    }

    const text = streamedText.trim() || accumulatedTurnText.trim();

    return {
      text,
      thinkingContent,
    };
  } catch (error) {
    // Clave rota o sin créditos: queda marcado en la org (cartel y Ajustes), igual
    // que en las llamadas comunes. No hay clave de respaldo a la que reintentar.
    await registrarFallaDeClave(req.organizationId, error);
    if (esClaveRechazada(error)) throw new Error(AI_KEY_REJECTED_MESSAGE);
    throw mapAnthropicCallError(error);
  }
}
