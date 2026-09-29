import type { User } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { ensureUserBootstrap, loadProfileOrganizationContext } from "@/lib/auth/bootstrap";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  resolveEffectiveOrganizationId,
} from "@/lib/holding/resolve-org";
import {
  isTempPasswordExpired,
  TEMP_PASSWORD_EXPIRED_QUERY,
} from "@/lib/auth/temp-password-expiry";
import { createClient } from "@/lib/supabase/server";
import {
  CUENTA_DESACTIVADA_MESSAGE,
  estaDesactivado,
} from "@/lib/auth/cuenta-desactivada";
import { paths } from "@/routes";

export type AuthContext = {
  user: User;
  orgId: string;
  role: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
  isHoldingView?: boolean;
  holdingOrgId?: string;
  activeBusinessName?: string;
};

type AuthSuccess = AuthContext & { ok: true };
type AuthFailure = { ok: false; error: NextResponse };

async function resolveAuthContext(): Promise<AuthSuccess | AuthFailure> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const profileContext = await loadProfileOrganizationContext(user.id);
  if (estaDesactivado(profileContext.isActive)) {
    return {
      ok: false,
      error: NextResponse.json({ error: CUENTA_DESACTIVADA_MESSAGE }, { status: 403 }),
    };
  }
  let { organizationId, accountType } = profileContext;
  let role = profileRow?.role ?? "founder";

  if (!organizationId) {
    try {
      const boot = await ensureUserBootstrap(user);
      organizationId = boot.organization_id;
      role = boot.role;
      const ctx = await loadProfileOrganizationContext(user.id);
      accountType = ctx.accountType;
    } catch {
      return {
        ok: false,
        error: NextResponse.json(
          { error: "No se pudo vincular la organización" },
          { status: 403 }
        ),
      };
    }
  }

  if (!organizationId) {
    return {
      ok: false,
      error: NextResponse.json(
        { error: "Organización no encontrada" },
        { status: 403 }
      ),
    };
  }

  const orgId = await resolveEffectiveOrganizationId(
    organizationId,
    accountType
  );

  const isHoldingView =
    accountType === "holding" && orgId !== organizationId;

  let activeBusinessName: string | undefined;
  if (isHoldingView) {
    const admin = createAdminClient();
    const { data: link } = await admin
      .from("holding_businesses")
      .select("business_name")
      .eq("holding_org_id", organizationId)
      .eq("business_org_id", orgId)
      .eq("status", "active")
      .maybeSingle();
    activeBusinessName = link?.business_name ?? undefined;
  }

  return {
    ok: true,
    user,
    orgId,
    role: role ?? "founder",
    supabase,
    isHoldingView,
    holdingOrgId: isHoldingView ? organizationId : undefined,
    activeBusinessName,
  };
}

/** Verifica sesión con getUser() para API routes. */
export async function requireAuth(): Promise<AuthSuccess | AuthFailure> {
  return resolveAuthContext();
}

/** Igual que requireAuth pero lanza Error (server actions). */
export async function requireAuthContext(): Promise<AuthContext> {
  const result = await resolveAuthContext();
  if (!result.ok) {
    throw new Error("Unauthorized");
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("must_change_password, temp_password_expires_at")
    .eq("id", result.user.id)
    .maybeSingle();

  if (
    isTempPasswordExpired(
      profile?.must_change_password,
      profile?.temp_password_expires_at
    )
  ) {
    await supabase.auth.signOut();
    redirect(`${paths.auth.login}?error=${TEMP_PASSWORD_EXPIRED_QUERY}`);
  }

  if (profile?.must_change_password) {
    const headersList = await headers();
    const pathname = headersList.get("x-pathname") ?? "";
    if (!pathname.startsWith(paths.auth.forcePasswordChange)) {
      redirect(paths.auth.forcePasswordChange);
    }
  }

  return {
    user: result.user,
    orgId: result.orgId,
    role: result.role,
    supabase: result.supabase,
    isHoldingView: result.isHoldingView,
    holdingOrgId: result.holdingOrgId,
    activeBusinessName: result.activeBusinessName,
  };
}
