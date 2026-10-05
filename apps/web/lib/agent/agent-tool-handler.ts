import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateDocument,
  type DocumentContent,
} from "@/lib/agent/document-generator";
import { storeAgentDocument } from "@/lib/agent/document-storage";
import { documentContentToMarkdown } from "@/lib/agent/document-to-markdown";
import {
  PROPOSAL_TOOL_NAMES,
} from "@/lib/agent/graph-proposal-tools";
import { DATA_READER_TOOL_NAMES } from "@/lib/agent/data-reader-tools";
import { avisoDePiezasSinMetricas } from "@/lib/marketing/ranking-de-contenido";
import {
  handleGetBusinessSnapshot,
  handleGetClientsData,
  handleGetSalesMetrics,
  handleGetClosingCalls,
  handleGetFinanceSummary,
  handleGetMarketingOverview,
  handleGetLeadMagnetsData,
  handleGetOperationsSummary,
} from "@/lib/agent/data-reader-handlers";
import { rowToProposal, type GraphProposalRow } from "@/lib/agent/mapper";
import type { GraphProposal } from "@/types/agent";
import type { WorkboardTaskUpdates } from "@/app/agent/workboard-actions";

export type AgentToolHandlerState = {
  canvasFromDocument: string | null;
  createdProposals: GraphProposal[];
  generatedDocuments: Array<{
    filename: string;
    signedUrl: string;
    mimeType: string;
    sizeBytes: number;
  }>;
};

export type AgentToolHandlerContext = {
  organizationId: string;
  conversationId: string;
  supabase: SupabaseClient;
  state: AgentToolHandlerState;
};

