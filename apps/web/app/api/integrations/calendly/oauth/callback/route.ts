import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "crypto";
import { paths } from "@/routes";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  isCalendlyWebhookPlanError,
  NO_WEBHOOK_SIGNING_KEY,
} from "@/lib/calendly/oauth-token";
import { cookies } from "next/headers";
import { withOAuthNoCache } from "@/lib/integrations/oauth-callback-headers";
import { stateCoincide } from "@/lib/integrations/oauth-state";
import { orgDeLaSesionOAuth } from "@/lib/integrations/oauth-sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

function safeJsonParse<T>(value: string | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

type OAuthCookie = {
  organizationId: string;
  state: string;
  codeVerifier: string;
};

function integrationsRedirect(
  origin: string,
  params: Record<string, string>
): NextResponse {
  const target = new URL(paths.platform.integrations, origin);
  for (const [key, value] of Object.entries(params)) {
    target.searchParams.set(key, value);
  }
  const res = NextResponse.redirect(target);
  res.cookies.delete("calendly_oauth");
  return withOAuthNoCache(res);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";

  const calendlyClientId = process.env.CALENDLY_CLIENT_ID;
  const calendlyClientSecret = process.env.CALENDLY_CLIENT_SECRET;
  const redirectUri = process.env.CALENDLY_REDIRECT_URI;
  const calendlyAuthToken =
    process.env.CALENDLY_AUTH_TOKEN ?? "https://auth.calendly.com/oauth/token";

  if (!code || !state) {
    return NextResponse.json({ error: "Faltan code/state en callback" }, { status: 400 });
  }
  if (!calendlyClientId || !calendlyClientSecret || !redirectUri) {
    return NextResponse.json(
      {
        error:
          "Faltan env vars: CALENDLY_CLIENT_ID/CALENDLY_CLIENT_SECRET/CALENDLY_REDIRECT_URI",
      },
      { status: 500 }
    );
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase no configurado" }, { status: 500 });
  }

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get("calendly_oauth")?.value;
  const oauth = safeJsonParse<OAuthCookie>(cookieValue);

  // SCRUM-10: la organización sale de la sesión, nunca de la cookie. La de
  // la cookie sólo tiene que coincidir (si el usuario cambió de negocio a mitad
  // del flujo, no se conecta en el equivocado).
  const organizationId = await orgDeLaSesionOAuth();
  if (!oauth || !stateCoincide(oauth.state, state) || !organizationId || oauth.organizationId !== organizationId) {
    return NextResponse.json({ error: "State/PKCE inválido o expirado" }, { status: 401 });
  }

  const { codeVerifier } = oauth;

  const basicAuth = Buffer.from(`${calendlyClientId}:${calendlyClientSecret}`).toString(
    "base64"
  );
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
    return NextResponse.json(
      { error: "No se pudo intercambiar el authorization code", details: tokenJson },
      { status: 400 }
    );
  }

  const accessToken = String(tokenJson.access_token);
  const refreshToken = String(tokenJson.refresh_token ?? "");
  const expiresIn = Number(tokenJson.expires_in ?? 7200);
  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  const meResp = await fetch("https://api.calendly.com/users/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const meJson = await meResp.json().catch(() => null);
  const calendlyOrgUri = String(meJson?.resource?.current_organization ?? "");
  if (!calendlyOrgUri) {
    return NextResponse.json(
      { error: "No se pudo obtener current_organization desde Calendly", details: meJson },
      { status: 400 }
    );
  }

  const webhookUrl =
    process.env.CALENDLY_WEBHOOK_URL ??
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/integrations/calendly/webhook`;

  let webhookSubscriptionUri: string | null = null;
  let webhookSigningKey = NO_WEBHOOK_SIGNING_KEY;
  let webhookSkippedReason: string | null = null;

  try {
    const parsed = new URL(webhookUrl);
    const host = parsed.hostname.toLowerCase();
    const isLocalhost =
      host === "localhost" || host === "127.0.0.1" || host.endsWith(".local");

    if (!isLocalhost) {
      if (parsed.protocol !== "https:" && process.env.NODE_ENV === "production") {
        webhookSkippedReason = "https_required";
      } else {
        const signingKey = crypto.randomBytes(20).toString("hex");
        const createWebhookResp = await fetch(
          "https://api.calendly.com/webhook_subscriptions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              url: webhookUrl,
              events: [
                "invitee.created",
                "invitee.canceled",
                "invitee_no_show.created",
                "invitee_no_show.deleted",
              ],
              organization: calendlyOrgUri,
              scope: "organization",
              signing_key: signingKey,
            }),
          }
        );

        const createWebhookJson = await createWebhookResp.json().catch(() => null);
        const subscriptionUri = String(createWebhookJson?.resource?.uri ?? "");

        if (createWebhookResp.ok && subscriptionUri) {
          webhookSubscriptionUri = subscriptionUri;
          webhookSigningKey = signingKey;
        } else if (isCalendlyWebhookPlanError(createWebhookJson)) {
          webhookSkippedReason = "standard_required";
        } else if (!createWebhookResp.ok) {
          webhookSkippedReason = "create_failed";
        }
      }
    } else {
      webhookSkippedReason = "localhost";
    }
  } catch {
    webhookSkippedReason = "invalid_url";
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { error: upsertError } = await supabase.from("calendly_integrations").upsert(
    {
      organization_id: organizationId,
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: tokenExpiresAt,
      calendly_org_uri: calendlyOrgUri,
      webhook_subscription_uri: webhookSubscriptionUri,
      webhook_signing_key: webhookSigningKey,
      updated_at: now,
    },
    { onConflict: "organization_id" }
  );

  if (upsertError) {
    return NextResponse.json(
      { error: "No se pudo guardar calendly_integrations", details: upsertError.message },
      { status: 500 }
    );
  }

  const redirectParams: Record<string, string> = { calendly: "connected" };
  if (webhookSkippedReason) {
    redirectParams.calendly_webhook = webhookSkippedReason;
  }

  return integrationsRedirect(req.url, redirectParams);
}
