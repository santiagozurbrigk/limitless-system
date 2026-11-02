"use server";

/**
 * Bajas del super admin: organizaciones y personas.
 *
 * Están en su propio archivo y no en `actions.ts` porque son las únicas
 * acciones **irreversibles** de la plataforma. Mezcladas entre cincuenta
 * acciones de lectura y edición se leen como una más.
 *
 * Dos reglas que valen para las cuatro acciones de acá:
 *
 * - **La confirmación se revalida en el servidor.** El diálogo pide escribir el
 *   nombre exacto, pero eso es una comodidad del navegador: quien invoque la
 *   action directamente tiene que mandarlo igual. Una barrera que sólo vive en
 *   el cliente no es una barrera.
 * - **Toda baja queda registrada** en `super_admin_deletions`, una tabla que no
 *   cuelga de ninguna organización. Si el rastro viviera adentro de lo que se
 *   borra, desaparecería con ello.
 */

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/require-staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { runMutation, type MutationResult } from "@/lib/server/action-result";
import { paths } from "@/routes";
import {
  advertenciasDeOrganizacion,
  advertenciasDeUsuario,
  confirmacionValida,
  estaBloqueada,
  type Advertencia,
} from "@/lib/super-admin/deletion-plan";
import {
  contarArchivosDeOrganizacion,
  ejecutarBajaDeOrganizacion,
  ejecutarBajaDeUsuario,
  type ResultadoDeBaja,
} from "@/lib/super-admin/execute-deletion";

export type VistaPreviaDeBaja = {
  nombre: string;
  /** Lo que hay que escribir para habilitar el botón. */
  confirmacionEsperada: string;
  advertencias: Advertencia[];
  bloqueada: boolean;
  conteo: {
    perfiles: number;
    clientes: number;
    archivos: number;
    negociosDelHolding: number;
  };
};

function revalidarSuperAdmin() {
  revalidatePath(paths.superAdmin.organizations);
  revalidatePath(paths.superAdmin.users);
  revalidatePath(paths.superAdmin.holding);
  revalidatePath(paths.superAdmin.root);
}

/** Los perfiles de una organización, con su email. */
async function perfilesDe(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string
): Promise<{ id: string; email: string | null }[]> {
  const { data } = await admin
    .from("profiles")
    .select("id, email")
    .eq("organization_id", organizationId);
  return (data ?? []) as { id: string; email: string | null }[];
}

async function contar(
  admin: ReturnType<typeof createAdminClient>,
  tabla: string,
  columna: string,
  valor: string
): Promise<number> {
  const { count } = await admin
    .from(tabla)
    .select("id", { count: "exact", head: true })
    .eq(columna, valor);
  return count ?? 0;
}

/**
 * Qué se va a llevar puesto la baja de una organización.
 *
 * Se calcula en el servidor y se muestra **antes** de pedir la confirmación:
 * escribir un nombre para autorizar algo que no sabés qué alcance tiene es el
 * mismo click automático que un "¿estás seguro?".
 */
export async function previewOrganizationDeletionAction(
  organizationId: string
): Promise<MutationResult<VistaPreviaDeBaja>> {
  return runMutation(async () => {
    const ejecutor = await requireStaff();
    const admin = createAdminClient();

    const { data: org } = await admin
      .from("organizations")
      .select("id, name, account_type")
      .eq("id", organizationId)
      .maybeSingle();

    if (!org) throw new Error("La organización no existe");

    const perfiles = await perfilesDe(admin, organizationId);
    const esHolding = org.account_type === "holding";

    const [clientes, negociosDelHolding, archivos] = await Promise.all([
      contar(admin, "clients", "organization_id", organizationId),
      esHolding
        ? contar(admin, "holding_businesses", "holding_org_id", organizationId)
        : Promise.resolve(0),
      contarArchivosDeOrganizacion(admin, organizationId),
    ]);

    const conteo = {
      perfiles: perfiles.length,
      clientes,
      archivos,
      negociosDelHolding,
    };

    const incluyeAlEjecutor = perfiles.some(
      (perfil) =>
        perfil.email?.trim().toLowerCase() === ejecutor.email?.trim().toLowerCase()
    );

    const advertencias = advertenciasDeOrganizacion({
      conteo,
      esHolding,
      incluyeAlEjecutor,
    });

    return {
      nombre: org.name as string,
      confirmacionEsperada: org.name as string,
      advertencias,
      bloqueada: estaBloqueada(advertencias),
      conteo,
    };
  });
}

