import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeGoogleCode, getGoogleEnv } from "@/lib/google/oauth";
import { createAdminClient } from "@/lib/supabase/admin";
import { paths } from "@/routes";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { mismoUsuario, stateCoincide } from "@/lib/integrations/oauth-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REDIRECT_URI = () =>
  process.env.SUPER_ADMIN_GOOGLE_REDIRECT_URI ??
  `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/super-admin-google/oauth/callback`;

const COOKIE = "super_admin_google_oauth";

type OAuthCookie = { userId: string; state: string; codeVerifier: string };

function redirectTo(origin: string, status: "connected" | "error") {
  const target = new URL(paths.superAdmin.aiBrain.add, origin);
  target.searchParams.set("google_drive", status);
  const res = NextResponse.redirect(target);
  res.cookies.delete(COOKIE);
  return res;
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;

  try {
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");

    if (!code || !state) return redirectTo(origin, "error");

    const cookieStore = await cookies();
    const raw = cookieStore.get(COOKIE)?.value;
    if (!raw) return redirectTo(origin, "error");

    let cookie: OAuthCookie;
    try {
      cookie = JSON.parse(raw) as OAuthCookie;
    } catch {
      return redirectTo(origin, "error");
    }

    // SCRUM-10: el token se guarda a nombre del super admin de la sesión, que
    // tiene que ser el mismo que empezó la conexión.
    let superAdminId: string;
    try {
      superAdminId = (await requireSuperAdmin()).id;
    } catch {
      return redirectTo(origin, "error");
    }
    if (!stateCoincide(cookie.state, state) || !mismoUsuario(cookie.userId, superAdminId)) {
      return redirectTo(origin, "error");
    }

    const env = getGoogleEnv();
    if (!env) return redirectTo(origin, "error");

    const tokens = await exchangeGoogleCode({
      code,
      clientId: env.clientId,
      clientSecret: env.clientSecret,
      redirectUri: REDIRECT_URI(),
      codeVerifier: cookie.codeVerifier,
    });

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    const admin = createAdminClient();
    const { error } = await admin.from("super_admin_google_tokens").upsert(
      {
        user_id: superAdminId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        token_expires_at: expiresAt,
        granted_scopes: tokens.scope ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (error) {
      console.error("[super-admin-google/callback] DB upsert:", error);
      return redirectTo(origin, "error");
    }

    return redirectTo(origin, "connected");
  } catch (e) {
    console.error("[super-admin-google/callback]", e);
    return redirectTo(origin, "error");
  }
}
