/**
 * Section root → default child route (mirrors sidebar primary links).
 * String literals only — safe to import from next.config.ts (no path aliases).
 */
export const sectionRedirects: { source: string; destination: string }[] = [
  { source: "/sales/marketing-insights", destination: "/marketing" },
  {
    source: "/sales/marketing-insights/library",
    destination: "/marketing/content",
  },
  {
    source: "/sales/marketing-insights/journeys",
    destination: "/marketing/sales-connection",
  },
  {
    source: "/sales/marketing-insights/journeys/:id",
    destination: "/marketing/sales-connection",
  },
  {
    source: "/sales/marketing-insights/content/:id",
    destination: "/marketing/content/:id",
  },
  { source: "/sales", destination: "/sales/inbox" },
  { source: "/operations", destination: "/operations/overview" },
  { source: "/sops", destination: "/operations/sops" },
  { source: "/executive-reports", destination: "/executive-reports/weekly" },
  { source: "/business-context", destination: "/business-context/documents" },
  { source: "/intelligence/insights", destination: "/intelligence" },
  { source: "/intelligence/recommendations", destination: "/intelligence" },
  { source: "/intelligence/bottlenecks", destination: "/intelligence" },
  { source: "/intelligence/opportunities", destination: "/intelligence" },
  { source: "/intelligence/ai-memory", destination: "/intelligence" },
  { source: "/team/members", destination: "/team#miembros" },
  { source: "/team/roles", destination: "/team#roles" },
  { source: "/sops/create", destination: "/operations/sops#crear" },
  { source: "/super-admin", destination: "/super-admin/organizations" },
  { source: "/superadmin", destination: "/superadmin/login" },
  { source: "/super-admin/founders", destination: "/super-admin/users" },
  { source: "/super-admin/team-accounts", destination: "/super-admin/users" },
  { source: "/super-admin/ai-usage", destination: "/super-admin/costs" },
  { source: "/super-admin/cost-tracking", destination: "/super-admin/costs" },
  { source: "/super-admin/profitability", destination: "/super-admin/costs" },
];
