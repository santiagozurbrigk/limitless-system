import { type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { exchangeGoogleCode, getGoogleEnv } from "@/lib/google/oauth";
import { isGooglePermissionError } from "@/lib/google/errors";
import { persistUnifiedGoogleTokens } from "@/lib/google/persist-oauth";
import { syncYoutubeChannelAndVideos } from "@/lib/google/sync-youtube";
import { integrationsOAuthRedirect } from "@/lib/integrations/oauth-redirect";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { stateCoincide } from "@/lib/integrations/oauth-state";
import { orgDeLaSesionOAuth } from "@/lib/integrations/oauth-sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type OAuthCookie = {
  organizationId: string;
  state: string;
  codeVerifier: string;
  includeYoutube?: boolean;
};

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;

  try {
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");

    if (!code || !state) {
      return integrationsOAuthRedirect(origin, "google_forms", "error", "google_forms_oauth");
    }

    if (!isSupabaseConfigured()) {
      return integrationsOAuthRedirect(origin, "google_forms", "error", "google_forms_oauth");
    }

    const cookieStore = await cookies();
    const cookieRaw = cookieStore.get("google_forms_oauth")?.value;
    if (!cookieRaw) {
      return integrationsOAuthRedirect(origin, "google_forms", "error", "google_forms_oauth");
    }

    let cookie: OAuthCookie;
    try {
      cookie = JSON.parse(cookieRaw) as OAuthCookie;
    } catch {
      return integrationsOAuthRedirect(origin, "google_forms", "error", "google_forms_oauth");
    }

    // SCRUM-10: la organización sale de la sesión, nunca de la cookie. La de
    // la cookie sólo tiene que coincidir (si el usuario cambió de negocio a
    // mitad del flujo, no se conecta en el equivocado). La de
  // la cookie sólo tiene que coincidir (si el usuario cambió de negocio a mitad
  // del flujo, no se conecta en el equivocado).
    const organizationId = await orgDeLaSesionOAuth();
    if (!stateCoincide(cookie.state, state) || !organizationId || cookie.organizationId !== organizationId) {
      return integrationsOAuthRedirect(origin, "google_forms", "error", "google_forms_oauth");
    }

    const env = getGoogleEnv();
    const redirectUri = process.env.GOOGLE_FORMS_REDIRECT_URI;
    if (!env || !redirectUri) {
      return integrationsOAuthRedirect(origin, "google_forms", "error", "google_forms_oauth");
    }

    const tokens = await exchangeGoogleCode({
      code,
      clientId: env.clientId,
      clientSecret: env.clientSecret,
      redirectUri,
      codeVerifier: cookie.codeVerifier,
    });

    const includeYoutube = cookie.includeYoutube !== false;

    const { formsError, youtubeError } = await persistUnifiedGoogleTokens(
      organizationId,
      tokens,
      includeYoutube
    );

    if (formsError || (includeYoutube && youtubeError)) {
      console.error("[google-forms/oauth/callback] DB:", formsError, youtubeError);
      return integrationsOAuthRedirect(origin, "google_forms", "error", "google_forms_oauth");
    }

    try {
      const { syncGoogleFormsForOrganization } = await import(
        "@/lib/google-forms/sync"
      );
      const syncResult = await syncGoogleFormsForOrganization(
        organizationId
      );
      if (syncResult.permissionDenied) {
        return integrationsOAuthRedirect(
          origin,
          "google_forms",
          "permissions",
          "google_forms_oauth"
        );
      }
    } catch (e) {
      if (isGooglePermissionError(e)) {
        return integrationsOAuthRedirect(
          origin,
          "google_forms",
          "permissions",
          "google_forms_oauth"
        );
      }
      console.error("[google-forms/oauth/callback] sync forms:", e);
    }

    if (includeYoutube) {
      try {
        await syncYoutubeChannelAndVideos(
          organizationId,
          tokens.access_token
        );
      } catch (e) {
        console.error("[google-forms/oauth/callback] sync youtube:", e);
      }
    }

    return integrationsOAuthRedirect(
      origin,
      "google_forms",
      "connected",
      "google_forms_oauth"
    );
  } catch (e) {
    console.error("[google-forms/oauth/callback] Error:", e);
    return integrationsOAuthRedirect(origin, "google_forms", "error", "google_forms_oauth");
  }
}
