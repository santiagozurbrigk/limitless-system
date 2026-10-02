import Anthropic from "@anthropic-ai/sdk";
import {
  esErrorSinCreditos,
  mapAnthropicCallError,
  type ClaudeKeySource,
} from "@/lib/ai/anthropic-errors";
import { AI_KEY_REJECTED_MESSAGE } from "@/lib/ai/anthropic-auth-errors";
import {
  invalidateOrgCredentialCache,
  marcarClaveDeOrgComoRechazada,
  marcarClaveDeOrgSinCreditos,
  resolveCredentialForOrg,
} from "@/lib/ai/credential-resolver";
import { trackTokenUsage } from "@/lib/track-token-usage";

/** IDs de modelo para la API de Anthropic */
export const AI_MODELS = {
  HAIKU: "claude-haiku-4-5-20251001",
  SONNET: "claude-sonnet-4-6",
} as const;

export type AITask =
  | "conversation_scoring"
  | "content_labeling"
  | "booking_detection"
  | "data_extraction"
  | "agent_simple"
  | "call_analysis"
  | "weekly_report"
  | "sop_generation"
  | "agent_complex"
  | "product_extraction"
  | "sales_analysis"
  | "intelligence_analysis"
  | "tone_analysis"
  | "analyze_content_piece"
  | "create_content_variants"
  | "content_pattern_report";

const TASK_MODEL_MAP: Record<AITask, string> = {
  conversation_scoring: AI_MODELS.HAIKU,
  content_labeling: AI_MODELS.HAIKU,
  booking_detection: AI_MODELS.HAIKU,
  data_extraction: AI_MODELS.HAIKU,
  agent_simple: AI_MODELS.HAIKU,

  call_analysis: AI_MODELS.SONNET,
  weekly_report: AI_MODELS.SONNET,
  sop_generation: AI_MODELS.SONNET,
  agent_complex: AI_MODELS.SONNET,
  product_extraction: AI_MODELS.SONNET,
  sales_analysis: AI_MODELS.SONNET,
  intelligence_analysis: AI_MODELS.SONNET,
  tone_analysis: AI_MODELS.SONNET,
  analyze_content_piece: AI_MODELS.SONNET,
  create_content_variants: AI_MODELS.SONNET,
  content_pattern_report: AI_MODELS.SONNET,
};

/** Alias hasta disponibilidad GA de Sonnet 4.6 en la API */
const API_MODEL_ALIASES: Record<string, string> = {
  "claude-sonnet-4-6": "claude-sonnet-4-5-20250929",
};

/** Alias cortos legacy (override manual) */
export type ClaudeModel =
  | "claude-haiku-4-5"
  | "claude-sonnet-4-5"
  | "claude-sonnet-4-6";

const LEGACY_MODEL_MAP: Record<ClaudeModel, string> = {
  "claude-haiku-4-5": AI_MODELS.HAIKU,
  "claude-sonnet-4-5": "claude-sonnet-4-5-20250929",
  "claude-sonnet-4-6": AI_MODELS.SONNET,
};

const PROMPT_CACHING_BETA = "prompt-caching-2024-07-31";

type CachedSystemBlock = {
  type: "text";
  text: string;
  cache_control: { type: "ephemeral" };
};

type SystemBlock = CachedSystemBlock | { type: "text"; text: string };

export function getModelForTask(task: AITask): string {
  return TASK_MODEL_MAP[task];
}

export function detectAgentComplexity(
  message: string,
  hasRAGContext: boolean
): AITask {
  const simplePatterns = [
    /^(qué|cuál|cuánto|cuántos|cuántas|dónde|quién|cómo se llama)/i,
    /^(dame|mostrame|listame|decime)/i,
    /\?((\s*)$)/,
  ];

  const complexPatterns = [
    /analiz/i,
    /recomiend/i,
    /estrategia/i,
    /por qué/i,
    /cómo puedo mejorar/i,
    /qué debería/i,
    /compara/i,
    /explica/i,
  ];

  const isComplex =
    complexPatterns.some((p) => p.test(message)) ||
    hasRAGContext ||
    message.length > 200;

  const isSimple =
    !isComplex &&
    simplePatterns.some((p) => p.test(message)) &&
    message.length < 100;

  if (isSimple) return "agent_simple";
  return "agent_complex";
}

