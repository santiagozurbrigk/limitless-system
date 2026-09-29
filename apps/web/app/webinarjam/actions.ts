"use server";

import { revalidatePath } from "next/cache";
import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { runMutation, type MutationResult } from "@/lib/server/action-result";
import { createClient } from "@/lib/supabase/server";
import { paths } from "@/routes";
import {
  listWebinarJamWebinars,
  WebinarJamApiError,
  WEBINARJAM_PRODUCTS,
} from "@/lib/webinarjam/client";
import {
  deleteWebinarJamIntegration,
  getWebinarJamIntegrationForOrg,
  setWebinarJamPitchSecond,
  upsertWebinarJamIntegration,
} from "@/lib/webinarjam/integration";
import {
  syncWebinarJamRegistrantsForOrg,
  syncWebinarJamWebinarsForOrg,
} from "@/lib/webinarjam/sync";
import {
  requireOrgRole,
  ROLES_CONFIG_ORG,
  SIN_PERMISO_CONFIG_ORG,
} from "@/lib/auth/require-org-role";

/**
 * Server Actions de la unidad I-5 — WebinarJam / EverWebinar.
 *
 * Cubren M13 (registrados), M14 (asistieron) y M15 (se quedaron hasta la oferta).
 *
 * ⭐ **M16 (clicks al CTA durante el webinar) no tiene action porque no se puede
 * medir**: la API no lo expone. Lo más cercano es `purchased_live`, que es
 * conversión y no intención. Ese paso del embudo queda sin fuente a propósito.
 */

export type WebinarJamWebinarOption = {
  product: string;
  webinarId: string;
  name: string | null;
  scheduleCount: number;
  /** `null` = falta configurarlo, y entonces M15 no se puede medir. */
  pitchSecond: number | null;
};

export type WebinarJamStatus = {
  connected: boolean;
  webinarsSyncedAt: string | null;
  registrantsSyncedAt: string | null;
  webinarCount: number;
  registrantCount: number;
  /** Webinars sin segundo de oferta configurado. */
  webinarsWithoutPitch: number;
  lastError: string | null;
};

export async function listWebinarJamWebinarOptionsAction(): Promise<
  WebinarJamWebinarOption[]
> {
  const organizationId = await requireOrganizationId();
  const supabase = await createClient();

  const { data } = await supabase
    .from("webinarjam_webinars")
    .select("product, external_id, name, title, schedules, pitch_second")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });

  return (data ?? []).map((row) => ({
    product: row.product as string,
    webinarId: row.external_id as string,
    name: (row.name as string | null) ?? (row.title as string | null) ?? null,
    scheduleCount: Array.isArray(row.schedules) ? row.schedules.length : 0,
    pitchSecond: (row.pitch_second as number | null) ?? null,
  }));
}

export async function getWebinarJamStatusAction(): Promise<WebinarJamStatus> {
  const organizationId = await requireOrganizationId();
  const supabase = await createClient();

  const empty: WebinarJamStatus = {
    connected: false,
    webinarsSyncedAt: null,
    registrantsSyncedAt: null,
    webinarCount: 0,
    registrantCount: 0,
    webinarsWithoutPitch: 0,
    lastError: null,
  };

  const row = await getWebinarJamIntegrationForOrg(organizationId).catch(() => null);
  if (!row) return empty;

  const [webinars, registrants] = await Promise.all([
    listWebinarJamWebinarOptionsAction(),
    supabase
      .from("webinarjam_registrants")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
  ]);

  return {
    connected: true,
    webinarsSyncedAt: row.webinars_synced_at,
    registrantsSyncedAt: row.registrants_synced_at,
    webinarCount: webinars.length,
    registrantCount: registrants.count ?? 0,
    webinarsWithoutPitch: webinars.filter((w) => !w.pitchSecond).length,
    lastError: row.last_error,
  };
}

/**
 * Guarda la API key y trae el catálogo.
 *
 * ⚠️ La key de WebinarJam **requiere aprobación previa** de su equipo: un 401 acá
 * puede significar que la key todavía no fue habilitada, no que esté mal escrita.
 */
export async function connectWebinarJamAction(
  apiKey: string
): Promise<MutationResult<{ webinars: number }>> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();

    const trimmed = apiKey.trim();
    if (!trimmed) throw new Error("La API key no puede estar vacía");

    // Se valida contra los dos prefijos: una cuenta puede tener sólo uno de los
    // dos productos, así que alcanza con que uno responda.
    let validated = false;
    let lastError: unknown = null;
    for (const product of WEBINARJAM_PRODUCTS) {
      try {
        await listWebinarJamWebinars(trimmed, product);
        validated = true;
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!validated) {
      const detail =
        lastError instanceof WebinarJamApiError
          ? ` (${lastError.message})`
          : "";
      throw new Error(
        `WebinarJam rechazó la API key${detail}. Recordá que la API requiere aprobación previa de su equipo.`
      );
    }

    await upsertWebinarJamIntegration(organizationId, trimmed);
    const sync = await syncWebinarJamWebinarsForOrg(organizationId);
    if (sync.error) throw new Error(sync.error);

    revalidatePath(paths.platform.integrations);
    return { webinars: sync.webinars };
  });
}

export async function syncWebinarJamWebinarsAction(): Promise<
  MutationResult<{ webinars: number; skipped: number }>
> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const result = await syncWebinarJamWebinarsForOrg(organizationId);
    if (result.error) throw new Error(result.error);
    revalidatePath(paths.platform.integrations);
    return { webinars: result.webinars, skipped: result.skipped };
  });
}

export async function syncWebinarJamRegistrantsAction(): Promise<
  MutationResult<{ registrants: number; stayedPastPitch: number; webinarsWithoutPitch: number }>
> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const result = await syncWebinarJamRegistrantsForOrg(organizationId);
    if (result.error) throw new Error(result.error);
    revalidatePath(paths.platform.integrations);
    return {
      registrants: result.registrants,
      stayedPastPitch: result.stayedPastPitch,
      webinarsWithoutPitch: result.webinarsWithoutPitch,
    };
  });
}

/**
 * Fija el segundo en el que aparece la oferta de un webinar.
 *
 * Sin este número M15 no se puede medir: la API de WebinarJam no lo expone, y el
 * filtro que devuelve "los que se quedaron pasado un segundo" necesita saber cuál.
 */
export async function setWebinarJamPitchSecondAction(
  product: string,
  webinarId: string,
  pitchSecond: number | null
): Promise<MutationResult> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();

    if (pitchSecond !== null && (!Number.isFinite(pitchSecond) || pitchSecond <= 0)) {
      throw new Error("El segundo de la oferta tiene que ser mayor a cero");
    }

    await setWebinarJamPitchSecond(organizationId, product, webinarId, pitchSecond);
    revalidatePath(paths.platform.integrations);
  });
}

export async function disconnectWebinarJamAction(): Promise<MutationResult> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    await requireOrgRole(ROLES_CONFIG_ORG, SIN_PERMISO_CONFIG_ORG);
    await deleteWebinarJamIntegration(organizationId);
    revalidatePath(paths.platform.integrations);
  });
}
