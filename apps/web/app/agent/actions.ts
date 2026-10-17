"use server";

import { brand } from "@/lib/brand";


import { revalidatePath } from "next/cache";
import {
  isMissingTableError,
  requireOrganizationId,
  tryRequireOrganizationId,
} from "@/lib/auth/bootstrap";
import {
  AGENT_ERROR_REPLY,
  CONVERSACION_NO_ENCONTRADA,
  contextoDeSesion,
  exigirUuid,
} from "@/lib/agent/errores-del-agente";
import {
  ErrorEsperable,
  FallaDeLaBase,
  mutacionConErroresEsperables,
  registrarFallaDeAccion,
  type MutationResult,
} from "@/lib/server/action-result";
import { lecturaDegradable, valorSiNoEsFalla } from "@/lib/server/lectura-degradable";
import { esTablaAusente } from "@/lib/server/tabla-ausente";
import { rechazoConocidoDeClaude } from "@/lib/ai/rechazo-de-claude";
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
  uuidSchema,
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

/*
 * Errores como valor (SCRUM-506): las seis acciones que usa la pantalla del
 * Agente y el chat flotante (`listAgentMessagesAction`,
 * `createBusinessStageAction`, `createAgentConversationAction`,
 * `deleteAgentConversationAction`, `deleteBusinessStageAction` y
 * `sendAgentMessageAction`) corren dentro de `mutacionConErroresEsperables` y
 * devuelven `MutationResult`. Los rechazos conocidos (sesión, ID inválido,
 * conversación inexistente o de otra organización, límite de pedidos, sin
 * clave de Claude, clave rechazada o cuenta sin créditos) son `ErrorEsperable`
 * y vuelven con su motivo; un error de la base es `FallaDeLaBase` y, como
 * cualquier otra falla, se registra en Sentry y vuelve con un texto fijo.
 *
 * La pantalla del Agente envía los mensajes por la ruta SSE
 * `app/api/agent/send/route.ts` (`lib/agent/stream-agent-message.ts`), que
 * manda el motivo en el evento `error` del stream: ese protocolo no cambia. La
 * acción `sendAgentMessageAction` es la del chat flotante.
 */

type ClienteDeSupabase = Awaited<ReturnType<typeof createClient>>;

async function getOrgName(supabase: ClienteDeSupabase, organizationId: string) {
  const { data, error } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", organizationId)
    .maybeSingle();
  if (error) throw new FallaDeLaBase(error);
  return data?.name ?? "tu negocio";
}

