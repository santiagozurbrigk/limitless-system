import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { paths } from "@/routes";
import { readActiveOrgCookie } from "@/lib/holding/constants";
import {
  isTempPasswordExpired,
  TEMP_PASSWORD_EXPIRED_QUERY,
} from "@/lib/auth/temp-password-expiry";
import { createAdminClient } from "./admin";
import { isSuperAdminEmail } from "@/lib/auth/require-super-admin";
import { shouldRedirectToGate } from "@/lib/onboarding/gate-routing";
import { getSupabaseAnonKey, getSupabaseUrl, isSupabaseConfigured } from "./env";
import { isPublicPath } from "./public-paths";
import {
  accionSesion,
  CUENTA_DESACTIVADA_QUERY,
} from "@/lib/auth/cuenta-desactivada";

/** POST de Server Actions: no redirigir a login (devolvería HTML y rompe el cliente). */
function isServerActionRequest(request: NextRequest): boolean {
  return (
    request.headers.has("next-action") ||
    request.headers.has("Next-Action")
  );
}

function isOnboardingGatePath(pathname: string): boolean {
  return (
    pathname === paths.platform.onboarding ||
    pathname.startsWith(`${paths.platform.onboarding}/`)
  );
}

function isForcePasswordChangePath(pathname: string): boolean {
  return (
    pathname === paths.auth.forcePasswordChange ||
    pathname.startsWith(`${paths.auth.forcePasswordChange}/`)
  );
}

async function resolveHoldingHomePath(
  admin: ReturnType<typeof createAdminClient>,
  holdingOrgId: string
): Promise<string> {
  const { data } = await admin
    .from("onboarding_responses")
    .select("completed_at")
    .eq("organization_id", holdingOrgId)
    .maybeSingle();

  if (!data?.completed_at) {
    return paths.platform.holdingOnboarding;
  }

  return paths.platform.holding;
}