function resolveLogicalModel(opts: {
  task?: AITask;
  model?: ClaudeModel | string;
}): string {
  if (opts.model) {
    if (opts.model in LEGACY_MODEL_MAP) {
      return LEGACY_MODEL_MAP[opts.model as ClaudeModel];
    }
    return opts.model;
  }
  if (opts.task) return getModelForTask(opts.task);
  return AI_MODELS.HAIKU;
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

type ClaudeUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
};

export function invalidateOrgKeyCache(organizationId: string): void {
  invalidateOrgCredentialCache(organizationId);
}

/**
 * Corre una llamada a Claude con la clave propia de la organización.
 *
 * ⭐ Sin clave propia, no hay IA (SCRUM-7): si la org no tiene clave usable
 * devuelve `result: null` sin llamar a nadie, y quien llamó saltea el trabajo.
 * No hay clave global de respaldo. Si Anthropic rechaza la clave o la cuenta no
 * tiene créditos, se deja marcado en la org (lo ve en el cartel de la
 * plataforma y en Ajustes) y se tira un error con un mensaje claro.
 */
async function executeWithOrgCredential<T>(
  organizationId: string,
  fn: (client: Anthropic, keySource: ClaudeKeySource) => Promise<T>
): Promise<{ result: T | null; keySource: ClaudeKeySource | "none" }> {
  const resolution = await resolveCredentialForOrg(organizationId);
  if (!resolution.client || resolution.source === "none") {
    console.info(
      `[anthropic] La organización ${organizationId} no tiene clave de IA usable: se saltea.`
    );
    return { result: null, keySource: "none" };
  }

  const keySource: ClaudeKeySource = "api_key";

  try {
    const result = await fn(resolution.client, keySource);
    return { result, keySource };
  } catch (error) {
    await registrarFallaDeClave(organizationId, error);
    if (esClaveRechazada(error)) throw new Error(AI_KEY_REJECTED_MESSAGE);
    throw mapAnthropicCallError(error);
  }
}

/**
 * Si el error dice que la clave está rota o sin créditos, lo deja escrito en la
 * organización. Lo usan las llamadas comunes y el stream del agente.
 */
export async function registrarFallaDeClave(
  organizationId: string,
  error: unknown
): Promise<void> {
  if (esClaveRechazada(error)) {
    console.warn(
      `[anthropic] La clave propia de la organización ${organizationId} fue rechazada: queda sin IA hasta que cargue otra.`
    );
    invalidateOrgKeyCache(organizationId);
    await marcarClaveDeOrgComoRechazada(organizationId);
    return;
  }
  if (esErrorSinCreditos(error)) {
    console.warn(
      `[anthropic] La cuenta de Anthropic de la organización ${organizationId} no tiene créditos.`
    );
    await marcarClaveDeOrgSinCreditos(organizationId);
  }
}

/** Una clave que el proveedor rechaza — vencida, revocada o mal copiada. */
export function esClaveRechazada(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  return status === 401 || status === 403;
}

export type ClaudeJsonRequest = {
  organizationId: string;
  task?: AITask;
  model?: ClaudeModel | string;
  feature: string;
  system?: string;
  cachedSystemPrompt?: string;
  user: string;
  maxTokens?: number;
};

export type ClaudeTextRequest = {
  organizationId: string;
  task?: AITask;
  model?: ClaudeModel | string;
  feature: string;
  system?: string;
  cachedSystemPrompt?: string;
  messages: { role: "user" | "assistant"; content: string }[];
  maxTokens?: number;
};

