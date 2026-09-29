"use server";

import { revalidatePath } from "next/cache";
import { requireOrganizationId } from "@/lib/auth/bootstrap";
import {
  getStripeBalance,
  getStripeTransactionDetail,
  getStripeTransactions,
  type StripeBalance,
  type StripeBalanceTransaction,
  type StripeListResponse,
} from "@/lib/stripe/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { paths } from "@/routes";
import {
  requireOrgRole,
  ROLES_CONFIG_ORG,
  SIN_PERMISO_CONFIG_ORG,
} from "@/lib/auth/require-org-role";

export type StripeIntegrationStatus = {
  connected: boolean;
  stripeAccountId: string | null;
  livemode: boolean | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
  status: "active" | "error" | "disconnected" | null;
};

async function getActiveStripeToken(organizationId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("stripe_integrations")
    .select("access_token, status")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .maybeSingle();

  if (!data?.access_token) return null;
  return data.access_token;
}

export async function getStripeIntegrationStatusAction(): Promise<StripeIntegrationStatus> {
  const organizationId = await requireOrganizationId();
  const admin = createAdminClient();
  const { data } = await admin
    .from("stripe_integrations")
    .select(
      "status, stripe_account_id, livemode, connected_at, last_sync_at"
    )
    .eq("organization_id", organizationId)
    .maybeSingle();

  const status =
    (data?.status as "active" | "error" | "disconnected" | undefined) ?? null;

  return {
    connected: status === "active",
    stripeAccountId: data?.stripe_account_id ?? null,
    livemode: data?.livemode ?? null,
    connectedAt: data?.connected_at ?? null,
    lastSyncAt: data?.last_sync_at ?? null,
    status,
  };
}

export async function getStripeBalanceAction(): Promise<StripeBalance | null> {
  const organizationId = await requireOrganizationId();
  const token = await getActiveStripeToken(organizationId);
  if (!token) return null;

  return getStripeBalance(token);
}

export async function getStripeTransactionsAction(
  limit = 50,
  startingAfter?: string
): Promise<StripeListResponse<StripeBalanceTransaction> | null> {
  const organizationId = await requireOrganizationId();
  const token = await getActiveStripeToken(organizationId);
  if (!token) return null;

  const result = await getStripeTransactions(token, limit, startingAfter);

  const admin = createAdminClient();
  await admin
    .from("stripe_integrations")
    .update({
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("status", "active");

  return result;
}

export async function getStripeTransactionDetailAction(
  transactionId: string
): Promise<StripeBalanceTransaction | null> {
  const organizationId = await requireOrganizationId();
  // El id viaja en el path de la API de Stripe con el token de la org: sin esto,
  // `../customers?` leía otros endpoints GET de la cuenta.
  if (!/^txn_[A-Za-z0-9]+$/.test(transactionId)) return null;
  const token = await getActiveStripeToken(organizationId);
  if (!token) return null;

  return getStripeTransactionDetail(token, transactionId);
}

export async function disconnectStripeIntegrationAction(): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    const organizationId = await requireOrganizationId();
    await requireOrgRole(ROLES_CONFIG_ORG, SIN_PERMISO_CONFIG_ORG);
    const admin = createAdminClient();
    const now = new Date().toISOString();

    const { error } = await admin
      .from("stripe_integrations")
      .update({
        status: "disconnected",
        updated_at: now,
      })
      .eq("organization_id", organizationId);

    if (error) return { ok: false, error: error.message };

    revalidatePath(paths.platform.integrations);
    revalidatePath(paths.platform.finance.root);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error al desconectar",
    };
  }
}
