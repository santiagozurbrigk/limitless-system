import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import type { AdminOrgStatus } from "@/types/super-admin";
import { estadoDeOrg } from "@/lib/super-admin/estado-de-org";
import { isMissingTableError } from "@/lib/auth/bootstrap";
import { createAdminClient } from "@/lib/supabase/admin";
import { countByOrg } from "@/lib/super-admin/org-metrics";
import { brand } from "@/lib/brand";

export type HoldingHealthStatus = "healthy" | "warning" | "critical";

export type HoldingPortfolioOrg = {
  id: string;
  name: string;
  status: AdminOrgStatus;
  industry: string | null;
  createdAt: string;
  metrics: {
    mrr: number;
    clients: number;
    teamMembers: number;
    activeConversations: number;
    aiCostThisMonth: number;
    hasInstagram: boolean;
  };
  healthScore: number;
  healthStatus: HoldingHealthStatus;
};

export type HoldingKPIs = {
  totalOrgs: number;
  totalMRR: number;
  activeConversations: number;
  totalAICostThisMonth: number;
  estimatedMargin: number;
};

function thirtyDaysAgoIso(): string {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
}

function resolveHealthStatus(score: number): HoldingHealthStatus {
  if (score >= 75) return "healthy";
  if (score >= 50) return "warning";
  return "critical";
}

function computeHealthScore(input: {
  conversations: number;
  clients: number;
  teamMembers: number;
  hasIntegration: boolean;
}): number {
  let score = 0;
  if (input.conversations > 0) score += 25;
  if (input.clients > 0) score += 25;
  if (input.teamMembers > 1) score += 25;
  if (input.hasIntegration) score += 25;
  return score;
}

async function loadDefaultHoldingName(
  admin: ReturnType<typeof createAdminClient>
): Promise<string> {
  const { data, error } = await admin
    .from("holdings")
    .select("name")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error.message)) return `${brand.name} Portfolio`;
    throw new Error(error.message);
  }

  return data?.name ?? `${brand.name} Portfolio`;
}

export async function getHoldingPortfolio(): Promise<{
  holdingName: string;
  organizations: HoldingPortfolioOrg[];
}> {
  await requireSuperAdmin();

  const admin = createAdminClient();
  const since = thirtyDaysAgoIso();

  const [holdingName, orgsRes] = await Promise.all([
    loadDefaultHoldingName(admin),
    admin
      .from("organizations")
      .select("id, name, status, industry, created_at")
      .order("created_at", { ascending: false }),
  ]);

  const orgs = orgsRes.data ?? [];
  if (!orgs.length) {
    return { holdingName, organizations: [] };
  }

  const orgIds = orgs.map((o) => o.id as string);

  const [
    profilesRes,
    clientsRes,
    conversationsRes,
    tokenUsageRes,
    instagramRes,
  ] = await Promise.all([
    admin
      .from("profiles")
      .select("organization_id")
      .in("organization_id", orgIds),
    admin
      .from("clients")
      .select("organization_id, total_amount")
      .in("organization_id", orgIds),
    admin
      .from("conversations")
      .select("organization_id")
      .in("organization_id", orgIds)
      .gte("created_at", since),
    admin
      .from("token_usage")
      .select("organization_id, total_cost_usd")
      .in("organization_id", orgIds)
      .gte("created_at", since),
    admin
      .from("instagram_integrations")
      .select("organization_id")
      .in("organization_id", orgIds),
  ]);

  const teamByOrg = countByOrg(
    (profilesRes.data ?? []) as { organization_id: string }[]
  );
  const conversationsByOrg = countByOrg(
    (conversationsRes.data ?? []) as { organization_id: string }[]
  );

  const clientsByOrg = new Map<string, { count: number; mrr: number }>();
  for (const row of clientsRes.data ?? []) {
    const orgId = row.organization_id as string;
    const current = clientsByOrg.get(orgId) ?? { count: 0, mrr: 0 };
    current.count += 1;
    current.mrr += Number(row.total_amount ?? 0);
    clientsByOrg.set(orgId, current);
  }

  const aiCostByOrg = new Map<string, number>();
  for (const row of tokenUsageRes.data ?? []) {
    const orgId = row.organization_id as string;
    aiCostByOrg.set(
      orgId,
      (aiCostByOrg.get(orgId) ?? 0) + Number(row.total_cost_usd ?? 0)
    );
  }

  const instagramOrgIds = new Set(
    (instagramRes.data ?? []).map((r) => r.organization_id as string)
  );

  const organizations: HoldingPortfolioOrg[] = orgs.map((org) => {
    const clientStats = clientsByOrg.get(org.id) ?? { count: 0, mrr: 0 };
    const teamMembers = teamByOrg.get(org.id) ?? 0;
    const activeConversations = conversationsByOrg.get(org.id) ?? 0;
    const hasInstagram = instagramOrgIds.has(org.id);
    const aiCostThisMonth =
      Math.round((aiCostByOrg.get(org.id) ?? 0) * 100) / 100;

    const healthScore = computeHealthScore({
      conversations: activeConversations,
      clients: clientStats.count,
      teamMembers,
      hasIntegration: hasInstagram,
    });

    return {
      id: org.id,
      name: org.name,
      status: estadoDeOrg(org.status),
      industry: (org.industry as string | null) ?? null,
      createdAt: org.created_at,
      metrics: {
        mrr: clientStats.mrr,
        clients: clientStats.count,
        teamMembers,
        activeConversations,
        aiCostThisMonth,
        hasInstagram,
      },
      healthScore,
      healthStatus: resolveHealthStatus(healthScore),
    };
  });

  organizations.sort((a, b) => a.healthScore - b.healthScore);

  return { holdingName, organizations };
}

export async function getHoldingKPIs(): Promise<HoldingKPIs> {
  await requireSuperAdmin();

  const admin = createAdminClient();
  const since = thirtyDaysAgoIso();

  const [orgsRes, clientsRes, conversationsRes, tokenUsageRes] =
    await Promise.all([
      admin
        .from("organizations")
        .select("id", { count: "exact", head: true }),
      admin.from("clients").select("total_amount"),
      admin
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since),
      admin
        .from("token_usage")
        .select("total_cost_usd")
        .gte("created_at", since),
    ]);

  const totalMRR =
    (clientsRes.data ?? []).reduce(
      (sum, row) => sum + Number(row.total_amount ?? 0),
      0
    ) ?? 0;

  const totalAICostThisMonth =
    Math.round(
      (tokenUsageRes.data ?? []).reduce(
        (sum, row) => sum + Number(row.total_cost_usd ?? 0),
        0
      ) * 100
    ) / 100;

  const totalOrgs = orgsRes.count ?? 0;

  return {
    totalOrgs,
    totalMRR,
    activeConversations: conversationsRes.count ?? 0,
    totalAICostThisMonth: totalAICostThisMonth,
    estimatedMargin:
      totalMRR > 0
        ? Math.round(((totalMRR - totalAICostThisMonth) / totalMRR) * 100)
        : 0,
  };
}
