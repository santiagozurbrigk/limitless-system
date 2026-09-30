/**
 * OAuth callback para closers individuales.
 * Guarda el token en team_member_integrations con integration_type='calendly'.
 * El config incluye: access_token, refresh_token, token_expires_at, calendly_user_uri.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { withOAuthNoCache } from "@/lib/integrations/oauth-callback-headers";
import { cookies } from "next/headers";
import { paths } from "@/routes";
import { mismoUsuario, stateCoincide } from "@/lib/integrations/oauth-state";
import { usuarioDeLaSesionOAuth } from "@/lib/integrations/oauth-sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type CloserOAuthCookie = {
  profileId: string;
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

function settingsRedirect(origin: string, params: Record<string, string>): NextResponse {
  const target = new URL(paths.platform.settingsTab("closer-calendly"), origin);
  for (const [k, v] of Object.entries(params)) {
    target.searchParams.set(k, v);
  }
  const res = NextResponse.redirect(target);
  res.cookies.delete("calendly_closer_oauth");
  return withOAuthNoCache(res);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";

  const calendlyClientId = process.env.CALENDLY_CLIENT_ID;
  const calendlyClientSecret = process.env.CALENDLY_CLIENT_SECRET;
  const redirectUri = process.env.CALENDLY_CLOSER_REDIRECT_URI ?? process.env.CALENDLY_REDIRECT_URI;
  const calendlyAuthToken =
    process.env.CALENDLY_AUTH_TOKEN ?? "https://auth.calendly.com/oauth/token";

  if (!code || !state) {
    return NextResponse.json({ error: "Faltan code/state en callback" }, { status: 400 });
  }
  if (!calendlyClientId || !calendlyClientSecret || !redirectUri) {
    return NextResponse.json({ error: "Faltan env vars de Calendly" }, { status: 500 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase no configurado" }, { status: 500 });
  }

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get("calendly_closer_oauth")?.value;
  const oauth = safeJsonParse<CloserOAuthCookie>(cookieValue);

  // SCRUM-10: la cuenta se guarda a nombre del usuario de la sesión, que tiene
  // que ser el mismo que empezó la conexión; nada sale de la cookie salvo el
  // state y el PKCE.
  const userId = await usuarioDeLaSesionOAuth();
  if (!oauth || !stateCoincide(oauth.state, state) || !mismoUsuario(oauth.profileId, userId)) {
    return NextResponse.json({ error: "State/PKCE inválido o expirado" }, { status: 401 });
  }

  const profileId = oauth.profileId;
  const { codeVerifier } = oauth;

  // Intercambiar code → tokens
  const basicAuth = Buffer.from(`${calendlyClientId}:${calendlyClientSecret}`).toString("base64");
  const tokenResp = await fetch(calendlyAuthToken, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  const tokenJson = await tokenResp.json().catch(() => null);
  if (!tokenResp.ok || !tokenJson?.access_token) {
    return settingsRedirect(req.url, { calendly_closer: "token_error" });
  }

  const accessToken = String(tokenJson.access_token);
  const refreshToken = String(tokenJson.refresh_token ?? "");
  const expiresIn = Number(tokenJson.expires_in ?? 7200);
  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  // Obtener el URI del usuario Calendly (para asignar llamadas a este closer)
  const meResp = await fetch("https://api.calendly.com/users/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const meJson = await meResp.json().catch(() => null);
  const calendlyUserUri = String(meJson?.resource?.uri ?? "");

  if (!calendlyUserUri) {
    return settingsRedirect(req.url, { calendly_closer: "uri_error" });
  }

  // Guardar en team_member_integrations
  const admin = createAdminClient();

  // La organización sale del perfil en la base, igual que en el inicio
  // (`profile.organization_id`), no de la cookie.
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, organization_id, is_active")
    .eq("id", profileId)
    .maybeSingle();

  if (profileError || !profile?.organization_id || profile.is_active === false) {
    return settingsRedirect(req.url, { calendly_closer: "profile_error" });
  }
  const organizationId = profile.organization_id as string;

  const { error: upsertError } = await admin
    .from("team_member_integrations")
    .upsert(
      {
        organization_id: organizationId,
        user_id: profileId,
        integration_type: "calendly",
        config: {
          access_token: accessToken,
          refresh_token: refreshToken,
          token_expires_at: tokenExpiresAt,
          calendly_user_uri: calendlyUserUri,
        },
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,user_id,integration_type" }
    );

  if (upsertError) {
    console.error("[calendly/closer/callback] upsert error:", upsertError.message);
    return settingsRedirect(req.url, { calendly_closer: "save_error" });
  }

  return settingsRedirect(req.url, { calendly_closer: "connected" });
}
