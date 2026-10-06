import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { estadoDeInvitacion } from "@/lib/team/invitacion";
import { aceptarInvitacionSchema } from "@/lib/validations";

/**
 * Lo que `/invite` muestra de una invitación de equipo. Se lee con el service
 * role porque quien abre el link todavía no es de la org (las policies de
 * `team_invitations` son sólo para el founder); el token del link es lo que
 * autoriza a verla. Con el token no se acepta nada: eso lo hace
 * `aceptarInvitacionAction`, con la sesión.
 */
export type InvitacionParaMostrar =
  | {
      estado: "pendiente";
      email: string;
      organizacion: string;
      /** Rol custom de la invitación, si tiene. */
      rol: string | null;
      invitadoPor: string | null;
    }
  | { estado: "no_existe" | "usada" | "vencida" | "error" };

type FilaInvitacion = {
  email: string;
  status: string;
  expires_at: string;
  organizations: { name: string | null } | { name: string | null }[] | null;
  team_roles: { name: string | null } | { name: string | null }[] | null;
  profiles: { full_name: string | null } | { full_name: string | null }[] | null;
};

function uno<T>(valor: T | T[] | null): T | null {
  return Array.isArray(valor) ? (valor[0] ?? null) : valor;
}

export async function cargarInvitacion(token: string): Promise<InvitacionParaMostrar> {
  const parsed = aceptarInvitacionSchema.safeParse({ token });
  if (!parsed.success) return { estado: "no_existe" };

  const { data, error } = await createAdminClient()
    .from("team_invitations")
    .select(
      "email, status, expires_at, organizations(name), team_roles(name), profiles(full_name)"
    )
    .eq("token", parsed.data.token)
    .maybeSingle();

  if (error) {
    // [AUD-SEG-8]: el detalle va al log, no a la pantalla.
    console.error("[invite] no se pudo leer la invitación:", error.message);
    return { estado: "error" };
  }

  const fila = data as FilaInvitacion | null;
  if (!fila) return { estado: "no_existe" };
  const estado = estadoDeInvitacion(fila, new Date());
  if (estado !== "pendiente") return { estado };

  return {
    estado: "pendiente",
    email: fila.email.trim(),
    organizacion: uno(fila.organizations)?.name ?? "tu equipo",
    rol: uno(fila.team_roles)?.name ?? null,
    invitadoPor: uno(fila.profiles)?.full_name ?? null,
  };
}