export async function updateSession(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.next({ request });
  }

  const requestHeaders = new Headers(request.headers);
  const activeOrg = readActiveOrgCookie(request.cookies);
  if (activeOrg) {
    requestHeaders.set("x-active-org-id", activeOrg);
  }
  const { pathname } = request.nextUrl;
  requestHeaders.set("x-pathname", pathname);
  const forwardedRequest = { headers: requestHeaders };

  let supabaseResponse = NextResponse.next({ request: forwardedRequest });

  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request: forwardedRequest });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select(
        "must_change_password, temp_password_expires_at, role, organization_id, is_active, organizations(account_type, skip_onboarding)"
      )
      .eq("id", user.id)
      .maybeSingle();

    if (
      isTempPasswordExpired(
        profile?.must_change_password,
        profile?.temp_password_expires_at
      )
    ) {
      await supabase.auth.signOut();
      if (isServerActionRequest(request)) {
        return supabaseResponse;
      }
      const url = request.nextUrl.clone();
      url.pathname = paths.auth.login;
      url.searchParams.set("error", TEMP_PASSWORD_EXPIRED_QUERY);
      return NextResponse.redirect(url);
    }

    // SCRUM-8: un miembro desactivado no sigue con su sesión. Igual que la
    // contraseña temporal vencida: se cierra la sesión y vuelve al login.
    const sesion = accionSesion(profile?.is_active, isServerActionRequest(request));
    if (sesion !== "seguir") {
      await supabase.auth.signOut();
      if (sesion === "cerrar") {
        return supabaseResponse;
      }
      const url = request.nextUrl.clone();
      url.pathname = paths.auth.login;
      url.searchParams.set("error", CUENTA_DESACTIVADA_QUERY);
      return NextResponse.redirect(url);
    }

    if (
      profile?.must_change_password &&
      !isForcePasswordChangePath(pathname)
    ) {
      if (isServerActionRequest(request)) {
        return supabaseResponse;
      }
      const url = request.nextUrl.clone();
      url.pathname = paths.auth.forcePasswordChange;
      return NextResponse.redirect(url);
    }

    /*
     * Gate de onboarding.
     *
     * La decisión vive en `shouldRedirectToGate`, que es pura y está testeada:
     * el modo de falla de esta lógica es un loop de redirects entre dos reglas
     * del middleware, y eso no lo agarra ni el typecheck ni el build.
     *
     * Acá sólo se lee `gate_completed_at`, una consulta por clave primaria. Si
     * el gate hace falta o no —¿ya tiene oferta cargada?— lo decide la página,
     * que es la única que necesita la derivación completa.
     */
    if (
      profile?.role === "founder" &&
      profile.organization_id &&
      !profile.must_change_password &&
      !isOnboardingGatePath(pathname) &&
      !isForcePasswordChangePath(pathname) &&
      !isPublicPath(pathname) &&
      !pathname.startsWith("/api/") &&
      !isServerActionRequest(request)
    ) {
      const orgField = profile.organizations as
        | { account_type?: string; skip_onboarding?: boolean }
        | { account_type?: string; skip_onboarding?: boolean }[]
        | null;
      const org = Array.isArray(orgField) ? orgField[0] : orgField;

      const { data: onboarding } = await admin
        .from("onboarding_state")
        .select("gate_completed_at")
        .eq("organization_id", profile.organization_id as string)
        .maybeSingle();

      const redirectToGate = shouldRedirectToGate({
        role: profile.role as string,
        organizationId: profile.organization_id as string,
        accountType: org?.account_type ?? null,
        skipOnboarding: Boolean(org?.skip_onboarding),
        mustChangePassword: Boolean(profile.must_change_password),
        gateCompletedAt:
          (onboarding?.gate_completed_at as string | null) ?? null,
        pathname,
        isPublicPath: isPublicPath(pathname),
        isOnboardingGatePath: isOnboardingGatePath(pathname),
        isForcePasswordChangePath: isForcePasswordChangePath(pathname),
        isNonNavigationRequest:
          pathname.startsWith("/api/") || isServerActionRequest(request),
      });

      if (redirectToGate) {
        const url = request.nextUrl.clone();
        url.pathname = paths.platform.onboarding;
        url.search = "";
        return NextResponse.redirect(url);
      }
    }
  }

  if (!user && !isPublicPath(pathname)) {
    if (isServerActionRequest(request)) {
      return supabaseResponse;
    }
    const url = request.nextUrl.clone();
    url.pathname = paths.auth.login;
    return NextResponse.redirect(url);
  }

  if (user && pathname === paths.auth.login) {
    const url = request.nextUrl.clone();
    if (user.email && (await isSuperAdminEmail(user.email))) {
      url.pathname = paths.superAdmin.organizations;
    } else {
      const admin = createAdminClient();
      const { data: profile } = await admin
        .from("profiles")
        .select("organization_id, organizations(account_type)")
        .eq("id", user.id)
        .maybeSingle();

      const orgField = profile?.organizations as
        | { account_type?: string }
        | { account_type?: string }[]
        | null;
      const accountType = Array.isArray(orgField)
        ? orgField[0]?.account_type
        : orgField?.account_type;
      const hasActiveBusiness = Boolean(
        readActiveOrgCookie(request.cookies)
      );

      if (accountType === "holding" && !hasActiveBusiness && profile?.organization_id) {
        url.pathname = await resolveHoldingHomePath(
          admin,
          profile.organization_id
        );
      } else {
        url.pathname = paths.platform.dashboard;
      }
    }
    return NextResponse.redirect(url);
  }

  if (
    user &&
    pathname === paths.platform.dashboard &&
    !readActiveOrgCookie(request.cookies)
  ) {
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("organization_id, organizations(account_type)")
      .eq("id", user.id)
      .maybeSingle();

    const orgField = profile?.organizations as
      | { account_type?: string }
      | { account_type?: string }[]
      | null;
    const accountType = Array.isArray(orgField)
      ? orgField[0]?.account_type
      : orgField?.account_type;

    if (accountType === "holding" && profile?.organization_id) {
      const url = request.nextUrl.clone();
      url.pathname = await resolveHoldingHomePath(
        admin,
        profile.organization_id
      );
      return NextResponse.redirect(url);
    }
  }

  if (user?.id) {
    void (async () => {
      try {
        await createAdminClient()
          .from("profiles")
          .update({ last_login_at: new Date().toISOString() })
          .eq("id", user.id);
      } catch {
        // no bloquear la request
      }
    })();
  }

  return supabaseResponse;
}
