"use server";

import { revalidatePath } from "next/cache";
import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { requireAuthContext } from "@/lib/auth/require-auth";
import {
} from "@/lib/rate-limit";
import { apiKeySchema, firstZodError } from "@/lib/validations";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { paths } from "@/routes";
import {
  type ZernioComment,
  type ZernioConversation,
  type ZernioMessage,
  createZernioClient,
} from "@/lib/zernio/client";
import { callClaudeJson } from "@/lib/ai/anthropic";
import {
  getLeadMagnetUrlsForOrg,
  registerLeadMagnetFromDm,
} from "@/lib/marketing/lead-magnets-internal";
import {
  encryptZernioApiKey,
  formatZernioChannelsLabel,
  getZernioChannelStatus,
  getZernioClientForOrganization,
  getZernioIntegrationForOrg,
  mapZernioAccountToConnected,
  resolveZernioAccountName,
  resolveZernioProfileId,
  type ZernioConnectedAccount,
} from "@/lib/zernio/integration";

export type ZernioIntegrationStatus = {
  connected: boolean;
  profileId: string | null;
  accountName: string | null;
  connectedAccounts: ZernioConnectedAccount[];
  channelsLabel: string;
  hasInstagram: boolean;
  hasWhatsapp: boolean;
  lastSyncAt: string | null;
};

const EMPTY_STATUS: ZernioIntegrationStatus = {
  connected: false,
  profileId: null,
  accountName: null,
  connectedAccounts: [],
  channelsLabel: formatZernioChannelsLabel({
    hasInstagram: false,
    hasWhatsapp: false,
  }),
  hasInstagram: false,
  hasWhatsapp: false,
  lastSyncAt: null,
};

export type ZernioConnectState = {
  error?: string;
  success?: string;
  accountName?: string;
};

export type ZernioConversationWithAccount = ZernioConversation & {
  accountId: string;
};

export type ZernioCommentWithAccount = ZernioComment & {
  accountId?: string;
};

export type ZernioAnalyticsSummary = {
  totalImpressions: number;
  totalLikes: number;
  totalComments: number;
  hasData: boolean;
};

function buildStatusFromRow(
  row: NonNullable<Awaited<ReturnType<typeof getZernioIntegrationForOrg>>>
): ZernioIntegrationStatus {
  const channels = getZernioChannelStatus(row.connected_accounts);
  return {
    connected: Boolean(row.api_key),
    profileId: row.zernio_profile_id,
    accountName: row.account_name,
    connectedAccounts: row.connected_accounts,
    hasInstagram: channels.hasInstagram,
    hasWhatsapp: channels.hasWhatsapp,
    channelsLabel: formatZernioChannelsLabel(channels),
    lastSyncAt: row.updated_at,
  };
}

export async function getZernioIntegrationStatusAction(): Promise<ZernioIntegrationStatus> {
  if (!isSupabaseConfigured()) return EMPTY_STATUS;

  try {
    const organizationId = await requireOrganizationId();
    const row = await getZernioIntegrationForOrg(organizationId);
    if (!row) return EMPTY_STATUS;

    return buildStatusFromRow(row);
  } catch {
    return EMPTY_STATUS;
  }
}

