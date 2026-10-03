"use server";

import { revalidatePath } from "next/cache";
import { requireAuthContext } from "@/lib/auth/require-auth";
import { validateFathomApiKey } from "@/lib/fathom/api";
import { sincronizarMiembroFathom } from "@/lib/fathom/member-sync";
import {
  createFathomWebhook,
  deleteFathomWebhook,
  guessFathomAccountEmail,
} from "@/lib/fathom/webhooks";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { encryptMemberFathomKey, readMemberFathomKey } from "@/lib/fathom/member-key";
import { paths } from "@/routes";
import { apiKeySchema, firstZodError } from "@/lib/validations";
import { runMutation, type MutationResult } from "@/lib/server/action-result";

export type FathomMemberStatus = {
  userId: string;
  name: string;
  connected: boolean;
  lastSyncAt?: string | null;
};

export async function listFathomMemberStatusesAction(): Promise<FathomMemberStatus[]> {
  const { orgId: organizationId } = await requireAuthContext();
  const supabase = await createClient();

  const { data: members, error: membersError } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (membersError) throw new Error(membersError.message);

  const admin = createAdminClient();
  const { data: integrations, error: integrationsError } = await admin
    .from("team_member_integrations")
    .select("user_id, last_sync_at")
    .eq("organization_id", organizationId)
    .eq("integration_type", "fathom");

  if (integrationsError) throw new Error(integrationsError.message);

  const byUser = new Map(
    (integrations ?? []).map((row) => [
      row.user_id as string,
      row.last_sync_at as string | null,
    ])
  );

  return (members ?? []).map((member) => ({
    userId: member.id as string,
    name: (member.full_name as string | null) ?? (member.email as string),
    connected: byUser.has(member.id as string),
    lastSyncAt: byUser.get(member.id as string) ?? null,
  }));
}

