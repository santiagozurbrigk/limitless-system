import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function isSuperAdminEmail(email: string): Promise<boolean> {
  if (!email.trim() || !isSupabaseConfigured()) return false;

  const admin = createAdminClient();
  const { data } = await admin
    .from("super_admin_users")
    .select("id")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();

  return Boolean(data);
}

/**
 * Resultado de resolver al usuario actual como super admin. Distingue por qué
 * no lo es para que `requireSuperAdmin` siga lanzando el mismo mensaje que antes.
 */
type ResolucionSuperAdmin =
  | { ok: true; user: User }
  | { ok: false; motivo: "no-configurado" | "no-autenticado" | "sin-permisos" };

/**
 * `auth.getUser()` + consulta a `super_admin_users`, una sola vez por pedido
 * (SCRUM-111). Una página del panel encadena varios chequeos (el layout con
 * `isSuperAdminUser` y cada lectura de `lib/super-admin` con
 * `requireSuperAdmin`); con `cache` de React todos comparten este resultado
 * dentro del mismo render de server components. Fuera de un render (server
 * actions, route handlers, tests) `cache` no memoiza y cada llamada consulta,
 * igual que antes.
 */
const resolverSuperAdmin = cache(async (): Promise<ResolucionSuperAdmin> => {
  if (!isSupabaseConfigured()) {
    return { ok: false, motivo: "no-configurado" };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email) {
    return { ok: false, motivo: "no-autenticado" };
  }

  if (!(await isSuperAdminEmail(user.email))) {
    return { ok: false, motivo: "sin-permisos" };
  }

  return { ok: true, user };
});

const MENSAJE_DE_RECHAZO = {
  "no-configurado": "Supabase no configurado",
  "no-autenticado": "No autenticado",
  "sin-permisos": "Sin permisos de super admin",
} as const;

export async function requireSuperAdmin(): Promise<User> {
  const resolucion = await resolverSuperAdmin();
  if (!resolucion.ok) {
    throw new Error(MENSAJE_DE_RECHAZO[resolucion.motivo]);
  }
  return resolucion.user;
}

export async function isSuperAdminUser(): Promise<boolean> {
  return (await resolverSuperAdmin()).ok;
}
