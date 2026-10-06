"use server";

import { revalidatePath } from "next/cache";
import {
  getCurrentProfile,
  isMissingTableError,
  requireOrganizationId,
} from "@/lib/auth/bootstrap";
import { generateTempPassword } from "@/lib/auth/generate-temp-password";
import { tempPasswordProfileFields } from "@/lib/auth/temp-password-expiry";
import type { TempCredentials } from "@/lib/auth/temp-credentials";
import {
  permissionsToRow,
  rowToCustomRole,
  rowToTeamInvitation,
  rowToTeamMember,
  type ProfileRow,
  type TeamInvitationRow,
  type TeamRoleRow,
} from "@/lib/team/mapper";
import {
  actionErrorMessage,
  ErrorEsperable,
  FallaDeLaBase,
  mutacionConErroresEsperables,
  runMutation,
  type MutationResult,
} from "@/lib/server/action-result";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertRolDeLaOrg } from "@/lib/team/rol-de-la-org";
import {
  leerMotivoDeLaBase,
  MENSAJE_INVITACION,
  type MotivoRechazoInvitacion,
} from "@/lib/team/invitacion";
import {
  banParaEstado,
  MOTIVO_BAN_DESACTIVADO,
} from "@/lib/auth/cuenta-desactivada";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  aceptarInvitacionSchema,
  createCustomRoleSchema,
  deactivateMemberSchema,
  deleteCustomRoleSchema,
  firstZodError,
  inviteTeamMemberSchema,
  revokeInvitationSchema,
  updateMemberRoleSchema,
} from "@/lib/validations";
import { paths } from "@/routes/paths";
import type { CustomRole, PermissionLevel, TeamInvitation, TeamMember } from "@/types/team";
import type { UserRole } from "@ai-coo/types";
import type { z } from "zod";

function revalidateTeam() {
  revalidatePath(paths.platform.team.root);
}

/**
 * SCRUM-8: además de `profiles.is_active`, el acceso se corta en Auth.
 * Desactivar banea al usuario (no vuelve a iniciar sesión ni renueva el
 * token) y vence las invitaciones que haya creado; reactivar lo desbanea.
 * Sólo se llama después de confirmar que el perfil es de la org.
 */
async function sincronizarAccesoEnAuth(memberId: string, activo: boolean) {
  const admin = createAdminClient();
  const fallo = (detalle: string) =>
    new Error(
      `El perfil quedó ${activo ? "activo" : "desactivado"}, pero no se pudo actualizar su acceso: ${detalle}`
    );

  if (!activo) {
    const { error: invitacionesError } = await admin
      .from("team_invitations")
      .update({ status: "expired" })
      .eq("invited_by", memberId)
      .eq("status", "pending");
    if (invitacionesError) throw fallo(invitacionesError.message);

    const { error } = await admin.auth.admin.updateUserById(memberId, {
      ban_duration: banParaEstado(false),
      app_metadata: { ban_motivo: MOTIVO_BAN_DESACTIVADO },
    });
    if (error) throw fallo(error.message);
    return;
  }

  // Reactivar: sólo se levanta el ban que puso la baja desde Equipo.
  const { data, error: lecturaError } = await admin.auth.admin.getUserById(memberId);
  if (lecturaError) throw fallo(lecturaError.message);
  if (data.user?.app_metadata?.ban_motivo !== MOTIVO_BAN_DESACTIVADO) return;

  const { error } = await admin.auth.admin.updateUserById(memberId, {
    ban_duration: banParaEstado(true),
    app_metadata: { ban_motivo: null },
  });
  if (error) throw fallo(error.message);
}

function canManageTeam(role: string | undefined): boolean {
  return role === "founder";
}

async function requireManagerProfile() {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Sesión no válida");
  if (!canManageTeam(profile.role)) {
    throw new Error("Sin permisos para esta acción");
  }
  return profile;
}

type ManagerProfileContext = Awaited<ReturnType<typeof requireManagerProfile>>;