export async function connectMemberFathomAction(
  apiKey: string
): Promise<{
  ok: boolean;
  error?: string;
  /** El mail de la cuenta de Fathom, para que el miembro lo confirme. */
  accountEmail?: string | null;
  /** Si el webhook no se pudo crear, por qué. La conexión igual sirve. */
  webhookError?: string | null;
}> {
  const parsed = apiKeySchema.safeParse(apiKey.trim());
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }

  const { user, orgId: organizationId } = await requireAuthContext();

  try {
    await validateFathomApiKey(parsed.data);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "API key inválida",
    };
  }

  // Se cifra ANTES de tocar nada: si no se puede, no se guarda ni se crea el
  // webhook. (`encryptMemberFathomKey` lanza.)
  let encryptedKey: string;
  try {
    encryptedKey = encryptMemberFathomKey(parsed.data, organizationId, user.id);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo guardar la credencial",
    };
  }

  // ⭐ Quién es el dueño de esta key. Se le muestra para que confirme: asumirlo
  // en silencio atribuiría todas sus llamadas a otra persona si sale mal.
  const accountEmail = await guessFathomAccountEmail(parsed.data).catch(() => null);

  // ⭐ El token opaco de la URL de destino. Con esto la verificación de firma es
  // contra **un solo secreto**, en vez de escanear todas las organizaciones.
  const webhookToken = crypto.randomUUID().replace(/-/g, "");

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  let webhook: { id: string; secret: string } | null = null;
  let webhookError: string | null = null;

  if (baseUrl) {
    try {
      // ⭐ Limitless le crea el webhook con su propia key: el miembro no configura nada
      // a mano en Fathom.
      webhook = await createFathomWebhook(
        parsed.data,
        `${baseUrl}/api/integrations/fathom/webhook/${webhookToken}`
      );
    } catch (error) {
      // Si el webhook falla, la conexión igual sirve: queda el poll de
      // reconciliación. Pero se registra, porque sin webhook las llamadas
      // llegan tarde y eso hay que poder verlo en el panel.
      webhookError = error instanceof Error ? error.message : String(error);
    }
  } else {
    webhookError = "NEXT_PUBLIC_APP_URL no configurada: no se pudo crear el webhook.";
  }

  const admin = createAdminClient();
  const { error } = await admin.from("team_member_integrations").upsert(
    {
      organization_id: organizationId,
      user_id: user.id,
      integration_type: "fathom",
      encrypted_api_key: encryptedKey,
      provider_account_email: accountEmail,
      webhook_id: webhook?.id ?? null,
      webhook_secret: webhook?.secret ?? null,
      webhook_token: webhook ? webhookToken : null,
      status: webhookError ? "error" : "connected",
      last_error: webhookError,
      last_error_at: webhookError ? new Date().toISOString() : null,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,user_id,integration_type" }
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath(paths.platform.integrations);
  return { ok: true, accountEmail, webhookError };
}

export async function disconnectMemberFathomAction(): Promise<void> {
  const { user, orgId: organizationId } = await requireAuthContext();
  const admin = createAdminClient();

  // ⭐ Desconectarse tiene que **borrar el webhook de la cuenta de esa persona**,
  // no sólo dejar de leerlo. Si no, Limitless deja basura colgada en una cuenta ajena.
  const { data: existing } = await admin
    .from("team_member_integrations")
    .select("encrypted_api_key, webhook_id")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .eq("integration_type", "fathom")
    .maybeSingle();

  const row = existing as { encrypted_api_key: string | null; webhook_id: string | null } | null;
  if (row?.encrypted_api_key && row.webhook_id) {
    const result = await deleteFathomWebhook(
      readMemberFathomKey(row.encrypted_api_key, organizationId, user.id),
      row.webhook_id
    );
    if (!result.deleted) {
      // No se bloquea la desconexión: un webhook huérfano molesta, impedir
      // desconectarse es peor.
      console.error("[fathom member] no se pudo borrar el webhook:", result.error);
    }
  }

  const { error } = await admin
    .from("team_member_integrations")
    .delete()
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .eq("integration_type", "fathom");

  if (error) throw new Error(error.message);
  revalidatePath(paths.platform.integrations);
}

/**
 * ⭐ Esta acción **tiene que devolver el error, no lanzarlo**.
 *
 * Lanzaba en crudo, y una Server Action que lanza en producción no le muestra
 * al usuario el mensaje: Next lo reemplaza por "An error occurred in the Server
 * Components render...", que no dice nada. Así se perdían todos los motivos
 * reales — "No tenés Fathom conectado", "Fathom te está limitando" — y la
 * pantalla mostraba un párrafo sobre digests en inglés.
 */
export async function syncMemberFathomAction(): Promise<
  MutationResult<{ synced: number; fallidas: number }>
> {
  return runMutation(async () => {
    return sincronizarLlamadasDelMiembro();
  });
}

async function sincronizarLlamadasDelMiembro(): Promise<{
  synced: number;
  fallidas: number;
}> {
  const { user, orgId: organizationId } = await requireAuthContext();
  const admin = createAdminClient();

  const { data: integration, error } = await admin
    .from("team_member_integrations")
    .select("encrypted_api_key, last_sync_at, connected_at")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .eq("integration_type", "fathom")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!integration?.encrypted_api_key) {
    throw new Error("No tenés Fathom conectado");
  }

  // ⭐ La misma sincronización que corre el cron cada hora
  // (`lib/fathom/member-sync.ts`): mismo upsert, mismo dueño, misma ventana.
  const { synced, fallidas } = await sincronizarMiembroFathom(admin, {
    organization_id: organizationId,
    user_id: user.id,
    encrypted_api_key: integration.encrypted_api_key as string,
    last_sync_at: integration.last_sync_at as string | null,
    connected_at: integration.connected_at as string | null,
  });

  revalidatePath(paths.platform.integrations);

  /**
   * ⭐ Si nada se guardó, esto **no es un éxito**.
   *
   * Antes el contador ignoraba el error del guardado y la pantalla cantaba
   * "Sync completado — 0 llamadas" en verde. Un fallo que se muestra como
   * éxito es peor que un fallo: nadie lo mira.
   */
  if (fallidas > 0 && synced === 0) {
    throw new Error(
      `No se pudo guardar ninguna de las ${fallidas} llamadas que trajo Fathom. ` +
        "Revisá los logs del servidor con el prefijo [Fathom:sync]."
    );
  }

  return { synced, fallidas };
}