async function trackUsage(
  organizationId: string,
  logicalModel: string,
  feature: string,
  usage: ClaudeUsage
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

async function createClaudeMessage(
  client: Anthropic,
  keySource: ClaudeKeySource,
  params: {
    apiModel: string;
    maxTokens: number;
    system?: string;
    cachedSystemPrompt?: string;
    messages: Anthropic.MessageParam[];
  }
): Promise<Anthropic.Message> {
  const system = buildSystemParam(params.cachedSystemPrompt, params.system);
  const request = {
    model: params.apiModel,
    max_tokens: params.maxTokens,
    messages: params.messages,
    ...(system !== undefined && { system }),
  };

  // El error crudo sigue de largo: `executeWithOrgCredential` lo necesita con su
  // status para marcar la clave (rota o sin créditos) antes de traducirlo.
  void keySource;
  if (params.cachedSystemPrompt?.trim()) {
    return await client.beta.messages.create({
      ...request,
      betas: [PROMPT_CACHING_BETA],
    });
  }

  return await client.messages.create(request);
}

export async function callClaudeText(
  req: ClaudeTextRequest
): Promise<string | null> {
  const logicalModel = resolveLogicalModel(req);
  const apiModel = resolveApiModelId(logicalModel);

  const { result } = await executeWithOrgCredential(
    req.organizationId,
    async (client, keySource) => {
      const response = await createClaudeMessage(client, keySource, {
        apiModel,
        maxTokens: req.maxTokens ?? 4096,
        system: req.system,
        cachedSystemPrompt: req.cachedSystemPrompt,
        messages: req.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      });

      await trackUsage(
        req.organizationId,
        logicalModel,
        req.feature,
        response.usage as ClaudeUsage
      );

      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") return null;
      return textBlock.text.trim();
    }
  );

  return result;
}

export type AgentToolInput = {
  name: string;
  input: Record<string, unknown>;
};

export type ClaudeAgentResult = {
  text: string;
  thinkingContent: string | null;
  /** Last tool call (kept for backward compatibility with generate_document) */
  toolCall: AgentToolInput | null;
  /** All tool calls across all agentic iterations */
  toolCalls: AgentToolInput[];
};

export type ClaudeAgentRequest = {
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
  thinkingBudget?: number;
  tools?: Anthropic.Tool[];
  onToolCall?: (name: string, input: Record<string, unknown>) => Promise<string>;
};

/**
 * Extended Claude call for the Agent module.
 * Supports web search, extended thinking, and custom tool calling.
 */
export async function callClaudeAgent(
  req: ClaudeAgentRequest
): Promise<ClaudeAgentResult> {
  const empty: ClaudeAgentResult = {
    text: "",
    thinkingContent: null,
    toolCall: null,
    toolCalls: [],
  };

  const logicalModel = resolveLogicalModel(req);
  const apiModel = resolveApiModelId(logicalModel);
  const maxTokens = req.maxTokens ?? 4096;
  const thinkingBudget = req.thinkingBudget ?? 4000;

  const { result } = await executeWithOrgCredential(
    req.organizationId,
    async (client, keySource) => {
      const systemParam = buildSystemParam(req.cachedSystemPrompt, req.system);

      const tools: Anthropic.Tool[] = [...(req.tools ?? [])];
      if (req.enableWebSearch) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools.push({ type: "web_search_20260209", name: "web_search" } as any);
      }

      const messages: Anthropic.MessageParam[] = req.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const requestBase: Record<string, any> = {
        model: apiModel,
        max_tokens: maxTokens,
        messages,
        ...(systemParam !== undefined && { system: systemParam }),
        ...(tools.length > 0 && { tools }),
        ...(req.enableThinking && {
          thinking: { type: "enabled", budget_tokens: thinkingBudget },
        }),
      };

      let response: Anthropic.Message;
      if (req.cachedSystemPrompt?.trim()) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        response = (await client.beta.messages.create({
          ...requestBase,
          betas: [PROMPT_CACHING_BETA],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)) as Anthropic.Message;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        response = (await (client.messages.create as (p: any) => Promise<Anthropic.Message>)(requestBase));
      }

      await trackUsage(
        req.organizationId,
        logicalModel,
        req.feature,
        response.usage as ClaudeUsage
      );

      const thinkingBlocks = response.content.filter((b) => b.type === "thinking");
      const thinkingContent =
        thinkingBlocks.length > 0
          ? JSON.stringify(
              thinkingBlocks.map((b) =>
                b.type === "thinking"
                  ? { text: (b as { type: "thinking"; thinking: string }).thinking }
                  : {}
              )
            )
          : null;

      const MAX_AGENT_ITERATIONS = 4;
      const allToolCalls: AgentToolInput[] = [];
      let currentResponse = response;
      let iteration = 0;

      while (iteration < MAX_AGENT_ITERATIONS && req.onToolCall) {
        const toolUseBlocks = currentResponse.content.filter(
          (b) => b.type === "tool_use"
        );
        if (toolUseBlocks.length === 0) break;

        const toolResults = await Promise.all(
          toolUseBlocks.map(async (block) => {
            const tb = block as Anthropic.ToolUseBlock;
            allToolCalls.push({
              name: tb.name,
              input: tb.input as Record<string, unknown>,
            });
            const resultStr = await req.onToolCall!(
              tb.name,
              tb.input as Record<string, unknown>
            );
            return {
              type: "tool_result" as const,
              tool_use_id: tb.id,
              content: resultStr,
            };
          })
        );

        messages.push({ role: "assistant", content: currentResponse.content });
        messages.push({ role: "user", content: toolResults });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nextRequest: Record<string, any> = {
          model: apiModel,
          max_tokens: maxTokens,
          messages,
          ...(systemParam !== undefined && { system: systemParam }),
          ...(tools.length > 0 && { tools }),
        };

        let nextResponse: Anthropic.Message;
        if (req.cachedSystemPrompt?.trim()) {
          nextResponse = (await client.beta.messages.create({
            ...nextRequest,
            betas: [PROMPT_CACHING_BETA],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any)) as Anthropic.Message;
        } else {
          nextResponse = (await (
            client.messages.create as (p: unknown) => Promise<Anthropic.Message>
          )(nextRequest));
        }

        await trackUsage(
          req.organizationId,
          logicalModel,
          req.feature,
          nextResponse.usage as ClaudeUsage
        );

        currentResponse = nextResponse;
        if (currentResponse.stop_reason === "max_tokens") {
          console.warn(
            "[callClaudeAgent] Respuesta truncada (max_tokens) en iteración",
            iteration
          );
        }
        iteration++;
      }

      const finalTextBlock = currentResponse.content.find((b) => b.type === "text");
      const lastToolCall =
        allToolCalls.length > 0 ? allToolCalls[allToolCalls.length - 1]! : null;

      if (currentResponse.stop_reason === "max_tokens") {
        console.warn("[callClaudeAgent] Respuesta truncada por max_tokens", {
          maxTokens,
          enableThinking: req.enableThinking,
        });
      }

      return {
        text:
          finalTextBlock && finalTextBlock.type === "text"
            ? finalTextBlock.text.trim()
            : "",
        thinkingContent,
        toolCall: lastToolCall,
        toolCalls: allToolCalls,
      };
    }
  );

  return result ?? empty;
}

export async function callClaudeJson<T>(
  req: ClaudeJsonRequest
): Promise<T | null> {
  const logicalModel = resolveLogicalModel(req);
  const apiModel = resolveApiModelId(logicalModel);

  const { result } = await executeWithOrgCredential(
    req.organizationId,
    async (client, keySource) => {
      const response = await createClaudeMessage(client, keySource, {
        apiModel,
        maxTokens: req.maxTokens ?? 2048,
        system: req.system,
        cachedSystemPrompt: req.cachedSystemPrompt,
        messages: [{ role: "user", content: req.user }],
      });

      await trackUsage(
        req.organizationId,
        logicalModel,
        req.feature,
        response.usage as ClaudeUsage
      );

      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") return null;

      const raw = textBlock.text.trim();
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      try {
        return JSON.parse(jsonMatch[0]) as T;
      } catch {
        return null;
      }
    }
  );

  return result;
}

export type ClaudeVisionImage = {
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
};

export async function callClaudeVisionJson<T>(req: {
  organizationId: string;
  task?: AITask;
  model?: ClaudeModel | string;
  feature: string;
  system?: string;
  text: string;
  images: ClaudeVisionImage[];
  maxTokens?: number;
}): Promise<T | null> {
  const logicalModel = resolveLogicalModel(req);
  const apiModel = resolveApiModelId(logicalModel);

  const userContent: Anthropic.ContentBlockParam[] = [
    { type: "text", text: req.text },
    ...req.images.map(
      (image): Anthropic.ImageBlockParam => ({
        type: "image",
        source: {
          type: "base64",
          media_type: image.mediaType,
          data: image.base64,
        },
      })
    ),
  ];

  const { result } = await executeWithOrgCredential(
    req.organizationId,
    async (client, keySource) => {
      const response = await createClaudeMessage(client, keySource, {
        apiModel,
        maxTokens: req.maxTokens ?? 2048,
        system:
          req.system ??
          "Respondé únicamente con JSON válido en español, sin markdown ni texto adicional.",
        messages: [{ role: "user", content: userContent }],
      });

      await trackUsage(
        req.organizationId,
        logicalModel,
        req.feature,
        response.usage as ClaudeUsage
      );

      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") return null;

      const raw = textBlock.text.trim();
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      try {
        return JSON.parse(jsonMatch[0]) as T;
      } catch {
        return null;
      }
    }
  );

  return result;
}

export { getClientForOrg } from "@/lib/ai/credential-resolver";
