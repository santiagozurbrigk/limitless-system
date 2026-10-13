import { createAdminClient } from "@/lib/supabase/admin";
import { refreshGoogleAccessToken } from "@/lib/google/refresh-token";
import { GOOGLE_FORMS_DRIVE_SCOPES } from "@/lib/google/scopes";
import { FallaDeLaBase } from "@/lib/server/action-result";

type GoogleIntegrationRow = {
  organization_id: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  granted_scopes: string | null;
};

/** Returns false if the stored token is missing the minimum Drive+Forms scopes. */
function hasRequiredScopes(grantedScopes: string | null): boolean {
  if (!grantedScopes) return false;
  const granted = new Set(grantedScopes.split(/\s+/));
  return GOOGLE_FORMS_DRIVE_SCOPES.every((s) => granted.has(s));
}

async function resolveAccessToken(
  integration: GoogleIntegrationRow
): Promise<string | null> {
  if (!integration.access_token) return null;

  const expiresAt = integration.token_expires_at
    ? new Date(integration.token_expires_at).getTime()
    : null;

  if (
    expiresAt &&
    expiresAt < Date.now() + 60_000 &&
    integration.refresh_token
  ) {
    const refreshed = await refreshGoogleAccessToken(integration.refresh_token);
    if (!refreshed) return integration.access_token;

    const admin = createAdminClient();
    await admin
      .from("google_forms_integrations")
      .update({
        access_token: refreshed.access_token,
        token_expires_at: refreshed.expires_in
          ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
          : null,
      })
      .eq("organization_id", integration.organization_id);

    return refreshed.access_token;
  }

  return integration.access_token;
}

function leerIntegracionDeGoogle(organizationId: string) {
  const admin = createAdminClient();
  return admin
    .from("google_forms_integrations")
    .select("organization_id, access_token, refresh_token, token_expires_at, granted_scopes")
    .eq("organization_id", organizationId)
    .eq("status", "connected")
    .maybeSingle();
}

async function tokenDeLaIntegracion(data: GoogleIntegrationRow | null): Promise<string | null> {
  if (!data?.access_token) return null;
  if (!hasRequiredScopes(data.granted_scopes)) return null;
  return resolveAccessToken(data);
}

/** Token OAuth de Google (Forms/YouTube/Drive) para la org, con refresh automático.
 *  Retorna null si el token no existe o si le faltan scopes (el usuario debe reconectar).
 *  Una falla al leer la integración también da null: para distinguirla, usá
 *  `leerTokenDeGoogle`. */
export async function getGoogleAccessTokenForOrganization(
  organizationId: string
): Promise<string | null> {
  const { data } = await leerIntegracionDeGoogle(organizationId);
  return tokenDeLaIntegracion(data as GoogleIntegrationRow | null);
}

/**
 * Lo mismo que `getGoogleAccessTokenForOrganization`, pero si la lectura de la
 * integración falla lanza `FallaDeLaBase` (SCRUM-519): una caída de la base no
 * se puede mostrar como "Google no está conectado". `null` sigue siendo "no hay
 * conexión usable" (sin token o sin los permisos de Drive y Forms).
 */
export async function leerTokenDeGoogle(organizationId: string): Promise<string | null> {
  const { data, error } = await leerIntegracionDeGoogle(organizationId);
  if (error) throw new FallaDeLaBase(error);
  return tokenDeLaIntegracion(data as GoogleIntegrationRow | null);
}
