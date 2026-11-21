import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { CUENTA_DESACTIVADA_MESSAGE, estaDesactivado } from "@/lib/auth/cuenta-desactivada";
import { paths } from "@/routes";

/**
 * SCRUM-552 · el guard del panel interno.
 *
 * El staff de Limitless es founder de la organización de Limitless, pero estar
 * en esa org (aunque sea como founder) no da el panel: lo decide sólo la lista
 * de staff (`super_admin_users`). Este módulo no lee `organization_id` ni
 * `role` del perfil; sólo `is_active`, para que un staff desactivado no entre.
 */

/**
 * Adónde va el staff al iniciar sesión. Lo cambia C1 (SCRUM-551) cuando exista
 * la ruta de Administración.
 */
export const DESTINO_DEL_STAFF = paths.superAdmin.organizations;

export async function isStaffEmail(email: string): Promise<boolean> {
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
 * Resultado de resolver al usuario actual como staff. Distingue por qué no lo
 * es para que `requireStaff` lance el mismo mensaje que lanzaba
 * `requireSuperAdmin`.
 */
type ResolucionStaff =
  | { ok: true; user: User }
  | { ok: false; motivo: "no-configurado" | "no-autenticado" | "sin-permisos" | "desactivado" };

/**
 * `auth.getUser()` + consulta a `super_admin_users` (y, sólo para quien está en
 * la lista, a su perfil), una sola vez por pedido (SCRUM-111). Una página del
 * panel encadena varios chequeos (el layout con `isStaffUser` y cada lectura de
 * `lib/super-admin` con `requireStaff`); con `cache` de React todos comparten
 * este resultado dentro del mismo render de server components. Fuera de un
 * render (server actions, route handlers, tests) `cache` no memoiza y cada
 * llamada consulta.
 *
 * Falla cerrada: si no se puede leer el perfil, rechaza. Un perfil que todavía
 * no existe (staff recién dado de alta) no corta.
 */
const resolverStaff = cache(async (): Promise<ResolucionStaff> => {
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

  if (!(await isStaffEmail(user.email))) {
    return { ok: false, motivo: "sin-permisos" };
  }

  const { data: perfil, error: errorPerfil } = await createAdminClient()
    .from("profiles")
    .select("is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (errorPerfil) {
    console.error("[require-staff] no se pudo leer el perfil:", errorPerfil.message);
    return { ok: false, motivo: "sin-permisos" };
  }
  if (estaDesactivado(perfil?.is_active)) {
    return { ok: false, motivo: "desactivado" };
  }

  return { ok: true, user };
});

const MENSAJE_DE_RECHAZO = {
  "no-configurado": "Supabase no configurado",
  "no-autenticado": "No autenticado",
  "sin-permisos": "Sin permisos de super admin",
  desactivado: CUENTA_DESACTIVADA_MESSAGE,
} as const;

/** Los textos con los que el guard rechaza (los usa el test por acción del panel). */
export const MENSAJES_DE_RECHAZO_DEL_STAFF: readonly string[] = Object.values(MENSAJE_DE_RECHAZO);

export async function requireStaff(): Promise<User> {
  const resolucion = await resolverStaff();
  if (!resolucion.ok) {
    throw new Error(MENSAJE_DE_RECHAZO[resolucion.motivo]);
  }
  return resolucion.user;
}

export async function isStaffUser(): Promise<boolean> {
  return (await resolverStaff()).ok;
}