export async function deleteOrganizationAction(input: {
  organizationId: string;
  confirmacion: string;
}): Promise<MutationResult<ResultadoDeBaja>> {
  return runMutation(async () => {
    const ejecutor = await requireStaff();
    const admin = createAdminClient();

    const { data: org } = await admin
      .from("organizations")
      .select("id, name, account_type")
      .eq("id", input.organizationId)
      .maybeSingle();

    if (!org) throw new Error("La organización no existe");

    // La confirmación, revalidada del lado del servidor.
    if (!confirmacionValida(input.confirmacion, org.name as string)) {
      throw new Error(
        `Para confirmar hay que escribir el nombre exacto: "${org.name}"`
      );
    }

    const perfiles = await perfilesDe(admin, input.organizationId);

    // El bloqueo, también revalidado: nadie borra la organización en la que está.
    const incluyeAlEjecutor = perfiles.some(
      (perfil) =>
        perfil.email?.trim().toLowerCase() === ejecutor.email?.trim().toLowerCase()
    );
    if (incluyeAlEjecutor) {
      throw new Error(
        "No podés dar de baja la organización a la que pertenece tu propia cuenta."
      );
    }

    const resultado = await ejecutarBajaDeOrganizacion(
      admin,
      input.organizationId,
      perfiles.map((perfil) => perfil.id)
    );

    // El registro va aunque la baja haya quedado a medias: es cuando más sirve.
    await admin.from("super_admin_deletions").insert({
      tipo: "organization",
      objetivo_id: input.organizationId,
      objetivo_nombre: org.name,
      ejecutado_por_email: ejecutor.email ?? "desconocido",
      resultado: {
        ...resultado,
        perfiles: perfiles.length,
        account_type: org.account_type,
      },
    });

    if (!resultado.filaBorrada) {
      throw new Error(resultado.problemas.join(" · "));
    }

    revalidarSuperAdmin();
    return resultado;
  });
}

export async function previewUserDeletionAction(
  profileId: string
): Promise<MutationResult<VistaPreviaDeBaja>> {
  return runMutation(async () => {
    const ejecutor = await requireStaff();
    const admin = createAdminClient();

    const { data: perfil } = await admin
      .from("profiles")
      .select("id, email, full_name, role, organization_id, organizations(name)")
      .eq("id", profileId)
      .maybeSingle();

    if (!perfil) throw new Error("La persona no existe");

    const orgField = perfil.organizations as
      | { name?: string }
      | { name?: string }[]
      | null;
    const organizacion =
      (Array.isArray(orgField) ? orgField[0]?.name : orgField?.name) ??
      "su organización";

    let esUltimoFounder = false;
    if (perfil.role === "founder" && perfil.organization_id) {
      const { count } = await admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", perfil.organization_id as string)
        .eq("role", "founder");
      esUltimoFounder = (count ?? 0) <= 1;
    }

    const esElEjecutor =
      (perfil.email as string | null)?.trim().toLowerCase() ===
      ejecutor.email?.trim().toLowerCase();

    const advertencias = advertenciasDeUsuario({
      esElEjecutor,
      esUltimoFounder,
      organizacion,
    });

    // Acá se escribe el email y no el nombre: dos personas pueden llamarse
    // igual, y el email es lo que identifica la cuenta que se va a dar de baja.
    const email = (perfil.email as string | null) ?? "";

    return {
      nombre: (perfil.full_name as string | null) || email,
      confirmacionEsperada: email,
      advertencias,
      bloqueada: estaBloqueada(advertencias),
      conteo: { perfiles: 1, clientes: 0, archivos: 0, negociosDelHolding: 0 },
    };
  });
}

export async function deleteUserAction(input: {
  profileId: string;
  confirmacion: string;
}): Promise<MutationResult<ResultadoDeBaja>> {
  return runMutation(async () => {
    const ejecutor = await requireStaff();
    const admin = createAdminClient();

    const { data: perfil } = await admin
      .from("profiles")
      .select("id, email, full_name, role, organization_id")
      .eq("id", input.profileId)
      .maybeSingle();

    if (!perfil) throw new Error("La persona no existe");

    const email = (perfil.email as string | null) ?? "";

    if (!confirmacionValida(input.confirmacion, email)) {
      throw new Error(`Para confirmar hay que escribir el email exacto: "${email}"`);
    }

    if (email.trim().toLowerCase() === ejecutor.email?.trim().toLowerCase()) {
      throw new Error("No podés dar de baja tu propia cuenta.");
    }

    const resultado = await ejecutarBajaDeUsuario(admin, input.profileId);

    await admin.from("super_admin_deletions").insert({
      tipo: "user",
      objetivo_id: input.profileId,
      objetivo_nombre: perfil.full_name,
      objetivo_email: email,
      ejecutado_por_email: ejecutor.email ?? "desconocido",
      resultado: { ...resultado, role: perfil.role },
    });

    if (!resultado.filaBorrada) {
      throw new Error(resultado.problemas.join(" · "));
    }

    revalidarSuperAdmin();
    return resultado;
  });
}
