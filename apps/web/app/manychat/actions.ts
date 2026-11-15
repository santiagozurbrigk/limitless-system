"use server";

import crypto from "crypto";
import {
  isMissingTableError,
  requireOrganizationId,
} from "@/lib/auth/bootstrap";
import { requireAuthContext } from "@/lib/auth/require-auth";
import {
  rechazoPorModulo,
  type RechazoPorModulo,
} from "@/lib/auth/acceso-a-modulo";
import {
} from "@/lib/rate-limit";
import { apiKeySchema, firstZodError } from "@/lib/validations";
import {
  fetchManyChatPageInfo,
  resolveManyChatSubscriber,
} from "@/lib/manychat/client";
import {
  buildManyChatWebhookUrl,
  getManyChatIntegrationForOrganization,
} from "@/lib/manychat/integration";
import { upsertConversationFromManyChat } from "@/lib/manychat/upsert-conversation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export type ManyChatConnectState = {
  error?: string;
  success?: string;
  webhookUrl?: string;
};

function mapManyChatError(msg: string): string {
  if (isMissingTableError(msg)) {
    return "Falta la tabla manychat_integrations. Ejecuta supabase/migrations/20260521700000_manychat_integrations.sql.";
  }
  if (msg.toLowerCase().includes("invalid") || msg.toLowerCase().includes("unauthorized")) {
    return "API key de ManyChat inválida. Revísala en Settings → API.";
  }
  const lower = msg.toLowerCase();
  if (lower.includes("subscriber does not exist") || lower === "validation error") {
    return "Contacto no encontrado en ManyChat. Usa el subscriber ID numérico ({{user_id}}), no el email si el lead es solo Instagram/WhatsApp.";
  }
  return msg;
}

function resolveLeadNameFromSubscriber(sub: {
  first_name?: string;
  last_name?: string;
  name?: string;
  ig_username?: string;
}): string {
  const first = sub.first_name?.trim();
  const last = sub.last_name?.trim();
  if (first || last) return `${first ?? ""} ${last ?? ""}`.trim();
  if (sub.name?.trim()) return sub.name.trim();
  if (sub.ig_username?.trim()) return `@${sub.ig_username.trim()}`;
  return "Contacto ManyChat";
}

export async function getManyChatIntegrationStatusAction(): Promise<{
  connected: boolean;
  pageName?: string;
  lastSyncAt?: string;
  webhookUrl?: string;
} | RechazoPorModulo> {
  const rechazo = await rechazoPorModulo("integrations");
  if (rechazo) return rechazo;
  if (!isSupabaseConfigured()) {
    return { connected: false };
  }

  try {
    const organizationId = await requireOrganizationId();
    const row = await getManyChatIntegrationForOrganization(organizationId);
    if (!row) return { connected: false };
    return {
      connected: true,
      pageName: row.page_name ?? undefined,
      lastSyncAt: row.updated_at,
      webhookUrl: buildManyChatWebhookUrl(row.webhook_token),
    };
  } catch {
    return { connected: false };
  }
}

export async function connectManyChatAction(
  _prev: ManyChatConnectState,
  formData: FormData
): Promise<ManyChatConnectState> {
  const parsedToken = apiKeySchema.safeParse(
    String(formData.get("apiToken") ?? "").trim()
  );
  if (!parsedToken.success) {
    return { error: firstZodError(parsedToken.error) };
  }

  const apiToken = parsedToken.data;
  const subscriberId = String(formData.get("subscriberId") ?? "").trim();

  if (!isSupabaseConfigured()) {
    return { error: "Supabase no configurado." };
  }

  try {
    const { user, orgId: organizationId } = await requireAuthContext();

    const page = await fetchManyChatPageInfo(apiToken);
    const webhookToken = crypto.randomBytes(24).toString("hex");
    const now = new Date().toISOString();

    const admin = createAdminClient();
    const { error } = await admin.from("manychat_integrations").upsert(
      {
        organization_id: organizationId,
        api_token: apiToken,
        page_id: page.id != null ? String(page.id) : null,
        page_name: page.name ?? null,
        webhook_token: webhookToken,
        updated_at: now,
      },
      { onConflict: "organization_id" }
    );

    if (error) {
      return { error: mapManyChatError(error.message) };
    }

    const webhookUrl = buildManyChatWebhookUrl(webhookToken);

    let importWarning: string | undefined;
    if (subscriberId) {
      try {
        await importManyChatSubscriberForOrganization(
          organizationId,
          apiToken,
          subscriberId
        );
      } catch (importError) {
        importWarning = mapManyChatError(
          importError instanceof Error ? importError.message : "Error al importar"
        );
      }
    }

    if (importWarning) {
      return {
        success: `ManyChat conectado, pero no se importó el contacto: ${importWarning}`,
        webhookUrl,
      };
    }

    return {
      success: subscriberId
        ? "ManyChat conectado e importaste un contacto de prueba."
        : "ManyChat conectado. Configura el External Request en tu flujo para enviar mensajes al webhook.",
      webhookUrl,
    };
  } catch (e) {
    return {
      error: mapManyChatError(e instanceof Error ? e.message : "Error al conectar ManyChat"),
    };
  }
}

async function importManyChatSubscriberForOrganization(
  organizationId: string,
  apiToken: string,
  subscriberLookup: string
) {
  const subscriber = await resolveManyChatSubscriber(apiToken, subscriberLookup);
  const leadName = resolveLeadNameFromSubscriber(subscriber);
  const messageText =
    subscriber.last_text_input?.trim() ||
    "Conversación vinculada desde ManyChat (importación manual).";
  const timestamp = subscriber.last_interaction ?? new Date().toISOString();

  const supabase = await createClient();
  await upsertConversationFromManyChat(supabase, organizationId, {
    subscriberId: String(subscriber.id ?? subscriberLookup),
    leadName,
    messageText,
    sender: "lead",
    timestamp,
  });

  const admin = createAdminClient();
  await admin
    .from("manychat_integrations")
    .update({ updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId);
}

export async function importManyChatSubscriberAction(
  subscriberId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase no configurado." };
  }

  const id = subscriberId.trim();
  if (!id) return { ok: false, error: "Indica un subscriber ID." };

  try {
    const organizationId = await requireOrganizationId();
    const row = await getManyChatIntegrationForOrganization(organizationId);
    if (!row) {
      return { ok: false, error: "Conecta ManyChat antes de importar contactos." };
    }

    await importManyChatSubscriberForOrganization(
      organizationId,
      row.api_token,
      id
    );
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: mapManyChatError(e instanceof Error ? e.message : "Error al importar"),
    };
  }
}