async function leerEtapa(
  supabase: ClienteDeSupabase,
  organizationId: string,
  stageId: string
): Promise<BusinessStage | null> {
  const { data: stageRow, error } = await supabase
    .from("business_stages")
    .select("*")
    .eq("id", stageId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new FallaDeLaBase(error);
  return stageRow ? rowToStage(stageRow) : null;
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

/**
 * Los mensajes de una conversación de la organización, con sus propuestas de
 * grafo. Lanza: una falla de la base es `FallaDeLaBase`. Antes de su migración
 * (tabla ausente, por código) no hay mensajes. Si falla la lectura de las
 * propuestas, los mensajes se muestran igual y la falla queda registrada.
 */
async function leerMensajesDeConversacion(
  supabase: ClienteDeSupabase,
  organizationId: string,
  conversationId: string
): Promise<AgentMessage[]> {
  const { data, error } = await supabase
    .from("agent_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (error) {
    if (esTablaAusente(error)) return [];
    throw new FallaDeLaBase(error);
  }

  const rows = (data ?? []) as AgentMessageRow[];

  // Collect IDs of messages that have graph proposals attached
  const graphProposalMessageIds = rows
    .filter((r) => r.action_type === "graph_proposals")
    .map((r) => r.id);

  const proposalsByMessage: Map<string, GraphProposal[]> =
    graphProposalMessageIds.length > 0
      ? await lecturaDegradable(
          "agente:propuestas-de-los-mensajes",
          () => leerPropuestasPorMensaje(supabase, organizationId, graphProposalMessageIds),
          new Map<string, GraphProposal[]>()
        )
      : new Map();

  return rows.map((row) =>
    rowToMessage(row, proposalsByMessage.get(row.id) ?? null)
  );
}

async function leerPropuestasPorMensaje(
  supabase: ClienteDeSupabase,
  organizationId: string,
  messageIds: string[]
): Promise<Map<string, GraphProposal[]>> {
  const proposalsByMessage: Map<string, GraphProposal[]> = new Map();
  const { data: proposalData, error } = await supabase
    .from("agent_graph_proposals")
    .select("*")
    .eq("organization_id", organizationId)
    .in("message_id", messageIds)
    .order("created_at", { ascending: true });

  if (error) {
    // Antes de su migración la tabla no existe: los mensajes van sin propuestas.
    if (esTablaAusente(error)) return proposalsByMessage;
    throw new FallaDeLaBase(error);
  }

  for (const row of proposalData ?? []) {
    const p = rowToProposal(row as GraphProposalRow);
    if (!p.messageId) continue;
    const list = proposalsByMessage.get(p.messageId) ?? [];
    list.push(p);
    proposalsByMessage.set(p.messageId, list);
  }
  return proposalsByMessage;
}

export async function listAgentMessagesAction(
  conversationId: string
): Promise<MutationResult<AgentMessage[]>> {
  return mutacionConErroresEsperables("[listAgentMessages]", async () => {
    if (!isSupabaseConfigured()) return [];
    const id = exigirUuid(conversationId);

    // Sin sesión la lectura siempre devolvió vacío; una falla al resolver la
    // organización ya no se esconde: se registra y vuelve con el texto fijo.
    const organizationId = await requireOrganizationId().catch((error: unknown) =>
      valorSiNoEsFalla<string | null>(error, null)
    );
    if (!organizationId) return [];

    const supabase = await createClient();
    return leerMensajesDeConversacion(supabase, organizationId, id);
  });
}

export async function createBusinessStageAction(input: {
  name: string;
  description?: string;
}): Promise<MutationResult<BusinessStage>> {
  return mutacionConErroresEsperables("[createBusinessStage]", async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { count, error: countError } = await supabase
      .from("business_stages")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId);
    if (countError) throw new FallaDeLaBase(countError);

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

    if (error) throw new FallaDeLaBase(error);
    revalidateAgent();
    return rowToStage(data);
  });
}

/** Crea una conversación de la organización. Lanza `FallaDeLaBase` si la base falla. */
async function crearConversacion(
  supabase: ClienteDeSupabase,
  organizationId: string,
  title: string | null
): Promise<AgentConversation> {
  const { data, error } = await supabase
    .from("agent_conversations")
    .insert({
      organization_id: organizationId,
      project_id: null,
      stage_id: null,
      title,
    })
    .select("*")
    .single();

  if (error) throw new FallaDeLaBase(error);
  if (!data) throw new Error("La base no devolvió la conversación creada");

  revalidateAgent();
  return rowToConversation(data as AgentConversationRow);
}

export async function createAgentConversationAction(opts?: {
  title?: string | null;
}): Promise<MutationResult<AgentConversation>> {
  return mutacionConErroresEsperables("[createAgentConversation]", async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    return crearConversacion(supabase, organizationId, opts?.title ?? null);
  });
}

export async function deleteAgentConversationAction(
  conversationId: string
): Promise<MutationResult<void>> {
  return mutacionConErroresEsperables("[deleteAgentConversation]", async () => {
    const id = exigirUuid(conversationId);
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { error } = await supabase
      .from("agent_conversations")
      .delete()
      .eq("id", id)
      .eq("organization_id", organizationId);

    if (error) throw new FallaDeLaBase(error);
    revalidateAgent();
  });
}

