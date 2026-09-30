/**
 * Helpers de la integración WebinarJam por organización.
 *
 * Sólo servidor: la API key se lee con `createAdminClient()` porque
 * `webinarjam_integrations` no tiene política de RLS de lectura.
 */

import { readStoredSecret, encrypt } from "@/lib/security/encryption";
import { createAdminClient } from "@/lib/supabase/admin";

export type WebinarJamIntegrationRow = {
  organization_id: string;
  api_key_encrypted: string;
  webinars_synced_at: string | null;
  registrants_synced_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Sin fallback a texto plano: si falta ENCRYPTION_MASTER_KEY, `encrypt` tira y
 * no se guarda nada. Antes se guardaba la clave en claro sin avisar.
 */
const API_KEY_FIELD = "webinarjam_integrations.api_key_encrypted";

export function encryptWebinarJamApiKey(plainKey: string, organizationId: string): string {
  return encrypt(plainKey, { field: API_KEY_FIELD, organizationId });
}

export function decryptWebinarJamApiKey(stored: string, organizationId: string): string {
  return readStoredSecret(stored, { field: API_KEY_FIELD, organizationId });
}

export async function getWebinarJamIntegrationForOrg(
  organizationId: string
): Promise<WebinarJamIntegrationRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("webinarjam_integrations")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as WebinarJamIntegrationRow | null) ?? null;
}

export async function upsertWebinarJamIntegration(
  organizationId: string,
  apiKey: string
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("webinarjam_integrations").upsert(
    {
      organization_id: organizationId,
      api_key_encrypted: encryptWebinarJamApiKey(apiKey, organizationId),
      last_error: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" }
  );
  if (error) throw new Error(error.message);
}

export async function deleteWebinarJamIntegration(organizationId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("webinarjam_integrations")
    .delete()
    .eq("organization_id", organizationId);
  if (error) throw new Error(error.message);
}

/**
 * Segundo en el que aparece la oferta de un webinar.
 *
 * Lo configura el usuario: **la API de WebinarJam no lo expone** (a diferencia de
 * VTurb, que publica el `pitch_time` de cada player). Sin este número, M15 no se
 * puede medir.
 */
export async function setWebinarJamPitchSecond(
  organizationId: string,
  product: string,
  webinarExternalId: string,
  pitchSecond: number | null
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("webinarjam_webinars")
    .update({ pitch_second: pitchSecond })
    .eq("organization_id", organizationId)
    .eq("product", product)
    .eq("external_id", webinarExternalId);
  if (error) throw new Error(error.message);
}
