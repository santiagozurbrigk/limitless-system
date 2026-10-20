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
  requireOrganizationId,
} from "@/lib/auth/bootstrap";
import { orgHasAddOn } from "@/lib/auth/add-ons";
import { exigirAddOn } from "@/lib/auth/exigir-add-on";
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
import {
  ErrorEsperable,
  FallaDeLaBase,
  mutacionConErroresEsperables,
  registrarFallaDeAccion,
  type MutationResult,
} from "@/lib/server/action-result";
import { firstZodError, uuidSchema } from "@/lib/validations";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CustomFieldValues } from "@/types/custom-fields";
import { createClient } from "@/lib/supabase/server";
import { paths } from "@/routes";
import { esTablaAusente } from "@/lib/server/tabla-ausente";
import { rechazoPorModulo } from "@/lib/auth/acceso-a-modulo";

const ADD_ON = "growth_partners" as const;
const idSchema = uuidSchema;

type LinkRow = OnboardingLinkRow;
const rowToLink = rowToOnboardingLink;

/** 24 bytes al azar: 32 caracteres que no se pueden adivinar. */
function nuevoToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * SCRUM-516: las acciones del onboarding devuelven sus errores esperables como
 * valor (`MutationResult`), dentro de `mutacionConErroresEsperables`. Id
 * inválido, sesión, add-on no habilitado, cliente, creador o envío inexistente,
 * de otra organización o ya asignado o descartado, y la migración que falta,
 * vuelven con su motivo; lo inesperado se registra, va a Sentry y vuelve con el
 * texto fijo. Antes el texto crudo de la base llegaba a la pantalla, y las
 * lecturas mostraban "sin link" ante una falla, con el botón de generar otro.
 */

const FALTA_LA_MIGRACION = "Falta aplicar la migración del onboarding en la base.";
const CLIENTE_AJENO = "No se encontró ese cliente en tu organización.";
const SUB_CLIENTE_INEXISTENTE = "Ese cliente ya no existe.";

function errorDeAlta(error: { message: string; code?: string | null }): Error {
  if (esTablaAusente(error)) return new ErrorEsperable(FALTA_LA_MIGRACION);
  return new FallaDeLaBase(error);
}

/**
 * El primer error de un par de lecturas: sin la tabla es "todavía no hay
 * onboarding" (`null`); cualquier otro es una falla.
 */
function sinTablaOFalla(
  errores: Array<{ message: string; code?: string | null } | null>
): "sin-tabla" | null {
  for (const error of errores) {
    if (!error) continue;
    if (esTablaAusente(error)) return "sin-tabla";
    throw new FallaDeLaBase(error);
  }
  return null;
}

export type OnboardingStatus = {
  link: OnboardingLink | null;
  submissions: OnboardingSubmission[];
};

/** El link activo y los envíos de un cliente, el más nuevo primero. */
export async function getOnboardingStatusAction(
  subClientId: string
): Promise<MutationResult<OnboardingStatus>> {
  const rechazo = await rechazoPorModulo("clients");
  if (rechazo) return rechazo;

  return mutacionConErroresEsperables("[getOnboardingStatus]", async () => {
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

    if (sinTablaOFalla([links.error, envios.error]) === "sin-tabla") return vacio;

    return {
      link: links.data ? rowToLink(links.data as LinkRow) : null,
      submissions: ((envios.data ?? []) as OnboardingSubmissionRow[]).map(
        rowToOnboardingSubmission
      ),
    };
  });
}

/**
 * El link del cliente. Si ya tiene uno activo, devuelve ese: generar otro sin
 * querer dejaría sin efecto el que ya le mandaron.
 */