async function requireManagerProfileAndParse<T extends z.ZodTypeAny>(
  schema: T,
  input: unknown
): Promise<
  | { success: true; data: z.infer<T>; profile: ManagerProfileContext }
  | { success: false; error: string }
> {
  let profile: ManagerProfileContext;
  try {
    profile = await requireManagerProfile();
  } catch (error) {
    return { success: false, error: actionErrorMessage(error) };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: firstZodError(parsed.error) };
  }

  return { success: true, data: parsed.data, profile };
}

/**
 * Lo que ve el usuario cuando una lectura de Equipo falla en la base. El
 * detalle técnico se registra en el servidor y va a Sentry.
 */
/** Código de Postgres de una restricción de unicidad violada. */
const VIOLACION_DE_UNICIDAD = "23505";
const ROL_REPETIDO = "Ya existe un rol con ese nombre.";

const FALLO_AL_LEER_EL_EQUIPO =
  "Hubo un problema al leer los datos del equipo. Recargá la página para intentar de nuevo.";

/*
 * SCRUM-497: las lecturas de Equipo devuelven sus errores como valor
 * (`MutationResult`). `/team` es un server component y no hay error boundary:
 * una lectura que lanzaba terminaba en la pantalla de error de Next, con el
 * párrafo técnico en inglés en producción. Corren dentro de
 * `mutacionConErroresEsperables`: sesión y cuenta desactivada vuelven con su
 * motivo; una falla de la base (`FallaDeLaBase`) o cualquier otra excepción se
 * registra, va a Sentry y vuelve con `FALLO_AL_LEER_EL_EQUIPO`.
 */

export async function getTeamMembersAction(): Promise<MutationResult<TeamMember[]>> {
  if (!isSupabaseConfigured()) return { success: true, data: [] };

  return mutacionConErroresEsperables("[getTeamMembers]", async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("profiles")
      .select(
        `
        id,
        full_name,
        email,
        role,
        avatar_url,
        is_active,
        last_login_at,
        hourly_rate,
        hourly_rate_currency,
        custom_role_id,
        created_at,
        team_roles(name, permissions)
      `
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true });

    if (error) {
      if (isMissingTableError(error.message)) return [];
      throw new FallaDeLaBase(error);
    }

    return ((data ?? []) as unknown as ProfileRow[]).map(rowToTeamMember);
  }, FALLO_AL_LEER_EL_EQUIPO);
}

export async function getTeamRolesAction(): Promise<MutationResult<CustomRole[]>> {
  if (!isSupabaseConfigured()) return { success: true, data: [] };

  return mutacionConErroresEsperables("[getTeamRoles]", async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("team_roles")
      .select("*")
      .eq("organization_id", organizationId)
      .order("is_default", { ascending: false })
      .order("name", { ascending: true });

    if (error) {
      if (isMissingTableError(error.message)) return [];
      throw new FallaDeLaBase(error);
    }

    if (!data?.length) {
      const { error: rpcError } = await supabase.rpc("create_default_roles", {
        org_id: organizationId,
      });
      if (rpcError && !isMissingTableError(rpcError.message)) {
        throw new FallaDeLaBase(rpcError);
      }

      const { data: seeded, error: retryError } = await supabase
        .from("team_roles")
        .select("*")
        .eq("organization_id", organizationId)
        .order("is_default", { ascending: false })
        .order("name", { ascending: true });

      if (retryError) throw new FallaDeLaBase(retryError);
      return ((seeded ?? []) as TeamRoleRow[]).map(rowToCustomRole);
    }

    return (data as TeamRoleRow[]).map(rowToCustomRole);
  }, FALLO_AL_LEER_EL_EQUIPO);
}

export async function getPendingInvitationsAction(): Promise<
  MutationResult<TeamInvitation[]>
