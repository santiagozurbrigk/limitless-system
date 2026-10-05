"use server";

import { brand } from "@/lib/brand";


import { revalidatePath } from "next/cache";
import {
  isMissingTableError,
  requireOrganizationId,
  tryRequireOrganizationId,
} from "@/lib/auth/bootstrap";
import { requireAuthContext } from "@/lib/auth/require-auth";
import {
  aiRateLimit,
  rateLimitErrorMessage,
  sopGenerateRateLimit,
} from "@/lib/rate-limit";
import { sanitizeText } from "@/lib/sanitize";
import { avisoDePiezasSinMetricas } from "@/lib/marketing/ranking-de-contenido";
import {
  aiPromptSchema,
  firstZodError,
  textSchema,
  longTextSchema,
} from "@/lib/validations";
import { z } from "zod";
import {
  callClaudeText,
  callClaudeAgent,
  detectAgentComplexity,
} from "@/lib/ai/anthropic";
import { NO_AI_CREDENTIALS_MESSAGE } from "@/lib/ai/anthropic-auth-errors";
import { resolveClientForOrg } from "@/lib/ai/credential-resolver";
import type Anthropic from "@anthropic-ai/sdk";
import {
  generateDocument,
  type DocumentContent,
} from "@/lib/agent/document-generator";
import { storeAgentDocument } from "@/lib/agent/document-storage";
import { buildOrgContextText, getOrgContext } from "@/lib/ai/org-context";
import {
  rowToConversation,
  rowToMessage,
  rowToProposal,
  rowToStage,
  type AgentConversationRow,
  type AgentMessageRow,
  type GraphProposalRow,
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
import { documentContentToMarkdown } from "@/lib/agent/document-to-markdown";
import {
  buildAgentSystemPrompt,
  buildRecentContextSummary,
  buildStageContext,
} from "@/lib/agent/prompt";
import { buildPageContextPrompt, type PageContextState } from "@/lib/agent/page-context";
import {
  ALL_PROPOSAL_TOOLS,
  PROPOSAL_TOOL_NAMES,
  loadProductEntityContext,
  buildEntityContextText,
} from "@/lib/agent/graph-proposal-tools";
import { buildRAGContext, searchRAG } from "@/lib/rag/search";
import { createClient } from "@/lib/supabase/server";
import {
  createWorkboardTasksAction,
  searchWorkboardTasksAction,
  updateWorkboardTaskAction,
  type WorkboardTaskUpdates,
} from "./workboard-actions";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { paths } from "@/routes/paths";
import type {
  AgentConversation,
  AgentFlags,
  AgentMessage,
  AgentWorkspaceData,
  BusinessStage,
  GraphProposal,
} from "@/types/agent";

const AGENT_ERROR_REPLY =
  "No pudimos generar la respuesta. Intentá de nuevo en unos segundos.";

// ---------------------------------------------------------------------------
// Document generation tool definition
// ---------------------------------------------------------------------------

const GENERATE_DOCUMENT_TOOL: Anthropic.Tool = {
  name: "generate_document",
  description:
    "Genera datos tabulares exportables (Excel/CSV). NO uses esta tool para SOPs, reportes ni documentos de texto — esos van al Canvas en markdown. Nunca devuelvas ni menciones URLs de descarga al usuario.",
  input_schema: {
    type: "object" as const,
    required: ["format", "filename", "content"],
    properties: {
      format: {
        type: "string",
        enum: ["docx", "xlsx", "pdf", "csv"],
        description: "Formato del archivo",
      },
      filename: {
        type: "string",
        description: "Nombre del archivo sin extensión (ej: 'propuesta-comercial')",
      },
      content: {
        type: "object",
        description:
          "Contenido del documento. Para docx/pdf: { paragraphs: [{ text, style? }] }. Para xlsx/csv: { headers: [...], rows: [[...]] }",
        properties: {
          paragraphs: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text: { type: "string" },
                style: {
                  type: "string",
                  enum: ["heading1", "heading2", "heading3", "body", "bullet"],
                },
              },
              required: ["text"],
            },
          },
          headers: { type: "array", items: { type: "string" } },
          rows: {
            type: "array",
            items: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  },
};

const CREATE_WORKBOARD_TASKS_TOOL: Anthropic.Tool = {
  name: "create_workboard_tasks",
  description:
    `Crea una o más tareas directamente en el Tablero de Trabajo de ${brand.name}. SIEMPRE usar esta herramienta (en lugar de listar tareas en texto) cuando el usuario pida agregar tareas al tablero, board, kanban o tablero de trabajo. Las fechas deben estar en formato YYYY-MM-DD usando el año actual.`,
  input_schema: {
    type: "object" as const,
    required: ["tasks"],
    properties: {
      tasks: {
        type: "array",
        items: {
          type: "object",
          required: ["title"],
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            area: {
              type: "string",
              enum: [
                "marketing",
                "ventas",
                "operaciones",
                "finanzas",
                "clientes",
                "general",
              ],
            },
            priority: {
              type: "string",
              enum: ["low", "medium", "high"],
            },
            due_date: {
              type: "string",
              description: "YYYY-MM-DD usando el año actual, o null",
            },
            assignee_name: {
              type: "string",
              description: "Nombre completo del responsable según profiles.full_name",
            },
            tags: {
              type: "array",
              items: { type: "string" },
            },
          },
        },
      },
    },
  },
};

const SEARCH_WORKBOARD_TASKS_TOOL: Anthropic.Tool = {
  name: "search_workboard_tasks",
  description:
    "Busca tareas en el Tablero de Trabajo por nombre. Usar ANTES de update_workboard_task para obtener el ID de la tarea a modificar.",
  input_schema: {
    type: "object" as const,
    required: ["query"],
    properties: {
      query: {
        type: "string",
        description: "Texto a buscar en el título de la tarea",
      },
      status: {
        type: "string",
        enum: ["todo", "in_progress", "review", "done"],
        description: "Filtrar por estado (opcional)",
      },
    },
  },
};

const UPDATE_WORKBOARD_TASK_TOOL: Anthropic.Tool = {
  name: "update_workboard_task",
  description:
    "Modifica una tarea existente en el Tablero de Trabajo. Requiere el ID de la tarea (obtenerlo con search_workboard_tasks primero). Puede actualizar título, descripción, estado, área, prioridad, fecha límite y responsable.",
  input_schema: {
    type: "object" as const,
    required: ["task_id", "updates"],
    properties: {
      task_id: {
        type: "string",
        description: "UUID de la tarea (obtener con search_workboard_tasks)",
      },
      updates: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          status: {
            type: "string",
            enum: ["todo", "in_progress", "review", "done"],
          },
          area: {
            type: "string",
            enum: [
              "marketing",
              "ventas",
              "operaciones",
              "finanzas",
              "clientes",
              "general",
            ],
          },
          priority: {
            type: "string",
            enum: ["low", "medium", "high"],
          },
          due_date: {
            type: "string",
            description: "YYYY-MM-DD usando el año actual, o null para quitar la fecha",
          },
          assignee_name: {
            type: "string",
            description: "Nombre completo del responsable, o null para desasignar",
          },
          tags: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
    },
  },
};

const ANALYZE_CONTENT_PIECE_TOOL: Anthropic.Tool = {
  name: "analyze_content_piece",
  description:
    "Analiza una pieza de contenido del módulo Marketing e identifica su Formato, Dolor y Ángulo. Descarga el archivo de Drive, lo transcribe con Whisper y usa Claude Vision para el análisis visual. Requiere que la pieza tenga un archivo de Drive vinculado.",
  input_schema: {
    type: "object" as const,
    required: ["content_piece_id"],
    properties: {
      content_piece_id: {
        type: "string",
        description: "ID de la pieza de contenido en content_pieces",
      },
    },
  },
};

const CREATE_CONTENT_VARIANTS_TOOL: Anthropic.Tool = {
  name: "create_content_variants",
  description:
    "Genera N variantes de una pieza de contenido existente. Cada variante es un brief con Formato, Dolor, Ángulo y estructura detallada del video parte por parte. Las variantes se guardan en la DB y aparecen en el módulo Contenido bajo la pieza original.",
  input_schema: {
    type: "object" as const,
    required: ["source_content_id", "count"],
    properties: {
      source_content_id: {
        type: "string",
        description: "ID de la pieza de contenido fuente (la que se quiere variar)",
      },
      count: {
        type: "number",
        description: "Cantidad de variantes a generar (1-5)",
      },
      instructions: {
        type: "string",
        description:
          "Instrucciones adicionales sobre qué cambiar o explorar en las variantes",
      },
    },
  },
};

const GET_TOP_PERFORMING_CONTENT_TOOL: Anthropic.Tool = {
  name: "get_top_performing_content",
  description:
    "Obtiene el ranking de piezas de contenido por métricas de engagement o por correlación con ventas cerradas. Útil para responder cuál reel trajo más clientes o qué contenido tuvo más engagement.",
  input_schema: {
    type: "object" as const,
    required: ["metric"],
    properties: {
      metric: {
        type: "string",
        enum: [
          "likes",
          "comments",
          "saves",
          "shares",
          "reach",
          "engagement_total",
          "sales",
        ],
        description:
          "Métrica por la que rankear. 'sales' usa saves como proxy hasta cruzar con inbox.",
      },
      limit: {
        type: "number",
        description: "Cantidad de piezas a retornar (default: 10)",
      },
      type_filter: {
        type: "string",
        enum: ["reel", "post", "carousel", "youtube", "story", "all"],
        description: "Filtrar por tipo de contenido. Default: 'all'",
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Canvas detection: responses that benefit from side-panel display
// ---------------------------------------------------------------------------

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

export async function listAgentWorkspaceAction(): Promise<AgentWorkspaceData> {
  const empty: AgentWorkspaceData = {
    stages: [],
    conversations: [],
  };
  if (!isSupabaseConfigured()) return empty;

  const organizationId = await tryRequireOrganizationId();
  if (!organizationId) return empty;

  const supabase = await createClient();

  const [stagesRes, conversationsRes] = await Promise.all([
    supabase
      .from("business_stages")
      .select("*")
      .eq("organization_id", organizationId)
      .order("order_index", { ascending: true }),
    supabase
      .from("agent_conversations")
      .select("*")
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false }),
  ]);

  if (stagesRes.error) {
    if (isMissingTableError(stagesRes.error.message)) return empty;
    console.error("[Agent] list stages:", stagesRes.error.message);
  }

  if (conversationsRes.error) {
    if (isMissingTableError(conversationsRes.error.message)) {
      return {
        stages: (stagesRes.data ?? []).map(rowToStage),
        conversations: [],
      };
    }
    console.error("[Agent] list conversations:", conversationsRes.error.message);
  }

  return {
    stages: (stagesRes.data ?? []).map(rowToStage),
    conversations: (conversationsRes.error
      ? []
      : (conversationsRes.data ?? []).map((row) =>
          rowToConversation(row as AgentConversationRow)
        )),
  };
}

export async function listAgentMessagesAction(
  conversationId: string
): Promise<AgentMessage[]> {
  if (!isSupabaseConfigured()) return [];

  const organizationId = await tryRequireOrganizationId();
  if (!organizationId) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agent_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingTableError(error.message)) return [];
    throw new Error(error.message);
  }

  const rows = (data ?? []) as AgentMessageRow[];

  // Collect IDs of messages that have graph proposals attached
  const graphProposalMessageIds = rows
    .filter((r) => r.action_type === "graph_proposals")
    .map((r) => r.id);

  const proposalsByMessage: Map<string, GraphProposal[]> = new Map();

  if (graphProposalMessageIds.length > 0) {
    try {
      const { data: proposalData } = await supabase
        .from("agent_graph_proposals")
        .select("*")
        .eq("organization_id", organizationId)
        .in("message_id", graphProposalMessageIds)
        .order("created_at", { ascending: true });

      for (const row of proposalData ?? []) {
        const p = rowToProposal(row as GraphProposalRow);
        if (!p.messageId) continue;
        const list = proposalsByMessage.get(p.messageId) ?? [];
        list.push(p);
        proposalsByMessage.set(p.messageId, list);
      }
    } catch {
      // Non-critical: table may not exist yet
    }
  }

  return rows.map((row) =>
    rowToMessage(row, proposalsByMessage.get(row.id) ?? null)
  );
}

export async function createBusinessStageAction(input: {
  name: string;
  description?: string;
}): Promise<BusinessStage | null> {
  const organizationId = await requireOrganizationId();
  const supabase = await createClient();

  const { count } = await supabase
    .from("business_stages")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  const { data, error } = await supabase
    .from("business_stages")
    .insert({
      organization_id: organizationId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      order_index: count ?? 0,
      is_active: true,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  revalidateAgent();
  return rowToStage(data);
}

export async function createAgentConversationAction(opts?: {
  title?: string | null;
}): Promise<AgentConversation | null> {
  const organizationId = await requireOrganizationId();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("agent_conversations")
    .insert({
      organization_id: organizationId,
      project_id: null,
      stage_id: null,
      title: opts?.title ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "No se pudo crear la conversación");
  }

  revalidateAgent();
  return rowToConversation(data as AgentConversationRow);
}

export async function deleteAgentConversationAction(
  conversationId: string
): Promise<void> {
  const organizationId = await requireOrganizationId();
  const supabase = await createClient();

  const { error } = await supabase
    .from("agent_conversations")
    .delete()
    .eq("id", conversationId)
    .eq("organization_id", organizationId);

  if (error) throw new Error(error.message);
  revalidateAgent();
}

export async function deleteBusinessStageAction(stageId: string): Promise<void> {
  const organizationId = await requireOrganizationId();
  const supabase = await createClient();

  const { error } = await supabase
    .from("business_stages")
    .delete()
    .eq("id", stageId)
    .eq("organization_id", organizationId);

  if (error) throw new Error(error.message);
  revalidateAgent();
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
  const { error } = await supabase
    .from("agent_conversations")
    .update({ title: cleanTitle })
    .eq("id", conversationId)
    .eq("organization_id", organizationId);

  if (error) {
    console.error("[Agent:Title] update failed", {
      conversationId,
      organizationId,
      message: error.message,
    });
    return;
  }

  console.error("[Agent:Title] title set", { conversationId, title: cleanTitle });
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

export async function sendAgentMessageAction(input: {
  conversationId?: string | null;
  content: string;
  /** Contexto de etapa solo para el prompt; no se persiste en la conversación. */
  contextStageId?: string | null;
  /** Contexto de la página actual (content piece, lead, etc.). */
  pageContext?: PageContextState | null;
  flags?: AgentFlags;
}): Promise<{
  conversationId: string;
  messages: AgentMessage[];
  openCanvas: boolean;
}> {
  const { user, orgId: organizationId } = await requireAuthContext();

  const { allowed, resetAt } = await aiRateLimit(user.id);
  if (!allowed) {
    throw new Error(rateLimitErrorMessage(resetAt));
  }

  const parsedContent = aiPromptSchema.safeParse(input.content);
  if (!parsedContent.success) {
    throw new Error(firstZodError(parsedContent.error));
  }

  const supabase = await createClient();
  const trimmed = sanitizeText(parsedContent.data);

  let conversationId = input.conversationId ?? null;

  if (!conversationId) {
    const created = await createAgentConversationAction();
    if (!created) throw new Error("No se pudo crear la conversación");
    conversationId = created.id;
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
    })
    .select("*")
    .single();

  if (userErr) throw new Error(userErr.message);

  await supabase
    .from("agent_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  const history = await listAgentMessagesAction(conversationId);
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
  const orgContext = await getOrgContext(organizationId);
  const orgContextText = buildOrgContextText(orgContext);

  // Load entity context (ids + names) for proposal tools
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
    // El mensaje del usuario en claudeMessages es input legítimo (no se envuelve).
    // El contexto RAG sí se envuelve en buildRAGContext() como contenido externo.
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

  const agentTask = detectAgentComplexity(trimmed, hasRagContext);
  const flags = resolveAgentFlags(trimmed, input.flags ?? {});

  let clientResolution: Awaited<ReturnType<typeof resolveClientForOrg>> = {
    client: null,
    keySource: "none",
  };
  try {
    clientResolution = await resolveClientForOrg(organizationId);
  } catch (clientErr) {
    console.error("[Agent:Claude] resolveClientForOrg failed", {
      organizationId,
      err: clientErr,
      message: clientErr instanceof Error ? clientErr.message : String(clientErr),
    });
  }

  const orgClaudeClientAvailable = Boolean(clientResolution.client);
  const orgByokKeyPresent = clientResolution.keySource === "api_key";

  console.error("[Agent:Claude] pre-call diagnostics", {
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
    conversationId,
    organizationId,
    orgByokKeyPresent,
    orgClaudeClientSource: clientResolution.keySource,
    orgClaudeClientAvailable,
    agentTask,
    hasRagContext,
    historyMessageCount: claudeMessages.length,
    flags,
    note: "callClaudeAgent() resuelve BYOK vía resolveClientForOrg()",
  });

  let agentResult: { text: string; thinkingContent: string | null; toolCall: { name: string; input: Record<string, unknown> } | null; toolCalls: { name: string; input: Record<string, unknown> }[] } | null = null;
  let claudeThrew = false;

  // Accumulated proposals created during tool-use loop
  const createdProposals: GraphProposal[] = [];
  const generatedDocuments: Array<{
    filename: string;
    signedUrl: string;
    mimeType: string;
    sizeBytes: number;
  }> = [];
  let canvasFromDocument: string | null = null;

  try {
    agentResult = await callClaudeAgent({
      organizationId,
      task: agentTask,
      feature: "agent_chat",
      cachedSystemPrompt: orgContextText,
      system,
      messages: claudeMessages,
      maxTokens: resolveAgentMaxTokens({
        enableThinking: flags.useThink,
        useCanvas: flags.useCanvas,
      }),
      thinkingBudget: resolveAgentThinkingBudget(flags.useThink),
      enableWebSearch: flags.useWebSearch,
      enableThinking: flags.useThink,
      tools: [
        GENERATE_DOCUMENT_TOOL,
        CREATE_WORKBOARD_TASKS_TOOL,
        SEARCH_WORKBOARD_TASKS_TOOL,
        UPDATE_WORKBOARD_TASK_TOOL,
        ANALYZE_CONTENT_PIECE_TOOL,
        CREATE_CONTENT_VARIANTS_TOOL,
        GET_TOP_PERFORMING_CONTENT_TOOL,
        ...ALL_PROPOSAL_TOOLS,
      ],
      onToolCall: async (name, toolInput) => {
        // -- Document generation tool --
        if (name === "generate_document") {
          const fmt = toolInput.format as "docx" | "xlsx" | "pdf" | "csv";
          const baseFilename = String(toolInput.filename ?? "documento");
          const rawContent =
            (toolInput.content as Record<string, unknown> | null | undefined) ??
            {};

          let docContent: DocumentContent;
          if (fmt === "xlsx") {
            docContent = {
              kind: "sheet",
              sheets: [
                {
                  name: "Datos",
                  table: {
                    headers: (rawContent.headers as string[]) ?? [],
                    rows: (rawContent.rows as string[][]) ?? [],
                  },
                },
              ],
            };
          } else if (fmt === "csv") {
            docContent = {
              kind: "csv",
              table: {
                headers: (rawContent.headers as string[]) ?? [],
                rows: (rawContent.rows as string[][]) ?? [],
              },
            };
          } else {
            docContent = {
              kind: fmt === "pdf" ? "pdf" : "doc",
              paragraphs:
                Array.isArray(rawContent.paragraphs) &&
                rawContent.paragraphs.length > 0
                  ? (
                      rawContent.paragraphs as { text: string; style?: string }[]
                    ).map((p) => ({
                      text: p?.text ?? "",
                      style: p?.style as
                        | "heading1"
                        | "heading2"
                        | "heading3"
                        | "body"
                        | "bullet"
                        | undefined,
                    }))
                  : [{ text: "Documento sin contenido." }],
            };
          }

          const generated = await generateDocument(fmt, docContent);
          const filename = `${baseFilename}.${generated.extension}`;
          const stored = await storeAgentDocument(organizationId, filename, generated);

          const markdown = documentContentToMarkdown(docContent);
          if (markdown.trim()) {
            canvasFromDocument = `# ${baseFilename}\n\n${markdown}`;
          }

          return JSON.stringify({
            success: true,
            filename: stored.filename,
            message:
              "Documento disponible en el panel Canvas. No incluyas links ni URLs de descarga en tu respuesta.",
          });
        }

        if (name === "create_workboard_tasks") {
          const tasks = Array.isArray(toolInput.tasks) ? toolInput.tasks : [];
          const result = await createWorkboardTasksAction({ tasks });
          return result.ok
            ? `✅ ${result.created} tarea(s) creadas en el Tablero de Trabajo.`
            : `Error al crear tareas: ${result.error}`;
        }

        if (name === "search_workboard_tasks") {
          const result = await searchWorkboardTasksAction({
            query: String(toolInput.query ?? ""),
            status: toolInput.status as
              | "todo"
              | "in_progress"
              | "review"
              | "done"
              | undefined,
          });
          return result.ok
            ? JSON.stringify(result.tasks)
            : `Error buscando tareas: ${result.error}`;
        }

        if (name === "update_workboard_task") {
          const result = await updateWorkboardTaskAction({
            task_id: String(toolInput.task_id ?? ""),
            updates: (toolInput.updates ?? {}) as WorkboardTaskUpdates,
          });
          return result.ok
            ? "✅ Tarea actualizada correctamente."
            : `Error al actualizar tarea: ${result.error}`;
        }

        if (name === "analyze_content_piece") {
          const contentPieceId = String(toolInput.content_piece_id ?? "");
          try {
            const { analyzeContentPieceAction } = await import(
              "@/app/marketing/content/actions"
            );
            const analysis = await analyzeContentPieceAction(contentPieceId);
            return JSON.stringify({
              success: true,
              analysis: {
                formato: analysis.formato.name,
                dolor: analysis.dolor.name,
                angulo: analysis.angulo.name,
                why_it_worked: analysis.why_it_worked,
              },
              message: `Análisis completado. Formato: "${analysis.formato.name}" · Dolor: "${analysis.dolor.name}" · Ángulo: "${analysis.angulo.name}"`,
            });
          } catch (err) {
            return JSON.stringify({
              success: false,
              error: err instanceof Error ? err.message : "Error desconocido",
            });
          }
        }

        if (name === "create_content_variants") {
          const sourceContentId = String(toolInput.source_content_id ?? "");
          const count = Math.min(
            Math.max(Number(toolInput.count ?? 1), 1),
            5
          );
          const instructions =
            typeof toolInput.instructions === "string"
              ? toolInput.instructions
              : undefined;

          try {
            const { createContentVariantsAction } = await import(
              "@/app/marketing/content/actions"
            );
            const variantIds = await createContentVariantsAction({
              sourceContentId,
              count,
              instructions,
            });

            return JSON.stringify({
              success: true,
              variant_ids: variantIds,
              count: variantIds.length,
              message: `Se crearon ${variantIds.length} variante(s). Podés verlas en el módulo Contenido, dentro de la pieza original, en el tab "Variantes".`,
            });
          } catch (err) {
            return JSON.stringify({
              success: false,
              error: err instanceof Error ? err.message : "Error desconocido",
            });
          }
        }

        if (name === "get_top_performing_content") {
          const metric = String(toolInput.metric ?? "engagement_total");
          const limit = Math.min(Math.max(Number(toolInput.limit ?? 10), 1), 50);
          const typeFilter = String(toolInput.type_filter ?? "all");

          try {
            const { getTopPerformingContentAction } = await import(
              "@/app/marketing/content/actions"
            );
            const { piezas: results, sinMetricas } =
              await getTopPerformingContentAction({
                metric,
                limit,
                typeFilter,
              });

            return JSON.stringify({
              success: true,
              results,
              count: results.length,
              ...avisoDePiezasSinMetricas(sinMetricas),
            });
          } catch (err) {
            return JSON.stringify({
              success: false,
              error: err instanceof Error ? err.message : "Error desconocido",
            });
          }
        }

        // -- Graph proposal tools --
        if (PROPOSAL_TOOL_NAMES.has(name as Parameters<typeof PROPOSAL_TOOL_NAMES["has"]>[0])) {
          const entityTypeMap: Record<string, GraphProposal["entityType"]> = {
            propose_customer_avatar: "customer_avatar",
            propose_product: "product",
            propose_value_ladder_step: "value_ladder_step",
            propose_sales_framework: "sales_framework",
            propose_value_proposition: "value_proposition",
          };
          const entityType = entityTypeMap[name];
          if (!entityType) return JSON.stringify({ error: "Unknown proposal tool" });

          const entityId = typeof toolInput.id === "string" ? toolInput.id : null;
          const action: "create" | "update" = entityId ? "update" : "create";
          const payload = { ...toolInput };
          delete (payload as Record<string, unknown>).id;

          try {
            const { data: proposalRow, error: insertErr } = await supabase
              .from("agent_graph_proposals")
              .insert({
                organization_id: organizationId,
                conversation_id: conversationId,
                message_id: null, // will be set after message is created
                entity_type: entityType,
                action,
                entity_id: entityId ?? null,
                payload,
                status: "pending",
              })
              .select("*")
              .single();

            if (insertErr || !proposalRow) {
              return JSON.stringify({ error: insertErr?.message ?? "Failed to save proposal" });
            }

            const proposal = rowToProposal(proposalRow as GraphProposalRow);
            createdProposals.push(proposal);

            return JSON.stringify({
              success: true,
              proposalId: proposal.id,
              message: `Propuesta registrada (${action} ${entityType}). El usuario verá la card para aprobar o descartar.`,
            });
          } catch (err) {
            return JSON.stringify({ error: String(err) });
          }
        }

        return JSON.stringify({ error: "Tool not found" });
      },
    });

    console.error("[Agent:Claude] callClaudeAgent returned", {
      organizationId,
      hasText: Boolean(agentResult?.text?.trim()),
      textLength: agentResult?.text?.length ?? 0,
      textPreview: agentResult?.text?.slice(0, 120) ?? null,
      hasThinking: Boolean(agentResult?.thinkingContent),
      toolCallName: agentResult?.toolCall?.name ?? null,
      toolCallsCount: agentResult?.toolCalls?.length ?? 0,
      createdProposalsCount: createdProposals.length,
    });
  } catch (claudeErr) {
    claudeThrew = true;
    console.error("[Agent:Claude] callClaudeAgent threw", {
      organizationId,
      err: claudeErr,
      message: claudeErr instanceof Error ? claudeErr.message : String(claudeErr),
      stack: claudeErr instanceof Error ? claudeErr.stack : undefined,
    });
    agentResult = null;
  }

  const rawAssistant = agentResult?.text ?? null;

  if (!rawAssistant) {
    console.error("[Agent:Claude] sin respuesta del modelo", {
      organizationId,
      claudeThrew,
      orgClaudeClientAvailable,
    });
    // Sin clave propia no hay IA (SCRUM-7): decirlo, no el error genérico.
    throw new Error(orgClaudeClientAvailable ? AGENT_ERROR_REPLY : NO_AI_CREDENTIALS_MESSAGE);
  }

  // Build document attachments if a document was generated via tool call
  let docAttachments: AgentMessage["attachments"] = null;
  const generatedDocument = generatedDocuments.at(-1);
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
    createdProposals.length === 0 && shouldExtractCanvas(displayContent)
      ? displayContent
      : null;

  const canvasContent =
    flags.useCanvas && createdProposals.length === 0
      ? canvasFromDocument ?? extractedCanvas
      : null;

  const chatContent =
    canvasContent !== null
      ? buildCanvasChatIntro(canvasContent.match(/^# (.+)$/m)?.[1])
      : displayContent;

  // Determine action type: proposals take priority over SOP action
  const finalActionType = createdProposals.length > 0
    ? ("graph_proposals" as const)
    : (actionResult?.actionType ?? null);
  const finalActionRefId = createdProposals.length > 0
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

  // Back-fill message_id on created proposals so the UI can load them per message
  if (createdProposals.length > 0 && assistantMsgData?.id) {
    const proposalIds = createdProposals.map((p) => p.id);
    await supabase
      .from("agent_graph_proposals")
      .update({ message_id: assistantMsgData.id })
      .in("id", proposalIds)
      .eq("organization_id", organizationId);
  }

  // Se hace await (no fire-and-forget): en serverless el runtime congela el
  // trabajo async pendiente al retornar, y la llamada a Claude del título se
  // cortaba antes del update — por eso el título quedaba en null.
  if ((priorCount ?? 0) === 0) {
    try {
      await generateConversationTitle(organizationId, conversationId, trimmed);
    } catch (titleErr) {
      console.error("[Agent:Title] generateConversationTitle failed", {
        conversationId,
        organizationId,
        message: titleErr instanceof Error ? titleErr.message : String(titleErr),
      });
    }
  }

  revalidateAgent();

  const messages = await listAgentMessagesAction(conversationId);
  return { conversationId, messages, openCanvas: flags.useCanvas };
}

