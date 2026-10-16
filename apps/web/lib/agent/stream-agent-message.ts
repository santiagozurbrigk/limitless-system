import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  createAgentConversationAction,
  listAgentMessagesAction,
} from "@/app/agent/actions";
import { requireAuthContext } from "@/lib/auth/require-auth";
import {
  aiRateLimit,
  rateLimitErrorMessage,
  sopGenerateRateLimit,
} from "@/lib/rate-limit";
import { sanitizeText } from "@/lib/sanitize";
import {
  aiPromptSchema,
  firstZodError,
  textSchema,
  longTextSchema,
} from "@/lib/validations";
import {
  callClaudeText,
  detectAgentComplexity,
} from "@/lib/ai/anthropic";
import { compactConversationMessages } from "@/lib/agent/compact-conversation";
import { buildJitOrgContextText } from "@/lib/agent/jit-context";
import {
  rowToMessage,
  rowToStage,
  type AgentMessageRow,
} from "@/lib/agent/mapper";
import {
  cleanAgentResponse,
  parseAgentActions,
} from "@/lib/agent/parse-actions";
import { resolveAgentFlags } from "@/lib/agent/canvas-intent";
import { resolveAgentMaxTokens, resolveAgentThinkingBudget } from "@/lib/agent/max-tokens";
import {
  buildCanvasChatIntro,
  stripDownloadUrls,
} from "@/lib/agent/sanitize-agent-output";
import {
  buildAgentSystemPrompt,
  buildRecentContextSummary,
  buildStageContext,
} from "@/lib/agent/prompt";
import { buildPageContextPrompt, type PageContextState } from "@/lib/agent/page-context";
import {
  loadProductEntityContext,
  buildEntityContextText,
} from "@/lib/agent/graph-proposal-tools";
import { buildRAGContext, searchRAG } from "@/lib/rag/search";
import { createClient } from "@/lib/supabase/server";
import { paths } from "@/routes/paths";
import type { AgentFlags, AgentMessage, BusinessStage } from "@/types/agent";
import { AGENT_CHAT_TOOLS } from "@/lib/agent/agent-tools";
import {
  createAgentToolHandler,
  type AgentToolHandlerState,
} from "@/lib/agent/agent-tool-handler";
import type { AgentSseEmitter } from "@/lib/agent/sse";
import { streamClaudeAgent } from "@/lib/agent/stream-claude-agent";

const AGENT_ERROR_REPLY =
  "No pudimos generar la respuesta. Intentá de nuevo en unos segundos.";

