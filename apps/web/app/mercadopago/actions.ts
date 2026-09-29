"use server";

import { revalidatePath } from "next/cache";
import { requireOrganizationId } from "@/lib/auth/bootstrap";
import {
  deriveMercadoPagoBalance,
  getMercadoPagoPayment,
  searchMercadoPagoPayments,
  type MPBalance,
  type MPPayment,
  type MPPaymentsSearchResponse,
} from "@/lib/mercadopago/api";
import { getActiveMercadoPagoCredentials } from "@/lib/mercadopago/tokens";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  firstZodError,
  mercadoPagoPaymentIdSchema,
  mercadoPagoTransactionsQuerySchema,
} from "@/lib/validations";
import { paths } from "@/routes";
import {
  requireOrgRole,
  ROLES_CONFIG_ORG,
  SIN_PERMISO_CONFIG_ORG,
} from "@/lib/auth/require-org-role";

export type MercadoPagoIntegrationStatus = {
  connected: boolean;
  mpUserId: string | null;
  livemode: boolean | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
  status: "active" | "error" | "disconnected" | null;
};

export async function getMercadoPagoIntegrationStatusAction(): Promise<MercadoPagoIntegrationStatus> {
  const organizationId = await requireOrganizationId();
  const admin = createAdminClient();
  const { data } = await admin
    .from("mercadopago_integrations")
    .select(
      "status, mp_user_id, livemode, connected_at, last_sync_at"
    )
    .eq("organization_id", organizationId)
    .maybeSingle();

  const status =
    (data?.status as "active" | "error" | "disconnected" | undefined) ?? null;

  return {
    connected: status === "active",
    mpUserId: data?.mp_user_id ?? null,
    livemode: data?.livemode ?? null,
    connectedAt: data?.connected_at ?? null,
    lastSyncAt: data?.last_sync_at ?? null,
    status,
  };
}

export async function getMercadoPagoBalanceAction(): Promise<MPBalance | null> {
  const organizationId = await requireOrganizationId();
  const creds = await getActiveMercadoPagoCredentials(organizationId);
  if (!creds) return null;

  const search = await searchMercadoPagoPayments(creds.accessToken, {
    limit: 100,
    collectorId: creds.mpUserId,
  });

  return deriveMercadoPagoBalance(search.results);
}

export async function getMercadoPagoTransactionsAction(
  input: unknown
): Promise<MPPaymentsSearchResponse | null> {
  const parsed = mercadoPagoTransactionsQuerySchema.safeParse(input ?? {});
  if (!parsed.success) {
    throw new Error(firstZodError(parsed.error));
  }

  const { limit, offset } = parsed.data;
  const organizationId = await requireOrganizationId();
  const creds = await getActiveMercadoPagoCredentials(organizationId);
  if (!creds) return null;

  const result = await searchMercadoPagoPayments(creds.accessToken, {
    limit,
    offset,
    collectorId: creds.mpUserId,
  });

  const admin = createAdminClient();
  await admin
    .from("mercadopago_integrations")
    .update({
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("status", "active");

  return result;
}

export async function getMercadoPagoPaymentDetailAction(
  input: unknown
): Promise<MPPayment | null> {
  const parsed = mercadoPagoPaymentIdSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(firstZodError(parsed.error));
  }

  const organizationId = await requireOrganizationId();
  const creds = await getActiveMercadoPagoCredentials(organizationId);
  if (!creds) return null;

  return getMercadoPagoPayment(creds.accessToken, parsed.data);
}

export async function disconnectMercadoPagoIntegrationAction(): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    const organizationId = await requireOrganizationId();
    await requireOrgRole(ROLES_CONFIG_ORG, SIN_PERMISO_CONFIG_ORG);
    const admin = createAdminClient();
    const now = new Date().toISOString();

    const { error } = await admin
      .from("mercadopago_integrations")
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
