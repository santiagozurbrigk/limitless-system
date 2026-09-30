import { type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { integrationsOAuthRedirect } from "@/lib/integrations/oauth-redirect";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { stateCoincide } from "@/lib/integrations/oauth-state";
import { orgDeLaSesionOAuth } from "@/lib/integrations/oauth-sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type OAuthCookie = { organizationId: string; state: string };

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;

  try {
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");

    if (!code || !state) {
      return integrationsOAuthRedirect(origin, "typeform", "error", "typeform_oauth");
    }

    if (!isSupabaseConfigured()) {
      console.error("[typeform/oauth/callback] Supabase no configurado");
      return integrationsOAuthRedirect(origin, "typeform", "error", "typeform_oauth");
    }

    const cookieStore = await cookies();
    const cookieRaw = cookieStore.get("typeform_oauth")?.value;
    if (!cookieRaw) {
      console.error("[typeform/oauth/callback] Cookie typeform_oauth ausente");
      return integrationsOAuthRedirect(origin, "typeform", "error", "typeform_oauth");
    }

    let cookie: OAuthCookie;
    try {
      cookie = JSON.parse(cookieRaw) as OAuthCookie;
    } catch {
      return integrationsOAuthRedirect(origin, "typeform", "error", "typeform_oauth");
    }

    // SCRUM-10: la organización sale de la sesión, nunca de la cookie. La de
    // la cookie sólo tiene que coincidir (si el usuario cambió de negocio a
    // mitad del flujo, no se conecta en el equivocado). La de
  // la cookie sólo tiene que coincidir (si el usuario cambió de negocio a mitad
  // del flujo, no se conecta en el equivocado).
    const organizationId = await orgDeLaSesionOAuth();
    if (!stateCoincide(cookie.state, state) || !organizationId || cookie.organizationId !== organizationId) {
      console.error("[typeform/oauth/callback] State no coincide");
      return integrationsOAuthRedirect(origin, "typeform", "error", "typeform_oauth");
    }

    const clientId = process.env.TYPEFORM_CLIENT_ID;
    const clientSecret = process.env.TYPEFORM_CLIENT_SECRET;
    const redirectUri = process.env.TYPEFORM_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) {
      console.error("[typeform/oauth/callback] Faltan env Typeform");
      return integrationsOAuthRedirect(origin, "typeform", "error", "typeform_oauth");
    }

    const tokenRes = await fetch("https://api.typeform.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenRes.ok) {
      console.error(
        "[typeform/oauth/callback] Token exchange failed:",
        tokenRes.status
      );
      return integrationsOAuthRedirect(origin, "typeform", "error", "typeform_oauth");
    }

    const tokens = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    const admin = createAdminClient();
    const { error: upsertError } = await admin.from("typeform_integrations").upsert(
      {
        organization_id: organizationId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        token_expires_at: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
          : null,
        status: "connected",
        last_sync_at: new Date().toISOString(),
      },
      { onConflict: "organization_id" }
    );

    if (upsertError) {
      console.error("[typeform/oauth/callback] DB upsert:", upsertError.message);
      return integrationsOAuthRedirect(origin, "typeform", "error", "typeform_oauth");
    }

    try {
      const { syncTypeformForOrganization } = await import("@/lib/typeform/sync");
      await syncTypeformForOrganization(organizationId);
    } catch (e) {
      console.error("[typeform/oauth/callback] sync inicial falló:", e);
    }

    return integrationsOAuthRedirect(origin, "typeform", "connected", "typeform_oauth");
  } catch (e) {
    console.error("[typeform/oauth/callback] Error no controlado:", e);
    return integrationsOAuthRedirect(origin, "typeform", "error", "typeform_oauth");
  }
}
