import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSuperAdminEmail } from "@/lib/auth/require-super-admin";
import {
  readAccountType,
  resolveEffectiveOrganizationId,
} from "@/lib/holding/resolve-org";
import { createClient } from "@/lib/supabase/server";
import { ErrorEsperable } from "@/lib/server/error-esperable";
import {
  CUENTA_DESACTIVADA_MESSAGE,
  estaDesactivado,
} from "@/lib/auth/cuenta-desactivada";

function defaultOrgName(email: string): string {
  const local = email.split("@")[0]?.trim();
  if (local) {
    return local.charAt(0).toUpperCase() + local.slice(1);
  }
  return "Mi organización";
}

/** Crea organización + perfil si el usuario aún no tiene fila en profiles. */
export async function ensureUserBootstrap(user: User) {
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("profiles")
    .select("id, organization_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (existing) return existing;

  const email = user.email ?? "";
  const fullName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    null;

  if (email && (await isSuperAdminEmail(email))) {
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .insert({
        id: user.id,
        organization_id: null,
        email,
        full_name: fullName ?? "Super Admin",
        role: "founder",
      })
      .select("id, organization_id, role")
      .single();

    if (profileError || !profile) {
      throw new Error(profileError?.message ?? "No se pudo crear el perfil");
    }

    return profile;
  }

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({ name: defaultOrgName(email) })
    .select("id")
    .single();

  if (orgError || !org) {
    throw new Error(orgError?.message ?? "No se pudo crear la organización");
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .insert({
      id: user.id,
      organization_id: org.id,
      email,
      full_name: fullName,
      role: "founder",
    })
    .select("id, organization_id, role")
    .single();

  if (profileError || !profile) {
    throw new Error(profileError?.message ?? "No se pudo crear el perfil");
  }

  void admin.rpc("create_default_roles", { org_id: org.id });

  return profile;
}

export async function ensureCurrentUserBootstrap() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error(error?.message ?? "Sesión no válida");
  }

  return ensureUserBootstrap(user);
}

export async function getCurrentProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, organization_id, email, full_name, role")
    .eq("id", user.id)
    .maybeSingle();

  return profile;
}

export type ProfileOrganizationContext = {
  organizationId: string | null;
  accountType: "founder" | "holding" | null;
  /**
   * Puede administrar el holding: founder de la org o `is_holding_admin`.
   * Un miembro invitado al holding comparte `accountType` pero no esto.
   */
  canManageHolding: boolean;
  /** `profiles.is_active`; `null` si todavía no hay perfil. */
  isActive: boolean | null;
};

export async function loadProfileOrganizationContext(
  userId: string
): Promise<ProfileOrganizationContext> {
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("organization_id, role, is_holding_admin, is_active, organizations(account_type)")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) {
    return { organizationId: null, accountType: null, canManageHolding: false, isActive: null };
  }

  const accountTypeRaw = readAccountType(
    profile.organizations as { account_type?: string } | null
  );

  return {
    organizationId: profile.organization_id ?? null,
    accountType: accountTypeRaw === "holding" ? "holding" : "founder",
    canManageHolding:
      profile.role === "founder" || profile.is_holding_admin === true,
    isActive: (profile.is_active as boolean | null) ?? null,
  };
}

/**
 * Devuelve el account_type real del perfil del usuario actual, siempre vía admin
 * client. Es una propiedad fija del perfil (no del negocio activo en sesión).
 */
export async function getProfileAccountType(): Promise<
  "founder" | "holding" | null
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { accountType } = await loadProfileOrganizationContext(user.id);
  return accountType;
}

/** @deprecated Usar getProfileAccountType() */
export async function getCurrentProfileAccountType(): Promise<
  "founder" | "holding" | null
> {
  return getProfileAccountType();
}

async function resolveOrganizationId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Sesión y cuenta desactivada son rechazos esperables (SCRUM-497): una
  // server action los devuelve con su mensaje y no los reporta como falla.
  if (!user) {
    throw new ErrorEsperable("Sesión no válida");
  }

  const { organizationId, accountType, isActive } =
    await loadProfileOrganizationContext(user.id);

  // SCRUM-8: la org se resuelve con el service role, así que la RLS no la
  // corta; un perfil desactivado no pasa de acá.
  if (estaDesactivado(isActive)) {
    throw new ErrorEsperable(CUENTA_DESACTIVADA_MESSAGE);
  }

  if (!organizationId) {
    const boot = await ensureUserBootstrap(user);
    if (!boot.organization_id) {
      throw new Error(
        "No se pudo vincular tu cuenta a una organización. Revisa Supabase (tablas organizations y profiles)."
      );
    }
    return boot.organization_id;
  }

  return resolveEffectiveOrganizationId(organizationId, accountType);
}

/**
 * Garantiza org + perfil (repara usuarios creados antes del bootstrap).
 *
 * **Memoizada por request** con `cache()` de React. Resolver la organización
 * cuesta un `auth.getUser()` contra Supabase Auth, una lectura de `profiles` y,
 * en cuentas holding, una verificación extra del negocio activo. Sin memoizar,
 * una pantalla que compone varios dominios paga ese costo una vez por acción:
 * Integraciones llegaba a ~30 resoluciones idénticas en un solo render.
 *
 * El alcance de `cache()` es el request, así que dos requests distintos —y por
 * lo tanto un cambio de negocio activo en una cuenta holding— siguen resolviendo
 * de cero. La cookie que elige el negocio no cambia dentro de un mismo request.
 */
export const requireOrganizationId = cache(resolveOrganizationId);

/** Igual que requireOrganizationId pero sin lanzar (lecturas desde el cliente). */
export async function tryRequireOrganizationId(): Promise<string | null> {
  try {
    return await requireOrganizationId();
  } catch {
    return null;
  }
}

export function isMissingColumnError(message: string, column?: string): boolean {
  const missingColumn =
    /column\s+.+\s+does not exist/i.test(message) ||
    message.includes("Could not find the") && message.includes("column");
  if (!missingColumn) return false;
  if (!column) return true;
  return message.includes(column);
}

export function isMissingTableError(message: string): boolean {
  if (isMissingColumnError(message)) return false;
  return (
    message.includes("Could not find the table") ||
    message.includes("does not exist") ||
    message.includes("schema cache")
  );
}