export async function deleteBusinessStageAction(
  stageId: string
): Promise<MutationResult<void>> {
  return mutacionConErroresEsperables("[deleteBusinessStage]", async () => {
    const id = exigirUuid(stageId);
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { error } = await supabase
      .from("business_stages")
      .delete()
      .eq("id", id)
      .eq("organization_id", organizationId);

    if (error) throw new FallaDeLaBase(error);
    revalidateAgent();
  });
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
  supabase: ClienteDeSupabase,
  organizationId: string,
  excludeConversationId: string
): Promise<AgentMessage[]> {
  const { data, error } = await supabase
    .from("agent_messages")
    .select("*")
    .eq("organization_id", organizationId)
    .neq("conversation_id", excludeConversationId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new FallaDeLaBase(error);

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
        throw new ErrorEsperable(rateLimitErrorMessage(resetAt));
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
        throw new ErrorEsperable(firstZodError(parsed.error));
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

      if (error) throw new FallaDeLaBase(error);
      revalidatePath(paths.platform.sops.root);
      return { actionType: "created_sop", actionRefId: data.id };
    }
  }
  return null;
}

type SendAgentMessageInput = {
  conversationId?: string | null;
  content: string;
  /** Contexto de etapa solo para el prompt; no se persiste en la conversación. */
  contextStageId?: string | null;
  /** Contexto de la página actual (content piece, lead, etc.). */
  pageContext?: PageContextState | null;
  flags?: AgentFlags;
};

type SendAgentMessageResult = {
  conversationId: string;
  messages: AgentMessage[];
  openCanvas: boolean;
};

/**
 * El chat flotante (`providers/floating-chat-provider.tsx`). Un rechazo
 * conocido vuelve con su motivo: sin sesión, límite de pedidos, el texto
 * inválido, conversación inexistente o de otra organización, sin clave de
 * Claude (no hay clave global de respaldo, SCRUM-7), la clave rechazada por
 * Anthropic o la cuenta sin créditos o con el límite de gasto alcanzado
 * (`rechazoConocidoDeClaude`). Cualquier otra falla (la base, la red, un
 * error de Anthropic que no es de la clave ni del saldo, una respuesta vacía)
 * se registra y vuelve con el texto de siempre del agente, `AGENT_ERROR_REPLY`.
 */
export async function sendAgentMessageAction(
  input: SendAgentMessageInput
): Promise<MutationResult<SendAgentMessageResult>> {
  return mutacionConErroresEsperables(
    "[sendAgentMessage]",
    () => enviarMensajeAlAgente(input),
    AGENT_ERROR_REPLY
  );
}