export async function createOnboardingLinkAction(
  subClientId: string
): Promise<MutationResult<OnboardingLink>> {
  return mutacionConErroresEsperables("[createOnboardingLink]", async () => {
    if (!idSchema.safeParse(subClientId).success) throw new ErrorEsperable("Cliente inválido.");
    const organizationId = await requireOrganizationId();
    await exigirAddOn(organizationId, ADD_ON);
    const profile = await getCurrentProfile();
    const supabase = await createClient();

    const { data: sub, error: subError } = await supabase
      .from("client_sub_clients")
      .select("id, client_id")
      .eq("id", subClientId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (subError) throw new FallaDeLaBase(subError);
    if (!sub) throw new ErrorEsperable(SUB_CLIENTE_INEXISTENTE);

    // Si no se puede saber si ya hay un link activo, no se crea otro: dejaría
    // sin efecto el que ya le mandaron.
    const { data: activo, error: activoError } = await supabase
      .from("client_onboarding_links")
      .select(ONBOARDING_LINK_COLUMNS)
      .eq("organization_id", organizationId)
      .eq("sub_client_id", subClientId)
      .is("revoked_at", null)
      .maybeSingle();
    if (activoError) throw errorDeAlta(activoError);
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

    if (error) throw errorDeAlta(error);

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
  return mutacionConErroresEsperables("[revokeOnboardingLink]", async () => {
    if (!idSchema.safeParse(linkId).success) throw new ErrorEsperable("Link inválido.");
    const organizationId = await requireOrganizationId();
    await exigirAddOn(organizationId, ADD_ON);
    const supabase = await createClient();

    const { error } = await supabase
      .from("client_onboarding_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", linkId)
      .eq("organization_id", organizationId)
      .is("revoked_at", null);
    if (error) throw new FallaDeLaBase(error);
  });
}

// ─── Link general y bandeja ─────────────────────────────────────────────────

export type GeneralOnboarding = {
  link: OnboardingLink | null;
  /** Lo que llegó por el link general y todavía nadie asignó ni descartó. */
  pending: OnboardingSubmission[];
};

/** El link general de la organización y su bandeja «sin asignar». */
export async function getGeneralOnboardingAction(): Promise<MutationResult<GeneralOnboarding>> {
  const rechazo = await rechazoPorModulo("clients");
  if (rechazo) return rechazo;

  return mutacionConErroresEsperables("[getGeneralOnboarding]", async () => {
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

    if (sinTablaOFalla([links.error, envios.error]) === "sin-tabla") return vacio;

    return {
      link: links.data ? rowToLink(links.data as LinkRow) : null,
      pending: ((envios.data ?? []) as OnboardingSubmissionRow[]).map(rowToOnboardingSubmission),
    };
  });
}

/** El link general. Si ya hay uno activo, devuelve ese. */
export async function createGeneralOnboardingLinkAction(): Promise<
  MutationResult<OnboardingLink>
> {
  return mutacionConErroresEsperables("[createGeneralOnboardingLink]", async () => {
    const organizationId = await requireOrganizationId();
    await exigirAddOn(organizationId, ADD_ON);
    const profile = await getCurrentProfile();
    const supabase = await createClient();

    const { data: activo, error: activoError } = await supabase
      .from("client_onboarding_links")
      .select(ONBOARDING_LINK_COLUMNS)
      .eq("organization_id", organizationId)
      .eq("kind", "general")
      .is("revoked_at", null)
      .maybeSingle();
    if (activoError) throw errorDeAlta(activoError);
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
    if (error) throw errorDeAlta(error);
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
  if (error) throw new FallaDeLaBase(error);
  const row = data as (OnboardingSubmissionRow & { discarded_at: string | null }) | null;
  if (!row) throw new ErrorEsperable("Ese envío ya no existe.");
  if (row.sub_client_id) throw new ErrorEsperable("Ese envío ya se asignó.");
  if (row.discarded_at) throw new ErrorEsperable("Ese envío se descartó.");
  return { admin, envio: rowToOnboardingSubmission(row) };
}

/** Saca un envío de la bandeja sin asignarlo. No se borra: queda el rastro. */
export async function discardOnboardingSubmissionAction(
  submissionId: string
): Promise<MutationResult<void>> {
  return mutacionConErroresEsperables("[discardOnboardingSubmission]", async () => {
    if (!idSchema.safeParse(submissionId).success) throw new ErrorEsperable("Envío inválido.");
    const organizationId = await requireOrganizationId();
    await exigirAddOn(organizationId, ADD_ON);
    const { admin } = await envioPendiente(organizationId, submissionId);

    const { error } = await admin
      .from("client_onboarding_submissions")
      .update({ discarded_at: new Date().toISOString() })
      .eq("id", submissionId)
      .eq("organization_id", organizationId);
    if (error) throw new FallaDeLaBase(error);
  });
}

const assignSchema = z
  .object({
    submissionId: uuidSchema,
    /** Un growth partner que ya existe… */
    clientId: uuidSchema.nullish(),
    /** …o el nombre de uno nuevo. */
    newClientName: z
      .string()
      .trim()
      .min(1, "Poné el nombre del cliente nuevo.")
      .max(200, "El nombre del cliente puede tener hasta 200 caracteres.")
      .nullish(),
    /** Un creador que ya existe de ese growth partner… */
    subClientId: uuidSchema.nullish(),
    /** …o el nombre de uno nuevo (por defecto, el que escribió en el link). */
    newSubClientName: z
      .string()
      .trim()
      .min(1, "Poné el nombre del creador.")
      .max(200, "El nombre del creador puede tener hasta 200 caracteres.")
      .nullish(),
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
 *
 * Si la ficha no se puede escribir, se deshace la asignación y el envío vuelve
 * a la bandeja. Si deshacerla también falla, queda registrado aparte (el envío
 * quedaría asignado sin sus respuestas en la ficha).
 */
export async function assignOnboardingSubmissionAction(
  input: z.input<typeof assignSchema>
): Promise<MutationResult<{ clientId: string; subClientId: string }>> {
  return mutacionConErroresEsperables("[assignOnboardingSubmission]", async () => {
    const parsed = assignSchema.safeParse(input);
    if (!parsed.success) throw new ErrorEsperable(firstZodError(parsed.error));
    const v = parsed.data;

    const organizationId = await requireOrganizationId();
    await exigirAddOn(organizationId, ADD_ON);
    const profile = await getCurrentProfile();
    const supabase = await createClient();
    const { admin, envio } = await envioPendiente(organizationId, v.submissionId);

    // El nombre del creador nuevo se valida antes de crear nada: si faltara
    // después de dar de alta el growth partner, éste quedaría huérfano.
    const nombreDelCreador = v.subClientId
      ? null
      : (v.newSubClientName ?? envio.creatorName ?? envio.respondentName);
    if (!v.subClientId && !nombreDelCreador) {
      throw new ErrorEsperable("Poné el nombre del creador.");
    }

    /*
      Lo que esta llamada da de alta. Si un paso posterior falla, se borra
      (SCRUM-516): sin esto el growth partner o el creador nuevos quedaban
      creados y un reintento con «nuevo» los duplicaba. Los ids salen de los
      inserts de esta misma llamada, no del navegador, así que se borran con
      service role (un miembro sin permiso de borrar clientes también tiene que
      poder deshacer lo que acaba de crear).
    */
    const creados: { clientId: string | null; subClientId: string | null } = {
      clientId: null,
      subClientId: null,
    };
    const deshacerAltas = async () => {
      if (creados.subClientId) {
        const { error } = await admin
          .from("client_sub_clients")
          .delete()
          .eq("id", creados.subClientId)
          .eq("organization_id", organizationId);
        if (error) {
          registrarFallaDeAccion("[assignOnboardingSubmission] deshacer creador", new FallaDeLaBase(error));
        }
      }
      if (creados.clientId) {
        const { error } = await admin
          .from("clients")
          .delete()
          .eq("id", creados.clientId)
          .eq("organization_id", organizationId);
        if (error) {
          registrarFallaDeAccion("[assignOnboardingSubmission] deshacer cliente", new FallaDeLaBase(error));
        }
      }
    };

    let clientId: string;
    let sub: { id: string; name: string; custom: CustomFieldValues };
    try {
      // 1 · El growth partner.
      let clientName = "";
      if (v.clientId) {
        const { data, error } = await supabase
          .from("clients")
          .select("id, name")
          .eq("id", v.clientId)
          .eq("organization_id", organizationId)
          .maybeSingle();
        if (error) throw new FallaDeLaBase(error);
        if (!data) throw new ErrorEsperable(CLIENTE_AJENO);
        clientId = v.clientId;
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
        if (error) throw new FallaDeLaBase(error);
        clientId = data.id as string;
        creados.clientId = clientId;
        clientName = data.name as string;
      }

      // 2 · El creador.
      if (v.subClientId) {
        const { data, error } = await supabase
          .from("client_sub_clients")
          .select("id, name, custom")
          .eq("id", v.subClientId)
          .eq("client_id", clientId)
          .eq("organization_id", organizationId)
          .maybeSingle();
        if (error) throw new FallaDeLaBase(error);
        if (!data) throw new ErrorEsperable(`Ese creador no es de ${clientName}.`);
        sub = rowToSubClient(data as SubClientRow);
      } else {
        const { data, error } = await supabase
          .from("client_sub_clients")
          .insert({
            organization_id: organizationId,
            client_id: clientId,
            name: nombreDelCreador!.slice(0, SUB_CLIENT_NAME_MAX),
            created_by: profile?.id ?? null,
          })
          .select("id, name, custom")
          .single();
        if (error) throw new FallaDeLaBase(error);
        sub = rowToSubClient(data as SubClientRow);
        creados.subClientId = sub.id;
      }

      // 3 · El envío queda asignado, con lo que se va a pisar. Primero el
      // historial: si la ficha no se puede escribir, se deshace la asignación
      // y el envío vuelve a la bandeja.
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
      if (assignError) throw new FallaDeLaBase(assignError);

      if (applied.changed.length > 0) {
        const { error } = await supabase
          .from("client_sub_clients")
          .update({ custom: applied.custom, updated_at: new Date().toISOString() })
          .eq("id", sub.id)
          .eq("organization_id", organizationId);
        if (error) {
          // Service role: filtra por id y por organización, como todo lo que
          // esta acción escribe con él.
          const { error: undoError } = await admin
            .from("client_onboarding_submissions")
            .update({
              client_id: null,
              sub_client_id: null,
              replaced: {},
              assigned_at: null,
              assigned_by: null,
            })
            .eq("id", envio.id)
            .eq("organization_id", organizationId);
          if (undoError) {
            registrarFallaDeAccion(
              "[assignOnboardingSubmission] deshacer",
              new FallaDeLaBase(undoError)
            );
          }
          throw new FallaDeLaBase(error);
        }
      }
    } catch (error) {
      await deshacerAltas();
      throw error;
    }

    const { error: timelineError } = await admin.from("client_timeline_entries").insert({
      organization_id: organizationId,
      client_id: clientId,
      entry_type: "onboarding",
      title: `Onboarding completado: ${sub.name}`,
      situation_summary: `Lo completó ${envio.respondentName ?? "alguien"} por el link general, y se asignó desde la bandeja.`,
      raw_data: { submission_id: envio.id, sub_client_id: sub.id },
    });
    // La asignación ya quedó: la línea de tiempo no la deshace, pero su falla
    // queda registrada.
    if (timelineError) {
      registrarFallaDeAccion(
        "[assignOnboardingSubmission] línea de tiempo",
        new FallaDeLaBase(timelineError)
      );
    }

    revalidatePath(paths.platform.clients.root);
    revalidatePath(paths.platform.clients.detail(clientId));
    return { clientId, subClientId: sub.id };
  });
}