> {
  if (!isSupabaseConfigured()) return { success: true, data: [] };

  return mutacionConErroresEsperables("[getPendingInvitations]", async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("team_invitations")
      .select(
        `
        id,
        email,
        role,
        status,
        expires_at,
        created_at,
        custom_role_id,
        invited_by,
        profiles(full_name),
        team_roles(name)
      `
      )
      .eq("organization_id", organizationId)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });

    if (error) {
      if (isMissingTableError(error.message)) return [];
      throw new FallaDeLaBase(error);
    }

    return ((data ?? []) as unknown as TeamInvitationRow[]).map(
      rowToTeamInvitation
    );
  }, FALLO_AL_LEER_EL_EQUIPO);
}

export type TeamPageContext = {
  members: TeamMember[];
  roles: CustomRole[];
  invitations: TeamInvitation[];
  canManage: boolean;
  canEditRates: boolean;
};

/** Todo lo de `/team`, o el primer error de las tres lecturas. */
export async function getTeamPageContextAction(): Promise<
  MutationResult<TeamPageContext>
> {
  if (!isSupabaseConfigured()) {
    return {
      success: true,
      data: {
        members: [],
        roles: [],
        invitations: [],
        canManage: false,
        canEditRates: false,
      },
    };
  }

  const profile = await getCurrentProfile();
  const [members, roles, invitations] = await Promise.all([
    getTeamMembersAction(),
    getTeamRolesAction(),
    getPendingInvitationsAction(),
  ]);

  if (!members.success) return members;
  if (!roles.success) return roles;
  if (!invitations.success) return invitations;

  return {
    success: true,
    data: {
      members: members.data,
      roles: roles.data,
      invitations: invitations.data,
      canManage: canManageTeam(profile?.role),
      canEditRates: canManageTeam(profile?.role),
    },
  };
}

export async function inviteTeamMemberAction(data: {
  email: string;
  fullName: string;
  role?: UserRole;
  customRoleId: string;
}): Promise<MutationResult<{ tempCredentials: TempCredentials }>> {
  const auth = await requireManagerProfileAndParse(inviteTeamMemberSchema, data);
  if (!auth.success) {
    return { success: false, error: auth.error };
  }

  const { email, fullName, customRoleId } = auth.data;

  return runMutation(async () => {
    const profile = auth.profile;
    // requireOrganizationId() respeta el contexto JWT del holding (child_org cuando
    // el holding opera un negocio hijo), a diferencia de profile.organization_id
    // que siempre apunta al holding_org.
    const organizationId = await requireOrganizationId();
    const admin = createAdminClient();

    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      throw new Error("Este email ya es miembro de la organización");
    }

    // SCRUM-75: el rol tiene que ser de esta organización.
    await assertRolDeLaOrg(admin, customRoleId, organizationId);

    const tempPassword = generateTempPassword();

    const { data: authUser, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

    if (createError || !authUser.user) {
      if (
        createError?.message.toLowerCase().includes("already") ||
        createError?.message.toLowerCase().includes("registered")
      ) {
        throw new Error("Ya existe una cuenta con este email");
      }
      throw new Error(createError?.message ?? "Error creando usuario");
    }

    const { error: profileError } = await admin.from("profiles").insert({
      id: authUser.user.id,
      organization_id: organizationId,
      email,
      full_name: fullName,
      role: "member",
      custom_role_id: customRoleId ?? null,
      invited_by: profile.id,
      is_active: true,
      ...tempPasswordProfileFields(),
    });

    if (profileError) {
      await admin.auth.admin.deleteUser(authUser.user.id);
      throw new Error(profileError.message);
    }

    revalidateTeam();
    return { tempCredentials: { email, tempPassword } };
  });
}

