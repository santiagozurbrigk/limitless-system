import { cookies } from "next/headers";
import {
  isMissingTableError,
  loadProfileOrganizationContext,
} from "@/lib/auth/bootstrap";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { readActiveOrgCookie } from "@/lib/holding/constants";

export type HoldingBusinessRow = {
  id: string;
  business_name: string | null;
  revenue_share_pct: number | null;
  fixed_fee_amount: number | null;
  fixed_fee_currency: string | null;
  status: string;
  business_org: {
    id: string;
    name: string;
    industry: string | null;
    status: string;
  } | null;
};

export async function verifyHoldingBusinessAccess(
  holdingOrgId: string,
  businessOrgId: string
): Promise<boolean> {
  if (holdingOrgId === businessOrgId) return true;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("holding_businesses")
    .select("id")
    .eq("holding_org_id", holdingOrgId)
    .eq("business_org_id", businessOrgId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error.message)) return false;
    throw new Error(error.message);
  }

  return Boolean(data);
}

export async function getActiveOrgForHolding(
  holdingOrgId: string
): Promise<string> {
  const cookieStore = await cookies();
  const activeOrg = readActiveOrgCookie(cookieStore);

  if (activeOrg && (await verifyHoldingBusinessAccess(holdingOrgId, activeOrg))) {
    return activeOrg;
  }

  return holdingOrgId;
}

type OrgEmbed = {
  id: string;
  name: string;
  industry?: string | null;
  status?: string;
};

function normalizeOrgEmbed(
  org: OrgEmbed | OrgEmbed[] | null | undefined
): HoldingBusinessRow["business_org"] {
  if (!org) return null;
  const row = Array.isArray(org) ? org[0] : org;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    industry: row.industry ?? null,
    status: row.status ?? "active",
  };
}

export async function getHoldingBusinesses(
  holdingOrgId: string
): Promise<HoldingBusinessRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("holding_businesses")
    .select(
      `
      id,
      business_name,
      revenue_share_pct,
      fixed_fee_amount,
      fixed_fee_currency,
      status,
      business_org:organizations!holding_businesses_business_org_id_fkey(
        id, name, industry, status
      )
    `
    )
    .eq("holding_org_id", holdingOrgId)
    .eq("status", "active")
    .order("added_at", { ascending: true });

  if (error) {
    if (isMissingTableError(error.message)) return [];
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    business_name: row.business_name as string | null,
    revenue_share_pct: row.revenue_share_pct as number | null,
    fixed_fee_amount: row.fixed_fee_amount as number | null,
    fixed_fee_currency: row.fixed_fee_currency as string | null,
    status: row.status as string,
    business_org: normalizeOrgEmbed(
      row.business_org as OrgEmbed | OrgEmbed[] | null
    ),
  }));
}

export async function isHoldingUser(): Promise<{
  isHolding: boolean;
  holdingOrgId?: string;
  businesses?: HoldingBusinessRow[];
}> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { isHolding: false };

  const { organizationId, accountType, isActive } =
    await loadProfileOrganizationContext(user.id);

  if (isActive === false || !organizationId || accountType !== "holding") {
    return { isHolding: false };
  }

  const businesses = await getHoldingBusinesses(organizationId);

  return {
    isHolding: true,
    holdingOrgId: organizationId,
    businesses,
  };
}
