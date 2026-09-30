/**
 * Helpers de la integración Hyros por organización.
 *
 * Patrón BYOK, igual que Anthropic y Zernio: Hyros se contrata **por negocio, no
 * por agencia**, así que cada org trae su propia key. Sólo servidor: la tabla no
 * tiene política de RLS de lectura.
 */

import { readStoredSecret, encrypt } from "@/lib/security/encryption";
import { createAdminClient } from "@/lib/supabase/admin";
import type { HyrosAttributionModel, HyrosCredentials } from "./client";

export type HyrosIntegrationRow = {
  organization_id: string;
  api_key_encrypted: string;
  accessible_account_id: string | null;
  attribution_model: HyrosAttributionModel;
  ad_accounts_synced_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Sin fallback a texto plano: si falta ENCRYPTION_MASTER_KEY, `encrypt` tira y
 * no se guarda nada. Antes se guardaba la clave en claro sin avisar.
 */
const API_KEY_FIELD = "hyros_integrations.api_key_encrypted";

export function encryptHyrosApiKey(plainKey: string, organizationId: string): string {
  return encrypt(plainKey, { field: API_KEY_FIELD, organizationId });
}

export function decryptHyrosApiKey(stored: string, organizationId: string): string {
  return readStoredSecret(stored, { field: API_KEY_FIELD, organizationId });
}

export async function getHyrosIntegrationForOrg(
  organizationId: string
): Promise<HyrosIntegrationRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("hyros_integrations")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as HyrosIntegrationRow | null) ?? null;
}

/** Credenciales listas para el cliente. `null` si la org no tiene Hyros. */
export async function getHyrosCredentialsForOrg(
  organizationId: string
): Promise<(HyrosCredentials & { attributionModel: HyrosAttributionModel }) | null> {
  const row = await getHyrosIntegrationForOrg(organizationId).catch(() => null);
  if (!row) return null;

  return {
    apiKey: decryptHyrosApiKey(row.api_key_encrypted, row.organization_id),
    accessibleAccountId: row.accessible_account_id,
    attributionModel: row.attribution_model,
  };
}

export async function upsertHyrosIntegration(
  organizationId: string,
  apiKey: string,
  options: {
    accessibleAccountId?: string | null;
    attributionModel?: HyrosAttributionModel;
  } = {}
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("hyros_integrations").upsert(
    {
      organization_id: organizationId,
      api_key_encrypted: encryptHyrosApiKey(apiKey, organizationId),
      accessible_account_id: options.accessibleAccountId ?? null,
      ...(options.attributionModel ? { attribution_model: options.attributionModel } : {}),
      last_error: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" }
  );
  if (error) throw new Error(error.message);
}

export async function deleteHyrosIntegration(organizationId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("hyros_integrations")
    .delete()
    .eq("organization_id", organizationId);
  if (error) throw new Error(error.message);
}
