"use server";

/**
 * El link de onboarding de cada cliente de un growth partner, y su historial.
 *
 * ⭐ Todo detrás del add-on `growth_partners`, como el resto de los clientes de
 * un cliente. Las lecturas y escrituras van con la sesión del usuario (RLS por
 * organización); sólo la página pública usa service role.
 */

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  getCurrentProfile,
  isMissingTableError,
  requireOrganizationId,
} from "@/lib/auth/bootstrap";
import { orgHasAddOn, requireAddOn } from "@/lib/auth/add-ons";
import {
  ONBOARDING_LINK_COLUMNS,
  ONBOARDING_SUBMISSION_COLUMNS,
  rowToOnboardingLink,
  rowToOnboardingSubmission,
  type OnboardingLink,
  type OnboardingLinkRow,
  type OnboardingSubmission,
  type OnboardingSubmissionRow,
} from "@/lib/client-onboarding/links";
import { applyOnboardingAnswers } from "@/lib/client-onboarding/form";
import { newClientFromOnboarding } from "@/lib/client-onboarding/assign";
import { fechaDeHoyDeLaOrganizacion } from "@/lib/fechas/organizacion";
import {
  SUB_CLIENT_NAME_MAX,
  rowToSubClient,
  type SubClientRow,
} from "@/lib/clients/sub-clients";
import { runMutation, type MutationResult } from "@/lib/server/action-result";
import { firstZodError } from "@/lib/validations";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CustomFieldValues } from "@/types/custom-fields";
import { createClient } from "@/lib/supabase/server";
import { paths } from "@/routes";

const ADD_ON = "growth_partners" as const;
const idSchema = z.string().uuid();

type LinkRow = OnboardingLinkRow;
const rowToLink = rowToOnboardingLink;

/** 24 bytes al azar: 32 caracteres que no se pueden adivinar. */
function nuevoToken(): string {
  return randomBytes(24).toString("base64url");
}

export type OnboardingStatus = {
  link: OnboardingLink | null;
  submissions: OnboardingSubmission[];
};