export async function connectZernioAction(
  _prev: ZernioConnectState,
  formData: FormData
): Promise<ZernioConnectState> {
  const parsed = apiKeySchema.safeParse(
    String(formData.get("apiKey") ?? "").trim()
  );
  if (!parsed.success) {
    return { error: firstZodError(parsed.error) };
  }

  if (!isSupabaseConfigured()) {
    return { error: "Supabase no configurado." };
  }

  try {
    const { user, orgId: organizationId } = await requireAuthContext();
    const client = createZernioClient(parsed.data);

    let accounts: Awaited<ReturnType<typeof client.listAccounts>>["accounts"];
    try {
      ({ accounts } = await client.listAccounts());
    } catch {
      return { error: "API key inválida" };
    }

    const connectedAccounts = (accounts ?? []).map(mapZernioAccountToConnected);
    const profileId = resolveZernioProfileId(accounts ?? [], organizationId);
    const accountName = resolveZernioAccountName(connectedAccounts);

    const admin = createAdminClient();
    const { error } = await admin.from("zernio_integrations").upsert(
      {
        organization_id: organizationId,
        api_key: encryptZernioApiKey(parsed.data, organizationId),
        zernio_profile_id: profileId,
        account_name: accountName,
        connected_accounts: connectedAccounts,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id" }
    );

    if (error) throw new Error(error.message);

    revalidatePath(paths.platform.integrations);
    return {
      success: "Zernio conectado correctamente.",
      accountName,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "No se pudo conectar Zernio",
    };
  }
}

export async function refreshZernioAccountsAction() {
  const organizationId = await requireOrganizationId();
  const integration = await getZernioIntegrationForOrg(organizationId);
  if (!integration?.api_key) {
    throw new Error("Zernio no está conectado");
  }

  const client = await getZernioClientForOrganization(organizationId);
  const { accounts } = await client.listAccounts();
  const connectedAccounts = (accounts ?? []).map(mapZernioAccountToConnected);
  const profileId = resolveZernioProfileId(accounts ?? [], organizationId);
  const accountName = resolveZernioAccountName(
    connectedAccounts,
    integration.account_name
  );

  const admin = createAdminClient();
  const { error } = await admin
    .from("zernio_integrations")
    .update({
      connected_accounts: connectedAccounts,
      account_name: accountName,
      zernio_profile_id: profileId,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId);

  if (error) throw new Error(error.message);
  revalidatePath(paths.platform.integrations);
  return { connectedAccounts, accountName };
}

export async function listZernioConversationsAction(): Promise<
  ZernioConversationWithAccount[]
> {
  const organizationId = await requireOrganizationId();
  const integration = await getZernioIntegrationForOrg(organizationId);
  if (!integration?.api_key || integration.connected_accounts.length === 0) {
    return [];
  }

  const client = await getZernioClientForOrganization(organizationId);

  const results = await Promise.all(
    integration.connected_accounts.map(async (account) => {
      try {
        const result = await client.listConversations(account.accountId);
        if (result.meta.accountsFailed > 0) {
          console.warn(
            "[Zernio] listConversations failed accounts:",
            result.meta.failedAccounts
          );
        }
        return result.data.map((conversation) => ({
          ...conversation,
          accountId: conversation.accountId || account.accountId,
        }));
      } catch {
        return [];
      }
    })
  );

  return results
    .flat()
    .sort(
      (a, b) =>
        new Date(b.updatedTime).getTime() - new Date(a.updatedTime).getTime()
    );
}

export async function getZernioMessagesAction(
  conversationId: string,
  accountId: string
): Promise<ZernioMessage[]> {
  const organizationId = await requireOrganizationId();
  const integration = await getZernioIntegrationForOrg(organizationId);
  if (!integration) {
    throw new Error("Integración Zernio no configurada");
  }

  const client = await getZernioClientForOrganization(organizationId);
  const result = await client.getMessages(conversationId, accountId);
  const messages = result.data ?? [];
  return messages.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

export async function sendZernioMessageAction(
  conversationId: string,
  text: string,
  accountId: string
) {
  const organizationId = await requireOrganizationId();
  const integration = await getZernioIntegrationForOrg(organizationId);
  if (!integration) {
    throw new Error("Integración Zernio no configurada");
  }

  const client = await getZernioClientForOrganization(organizationId);
  const result = await client.sendMessage(conversationId, text, accountId);
  return result;
}

export async function listZernioCommentsAction(): Promise<ZernioCommentWithAccount[]> {
  const organizationId = await requireOrganizationId();
  const integration = await getZernioIntegrationForOrg(organizationId);
  if (!integration?.api_key || integration.connected_accounts.length === 0) {
    return [];
  }

  const client = await getZernioClientForOrganization(organizationId);

  const results = await Promise.all(
    integration.connected_accounts.map(async (account) => {
      try {
        const { comments } = await client.listComments(account.accountId);
        return comments.map((comment) => ({
          ...comment,
          accountId: account.accountId,
        }));
      } catch {
        return [];
      }
    })
  );

  return results
    .flat()
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
}

export async function getZernioPostCommentsAction(
  postId: string
): Promise<ZernioCommentWithAccount[]> {
  const organizationId = await requireOrganizationId();
  const integration = await getZernioIntegrationForOrg(organizationId);
  if (!integration?.api_key || integration.connected_accounts.length === 0) {
    return [];
  }

  const client = await getZernioClientForOrganization(organizationId);
  const account = integration.connected_accounts.find(
    (item) => item.platform.toLowerCase() === "instagram"
  );
  if (!account) return [];

  try {
    const response = await client.getPostComments(
      postId,
      account.accountId
    );
    const { comments } = response;
    return comments
      .map((comment) => ({
        _id: comment.id,
        postId,
        platform: response.meta.platform ?? "instagram",
        author: {
          name: comment.from?.name,
          username: comment.from?.username,
          profilePictureUrl: comment.from?.picture,
        },
        text: comment.message,
        isHidden: comment.isHidden,
        createdAt: comment.createdTime,
        accountId: account.accountId,
      }))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  } catch {
    const allComments = await listZernioCommentsAction();
    return allComments.filter((comment) => comment.postId === postId);
  }
}

export async function replyToZernioCommentAction(
  postId: string,
  commentId: string,
  message: string,
  accountId: string
) {
  const organizationId = await requireOrganizationId();
  const integration = await getZernioIntegrationForOrg(organizationId);
  if (!integration) {
    throw new Error("Integración Zernio no configurada");
  }

  const client = await getZernioClientForOrganization(organizationId);
  const result = await client.replyToComment(postId, commentId, message, accountId);

  const admin = createAdminClient();
  await admin
    .from("zernio_comments")
    .update({ is_replied: true })
    .eq("organization_id", organizationId)
    .eq("zernio_comment_id", commentId);

  revalidatePath(paths.platform.comentarios);
  return result;
}

export async function hideZernioCommentAction(postId: string, commentId: string) {
  const organizationId = await requireOrganizationId();
  const integration = await getZernioIntegrationForOrg(organizationId);
  if (!integration) {
    throw new Error("Integración Zernio no configurada");
  }

  const client = await getZernioClientForOrganization(organizationId);
  const result = await client.hideComment(postId, commentId);

  const admin = createAdminClient();
  await admin
    .from("zernio_comments")
    .update({ is_hidden: true })
    .eq("organization_id", organizationId)
    .eq("zernio_comment_id", commentId);

  revalidatePath(paths.platform.comentarios);
  return result;
}

export async function getZernioAnalyticsAction(): Promise<ZernioAnalyticsSummary> {
  if (!isSupabaseConfigured()) {
    return { totalImpressions: 0, totalLikes: 0, totalComments: 0, hasData: false };
  }

  try {
    const organizationId = await requireOrganizationId();

    // Verificar que Zernio esté conectado (para mostrar el empty state correcto)
    const integration = await getZernioIntegrationForOrg(organizationId);
    if (!integration) {
      return { totalImpressions: 0, totalLikes: 0, totalComments: 0, hasData: false };
    }

    // Leer métricas desde content_pieces (ya normalizadas por resolvePostAnalytics en el sync).
    // Evita llamar al endpoint /analytics/posts de Zernio que devuelve un formato inconsistente
    // y puede retornar 0 aunque haya datos, causando que el dashboard muestre "Conectá tus redes".
    const supabase = await createClient();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("content_pieces")
      .select("metrics")
      .eq("organization_id", organizationId)
      .eq("source", "zernio")
      .gte("published_at", thirtyDaysAgo);

    if (error) {
      console.warn("[getZernioAnalyticsAction] content_pieces query failed:", error.message);
      return { totalImpressions: 0, totalLikes: 0, totalComments: 0, hasData: false };
    }

    const pieces = data ?? [];

    // Si no hay piezas en los últimos 30 días, ampliar a todas las piezas Zernio
    // para detectar si hay datos históricos y mostrar el dashboard en vez del empty state.
    const allData = pieces.length === 0
      ? (await supabase
          .from("content_pieces")
          .select("metrics")
          .eq("organization_id", organizationId)
          .eq("source", "zernio")
          .limit(1)
        ).data ?? []
      : pieces;

    if (allData.length === 0) {
      // Hay integración pero todavía no se sincronizó contenido
      return { totalImpressions: 0, totalLikes: 0, totalComments: 0, hasData: false };
    }

    let totalImpressions = 0;
    let totalLikes = 0;
    let totalComments = 0;

    for (const row of pieces) {
      const m = row.metrics as Record<string, number> | null;
      if (!m) continue;
      totalImpressions += m.impressions ?? 0;
      totalLikes += m.likes ?? 0;
      totalComments += m.comments ?? 0;
    }

    // hasData = true si hay piezas de Zernio (aunque las métricas sean 0 por no haber
    // corrido el sync de métricas todavía) — muestra el ring chart en vez del empty state.
    return { totalImpressions, totalLikes, totalComments, hasData: true };
  } catch (err) {
    console.error("[getZernioAnalyticsAction] unexpected error:", err instanceof Error ? err.message : err);
    return { totalImpressions: 0, totalLikes: 0, totalComments: 0, hasData: false };
  }
}

export type ZernioAnalysisSummary = {
  ai_tag?: string;
  ai_status?: string;
  ai_qualification?: string;
  ai_ghosting_risk?: string;
  agenda_sent?: boolean;
  is_scheduled?: boolean;
  scheduling_process_missing?: boolean;
};

export type ZernioAnalysisResult = ZernioAnalysisSummary & {
  success: boolean;
  ai_sentiment?: string;
  ai_pain_point?: string;
  ai_recommended_action?: string;
  ai_summary?: string;
  link_sent?: boolean;
  suggested_next_message?: string;
  scheduling_process_missing?: boolean;
  error?: string;
};

export async function analyzeZernioConversationAction(
  conversationId: string,
  accountId: string,
  participantName: string,
  platform: string,
  messages: Array<{ text?: string; direction: string; createdAt: string }>
): Promise<ZernioAnalysisResult> {
  try {
    const organizationId = await requireOrganizationId();
    const admin = createAdminClient();

    const { data: sopRows } = await admin
      .from("sops")
      .select("title, content")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .or(
        "title.ilike.%agendamiento%,title.ilike.%agenda%,title.ilike.%proceso de venta%,tags.cs.{agendamiento}"
      )
      .limit(1);

    const schedulingSop = sopRows?.[0] ?? null;
    const schedulingProcessMissing = !schedulingSop;

    const conversationText = messages
      .slice(-40)
      .map((m) => {
        const isOutbound =
          m.direction === "outbound" || m.direction === "outgoing";
        return `[${isOutbound ? "NOSOTROS" : participantName}]: ${m.text ?? ""}`;
      })
      .join("\n");

    const schedulingContext = schedulingSop
      ? `\n\n## PROCESO DE AGENDAMIENTO DEL NEGOCIO\nUsá este proceso para recomendar el siguiente mensaje al setter:\n\n${schedulingSop.content}`
      : `\n\n## PROCESO DE AGENDAMIENTO\nNo se encontró ningún documento de proceso de agendamiento en la base de conocimiento. Igualmente intentá sugerir el mejor próximo mensaje posible basándote en el contexto de la conversación.`;

    const result = await callClaudeJson<{
      ai_tag: string;
      ai_status: string;
      ai_qualification: string;
      ai_sentiment: string;
      ai_pain_point: string;
      ai_recommended_action: string;
      ai_ghosting_risk: string;
      ai_summary: string;
      agenda_sent: boolean;
      is_scheduled: boolean;
      link_sent: boolean;
      suggested_next_message: string;
    }>({
      organizationId,
      task: "conversation_scoring",
      feature: "zernio_conversation_analysis",
      system:
        "Respondé únicamente con JSON válido en español, sin markdown ni texto adicional.",
      user: `Analizá esta conversación de ${platform} con ${participantName} y respondé en español con JSON exacto:

${conversationText}
${schedulingContext}

Devolvé este JSON (sin markdown, solo JSON):
{
  "ai_tag": "caliente|tibio|frio|agendado|no_interesado",
  "ai_status": "interesado|no_interesado|agendado|esperando_respuesta",
  "ai_qualification": "alto|medio|bajo",
  "ai_sentiment": "positivo|neutral|negativo",
  "ai_pain_point": "el dolor o problema principal que mencionó en máx 100 chars",
  "ai_recommended_action": "qué hacer ahora en máx 150 chars",
  "ai_ghosting_risk": "alto|medio|bajo",
  "ai_summary": "resumen de 2 líneas de la conversación",
  "agenda_sent": true/false,
  "is_scheduled": true/false,
  "link_sent": true/false,
  "suggested_next_message": "el mensaje exacto que el setter debería enviar ahora, en el tono y plataforma correctos, máx 300 chars. Si el lead ya está agendado o no interesado, dejalo como cadena vacía."
}`,
    });

    if (!result) {
      throw new Error("El análisis IA no devolvió resultado");
    }

    // ── Detección de Lead Magnets en mensajes salientes ──────────────────────
    // Obtener LMs activos de la org con sus URLs
    const lmUrls = await getLeadMagnetUrlsForOrg(organizationId);
    if (lmUrls.length > 0) {
      // Solo mensajes outbound (los que envía el equipo)
      const outboundTexts = messages
        .filter((m) => m.direction === "outbound" || m.direction === "outgoing")
        .map((m) => m.text ?? "")
        .join(" ");

      for (const lm of lmUrls) {
        const urlsToCheck = [lm.assetUrl, lm.redirectUrl].filter(Boolean) as string[];
        const found = urlsToCheck.some(
          (url) => outboundTexts.includes(url)
        );
        if (found) {
          // Registrar el lead (idempotente por conversationId + leadMagnetId)
          await registerLeadMagnetFromDm({
            organizationId,
            conversationId,
            participantName,
            leadMagnetId: lm.id,
          });
        }
      }
    }

    await admin.from("zernio_conversation_analysis").upsert(
      {
        organization_id: organizationId,
        conversation_id: conversationId,
        account_id: accountId,
        participant_name: participantName,
        platform,
        message_count: messages.length,
        last_analyzed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        scheduling_process_missing: schedulingProcessMissing,
        ...result,
      },
      { onConflict: "organization_id,conversation_id" }
    );

    return {
      success: true,
      scheduling_process_missing: schedulingProcessMissing,
      ...result,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}

export async function getZernioAnalysisBatchAction(
  conversationIds: string[]
): Promise<Record<string, ZernioAnalysisSummary>> {
  if (conversationIds.length === 0) return {};
  try {
    const organizationId = await requireOrganizationId();
    const admin = createAdminClient();
    const { data } = await admin
      .from("zernio_conversation_analysis")
      .select(
        "conversation_id, ai_tag, ai_status, ai_qualification, ai_ghosting_risk, agenda_sent, is_scheduled"
      )
      .eq("organization_id", organizationId)
      .in("conversation_id", conversationIds);

    const map: Record<string, ZernioAnalysisSummary> = {};
    for (const row of data ?? []) {
      map[row.conversation_id as string] = {
        ai_tag: row.ai_tag as string | undefined,
        ai_status: row.ai_status as string | undefined,
        ai_qualification: row.ai_qualification as string | undefined,
        ai_ghosting_risk: row.ai_ghosting_risk as string | undefined,
        agenda_sent: row.agenda_sent as boolean | undefined,
        is_scheduled: row.is_scheduled as boolean | undefined,
      };
    }
    return map;
  } catch {
    return {};
  }
}
