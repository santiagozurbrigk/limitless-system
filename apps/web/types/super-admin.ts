import type { OrganizationStatus } from "@ai-coo/types";

/**
 * El estado de la org que muestra el panel: el de la base (`active`, `paused`,
 * `churned`) o `unknown` si llegara un valor que el check de la base no admite.
 * `unknown` es sólo del panel: nunca se escribe en la base.
 */
export type AdminOrgStatus = OrganizationStatus | "unknown";

/** Plan estimado por MRR (no hay columna de plan en la base). */
export type AdminOrgPlan = "starter" | "growth" | "enterprise";

/**
 * Si una persona puede entrar o no (usuario baneado en Auth o perfil
 * inactivo). Es de la persona, no de su organización.
 */
export type AdminUserStatus = "active" | "inactive";

export type AdminOrganizationListRow = {
  id: string;
  name: string;
  industry: string | null;
  founderName: string;
  founderEmail: string;
  founderId: string | null;
  status: AdminOrgStatus;
  plan: AdminOrgPlan;
  usersCount: number;
  byokEnabled: boolean;
  timezone: string | null;
  createdAt: string;
  lastActivityAt: string | null;
  founderLastLogin: string | null;
  conversationsThisMonth: number;
  dealsClosedThisMonth: number;
  billingThisMonth: number;
  billingThisMonthLabel: string;
  mrrUsd: number;
};

/** @deprecated Usar AdminOrganizationListRow */
export type AdminOrganization = {
  id: string;
  name: string;
  founder: string;
  mrr: string;
  status: OrganizationStatus;
  aiCostMonth: string;
};

export type OrganizationNote = {
  id: string;
  note: string;
  created_by: string | null;
  created_at: string;
};

export type OrganizationIntegration = {
  id: string;
  name: string;
  connected: boolean;
  detail?: string;
};

export type OrganizationUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  lastLogin: string | null;
};

export type OrganizationAiCostBreakdown = {
  haikuUsd: number;
  sonnetUsd: number;
  opusUsd: number;
  embeddingsUsd: number;
  storageUsd: number;
  infrastructureUsd: number;
  totalUsd: number;
};

export type TokenUsageDailyPoint = {
  date: string;
  costUsd: number;
};

export type AdminOrganizationDetail = {
  id: string;
  name: string;
  status: AdminOrgStatus;
  plan: AdminOrgPlan;
  timezone: string | null;
  createdAt: string;
  mrrUsd: number;
  enabledAddOns: string[];
  founder: {
    id: string | null;
    name: string;
    email: string;
    lastLogin: string | null;
  };
  users: OrganizationUser[];
  onboarding: Record<string, unknown> | null;
  metrics: {
    conversationsThisMonth: number;
    dealsClosedThisMonth: number;
    billingThisMonth: number;
    cashCollectedThisMonth: number;
  };
  integrations: OrganizationIntegration[];
  notes: OrganizationNote[];
  aiCost: OrganizationAiCostBreakdown;
  tokenUsage: {
    costMonthUsd: number;
    daily: TokenUsageDailyPoint[];
  };
};

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  organizationId: string;
  organizationName: string;
  organizationTimezone: string | null;
  role: string;
  status: AdminUserStatus;
  lastLogin: string | null;
};

export type AdminProfitabilitySummary = {
  totalMrrUsd: number;
  totalTokenCostMonthUsd: number;
  totalInfraCostUsd: number;
  estimatedGrossMarginUsd: number;
  globalMarginPercent: number;
  activeOrganizations: number;
};

export type AdminProfitabilityOrgRow = {
  orgId: string;
  orgName: string;
  mrrUsd: number;
  tokenCostMonthUsd: number;
  tokenCostPrevMonthUsd: number;
  estimatedMarginUsd: number;
  marginPercent: number;
  trend: "up" | "down" | "flat";
};

export type OrgAiCostRow = {
  orgId: string;
  orgName: string;
  plan: AdminOrgPlan;
  mrrUsd: number;
  claudeHaikuUsd: number;
  claudeSonnetUsd: number;
  claudeOpusUsd: number;
  embeddingsUsd: number;
  storageUsd: number;
  infrastructureUsd: number;
  totalMonthUsd: number;
  marginUsd: number;
  marginPercent: number;
  aiKeySource: "byok" | "platform";
};

export type ModelUsageRow = {
  model: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
};

export type AdminAiCostDashboard = {
  summary: AdminProfitabilitySummary;
  organizations: OrgAiCostRow[];
  profitabilityChart: {
    orgName: string;
    mrrUsd: number;
    costUsd: number;
    marginUsd: number;
  }[];
  modelUsage: ModelUsageRow[];
};

export type TokenUsageBreakdown = {
  period: "day" | "week" | "month" | "year";
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
  byModel: { model: string; tokens: number; costUsd: number }[];
  byFeature: { feature: string; tokens: number; costUsd: number }[];
};

export type InfrastructureStats = {
  organizations: number;
  users: number;
  conversations: number;
  closingCalls: number;
  clients: number;
  aiBrainDocuments: number;
};

export type OrgHealthStatus = "healthy" | "warning" | "critical";

export type OrgHealthRow = {
  orgId: string;
  orgName: string;
  healthScore: number;
  conversations: number;
  fathomCalls: number;
  sops: number;
  weeklyInputs: number;
  status: OrgHealthStatus;
};

export type AICostsSummary = {
  byOrg: {
    organizationId: string;
    orgName: string;
    totalCost: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    requests: number;
    aiKeySource: "byok" | "platform";
  }[];
  byModel: {
    model: string;
    totalCost: number;
    requests: number;
    inputTokens: number;
    outputTokens: number;
  }[];
  total: number;
};

export type CreateFounderResult = {
  organizationId: string;
  organizationName: string;
  email: string;
  password: string;
  emailSent: boolean;
  emailError?: string;
  tempCredentials: {
    email: string;
    tempPassword: string;
  };
};

/** @deprecated */
export type AdminTeamAccount = {
  id: string;
  name: string;
  email: string;
  organization: string;
  role: string;
  lastLogin: string;
};