export async function updateMemberRoleAction(
  memberId: string,
  data: {
    role?: UserRole;
    customRoleId?: string | null;
    isActive?: boolean;
  }
): Promise<MutationResult<{ ok: true }>> {
  const auth = await requireManagerProfileAndParse(updateMemberRoleSchema, {
    memberId,
    ...data,
  });
  if (!auth.success) {
    return { success: false, error: auth.error };
  }

  const { memberId: parsedMemberId, customRoleId, isActive } = auth.data;

  return runMutation(async () => {
    const profile = auth.profile;

    if (parsedMemberId === profile.id && profile.role === "founder") {
      throw new Error("El founder no puede cambiar su propio rol");
    }

    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const updates: {
      custom_role_id?: string | null;
      is_active?: boolean;
    } = {};

    if (customRoleId !== undefined) {
      // SCRUM-75: el rol tiene que ser de esta organización.
      await assertRolDeLaOrg(supabase, customRoleId, organizationId);
      updates.custom_role_id = customRoleId;
    }
    if (isActive !== undefined) {
      updates.is_active = isActive;
    }

    if (Object.keys(updates).length === 0) {
      return { ok: true as const };
    }

    const { data: anterior } = await supabase
      .from("profiles")
      .select("is_active")
      .eq("id", parsedMemberId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    const { data: actualizados, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", parsedMemberId)
      .eq("organization_id", organizationId)
      .select("id");

    if (error) throw new Error(error.message);
    if (!actualizados?.length) throw new Error("Miembro no encontrado");

    // Auth sólo se toca si el estado cambió de verdad.
    if (isActive !== undefined && anterior?.is_active !== isActive) {
      await sincronizarAccesoEnAuth(parsedMemberId, isActive);
    }

    revalidateTeam();
    return { ok: true };
  });
}

export async function deactivateMemberAction(
  memberId: string
): Promise<MutationResult<{ ok: true }>> {
  const auth = await requireManagerProfileAndParse(deactivateMemberSchema, {
    memberId,
  });
  if (!auth.success) {
    return { success: false, error: auth.error };
  }

  const { memberId: parsedMemberId } = auth.data;

  return runMutation(async () => {
    const profile = auth.profile;
    if (parsedMemberId === profile.id) {
      throw new Error("No podés desactivarte a vos mismo");
    }

    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const { data: actualizados, error } = await supabase
      .from("profiles")
      .update({ is_active: false })
      .eq("id", parsedMemberId)
      .eq("organization_id", organizationId)
      .select("id");

    if (error) throw new Error(error.message);
    if (!actualizados?.length) throw new Error("Miembro no encontrado");

    await sincronizarAccesoEnAuth(parsedMemberId, false);

    revalidateTeam();
    return { ok: true };
  });
}

export async function createCustomRoleAction(data: {
  name: string;
  description?: string;
  permissions: Record<string, PermissionLevel>;
}): Promise<MutationResult<CustomRole>> {
  const auth = await requireManagerProfileAndParse(createCustomRoleSchema, data);
  if (!auth.success) {
    return { success: false, error: auth.error };
  }

  const { name, description, permissions } = auth.data;

  return runMutation(async () => {
    // Usar requireOrganizationId() en vez de profile.organization_id para respetar
    // el contexto efectivo del holding (get_my_organization_id() lee active_business_org_id
    // del JWT cuando el holding está operando un negocio hijo).
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data: role, error } = await supabase
      .from("team_roles")
      .insert({
        organization_id: organizationId,
        name,
        description: description ?? null,
        permissions: permissionsToRow(permissions),
        is_default: false,
      })
      .select("*")
      .single();

    // `UNIQUE (organization_id, name)`: un nombre repetido es un rechazo
    // esperable, no una falla (SCRUM-497).
    if (error?.code === VIOLACION_DE_UNICIDAD) throw new ErrorEsperable(ROL_REPETIDO);
    if (error) throw new FallaDeLaBase(error);

    revalidateTeam();
    return rowToCustomRole(role as TeamRoleRow);
  });
}

export async function deleteCustomRoleAction(
  roleId: string
): Promise<MutationResult<{ ok: true }>> {
  const auth = await requireManagerProfileAndParse(deleteCustomRoleSchema, {
    roleId,
  });
  if (!auth.success) {
    return { success: false, error: auth.error };
  }

  const { roleId: parsedRoleId } = auth.data;

  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { data: role, error: fetchError } = await supabase
      .from("team_roles")
      .select("is_default")
      .eq("id", parsedRoleId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (fetchError) throw new Error(fetchError.message);
    if (!role) throw new Error("Rol no encontrado");
    if (role.is_default) throw new Error("No se pueden eliminar roles default");

    const { error } = await supabase
      .from("team_roles")
      .delete()
      .eq("id", parsedRoleId)
      .eq("organization_id", organizationId);

    if (error) throw new Error(error.message);

    revalidateTeam();
    return { ok: true };
  });
}

