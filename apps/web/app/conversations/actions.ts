"use server";

import {
  isMissingTableError,
  requireOrganizationId,
  tryRequireOrganizationId,
} from "@/lib/auth/bootstrap";
import { repairClosingConversationLinks } from "@/lib/conversations/repair-links";
import {
  patchToConversationUpdateRow,
  rowToConversation,
  type ConversationRow,
} from "@/lib/conversations/mapper";
import {
  fetchConnectedUnipileAccounts,
  filterConversationsForInbox,
  type ConnectedUnipileAccount,
} from "@/lib/sales/unipile-inbox-filter";
import { scoreConversation } from "@/lib/manychat/score-conversation";
import { sendUnipileChatMessage, UnipileApiError } from "@/lib/unipile/client";
import { createClient } from "@/lib/supabase/server";
import {
  rechazoDeLecturaDelMarco,
  type RechazoPorModulo,
} from "@/lib/auth/acceso-a-modulo";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  firstZodError,
  updateConversationTagSchema,
} from "@/lib/validations";
import type { Conversation, SalesMessage } from "@/types/sales";

export async function getConversationIdByExternalRef(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  externalRef: string
): Promise<string | null> {
  const { data } = await supabase
    .from("conversations")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("external_ref", externalRef)
    .maybeSingle();

  return data?.id ?? null;
}

/** Org efectiva del usuario (misma resolución que listConversations). */
export async function getOrganizationIdAction(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  return tryRequireOrganizationId();
}

export async function getConnectedUnipileAccountsAction(): Promise<
  ConnectedUnipileAccount[] | RechazoPorModulo
> {
  if (!isSupabaseConfigured()) return [];

  const rechazo = await rechazoDeLecturaDelMarco("conversaciones");
  if (rechazo) return rechazo;

  const organizationId = await tryRequireOrganizationId();
  if (!organizationId) return [];

  const supabase = await createClient();
  return fetchConnectedUnipileAccounts(supabase, organizationId);
}

export async function listConversationsAction(): Promise<Conversation[] | RechazoPorModulo> {
  if (!isSupabaseConfigured()) return [];

  const rechazo = await rechazoDeLecturaDelMarco("conversaciones");
  if (rechazo) return rechazo;

  const organizationId = await tryRequireOrganizationId();
  if (!organizationId) return [];

  const supabase = await createClient();

  await repairClosingConversationLinks(supabase, organizationId);

  const connectedAccounts = await fetchConnectedUnipileAccounts(
    supabase,
    organizationId
  );

  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("organization_id", organizationId)
    .order("last_message_at", { ascending: false });

  if (error) {
    if (isMissingTableError(error.message)) {
      console.error(
        "[listConversations] Ejecuta supabase/migrations/20260521500000_conversations.sql"
      );
    } else {
      console.error("[listConversations]", error.message);
    }
    return [];
  }

  const rows = filterConversationsForInbox(
    data as ConversationRow[],
    connectedAccounts
  );

  return rows.map(rowToConversation);
}

export async function updateConversationTagAction(
  id: string,
  tag: unknown
): Promise<Conversation> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase no configurado");
  }

  const parsed = updateConversationTagSchema.safeParse({ id, tag });
  if (!parsed.success) {
    throw new Error(firstZodError(parsed.error));
  }

  const supabase = await createClient();
  const updateRow = patchToConversationUpdateRow({ tag: parsed.data.tag });

  const { data, error } = await supabase
    .from("conversations")
    .update(updateRow)
    .eq("id", parsed.data.id)
    .select()
    .single();

  if (error || !data) {
    throw new Error(mapConversationError(error?.message ?? "No se pudo actualizar"));
  }

  return rowToConversation(data as ConversationRow);
}

function mapConversationError(msg: string): string {
  if (isMissingTableError(msg)) {
    return "Falta la tabla conversations. Ejecuta la migración en Supabase SQL Editor.";
  }
  return msg;
}