async function enviarMensajeAlAgente(
  input: SendAgentMessageInput
): Promise<SendAgentMessageResult> {
  const { user, orgId: organizationId } = await contextoDeSesion();

  const { allowed, resetAt } = await aiRateLimit(user.id);
  if (!allowed) {
    throw new ErrorEsperable(rateLimitErrorMessage(resetAt));
  }

  const parsedContent = aiPromptSchema.safeParse(input.content);
  if (!parsedContent.success) {
    throw new ErrorEsperable(firstZodError(parsedContent.error));
  }
  const conversacionPedida = input.conversationId
    ? exigirUuid(input.conversationId)
    : null;

  const supabase = await createClient();
  const trimmed = sanitizeText(parsedContent.data);

  const conversationId =
    conversacionPedida ??
    (await crearConversacion(supabase, organizationId, null)).id;

  const { data: convRow, error: convError } = await supabase
    .from("agent_conversations")
    .select("*")
    .eq("id", conversationId)
    .eq("organization_id", organizationId)
    .single();

  if (convError) {
    // PGRST116: `.single()` sin filas (no existe o es de otra organización).
    if (convError.code === "PGRST116") throw new ErrorEsperable(CONVERSACION_NO_ENCONTRADA);
    throw new FallaDeLaBase(convError);
  }
  if (!convRow) throw new ErrorEsperable(CONVERSACION_NO_ENCONTRADA);

  // Si falla, se sigue como antes (sin el conteo, el título se genera) y la
  // falla queda registrada.
  const priorCount = await lecturaDegradable(
    "agente:mensajes-previos",
    async () => {
      const { count, error } = await supabase
        .from("agent_messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conversationId);
      if (error) throw new FallaDeLaBase(error);
      return count;
    },
    null
  );

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

  if (userErr) throw new FallaDeLaBase(userErr);

  const { error: fechaErr } = await supabase
    .from("agent_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);
  // No corta el envío (sólo ordena el historial), pero no se esconde.
  if (fechaErr) {
    registrarFallaDeAccion("[sendAgentMessage] updated_at", new FallaDeLaBase(fechaErr));
  }

  const history = await leerMensajesDeConversacion(
    supabase,
    organizationId,
    conversationId
  );
  const recentOrg = await lecturaDegradable(
    "agente:mensajes-recientes",
    () => getRecentOrgMessages(supabase, organizationId, conversationId),
    []
  );

  // Una etapa con un ID que no es UUID se ignora, como antes (la consulta
  // fallaba y no se usaba la etapa).
  const etapaPedida = uuidSchema.safeParse(input.contextStageId);
  const stageForPrompt: BusinessStage | null = etapaPedida.success
    ? await lecturaDegradable(
        "agente:etapa-del-prompt",
        () => leerEtapa(supabase, organizationId, etapaPedida.data),
        null
      )
    : null;

  const orgName = await lecturaDegradable(
    "agente:nombre-de-la-org",
    () => getOrgName(supabase, organizationId),
    "tu negocio"
  );
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
  let errorDeClaude: unknown = null;

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
            // Devuelve su error como valor (SCRUM-502).
            const resultado = await analyzeContentPieceAction(contentPieceId);
            if (!resultado.success) {
              return JSON.stringify({ success: false, error: resultado.error });
            }
            const analysis = resultado.data;
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
            const resultado = await createContentVariantsAction({
              sourceContentId,
              count,
              instructions,
            });
            if (!resultado.success) {
              return JSON.stringify({ success: false, error: resultado.error });
            }
            const variantIds = resultado.data;

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
            const resultado = await getTopPerformingContentAction({
              metric,
              limit,
              typeFilter,
            });
            if (!resultado.success) {
              return JSON.stringify({ success: false, error: resultado.error });
            }
            const { piezas: results, sinMetricas } = resultado.data;

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
    errorDeClaude = claudeErr;
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
    // La clave rechazada o la cuenta sin créditos vuelven con su motivo
    // (`rechazoConocidoDeClaude`); cualquier otro error de Claude (también una
    // falla de la base al leer la clave) es una falla: se registra y el usuario
    // ve `AGENT_ERROR_REPLY`.
    if (claudeThrew) throw rechazoConocidoDeClaude(errorDeClaude);
    // Sin clave propia no hay IA (SCRUM-7): decirlo, no el error genérico.
    if (!orgClaudeClientAvailable) throw new ErrorEsperable(NO_AI_CREDENTIALS_MESSAGE);
    throw new Error("Claude no devolvió texto para el agente");
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

  if (assistantErr) throw new FallaDeLaBase(assistantErr);

  // Back-fill message_id on created proposals so the UI can load them per message
  if (createdProposals.length > 0 && assistantMsgData?.id) {
    const proposalIds = createdProposals.map((p) => p.id);
    const { error: propuestasErr } = await supabase
      .from("agent_graph_proposals")
      .update({ message_id: assistantMsgData.id })
      .in("id", proposalIds)
      .eq("organization_id", organizationId);
    // La respuesta ya está guardada: no se corta, pero no se esconde.
    if (propuestasErr) {
      registrarFallaDeAccion(
        "[sendAgentMessage] message_id de las propuestas",
        new FallaDeLaBase(propuestasErr)
      );
    }
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

  const messages = await leerMensajesDeConversacion(
    supabase,
    organizationId,
    conversationId
  );
  return { conversationId, messages, openCanvas: flags.useCanvas };
}

