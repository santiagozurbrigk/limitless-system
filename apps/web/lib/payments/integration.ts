/**
 * lib/payments/integration.ts
 *
 * Credenciales de Whop y Fanbasis por organización.
 *
 * Sólo servidor y sólo con admin client: `payment_integrations` guarda secretos
 * y no tiene políticas de RLS de lectura, igual que el resto de las tablas de
 * integraciones del repo.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/security/encryption";
import type { PaymentProvider } from "./types";

export type PaymentIntegrationRow = {
  organization_id: string;
  provider: PaymentProvider;
  webhook_secret_encrypted: string | null;
  api_key_encrypted: string | null;
  is_active: boolean;
};

/**
 * Resuelve a qué organización pertenece un webhook y con qué secreto verificarlo.
 *
 * El proveedor no conoce el `organization_id` de Limitless, así que la URL del webhook
 * lo lleva como parámetro. Eso NO es autenticación: el secreto de la firma es lo
 * que prueba que el evento es legítimo.
 *
 * Lanza si la consulta falla: un error de base no es "no está conectado".
 */
export async function getPaymentIntegration(
  organizationId: string,
  provider: PaymentProvider
): Promise<PaymentIntegrationRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("payment_integrations")
    .select("organization_id, provider, webhook_secret_encrypted, api_key_encrypted, is_active")
    .eq("organization_id", organizationId)
    .eq("provider", provider)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as PaymentIntegrationRow | null) ?? null;
}

/**
 * - `not_connected`: la org no tiene el proveedor activo → el webhook responde 404.
 * - `unavailable`: está conectado pero el secreto no se pudo leer (clave maestra
 *   cambiada, dato alterado, base caída) → 500. Antes esto también era 404 y
 *   parecía "no conectado": el cobro se perdía sin que nadie viera el motivo real.
 */
export type WebhookSecretLookup =
  | { status: "ok"; secret: string }
  | { status: "not_connected" }
  | { status: "unavailable"; reason: "decrypt_failed" | "db_error" };

export async function getWebhookSecret(
  organizationId: string,
  provider: PaymentProvider
): Promise<WebhookSecretLookup> {
  let integration: PaymentIntegrationRow | null;
  try {
    integration = await getPaymentIntegration(organizationId, provider);
  } catch (error) {
    console.error(
      `[payments] no se pudo leer la integración de ${provider}:`,
      error instanceof Error ? error.message : String(error)
    );
    return { status: "unavailable", reason: "db_error" };
  }

  if (!integration?.webhook_secret_encrypted) return { status: "not_connected" };

  try {
    return {
      status: "ok",
      secret: decrypt(integration.webhook_secret_encrypted, {
        field: "payment_integrations.webhook_secret_encrypted",
        organizationId: integration.organization_id,
      }),
    };
  } catch {
    console.error(
      `[payments] no se pudo descifrar el secreto de ${provider} (org ${organizationId}). ` +
        "¿Cambió ENCRYPTION_MASTER_KEY? Ver docs/operacion/rotacion-master-key.md"
    );
    return { status: "unavailable", reason: "decrypt_failed" };
  }
}
