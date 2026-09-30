import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { encrypt } from "@/lib/security/encryption";
import {
  assertMercadoPagoOAuthConfig,
  MP_OAUTH_TOKEN_URL,
} from "@/lib/mercadopago/config";
import { paths } from "@/routes";
import { withOAuthNoCache } from "@/lib/integrations/oauth-callback-headers";
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
};

function safeJsonParse<T>(value: string | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function redirectToIntegrations(
  origin: string,
  params: Record<string, string>
): NextResponse {
  const target = new URL(paths.platform.integrations, origin);
  for (const [key, value] of Object.entries(params)) {
    target.searchParams.set(key, value);
  }
  const res = NextResponse.redirect(target);
  res.cookies.delete("mercadopago_oauth");
  return withOAuthNoCache(res);
}

export async function GET(req: NextRequest) {
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const state = searchParams.get("state") ?? "";

  if (error || !code) {
    return redirectToIntegrations(origin, { error: "mercadopago_denied" });
  }

  if (!isSupabaseConfigured()) {
    return redirectToIntegrations(origin, { error: "mercadopago_failed" });
  }

  const cookieStore = await cookies();
  const oauth = safeJsonParse<OAuthCookie>(
    cookieStore.get("mercadopago_oauth")?.value
  );

  // SCRUM-10: la organización sale de la sesión, nunca de la cookie. La de
  // la cookie sólo tiene que coincidir (si el usuario cambió de negocio a mitad
  // del flujo, no se conecta en el equivocado).
  const organizationId = await orgDeLaSesionOAuth();
  if (!oauth || !stateCoincide(oauth.state, state) || !organizationId || oauth.organizationId !== organizationId) {
    return redirectToIntegrations(origin, { error: "mercadopago_failed" });
  }

  try {
    const { clientId, clientSecret, redirectUri } =
      assertMercadoPagoOAuthConfig();

    const tokenRes = await fetch(MP_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: oauth.codeVerifier,
      }),
    });

    const tokenData = (await tokenRes.json()) as {
      error?: string;
      message?: string;
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      user_id?: number;
      public_key?: string;
      live_mode?: boolean;
    };

    if (!tokenRes.ok || !tokenData.access_token || !tokenData.user_id) {
      throw new Error(
        tokenData.message ?? tokenData.error ?? "Token exchange failed"
      );
    }

    const expiresIn = Number(tokenData.expires_in ?? 15_552_000);
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    const now = new Date().toISOString();
    const admin = createAdminClient();

    const { error: upsertError } = await admin
      .from("mercadopago_integrations")
      .upsert(
        {
          organization_id: organizationId,
          mp_user_id: String(tokenData.user_id),
          access_token_encrypted: encrypt(tokenData.access_token),
          refresh_token_encrypted: tokenData.refresh_token
            ? encrypt(tokenData.refresh_token)
            : null,
          token_expires_at: tokenExpiresAt,
          public_key: tokenData.public_key ?? null,
          livemode: Boolean(tokenData.live_mode),
          status: "active",
          connected_at: now,
          updated_at: now,
        },
        { onConflict: "organization_id" }
      );

    if (upsertError) {
      throw new Error(upsertError.message);
    }

    return redirectToIntegrations(origin, { success: "mercadopago" });
  } catch (err) {
    console.error("Mercado Pago OAuth error:", err);
    return redirectToIntegrations(origin, { error: "mercadopago_failed" });
  }
}