const CANVAS_HEADING_RE = /^#{1,3} /m;
const CANVAS_CODE_RE = /```[\s\S]{100}/;
const CANVAS_TABLE_RE = /\|.+\|.+\|/;

function shouldExtractCanvas(text: string): boolean {
  if (text.length < 600) return false;
  return (
    CANVAS_HEADING_RE.test(text) ||
    CANVAS_CODE_RE.test(text) ||
    CANVAS_TABLE_RE.test(text)
  );
}

function revalidateAgent() {
  revalidatePath(paths.platform.agent.root);
}

async function getOrgName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string
) {
  const { data } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", organizationId)
    .maybeSingle();
  return data?.name ?? "tu negocio";
}

async function getRecentOrgMessages(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  excludeConversationId: string
): Promise<AgentMessage[]> {
  const { data } = await supabase
    .from("agent_messages")
    .select("*")
    .eq("organization_id", organizationId)
    .neq("conversation_id", excludeConversationId)
    .order("created_at", { ascending: false })
    .limit(20);

  return (data ?? [])
    .reverse()
    .map((row) => rowToMessage(row as AgentMessageRow));
}

async function executeAgentActions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  actions: ReturnType<typeof parseAgentActions>
): Promise<{ actionType: AgentMessage["actionType"]; actionRefId: string } | null> {
  for (const action of actions) {
    if (action.type === "CREATE_SOP") {
      const { allowed, resetAt } = await sopGenerateRateLimit(organizationId);
      if (!allowed) {
        throw new Error(rateLimitErrorMessage(resetAt));
      }

      const parsed = z
        .object({
          title: textSchema,
          content: longTextSchema,
          goal: textSchema,
          department: z.string().max(50).default("general"),
        })
        .safeParse({
          title: action.data.title ?? "SOP sin título",
          department: action.data.department ?? "general",
          content: action.data.content ?? "",
          goal: action.data.goal ?? action.data.title ?? "SOP sin título",
        });
      if (!parsed.success) {
        throw new Error(firstZodError(parsed.error));
      }

      const { title, department, content, goal } = parsed.data;

      const { data, error } = await supabase
        .from("sops")
        .insert({
          organization_id: organizationId,
          title: sanitizeText(title),
          department,
          content: sanitizeText(content),
          goal: sanitizeText(goal),
          status: "draft",
          created_by: "agent",
        })
        .select("id")
        .single();

      if (error) throw new Error(error.message);
      revalidatePath(paths.platform.sops.root);
      return { actionType: "created_sop", actionRefId: data.id };
    }
  }
  return null;
}

async function generateConversationTitle(
  organizationId: string,
  conversationId: string,
  firstMessage: string
) {
  const title =
    (await callClaudeText({
      organizationId,
      task: "agent_simple",
      feature: "agent_conversation_title",
      system:
        "Genera títulos breves en español. Responde SOLO con el título, máximo 5 palabras, sin puntuación final.",
      messages: [
        {
          role: "user",
          content: `Resume en máximo 5 palabras de qué trata esta pregunta: "${firstMessage}"`,
        },
      ],
      maxTokens: 30,
    })) ?? firstMessage.slice(0, 48);

  const cleanTitle = title.replace(/[.!?]+$/, "").trim();
  const supabase = await createClient();
  await supabase
    .from("agent_conversations")
    .update({ title: cleanTitle })
    .eq("id", conversationId)
    .eq("organization_id", organizationId);
}

export type StreamAgentMessageInput = {
  conversationId?: string | null;
  content: string;
  contextStageId?: string | null;
  pageContext?: PageContextState | null;
  flags?: AgentFlags;
  emitter: AgentSseEmitter;
  signal?: AbortSignal;
};

export async function streamAgentMessage(
  input: StreamAgentMessageInput
): Promise<void> {
  const { user, orgId: organizationId } = await requireAuthContext();

  const { allowed, resetAt } = await aiRateLimit(user.id);
  if (!allowed) {
    throw new Error(rateLimitErrorMessage(resetAt));
  }

  const parsedContent = aiPromptSchema.safeParse(input.content);
  if (!parsedContent.success) {
    throw new Error(firstZodError(parsedContent.error));
  }

  if (input.signal?.aborted) {
    throw new DOMException("Cancelled", "AbortError");
  }

  const supabase = await createClient();
  const trimmed = sanitizeText(parsedContent.data);

  let conversationId = input.conversationId ?? null;

  if (!conversationId) {
    // Las acciones devuelven su error como valor (SCRUM-506); la ruta SSE
    // manda el mensaje en el evento `error`, como antes.
    const created = await createAgentConversationAction();
    if (!created.success) throw new Error(created.error);
    conversationId = created.data.id;
  }

  const { data: convRow, error: convError } = await supabase
    .from("agent_conversations")
    .select("*")
    .eq("id", conversationId)
    .eq("organization_id", organizationId)
    .single();

  if (convError) throw new Error(convError.message);
  if (!convRow) throw new Error("Conversación no encontrada");

  const { count: priorCount } = await supabase
    .from("agent_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId);

  const { error: userErr } = await supabase
    .from("agent_messages")
    .insert({
      conversation_id: conversationId,
      organization_id: organizationId,
      role: "user",
      content: trimmed,
    });

  if (userErr) throw new Error(userErr.message);

  await supabase
    .from("agent_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  const lecturaDelHistorial = await listAgentMessagesAction(conversationId);
  if (!lecturaDelHistorial.success) throw new Error(lecturaDelHistorial.error);
  const history = lecturaDelHistorial.data;
  const recentOrg = await getRecentOrgMessages(
    supabase,
    organizationId,
    conversationId
  );

  let stageForPrompt: BusinessStage | null = null;
  if (input.contextStageId) {
    const { data: stageRow } = await supabase
      .from("business_stages")
      .select("*")
      .eq("id", input.contextStageId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (stageRow) stageForPrompt = rowToStage(stageRow);
  }

  const orgName = await getOrgName(supabase, organizationId);
  const orgContextText = await buildJitOrgContextText(organizationId, trimmed);

  const entityCtx = await loadProductEntityContext(organizationId);
  const entityContextText = buildEntityContextText(entityCtx);

  let ragContext = "";
  let hasRagContext = false;
  try {
    const ragResults = await searchRAG({
      organizationId,
      query: trimmed,
      matchCount: 5,
      minSimilarity: 0.65,
    });
    hasRagContext = ragResults.length > 0;
    ragContext = buildRAGContext(ragResults);
  } catch {
    console.warn("[Agent] RAG no disponible, respondiendo sin contexto semántico");
  }

  const system = buildAgentSystemPrompt({
    orgName,
    stageContext: buildStageContext(stageForPrompt),
    recentContext: buildRecentContextSummary(recentOrg),
    ragContext,
    entityContext: entityContextText,
    pageContext: buildPageContextPrompt(input.pageContext ?? null),
  });

  const claudeMessages = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const messagesForClaude = await compactConversationMessages(
    organizationId,
    claudeMessages
  );

  const agentTask = detectAgentComplexity(trimmed, hasRagContext);
  const flags = resolveAgentFlags(trimmed, input.flags ?? {});

  const toolState: AgentToolHandlerState = {
    canvasFromDocument: null,
    createdProposals: [],
    generatedDocuments: [],
  };

  const onToolCall = createAgentToolHandler({
    organizationId,
    conversationId,
    supabase,
    state: toolState,
  });

  let agentResult: { text: string; thinkingContent: string | null } | null = null;

  try {
    agentResult = await streamClaudeAgent({
      organizationId,
      task: agentTask,
      feature: "agent_chat",
      cachedSystemPrompt: orgContextText,
      system,
      messages: messagesForClaude,
      maxTokens: resolveAgentMaxTokens({
        enableThinking: flags.useThink,
        useCanvas: flags.useCanvas,
      }),
      thinkingBudget: resolveAgentThinkingBudget(flags.useThink),
      enableWebSearch: flags.useWebSearch,
      enableThinking: flags.useThink,
      useCanvas: flags.useCanvas,
      tools: AGENT_CHAT_TOOLS,
      onToolCall,
      emitter: input.emitter,
      signal: input.signal,
    });
  } catch (claudeErr) {
    console.error("[Agent:Claude] streamClaudeAgent threw", {
      organizationId,
      err: claudeErr,
      message: claudeErr instanceof Error ? claudeErr.message : String(claudeErr),
    });
    throw claudeErr;
  }

  const rawAssistant = agentResult?.text ?? null;

  if (!rawAssistant) {
    throw new Error(AGENT_ERROR_REPLY);
  }

  let docAttachments: AgentMessage["attachments"] = null;
  const generatedDocument = toolState.generatedDocuments.at(-1);
  if (generatedDocument) {
    docAttachments = [
      {
        name: generatedDocument.filename,
        url: generatedDocument.signedUrl,
        type: generatedDocument.mimeType,
        sizeBytes: generatedDocument.sizeBytes,
      },
    ];
  }

  const actions = parseAgentActions(rawAssistant);
  const actionResult = await executeAgentActions(
    supabase,
    organizationId,
    actions
  );
  const displayContent = stripDownloadUrls(cleanAgentResponse(rawAssistant));

  const extractedCanvas =
    toolState.createdProposals.length === 0 && shouldExtractCanvas(displayContent)
      ? displayContent
      : null;

  const canvasContent =
    flags.useCanvas && toolState.createdProposals.length === 0
      ? toolState.canvasFromDocument ?? extractedCanvas
      : null;

  const chatContent =
    canvasContent !== null
      ? buildCanvasChatIntro(canvasContent.match(/^# (.+)$/m)?.[1])
      : displayContent;

  const finalActionType =
    toolState.createdProposals.length > 0
      ? ("graph_proposals" as const)
      : (actionResult?.actionType ?? null);
  const finalActionRefId =
    toolState.createdProposals.length > 0
      ? null
      : (actionResult?.actionRefId ?? null);

  const { data: assistantMsgData, error: assistantErr } = await supabase
    .from("agent_messages")
    .insert({
      conversation_id: conversationId,
      organization_id: organizationId,
      role: "assistant",
      content: chatContent,
      action_type: finalActionType,
      action_ref_id: finalActionRefId,
      attachments: docAttachments ?? null,
      thinking_content: agentResult?.thinkingContent ?? null,
      canvas_content: canvasContent,
    })
    .select("id")
    .single();

  if (assistantErr) throw new Error(assistantErr.message);

  if (toolState.createdProposals.length > 0 && assistantMsgData?.id) {
    const proposalIds = toolState.createdProposals.map((p) => p.id);
    await supabase
      .from("agent_graph_proposals")
      .update({ message_id: assistantMsgData.id })
      .in("id", proposalIds)
      .eq("organization_id", organizationId);
  }

  input.emitter.emit("done", {
    messageId: assistantMsgData.id,
    conversationId,
    openCanvas: flags.useCanvas,
  });

  if ((priorCount ?? 0) === 0) {
    void generateConversationTitle(organizationId, conversationId, trimmed).catch(
      (titleErr) => {
        console.error("[Agent:Title] generateConversationTitle failed", {
          conversationId,
          organizationId,
          message: titleErr instanceof Error ? titleErr.message : String(titleErr),
        });
      }
    );
  }

  revalidateAgent();
}