export function createAgentToolHandler(ctx: AgentToolHandlerContext) {
  return async (
    name: string,
    toolInput: Record<string, unknown>
  ): Promise<string> => {
    const { organizationId, conversationId, supabase, state } = ctx;

    // ── Data reader tools (acceso a todos los módulos) ─────────────────────────
    if (DATA_READER_TOOL_NAMES.has(name as Parameters<typeof DATA_READER_TOOL_NAMES["has"]>[0])) {
      const ctx = { organizationId, supabase };
      switch (name) {
        case "get_business_snapshot":
          return handleGetBusinessSnapshot(ctx, toolInput);
        case "get_clients_data":
          return handleGetClientsData(ctx, toolInput);
        case "get_sales_metrics":
          return handleGetSalesMetrics(ctx, toolInput);
        case "get_closing_calls":
          return handleGetClosingCalls(ctx, toolInput);
        case "get_finance_summary":
          return handleGetFinanceSummary(ctx, toolInput);
        case "get_marketing_overview":
          return handleGetMarketingOverview(ctx, toolInput);
        case "get_lead_magnets_data":
          return handleGetLeadMagnetsData(ctx);
        case "get_operations_summary":
          return handleGetOperationsSummary(ctx);
        default:
          return JSON.stringify({ error: "Data reader tool not implemented" });
      }
    }

    if (name === "generate_document") {
      const fmt = toolInput.format as "docx" | "xlsx" | "pdf" | "csv";
      const baseFilename = String(toolInput.filename ?? "documento");
      const rawContent =
        (toolInput.content as Record<string, unknown> | null | undefined) ?? {};

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
        state.canvasFromDocument = `# ${baseFilename}\n\n${markdown}`;
      }

      state.generatedDocuments.push({
        filename: stored.filename,
        signedUrl: stored.signedUrl,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
      });

      return JSON.stringify({
        success: true,
        filename: stored.filename,
        message:
          "Documento disponible en el panel Canvas. No incluyas links ni URLs de descarga en tu respuesta.",
      });
    }

    if (name === "create_workboard_tasks") {
      const { createWorkboardTasksAction } = await import("@/app/agent/workboard-actions");
      const tasks = Array.isArray(toolInput.tasks) ? toolInput.tasks : [];
      const result = await createWorkboardTasksAction({ tasks });
      return result.ok
        ? `✅ ${result.created} tarea(s) creadas en el Tablero de Trabajo.`
        : `Error al crear tareas: ${result.error}`;
    }

    if (name === "search_workboard_tasks") {
      const { searchWorkboardTasksAction } = await import("@/app/agent/workboard-actions");
      const query = String(toolInput.query ?? "");
      const result = await searchWorkboardTasksAction({
        query,
        status: toolInput.status as
          | "todo"
          | "in_progress"
          | "review"
          | "done"
          | undefined,
      });
      if (!result.ok) {
        return JSON.stringify({
          success: false,
          error: result.error,
          suggestion:
            "Reintentá la búsqueda con menos palabras o sin filtro de estado.",
        });
      }
      if (result.tasks.length === 0) {
        return JSON.stringify({
          success: true,
          tasks: [],
          message: query
            ? `No se encontraron tareas que coincidan con "${query}".`
            : "El Tablero de Trabajo no tiene tareas todavía.",
          suggestion:
            "Probá con otras palabras clave del título, quitá el filtro de estado, o buscá con query vacío ('') para listar todas las tareas. Si igual no hay resultados, confirmá con el usuario el nombre de la tarea antes de intentar modificarla.",
        });
      }
      return JSON.stringify({ success: true, tasks: result.tasks });
    }

    if (name === "update_workboard_task") {
      const { updateWorkboardTaskAction } = await import("@/app/agent/workboard-actions");
      const result = await updateWorkboardTaskAction({
        task_id: String(toolInput.task_id ?? ""),
        updates: (toolInput.updates ?? {}) as WorkboardTaskUpdates,
      });
      if (result.ok) {
        return JSON.stringify({
          success: true,
          message: "Tarea actualizada correctamente.",
        });
      }
      return JSON.stringify({
        success: false,
        error: result.error,
        suggestion:
          "Verificá que el task_id provenga de search_workboard_tasks (no lo inventes). Volvé a buscar la tarea por título para obtener el id correcto y reintentá.",
      });
    }

    if (name === "analyze_content_piece") {
      const contentPieceId = String(toolInput.content_piece_id ?? "");
      try {
        const { analyzeContentPieceAction } = await import(
          "@/app/marketing/content/actions"
        );
        if (!contentPieceId) {
          return JSON.stringify({
            success: false,
            error: "Falta content_piece_id.",
            suggestion:
              "Conseguí el id de la pieza con get_top_performing_content (busca por métrica y filtra por tipo) antes de analizarla. No inventes el id.",
          });
        }
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
          suggestion:
            "La pieza puede no tener un archivo de Drive vinculado, o el id puede ser incorrecto. Confirmá con get_top_performing_content que el id existe, o avisale al usuario que la pieza necesita un archivo vinculado para analizarse.",
        });
      }
    }

    if (name === "create_content_variants") {
      const sourceContentId = String(toolInput.source_content_id ?? "");
      const count = Math.min(Math.max(Number(toolInput.count ?? 1), 1), 5);
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
          message: `Se crearon ${variantIds.length} variante(s). Podés verlas en el módulo Contenido.`,
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

        if (results.length === 0) {
          return JSON.stringify({
            success: true,
            results: [],
            count: 0,
            ...avisoDePiezasSinMetricas(sinMetricas),
            message: `No hay piezas de contenido${
              typeFilter !== "all" ? ` del tipo "${typeFilter}"` : ""
            } con datos para la métrica "${metric}".`,
            suggestion:
              "Probá con type_filter='all' o con otra métrica (ej: 'engagement_total'). Si sigue vacío, es probable que el módulo Contenido aún no tenga piezas cargadas — avisale al usuario.",
          });
        }

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
          suggestion:
            "Reintentá con type_filter='all' y metric='engagement_total'. Si el error persiste, informá al usuario que no se pudo acceder a las métricas de contenido.",
        });
      }
    }

    if (
      PROPOSAL_TOOL_NAMES.has(
        name as Parameters<typeof PROPOSAL_TOOL_NAMES["has"]>[0]
      )
    ) {
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
            message_id: null,
            entity_type: entityType,
            action,
            entity_id: entityId ?? null,
            payload,
            status: "pending",
          })
          .select("*")
          .single();

        if (insertErr || !proposalRow) {
          return JSON.stringify({
            error: insertErr?.message ?? "Failed to save proposal",
          });
        }

        const proposal = rowToProposal(proposalRow as GraphProposalRow);
        state.createdProposals.push(proposal);

        return JSON.stringify({
          success: true,
          proposalId: proposal.id,
          message: `Propuesta registrada (${action} ${entityType}).`,
        });
      } catch (err) {
        return JSON.stringify({ error: String(err) });
      }
    }

    return JSON.stringify({ error: "Tool not found" });
  };
}
