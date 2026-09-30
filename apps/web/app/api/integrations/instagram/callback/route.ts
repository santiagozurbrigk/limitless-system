import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  fetchInstagramProfile,
} from "@/lib/instagram/graph";
import { syncInstagramForOrganization } from "@/lib/instagram/sync";
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
  res.cookies.delete("instagram_oauth");
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
    return redirectToIntegrations(origin, { error: "instagram_denied" });
  }

  if (!isSupabaseConfigured()) {
    return redirectToIntegrations(origin, { error: "instagram_failed" });
  }

  const cookieStore = await cookies();
  const oauth = safeJsonParse<OAuthCookie>(
    cookieStore.get("instagram_oauth")?.value
  );

  // SCRUM-10: la organización sale de la sesión, nunca de la cookie. La de
  // la cookie sólo tiene que coincidir (si el usuario cambió de negocio a mitad
  // del flujo, no se conecta en el equivocado).
  const organizationId = await orgDeLaSesionOAuth();
  if (!oauth || !stateCoincide(oauth.state, state) || !organizationId || oauth.organizationId !== organizationId) {
    return redirectToIntegrations(origin, { error: "instagram_failed" });
  }

  try {
    const shortToken = await exchangeCodeForShortLivedToken(code);
    const { accessToken, expiresIn } =
      await exchangeForLongLivedToken(shortToken);
    const account = await fetchInstagramProfile(accessToken);

    const now = new Date().toISOString();
    const tokenExpiresAt = new Date(
      Date.now() + expiresIn * 1000
    ).toISOString();

    const admin = createAdminClient();
    const { error: upsertError } = await admin
      .from("instagram_integrations")
      .upsert(
        {
          organization_id: organizationId,
          instagram_user_id: account.instagramUserId,
          instagram_username: account.username,
          access_token: accessToken,
          token_expires_at: tokenExpiresAt,
          page_id: account.pageId,
          status: "active",
          connected_at: now,
          updated_at: now,
        },
        { onConflict: "organization_id" }
      );

    if (upsertError) {
      throw new Error(upsertError.message);
    }

    try {
      await syncInstagramForOrganization(organizationId);
    } catch (syncErr) {
      console.error("[Instagram:callback] Sync inicial falló:", syncErr);
    }

    return redirectToIntegrations(origin, { success: "instagram" });
  } catch (err) {
    console.error("Instagram OAuth error:", err);
    return redirectToIntegrations(origin, { error: "instagram_failed" });
  }
}
