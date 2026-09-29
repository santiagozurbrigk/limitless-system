"use server";

import { revalidatePath } from "next/cache";
import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { runMutation, type MutationResult } from "@/lib/server/action-result";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { paths } from "@/routes";
import {
  getHyrosLeadJourneys,
  HyrosApiError,
  listHyrosAdAccounts,
  type HyrosAttributionModel,
} from "@/lib/hyros/client";
import {
  deleteHyrosIntegration,
  getHyrosCredentialsForOrg,
  getHyrosIntegrationForOrg,
  upsertHyrosIntegration,
} from "@/lib/hyros/integration";
import { syncHyrosAdAccountsForOrg } from "@/lib/hyros/sync-ad-accounts";
import {
  requireOrgRole,
  ROLES_CONFIG_ORG,
  SIN_PERMISO_CONFIG_ORG,
} from "@/lib/auth/require-org-role";

/**
 * Server Actions de la unidad I-8 — Hyros.
 *
 * Hyros es el dueño de la atribución según el documento fuente. Cubre M05
 * (revenue atribuido), M06 (leads atribuidos), M08 (visitantes de landing) y
 * M09 (opt-ins), y es lo que hace que el ROAS by-source sea un número distinto
 * del blended en vez de una copia con otra etiqueta.
 */

export type HyrosAdAccountView = {
  externalId: string;
  name: string | null;
  accountType: string | null;
  isActive: boolean;
};

export type HyrosStatus = {
  connected: boolean;
  attributionModel: HyrosAttributionModel | null;
  adAccountsSyncedAt: string | null;
  adAccounts: HyrosAdAccountView[];
  lastError: string | null;
};

export async function getHyrosStatusAction(): Promise<HyrosStatus> {
  const organizationId = await requireOrganizationId();
  const supabase = await createClient();

  const empty: HyrosStatus = {
    connected: false,
    attributionModel: null,
    adAccountsSyncedAt: null,
    adAccounts: [],
    lastError: null,
  };

  const row = await getHyrosIntegrationForOrg(organizationId).catch(() => null);
  if (!row) return empty;

  const { data } = await supabase
    .from("hyros_ad_accounts")
    .select("external_id, name, account_type, is_active")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });

  return {
    connected: true,
    attributionModel: row.attribution_model,
    adAccountsSyncedAt: row.ad_accounts_synced_at,
    adAccounts: (data ?? []).map((account) => ({
      externalId: account.external_id as string,
      name: (account.name as string | null) ?? null,
      accountType: (account.account_type as string | null) ?? null,
      isActive: Boolean(account.is_active),
    })),
    lastError: row.last_error,
  };
}

/**
 * Guarda la API key y trae las cuentas publicitarias.
 *
 * La key se valida contra `/ad-accounts` antes de guardarla. Es la llamada más
 * barata que prueba autenticación real, y de paso es el catálogo que el reporte
 * de atribución necesita: sin cuentas no se puede pedir ningún número.
 */
export async function connectHyrosAction(
  apiKey: string,
  options: {
    accessibleAccountId?: string;
    attributionModel?: HyrosAttributionModel;
  } = {}
): Promise<MutationResult<{ adAccounts: number }>> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();

    const trimmed = apiKey.trim();
    if (!trimmed) throw new Error("La API key no puede estar vacía");

    try {
      await listHyrosAdAccounts({
        apiKey: trimmed,
        accessibleAccountId: options.accessibleAccountId ?? null,
      });
    } catch (error) {
      if (error instanceof HyrosApiError && (error.status === 401 || error.status === 403)) {
        throw new Error("Hyros rechazó la API key. Verificá que el plan incluya el acceso a la API.");
      }
      throw error;
    }

    await upsertHyrosIntegration(organizationId, trimmed, {
      accessibleAccountId: options.accessibleAccountId ?? null,
      attributionModel: options.attributionModel,
    });

    const sync = await syncHyrosAdAccountsForOrg(organizationId);
    if (sync.error) throw new Error(sync.error);

    revalidatePath(paths.platform.integrations);
    return { adAccounts: sync.adAccounts };
  });
}

export async function syncHyrosAdAccountsAction(): Promise<
  MutationResult<{ adAccounts: number; skipped: number }>
> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const result = await syncHyrosAdAccountsForOrg(organizationId);
    if (result.error) throw new Error(result.error);
    revalidatePath(paths.platform.integrations);
    return { adAccounts: result.adAccounts, skipped: result.skipped };
  });
}

/**
 * Cambia el modelo de atribución.
 *
 * ⭐ Cambia los números, no la presentación: `last_click`, `first_click` y
 * `scientific` responden preguntas distintas sobre el mismo período. Por eso la
 * caché se invalida al cambiarlo — mostrar el número de un modelo bajo la
 * etiqueta de otro sería peor que no mostrarlo.
 */
export async function setHyrosAttributionModelAction(
  model: HyrosAttributionModel
): Promise<MutationResult> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const admin = createAdminClient();

    const { error } = await admin
      .from("hyros_integrations")
      .update({ attribution_model: model, updated_at: new Date().toISOString() })
      .eq("organization_id", organizationId);
    if (error) throw new Error(error.message);

    revalidatePath(paths.platform.integrations);
  });
}

/** Activa o desactiva una cuenta publicitaria para los totales del embudo. */
export async function setHyrosAdAccountActiveAction(
  externalId: string,
  isActive: boolean
): Promise<MutationResult> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const admin = createAdminClient();

    const { error } = await admin
      .from("hyros_ad_accounts")
      .update({ is_active: isActive })
      .eq("organization_id", organizationId)
      .eq("external_id", externalId);
    if (error) throw new Error(error.message);

    revalidatePath(paths.platform.integrations);
  });
}

/**
 * Recorrido de un lead entre touchpoints (M07).
 *
 * Se consulta en vivo y no se persiste: es información de una persona concreta
 * que se mira puntualmente, no un agregado del embudo. Máximo 50 emails por
 * llamada, que es el límite de Hyros.
 */
export async function getHyrosLeadJourneyAction(
  emails: string[]
): Promise<Record<string, unknown>[]> {
  const organizationId = await requireOrganizationId();
  const credentials = await getHyrosCredentialsForOrg(organizationId);
  if (!credentials) return [];

  try {
    return await getHyrosLeadJourneys(credentials, emails);
  } catch (error) {
    console.warn("[hyros] getHyrosLeadJourney falló:", error);
    return [];
  }
}

export async function disconnectHyrosAction(): Promise<MutationResult> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    await requireOrgRole(ROLES_CONFIG_ORG, SIN_PERMISO_CONFIG_ORG);
    await deleteHyrosIntegration(organizationId);
    revalidatePath(paths.platform.integrations);
  });
}
