import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { assertStripeOAuthConfig, STRIPE_TOKEN_URL } from "@/lib/stripe/config";
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
  res.cookies.delete("stripe_oauth");
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
    return redirectToIntegrations(origin, { error: "stripe_denied" });
  }

  if (!isSupabaseConfigured()) {
    return redirectToIntegrations(origin, { error: "stripe_failed" });
  }

  const cookieStore = await cookies();
  const oauth = safeJsonParse<OAuthCookie>(
    cookieStore.get("stripe_oauth")?.value
  );

  // SCRUM-10: la organización sale de la sesión, nunca de la cookie. La de
  // la cookie sólo tiene que coincidir (si el usuario cambió de negocio a mitad
  // del flujo, no se conecta en el equivocado).
  const organizationId = await orgDeLaSesionOAuth();
  if (!oauth || !stateCoincide(oauth.state, state) || !organizationId || oauth.organizationId !== organizationId) {
    return redirectToIntegrations(origin, { error: "stripe_failed" });
  }

  try {
    const { secretKey, redirectUri } = assertStripeOAuthConfig();

    const tokenRes = await fetch(STRIPE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_secret: secretKey,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = (await tokenRes.json()) as {
      error?: string;
      error_description?: string;
      access_token?: string;
      stripe_user_id?: string;
      livemode?: boolean;
    };

    if (!tokenRes.ok || tokenData.error || !tokenData.access_token) {
      throw new Error(
        tokenData.error_description ?? tokenData.error ?? "Token exchange failed"
      );
    }

    const now = new Date().toISOString();
    const admin = createAdminClient();
    const { error: upsertError } = await admin.from("stripe_integrations").upsert(
      {
        organization_id: organizationId,
        stripe_account_id: tokenData.stripe_user_id ?? "",
        access_token: tokenData.access_token,
        livemode: Boolean(tokenData.livemode),
        status: "active",
        connected_at: now,
        updated_at: now,
      },
      { onConflict: "organization_id" }
    );

    if (upsertError) {
      throw new Error(upsertError.message);
    }

    return redirectToIntegrations(origin, { success: "stripe" });
  } catch (err) {
    console.error("Stripe OAuth error:", err);
    return redirectToIntegrations(origin, { error: "stripe_failed" });
  }
}