export async function revokeInvitationAction(
  invitationId: string
): Promise<MutationResult<{ ok: true }>> {
  const auth = await requireManagerProfileAndParse(revokeInvitationSchema, {
    invitationId,
  });
  if (!auth.success) {
    return { success: false, error: auth.error };
  }

  const { invitationId: parsedInvitationId } = auth.data;

  return runMutation(async () => {
    const organizationId = auth.profile.organization_id;
    const supabase = await createClient();

    const { error } = await supabase
      .from("team_invitations")
      .update({ status: "expired" })
      .eq("id", parsedInvitationId)
      .eq("organization_id", organizationId);

    if (error) throw new Error(error.message);

    revalidateTeam();
    return { ok: true };
  });
}

export type ResultadoAceptarInvitacion =
  | { success: true; data: { yaEraMiembro: boolean } }
  | { success: false; motivo: MotivoRechazoInvitacion; error: string };

function rechazoDeInvitacion(motivo: MotivoRechazoInvitacion): ResultadoAceptarInvitacion {
  return { success: false, motivo, error: MENSAJE_INVITACION[motivo] };
}

/**
 * [AUTH-ALTA-EMAIL-AJENO] parte A (SCRUM-495): acepta una invitación de equipo
 * con la cuenta de la sesión. No crea cuentas: sin sesión, rechaza. El resto
 * (email de la cuenta igual al invitado y confirmado, invitación pendiente y
 * sin vencer, rol de la org, cuenta sin otra org, marcarla usada una sola vez)
 * lo resuelve `aceptar_invitacion_de_equipo` en una transacción, con el id del
 * usuario de la sesión.
 *
 * No usa `requireOrganizationId()`: quien acepta todavía no es de la org, y
 * resolverla le crearía una org propia (`ensureUserBootstrap`). Los errores
 * esperables vuelven como valor, con `motivo`; quien llama redirige.
 */
export async function aceptarInvitacionAction(
  token: string
): Promise<ResultadoAceptarInvitacion> {
  const parsed = aceptarInvitacionSchema.safeParse({ token });
  if (!parsed.success) return rechazoDeInvitacion("no_existe");

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return rechazoDeInvitacion("sin_sesion");

    const { data, error } = await createAdminClient().rpc(
      "aceptar_invitacion_de_equipo",
      { p_token: parsed.data.token, p_user_id: user.id }
    );
    if (error) {
      console.error("[invite] no se pudo aceptar la invitación:", error.message);
      return rechazoDeInvitacion("error");
    }

    const motivo = leerMotivoDeLaBase(data);
    if (motivo === null) {
      console.error("[invite] respuesta inesperada de aceptar_invitacion_de_equipo:", data);
      return rechazoDeInvitacion("error");
    }
    if (motivo === "aceptada" || motivo === "ya_era_miembro") {
      revalidateTeam();
      return { success: true, data: { yaEraMiembro: motivo === "ya_era_miembro" } };
    }
    return rechazoDeInvitacion(motivo);
  } catch (error) {
    console.error("[invite] error al aceptar la invitación:", actionErrorMessage(error));
    return rechazoDeInvitacion("error");
  }
}

export { actionErrorMessage };
