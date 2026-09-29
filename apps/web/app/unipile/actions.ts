"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOrganizationId } from "@/lib/auth/bootstrap";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { runMutation, type MutationResult } from "@/lib/server/action-result";
import { paths } from "@/routes";
import type { UnipileProvider } from "@/lib/unipile/config";
import { disconnectUnipileAccount } from "@/lib/unipile/hosted-auth";
import { getUnipileIntegrationForOrg } from "@/lib/unipile/integration";
import {
  requireOrgRole,
  ROLES_CONFIG_ORG,
  SIN_PERMISO_CONFIG_ORG,
} from "@/lib/auth/require-org-role";

export type UnipileIntegrationStatus = {
  connected: boolean;
  displayName: string | null;
  connectedAt: string | null;
};

const EMPTY_STATUS: UnipileIntegrationStatus = {
  connected: false,
  displayName: null,
  connectedAt: null,
};

export async function getUnipileIntegrationStatusAction(
  provider: UnipileProvider
): Promise<UnipileIntegrationStatus> {
  if (!isSupabaseConfigured()) return EMPTY_STATUS;

  try {
    const organizationId = await requireOrganizationId();
    const row = await getUnipileIntegrationForOrg(organizationId, provider);
    if (!row) return EMPTY_STATUS;

    return {
      connected: true,
      displayName: row.display_name,
      connectedAt: row.connected_at,
    };
  } catch {
    return EMPTY_STATUS;
  }
}

export async function countUnipileConversationsAction(
  provider: UnipileProvider
): Promise<number> {
  if (!isSupabaseConfigured()) return 0;

  const organizationId = await requireOrganizationId();
  const admin = createAdminClient();
  const { count } = await admin
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .like("external_ref", `unipile:${provider}:%`);

  return count ?? 0;
}

export async function disconnectUnipileIntegrationAction(
  provider: UnipileProvider
): Promise<MutationResult> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    await requireOrgRole(ROLES_CONFIG_ORG, SIN_PERMISO_CONFIG_ORG);
    const integration = await getUnipileIntegrationForOrg(organizationId, provider);
    if (!integration) {
      throw new Error("No hay cuenta Unipile conectada");
    }

    try {
      await disconnectUnipileAccount(integration.unipile_account_id);
    } catch (err) {
      console.warn("[Unipile] Error al desconectar en API:", err);
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from("unipile_integrations")
      .update({
        status: "disconnected",
        updated_at: new Date().toISOString(),
      })
      .eq("id", integration.id);

    if (error) throw new Error(error.message);
    revalidatePath(paths.platform.integrations);
  });
}
