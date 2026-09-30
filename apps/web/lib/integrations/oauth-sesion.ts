import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { createClient } from "@/lib/supabase/server";

/**
 * SCRUM-10: la organización donde un callback OAuth guarda la integración es
 * la de la sesión, resuelta igual que en el inicio (`requireOrganizationId()`,
 * que respeta el negocio activo del holding y corta a un perfil desactivado).
 * Sin sesión, `null`: el callback rechaza y no escribe nada.
 */
export async function orgDeLaSesionOAuth(): Promise<string | null> {
  try {
    return await requireOrganizationId();
  } catch {
    return null;
  }
}

/** El usuario de la sesión, o `null` si no hay. */
export async function usuarioDeLaSesionOAuth(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}
