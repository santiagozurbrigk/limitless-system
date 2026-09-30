"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authRateLimit, rateLimitErrorMessage } from "@/lib/rate-limit";
import { limiteDeLogin } from "@/lib/auth/limite-login";
import {
  ACTIVE_ORG_COOKIE,
  LEGACY_ACTIVE_ORG_COOKIE,
} from "@/lib/holding/constants";
import { emailSchema, firstZodError } from "@/lib/validations";
import { ensureCurrentUserBootstrap, loadProfileOrganizationContext } from "@/lib/auth/bootstrap";
import { isSuperAdminEmail } from "@/lib/auth/require-super-admin";
import {
  isTempPasswordExpired,
  TEMP_PASSWORD_EXPIRED_MESSAGE,
} from "@/lib/auth/temp-password-expiry";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { paths } from "@/routes";
import { CUENTA_DESACTIVADA_MESSAGE } from "@/lib/auth/cuenta-desactivada";

export type AuthActionState = {
  error?: string;
  success?: string;
};

function mapAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("banned")) {
    return CUENTA_DESACTIVADA_MESSAGE;
  }
  if (lower.includes("invalid login credentials")) {
    return "Email o contraseña incorrectos.";
  }
  if (lower.includes("email not confirmed")) {
    return "Confirma tu email antes de iniciar sesión (revisa tu bandeja).";
  }
  if (lower.includes("user already registered")) {
    return "Ya existe una cuenta con este email. Inicia sesión.";
  }
  if (lower.includes("password")) {
    return "La contraseña debe tener al menos 6 caracteres.";
  }
  if (lower.includes("invalid api key")) {
    return "Clave de Supabase inválida. En Vercel revisa NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY (o PUBLISHABLE_KEY) del mismo proyecto.";
  }
  return message;
}

async function rejectExpiredTempPasswordSession(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<AuthActionState | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("must_change_password, temp_password_expires_at")
    .eq("id", userId)
    .maybeSingle();

  if (
    isTempPasswordExpired(
      profile?.must_change_password,
      profile?.temp_password_expires_at
    )
  ) {
    await supabase.auth.signOut();
    return { error: TEMP_PASSWORD_EXPIRED_MESSAGE };
  }

  return null;
}

async function postAuthRedirect() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("must_change_password")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.must_change_password) {
        redirect(paths.auth.forcePasswordChange);
      }
    }

    if (user?.email && (await isSuperAdminEmail(user.email))) {
      redirect(paths.superAdmin.organizations);
    }

    if (user) {
      const { accountType } = await loadProfileOrganizationContext(user.id);

      if (accountType === "holding") {
        redirect(paths.platform.holding);
      }
    }
  }
  redirect(paths.platform.dashboard);
}

export async function signInAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const emailRaw = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const emailParsed = emailSchema.safeParse(emailRaw);
  if (!emailParsed.success) {
    return { error: firstZodError(emailParsed.error) };
  }
  if (!password) {
    return { error: "Completa email y contraseña." };
  }

  // SCRUM-24: por IP + email y por IP; bloquear a alguien exige estar en su IP.
  const { allowed, resetAt } = await limiteDeLogin("signin", emailParsed.data);
  if (!allowed) {
    return { error: rateLimitErrorMessage(resetAt) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: emailParsed.data,
    password,
  });

  if (error) {
    return { error: mapAuthError(error.message) };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const expired = await rejectExpiredTempPasswordSession(supabase, user.id);
    if (expired) return expired;
  }

  try {
    await ensureCurrentUserBootstrap();
  } catch (e) {
    return {
      error:
        e instanceof Error ? e.message : "No se pudo inicializar tu perfil.",
    };
  }

  await postAuthRedirect();
  return {};
}

export async function signInSuperAdminAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase no configurado." };
  }

  const emailRaw = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const emailParsed = emailSchema.safeParse(emailRaw);
  if (!emailParsed.success) {
    return { error: firstZodError(emailParsed.error) };
  }
  if (!password) {
    return { error: "Completa email y contraseña." };
  }

  // SCRUM-24: por IP + email y por IP (compartido con el login normal).
  const { allowed, resetAt } = await limiteDeLogin("signin-superadmin", emailParsed.data);
  if (!allowed) {
    return { error: rateLimitErrorMessage(resetAt) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: emailParsed.data,
    password,
  });

  if (error) {
    return { error: mapAuthError(error.message) };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email || !(await isSuperAdminEmail(user.email))) {
    await supabase.auth.signOut();
    return { error: "No tenés permisos de super admin." };
  }

  const expired = await rejectExpiredTempPasswordSession(supabase, user.id);
  if (expired) return expired;

  try {
    await ensureCurrentUserBootstrap();
  } catch (e) {
    await supabase.auth.signOut();
    return {
      error:
        e instanceof Error ? e.message : "No se pudo inicializar tu perfil.",
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("must_change_password")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.must_change_password) {
    redirect(paths.auth.forcePasswordChange);
  }

  redirect(paths.superAdmin.organizations);
}

export async function signUpAction(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const emailRaw = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim();

  const emailParsed = emailSchema.safeParse(emailRaw);
  if (!emailParsed.success) {
    return { error: firstZodError(emailParsed.error) };
  }
  if (!password) {
    return { error: "Completa email y contraseña." };
  }

  const { allowed, resetAt } = await authRateLimit(`signup:${emailParsed.data}`);
  if (!allowed) {
    return { error: rateLimitErrorMessage(resetAt) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: emailParsed.data,
    password,
    options: {
      data: fullName ? { full_name: fullName } : undefined,
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}${paths.auth.callback}`,
    },
  });

  if (error) {
    return { error: mapAuthError(error.message) };
  }

  if (data.user && data.session) {
    try {
      await ensureCurrentUserBootstrap();
    } catch (e) {
      return {
        error:
          e instanceof Error ? e.message : "No se pudo crear tu organización.",
      };
    }
    await postAuthRedirect();
    return {};
  }

  return {
    success:
      "Cuenta creada. Si activaste confirmación por email, revisa tu bandeja y luego inicia sesión.",
  };
}

export async function signOutAction() {
  const supabase = await createClient();
  const cookieStore = await cookies();

  if (isSupabaseConfigured()) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const admin = createAdminClient();
      await admin
        .from("holding_active_sessions")
        .delete()
        .eq("profile_id", user.id);
    }
  }

  await supabase.auth.signOut({ scope: "global" });

  // Se borran las dos: mientras la cookie legada se siga leyendo como respaldo,
  // dejarla viva al cerrar sesión reviviría el negocio activo en el próximo
  // ingreso.
  for (const name of [ACTIVE_ORG_COOKIE, LEGACY_ACTIVE_ORG_COOKIE]) {
    cookieStore.set(name, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });
  }

  redirect(paths.auth.login);
}