export async function markConversationReadAction(
  conversationId: string
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const organizationId = await tryRequireOrganizationId();
  if (!organizationId) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("conversations")
    .update({ unread: false, updated_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("organization_id", organizationId);

  if (error) {
    console.error("[markConversationRead]", error.message);
  }
}

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

const UNIPILE_REF_RE = /^unipile:(instagram|whatsapp):(.+)$/;

function mapUnipileSendError(err: UnipileApiError): string {
  if (err.status === 401 || err.status === 403) {
    return "La cuenta de mensajería está desconectada o sin permisos. Reconectala desde Integraciones.";
  }
  if (err.status === 404) {
    return "El chat ya no existe en la plataforma de origen.";
  }
  if (err.status === 422) {
    return "El mensaje fue rechazado por la plataforma (contenido o adjunto inválido).";
  }
  if (err.status === 429) {
    return "Límite de envío alcanzado. Esperá unos segundos y volvé a intentar.";
  }
  return `No se pudo enviar el mensaje (error ${err.status}).`;
}

export type SendConversationMessageResult =
  | { success: true; conversation: Conversation }
  | { success: false; error: string };

/**
 * Envía una respuesta del equipo vía Unipile (Instagram / WhatsApp) y la
 * persiste en la conversación local. FormData: conversationId, text,
 * attachment (File, opcional, máx. 15MB).
 */
export async function sendConversationMessageAction(
  formData: FormData
): Promise<SendConversationMessageResult> {
  try {
    if (!isSupabaseConfigured()) {
      return { success: false, error: "Supabase no configurado." };
    }

    const conversationId = String(formData.get("conversationId") ?? "").trim();
    const text = String(formData.get("text") ?? "").trim();
    const attachmentEntry = formData.get("attachment");
    const attachment =
      attachmentEntry instanceof File && attachmentEntry.size > 0
        ? attachmentEntry
        : null;

    if (!conversationId) {
      return { success: false, error: "Conversación inválida." };
    }
    if (!text && !attachment) {
      return { success: false, error: "Escribí un mensaje o adjuntá un archivo." };
    }
    if (attachment && attachment.size > MAX_ATTACHMENT_BYTES) {
      return {
        success: false,
        error: "El adjunto supera el máximo de 15MB.",
      };
    }

    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data: row, error: selectError } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (selectError || !row) {
      return { success: false, error: "No se encontró la conversación." };
    }

    const externalRef = (row as ConversationRow).external_ref ?? "";
    const refMatch = UNIPILE_REF_RE.exec(externalRef);
    if (!refMatch) {
      return {
        success: false,
        error:
          "Esta conversación no soporta respuestas desde la plataforma (solo Instagram y WhatsApp conectados vía Unipile).",
      };
    }

    if (refMatch[1] === "instagram") {
      return {
        success: false,
        error:
          "El envío por Instagram está deshabilitado temporalmente. Respondé desde la app nativa de Instagram.",
      };
    }

    const chatId = refMatch[2];

    let sendResult;
    try {
      sendResult = await sendUnipileChatMessage({
        chatId,
        text,
        attachment: attachment
          ? {
              fileName: attachment.name,
              mimeType: attachment.type || "application/octet-stream",
              data: attachment,
            }
          : undefined,
      });
    } catch (err) {
      if (err instanceof UnipileApiError) {
        return { success: false, error: mapUnipileSendError(err) };
      }
      throw err;
    }

    const timestamp = new Date().toISOString();
    // Mismo formato de id que el webhook entrante (`up-{message_id}`) para
    // que el eco del webhook se deduplique en upsertInboundConversation.
    const messageId = sendResult.message_id
      ? `up-${sendResult.message_id}`
      : `up-local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const content = text || `[Adjunto: ${attachment?.name ?? "archivo"}]`;
    const newMessage: SalesMessage = {
      id: messageId,
      sender: "team",
      content,
      timestamp,
    };

    const priorMessages = ((row as ConversationRow).messages ??
      []) as SalesMessage[];
    const messages = [...priorMessages, newMessage];

    const { data: updated, error: updateError } = await supabase
      .from("conversations")
      .update({
        messages,
        last_message: content,
        last_message_at: timestamp,
        unread: false,
        updated_at: timestamp,
      })
      .eq("id", conversationId)
      .eq("organization_id", organizationId)
      .select()
      .single();

    if (updateError || !updated) {
      // El mensaje ya salió por Unipile; el webhook lo reconciliará.
      console.error(
        "[sendConversationMessage] enviado pero no persistido:",
        updateError?.message
      );
      return {
        success: false,
        error:
          "El mensaje se envió pero no se pudo guardar localmente. Se sincronizará automáticamente.",
      };
    }

    return {
      success: true,
      conversation: rowToConversation(updated as ConversationRow),
    };
  } catch (err) {
    console.error("[sendConversationMessage]", err);
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "No se pudo enviar el mensaje.",
    };
  }
}

export type AnalyzeConversationResult =
  | { success: true; conversation: Conversation }
  | { success: false; error: string };

/** Dispara el análisis IA de una conversación manualmente, sin umbral de mensajes. */
export async function analyzeConversationAction(
  conversationId: string
): Promise<AnalyzeConversationResult> {
  try {
    if (!isSupabaseConfigured()) {
      return { success: false, error: "Supabase no configurado." };
    }

    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data: row, error: selectError } = await supabase
      .from("conversations")
      .select("id, lead_name, messages, source")
      .eq("id", conversationId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (selectError || !row) {
      return { success: false, error: "No se encontró la conversación." };
    }

    const messages = ((row.messages ?? []) as SalesMessage[]).filter(
      (m) => m.content?.trim()
    );
    if (messages.length === 0) {
      return {
        success: false,
        error: "La conversación no tiene mensajes para analizar.",
      };
    }

    const scored = await scoreConversation({
      organizationId,
      conversationId,
      messages: messages.map((m) => ({
        sender: m.sender,
        message: m.content,
        timestamp: m.timestamp,
      })),
      leadName: row.lead_name as string,
      source: (row.source as string | null) ?? undefined,
    });

    if (!scored) {
      return {
        success: false,
        error: "El análisis IA falló. Intentá de nuevo en unos minutos.",
      };
    }

    const { data: updated, error: refreshError } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .eq("organization_id", organizationId)
      .single();

    if (refreshError || !updated) {
      return { success: false, error: "Análisis guardado pero no se pudo refrescar." };
    }

    return {
      success: true,
      conversation: rowToConversation(updated as ConversationRow),
    };
  } catch (err) {
    console.error("[analyzeConversation]", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "No se pudo analizar.",
    };
  }
}
