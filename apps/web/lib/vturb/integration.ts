/**
 * Helpers de la integración VTurb por organización.
 *
 * Sólo servidor: la API key se lee con `createAdminClient()` porque
 * `vturb_integrations` no tiene política de RLS de lectura (guarda el token de
 * la cuenta, que ve todos los players de la company).
 */

import { readStoredSecret, encrypt } from "@/lib/security/encryption";
import { createAdminClient } from "@/lib/supabase/admin";

export type VTurbIntegrationRow = {
  organization_id: string;
  api_key_encrypted: string;
  timezone: string;
  players_synced_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Sin fallback a texto plano: si falta ENCRYPTION_MASTER_KEY, `encrypt` tira y
 * no se guarda nada. Antes se guardaba la clave en claro sin avisar.
 */
const API_KEY_FIELD = "vturb_integrations.api_key_encrypted";

export function encryptVTurbApiKey(plainKey: string, organizationId: string): string {
  return encrypt(plainKey, { field: API_KEY_FIELD, organizationId });
}

export function decryptVTurbApiKey(stored: string, organizationId: string): string {
  return readStoredSecret(stored, { field: API_KEY_FIELD, organizationId });
}

export async function getVTurbIntegrationForOrg(
  organizationId: string
): Promise<VTurbIntegrationRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("vturb_integrations")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as VTurbIntegrationRow | null) ?? null;
}

/** Credenciales listas para usar. Devuelve `null` si la org no tiene VTurb. */
export async function getVTurbCredentialsForOrg(
  organizationId: string
): Promise<{ apiKey: string; timezone: string } | null> {
  const row = await getVTurbIntegrationForOrg(organizationId);
  if (!row) return null;
  return {
    apiKey: decryptVTurbApiKey(row.api_key_encrypted, row.organization_id),
    timezone: row.timezone,
  };
}

export async function upsertVTurbIntegration(
  organizationId: string,
  apiKey: string,
  timezone?: string
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("vturb_integrations").upsert(
    {
      organization_id: organizationId,
      api_key_encrypted: encryptVTurbApiKey(apiKey, organizationId),
      ...(timezone ? { timezone } : {}),
      last_error: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" }
  );
  if (error) throw new Error(error.message);
}

export async function deleteVTurbIntegration(organizationId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("vturb_integrations")
    .delete()
    .eq("organization_id", organizationId);
  if (error) throw new Error(error.message);
}