/** El link activo y los envíos de un cliente, el más nuevo primero. */
export async function getOnboardingStatusAction(subClientId: string): Promise<OnboardingStatus> {
  const vacio: OnboardingStatus = { link: null, submissions: [] };
  if (!idSchema.safeParse(subClientId).success) return vacio;

  const organizationId = await requireOrganizationId();
  if (!(await orgHasAddOn(organizationId, ADD_ON))) return vacio;

  const supabase = await createClient();
  const [links, envios] = await Promise.all([
    supabase
      .from("client_onboarding_links")
      .select(ONBOARDING_LINK_COLUMNS)
      .eq("organization_id", organizationId)
      .eq("sub_client_id", subClientId)
      .is("revoked_at", null)
      .maybeSingle(),
    supabase
      .from("client_onboarding_submissions")
      .select(ONBOARDING_SUBMISSION_COLUMNS)
      .eq("organization_id", organizationId)
      .eq("sub_client_id", subClientId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  for (const error of [links.error, envios.error]) {
    if (!error) continue;
    if (isMissingTableError(error.message)) return vacio;
    console.error("[onboarding] estado", error.message);
  }

  return {
    link: links.data ? rowToLink(links.data as LinkRow) : null,
    submissions: ((envios.data ?? []) as OnboardingSubmissionRow[]).map(
      rowToOnboardingSubmission
    ),
  };
}

/**
 * El link del cliente. Si ya tiene uno activo, devuelve ese: generar otro sin
 * querer dejaría sin efecto el que ya le mandaron.
 */
export async function createOnboardingLinkAction(
  subClientId: string
): Promise<MutationResult<OnboardingLink>> {
  return runMutation(async () => {
    if (!idSchema.safeParse(subClientId).success) throw new Error("Cliente inválido.");
    const organizationId = await requireOrganizationId();
    await requireAddOn(organizationId, ADD_ON);
    const profile = await getCurrentProfile();
    const supabase = await createClient();

    const { data: sub } = await supabase
      .from("client_sub_clients")
      .select("id, client_id")
      .eq("id", subClientId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!sub) throw new Error("Ese cliente ya no existe.");

    const { data: activo } = await supabase
      .from("client_onboarding_links")
      .select(ONBOARDING_LINK_COLUMNS)
      .eq("organization_id", organizationId)
      .eq("sub_client_id", subClientId)
      .is("revoked_at", null)
      .maybeSingle();
    if (activo) return rowToLink(activo as LinkRow);

    const { data, error } = await supabase
      .from("client_onboarding_links")
      .insert({
        organization_id: organizationId,
        client_id: sub.client_id as string,
        sub_client_id: subClientId,
        kind: "creator",
        token: nuevoToken(),
        created_by: profile?.id ?? null,
      })
      .select(ONBOARDING_LINK_COLUMNS)
      .single();

    if (error) {
      if (isMissingTableError(error.message)) {
        throw new Error("Falta aplicar la migración del onboarding en la base.");
      }
      throw new Error(error.message);
    }

    revalidatePath(paths.platform.clients.detail(sub.client_id as string));
    return rowToLink(data as LinkRow);
  });
}

/**
 * Apaga el link. Quien lo tenga ve «este link no está activo». Lo ya
 * respondido queda en la ficha y en el historial.
 */
export async function revokeOnboardingLinkAction(
  linkId: string
): Promise<MutationResult<void>> {
  return runMutation(async () => {
    if (!idSchema.safeParse(linkId).success) throw new Error("Link inválido.");
    const organizationId = await requireOrganizationId();
    await requireAddOn(organizationId, ADD_ON);
    const supabase = await createClient();

    const { error } = await supabase
      .from("client_onboarding_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", linkId)
      .eq("organization_id", organizationId)
      .is("revoked_at", null);
    if (error) throw new Error(error.message);
  });
}

// ─── Link general y bandeja ─────────────────────────────────────────────────

export type GeneralOnboarding = {
  link: OnboardingLink | null;
  /** Lo que llegó por el link general y todavía nadie asignó ni descartó. */
  pending: OnboardingSubmission[];
};

/** El link general de la organización y su bandeja «sin asignar». */
export async function getGeneralOnboardingAction(): Promise<GeneralOnboarding> {
  const vacio: GeneralOnboarding = { link: null, pending: [] };
  const organizationId = await requireOrganizationId();
  if (!(await orgHasAddOn(organizationId, ADD_ON))) return vacio;

  const supabase = await createClient();
  const [links, envios] = await Promise.all([
    supabase
      .from("client_onboarding_links")
      .select(ONBOARDING_LINK_COLUMNS)
      .eq("organization_id", organizationId)
      .eq("kind", "general")
      .is("revoked_at", null)
      .maybeSingle(),
    supabase
      .from("client_onboarding_submissions")
      .select(ONBOARDING_SUBMISSION_COLUMNS)
      .eq("organization_id", organizationId)
      .is("sub_client_id", null)
      .is("discarded_at", null)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  for (const error of [links.error, envios.error]) {
    if (!error) continue;
    if (isMissingTableError(error.message)) return vacio;
    console.error("[onboarding] bandeja", error.message);
  }

  return {
    link: links.data ? rowToLink(links.data as LinkRow) : null,
    pending: ((envios.data ?? []) as OnboardingSubmissionRow[]).map(rowToOnboardingSubmission),
  };
}

/** El link general. Si ya hay uno activo, devuelve ese. */
export async function createGeneralOnboardingLinkAction(): Promise<
  MutationResult<OnboardingLink>
> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    await requireAddOn(organizationId, ADD_ON);
    const profile = await getCurrentProfile();
    const supabase = await createClient();

    const { data: activo } = await supabase
      .from("client_onboarding_links")
      .select(ONBOARDING_LINK_COLUMNS)
      .eq("organization_id", organizationId)
      .eq("kind", "general")
      .is("revoked_at", null)
      .maybeSingle();
    if (activo) return rowToLink(activo as LinkRow);

    const { data, error } = await supabase
      .from("client_onboarding_links")
      .insert({
        organization_id: organizationId,
        kind: "general",
        token: nuevoToken(),
        created_by: profile?.id ?? null,
      })
      .select(ONBOARDING_LINK_COLUMNS)
      .single();
    if (error) {
      if (isMissingTableError(error.message)) {
        throw new Error("Falta aplicar la migración del onboarding en la base.");
      }
      throw new Error(error.message);
    }
    return rowToLink(data as LinkRow);
  });
}

/**
 * Lee un envío de la bandeja: de la organización, sin asignar y sin descartar.
 * Con service role porque la tabla no tiene policy de update: sólo el servidor
 * mueve un envío.
 */
async function envioPendiente(organizationId: string, submissionId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("client_onboarding_submissions")
    .select(ONBOARDING_SUBMISSION_COLUMNS + ", discarded_at")
    .eq("id", submissionId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as (OnboardingSubmissionRow & { discarded_at: string | null }) | null;
  if (!row) throw new Error("Ese envío ya no existe.");
  if (row.sub_client_id) throw new Error("Ese envío ya se asignó.");
  if (row.discarded_at) throw new Error("Ese envío se descartó.");
  return { admin, envio: rowToOnboardingSubmission(row) };
}

/** Saca un envío de la bandeja sin asignarlo. No se borra: queda el rastro. */
export async function discardOnboardingSubmissionAction(
  submissionId: string
): Promise<MutationResult<void>> {
  return runMutation(async () => {
    if (!idSchema.safeParse(submissionId).success) throw new Error("Envío inválido.");
    const organizationId = await requireOrganizationId();
    await requireAddOn(organizationId, ADD_ON);
    const { admin } = await envioPendiente(organizationId, submissionId);

    const { error } = await admin
      .from("client_onboarding_submissions")
      .update({ discarded_at: new Date().toISOString() })
      .eq("id", submissionId)
      .eq("organization_id", organizationId);
    if (error) throw new Error(error.message);
  });
}

const assignSchema = z
  .object({
    submissionId: z.string().uuid(),
    /** Un growth partner que ya existe… */
    clientId: z.string().uuid().nullish(),
    /** …o el nombre de uno nuevo. */
    newClientName: z.string().trim().min(1).max(200).nullish(),
    /** Un creador que ya existe de ese growth partner… */
    subClientId: z.string().uuid().nullish(),
    /** …o el nombre de uno nuevo (por defecto, el que escribió en el link). */
    newSubClientName: z.string().trim().min(1).max(200).nullish(),
  })
  .refine((v) => Boolean(v.clientId) !== Boolean(v.newClientName), {
    message: "Elegí un cliente o poné el nombre de uno nuevo.",
  })
  .refine((v) => !(v.subClientId && v.newClientName), {
    message: "Un cliente nuevo todavía no tiene creadores.",
  });

/**
 * «Esta ficha pertenece a este cliente»: pasa un envío de la bandeja a un
 * creador, y sus respuestas caen en su ficha como si hubiera usado su link.
 *
 * Si hace falta, crea el growth partner (en *pendiente de onboarding*) y el
 * creador. Pisa como el link de creador, y guarda lo que había en `replaced`.
 */
export async function assignOnboardingSubmissionAction(
  input: z.input<typeof assignSchema>
): Promise<MutationResult<{ clientId: string; subClientId: string }>> {
  return runMutation(async () => {
    const parsed = assignSchema.safeParse(input);
    if (!parsed.success) throw new Error(firstZodError(parsed.error));
    const v = parsed.data;

    const organizationId = await requireOrganizationId();
    await requireAddOn(organizationId, ADD_ON);
    const profile = await getCurrentProfile();
    const supabase = await createClient();
    const { admin, envio } = await envioPendiente(organizationId, v.submissionId);

    // 1 · El growth partner.
    let clientId = v.clientId ?? null;
    let clientName = "";
    if (clientId) {
      const { data } = await supabase
        .from("clients")
        .select("id, name")
        .eq("id", clientId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (!data) throw new Error("No se encontró ese cliente en tu organización.");
      clientName = data.name as string;
    } else {
      const { data, error } = await supabase
        .from("clients")
        .insert(
          newClientFromOnboarding(
            organizationId,
            v.newClientName!,
            await fechaDeHoyDeLaOrganizacion(supabase, organizationId)
          )
        )
        .select("id, name")
        .single();
      if (error) throw new Error(error.message);
      clientId = data.id as string;
      clientName = data.name as string;
    }

    // 2 · El creador.
    let sub: { id: string; name: string; custom: CustomFieldValues };
    if (v.subClientId) {
      const { data } = await supabase
        .from("client_sub_clients")
        .select("id, name, custom")
        .eq("id", v.subClientId)
        .eq("client_id", clientId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (!data) throw new Error(`Ese creador no es de ${clientName}.`);
      sub = rowToSubClient(data as SubClientRow);
    } else {
      const nombre = v.newSubClientName ?? envio.creatorName ?? envio.respondentName;
      if (!nombre) throw new Error("Poné el nombre del creador.");
      const { data, error } = await supabase
        .from("client_sub_clients")
        .insert({
          organization_id: organizationId,
          client_id: clientId,
          name: nombre.slice(0, SUB_CLIENT_NAME_MAX),
          created_by: profile?.id ?? null,
        })
        .select("id, name, custom")
        .single();
      if (error) throw new Error(error.message);
      sub = rowToSubClient(data as SubClientRow);
    }

    // 3 · El envío queda asignado, con lo que se va a pisar. Primero el
    // historial: si la ficha no se puede escribir, se deshace la asignación y
    // el envío vuelve a la bandeja.
    const applied = applyOnboardingAnswers(sub.custom, envio.answers);
    const { error: assignError } = await admin
      .from("client_onboarding_submissions")
      .update({
        client_id: clientId,
        sub_client_id: sub.id,
        replaced: applied.replaced,
        assigned_at: new Date().toISOString(),
        assigned_by: profile?.id ?? null,
      })
      .eq("id", envio.id)
      .eq("organization_id", organizationId)
      .is("sub_client_id", null);
    if (assignError) throw new Error(assignError.message);

    if (applied.changed.length > 0) {
      const { error } = await supabase
        .from("client_sub_clients")
        .update({ custom: applied.custom, updated_at: new Date().toISOString() })
        .eq("id", sub.id)
        .eq("organization_id", organizationId);
      if (error) {
        await admin
          .from("client_onboarding_submissions")
          .update({
            client_id: null,
            sub_client_id: null,
            replaced: {},
            assigned_at: null,
            assigned_by: null,
          })
          .eq("id", envio.id);
        throw new Error(error.message);
      }
    }

    const { error: timelineError } = await admin.from("client_timeline_entries").insert({
      organization_id: organizationId,
      client_id: clientId,
      entry_type: "onboarding",
      title: `Onboarding completado: ${sub.name}`,
      situation_summary: `Lo completó ${envio.respondentName ?? "alguien"} por el link general, y se asignó desde la bandeja.`,
      raw_data: { submission_id: envio.id, sub_client_id: sub.id },
    });
    if (timelineError) console.error("[onboarding] línea de tiempo", timelineError.message);

    revalidatePath(paths.platform.clients.root);
    revalidatePath(paths.platform.clients.detail(clientId));
    return { clientId, subClientId: sub.id };
  });
}
