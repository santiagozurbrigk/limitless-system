"use server";

import { revalidatePath } from "next/cache";
import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/security/encryption";
import { isPaymentProvider, type PaymentProvider } from "@/lib/payments/types";
import { paths } from "@/routes/paths";
import {
  requireOrgRole,
  ROLES_CONFIG_ORG,
  SIN_PERMISO_CONFIG_ORG,
} from "@/lib/auth/require-org-role";

export type PaymentIntegrationStatus = {
  provider: PaymentProvider;
  connected: boolean;
  connectedAt: string | null;
  lastEventAt: string | null;
  /** URL que hay que registrar en el panel del proveedor. */
  webhookUrl: string | null;
  /** Eventos recibidos que todavía no se supieron interpretar. */
  unmappedEvents: number;
};

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
}

/** Estado de Whop y Fanbasis para la org actual. */
export async function getPaymentIntegrationsStatusAction(): Promise<
  PaymentIntegrationStatus[]
> {
  const organizationId = await requireOrganizationId();
  const admin = createAdminClient();

  const [{ data: rows }, { data: unmapped }] = await Promise.all([
    admin
      .from("payment_integrations")
      .select("provider, connected_at, last_event_at, is_active")
      .eq("organization_id", organizationId),
    admin
      .from("payment_webhook_events")
      .select("provider")
      .eq("organization_id", organizationId)
      .eq("status", "unmapped"),
  ]);

  const byProvider = new Map((rows ?? []).map((r) => [r.provider as string, r]));

  const unmappedCount = new Map<string, number>();
  for (const row of unmapped ?? []) {
    const key = row.provider as string;
    unmappedCount.set(key, (unmappedCount.get(key) ?? 0) + 1);
  }

  const base = appUrl();

  return (["whop", "fanbasis"] as PaymentProvider[]).map((provider) => {
    const row = byProvider.get(provider);
    const connected = Boolean(row?.is_active);

    return {
      provider,
      connected,
      connectedAt: (row?.connected_at as string | null) ?? null,
      lastEventAt: (row?.last_event_at as string | null) ?? null,
      webhookUrl:
        connected && base
          ? `${base}/api/webhooks/${provider}?organizationId=${organizationId}`
          : null,
      unmappedEvents: unmappedCount.get(provider) ?? 0,
    };
  });
}

export type ConnectPaymentInput = {
  provider: string;
  apiKey?: string;
  webhookSecret: string;
};

/**
 * Guarda las credenciales de un proveedor de pagos.
 *
 * El webhook secret es obligatorio: sin él la ruta de webhook rechaza todo, así
 * que conectar sin secreto sería conectar a nada.
 *
 * Se escribe con admin client porque `payment_integrations` guarda secretos y no
 * tiene políticas de RLS.
 */
export async function connectPaymentProviderAction(
  input: ConnectPaymentInput
): Promise<{ ok: true; webhookUrl: string } | { ok: false; error: string }> {
  const organizationId = await requireOrganizationId();

  if (!isPaymentProvider(input.provider)) {
    return { ok: false, error: "Proveedor desconocido" };
  }

  const webhookSecret = input.webhookSecret.trim();
  if (!webhookSecret) {
    return {
      ok: false,
      error: "El secreto del webhook es obligatorio: sin él los eventos se rechazan",
    };
  }

  const apiKey = input.apiKey?.trim();

  let webhookSecretEncrypted: string;
  let apiKeyEncrypted: string | null = null;
  try {
    webhookSecretEncrypted = encrypt(webhookSecret);
    if (apiKey) apiKeyEncrypted = encrypt(apiKey);
  } catch {
    return {
      ok: false,
      error: "No se pudieron cifrar las credenciales. Revisá ENCRYPTION_MASTER_KEY.",
    };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("payment_integrations").upsert(
    {
      organization_id: organizationId,
      provider: input.provider,
      webhook_secret_encrypted: webhookSecretEncrypted,
      api_key_encrypted: apiKeyEncrypted,
      is_active: true,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,provider" }
  );

  if (error) {
    console.error("[payments] connect", error.message);
    return { ok: false, error: error.message };
  }

  revalidatePath(paths.platform.integrations);

  const base = appUrl();
  return {
    ok: true,
    webhookUrl: base
      ? `${base}/api/webhooks/${input.provider}?organizationId=${organizationId}`
      : `/api/webhooks/${input.provider}?organizationId=${organizationId}`,
  };
}

/**
 * Desconecta un proveedor.
 *
 * Marca la integración como inactiva y borra los secretos, pero **conserva las
 * órdenes y transacciones ya recibidas**: son historia del negocio, no de la
 * conexión. Borrarlas alteraría métricas de períodos pasados.
 */
export async function disconnectPaymentProviderAction(
  provider: string
): Promise<{ ok: boolean; error?: string }> {
  const organizationId = await requireOrganizationId();
  try {
    await requireOrgRole(ROLES_CONFIG_ORG, SIN_PERMISO_CONFIG_ORG);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : SIN_PERMISO_CONFIG_ORG };
  }
  if (!isPaymentProvider(provider)) return { ok: false, error: "Proveedor desconocido" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("payment_integrations")
    .update({
      is_active: false,
      webhook_secret_encrypted: null,
      api_key_encrypted: null,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("provider", provider);

  if (error) return { ok: false, error: error.message };

  revalidatePath(paths.platform.integrations);
  return { ok: true };
}
