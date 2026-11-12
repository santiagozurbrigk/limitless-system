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
  { source: "/superadmin", destination: "/superadmin/login" },
  ...redireccionesDelPanelViejo(),
];

/**
 * SCRUM-553 · El panel viejo (`/super-admin`) se cerró: cada pantalla que se
 * mudó a la consola de Administración (SCRUM-551) va a la suya, y lo que no se
 * mudó (Cerebro de IA general, lista de espera, pruebas gratis, salud de
 * clientes) queda escondido sin borrar el código: lleva a Organizaciones. Las
 * más específicas primero (gana la primera que coincide). El código del panel
 * sigue en `app/(super-admin)`; para volver a abrirlo alcanza con sacar estas
 * entradas. Strings literales: lo importa `next.config.ts`.
 */
export function redireccionesDelPanelViejo(): { source: string; destination: string }[] {
  const organizaciones = "/administracion/organizaciones";
  return [
    { source: "/super-admin", destination: organizaciones },
    { source: "/super-admin/organizations", destination: organizaciones },
    { source: "/super-admin/organizations/new", destination: "/administracion/organizaciones/nueva" },
    { source: "/super-admin/organizations/:id", destination: "/administracion/organizaciones/:id" },
    { source: "/super-admin/users", destination: "/administracion/usuarios" },
    { source: "/super-admin/founders", destination: "/administracion/usuarios" },
    { source: "/super-admin/team-accounts", destination: "/administracion/usuarios" },
    { source: "/super-admin/holding", destination: "/administracion/holdings" },
    { source: "/super-admin/infrastructure", destination: "/administracion/sistema" },
    { source: "/super-admin/costs", destination: "/administracion/sistema" },
    { source: "/super-admin/ai-usage", destination: "/administracion/sistema" },
    { source: "/super-admin/cost-tracking", destination: "/administracion/sistema" },
    { source: "/super-admin/profitability", destination: "/administracion/sistema" },
    { source: "/super-admin/onboarding", destination: "/administracion/onboarding" },
    // Lo que no se mudó, y cualquier otra ruta del panel: a Organizaciones.
    { source: "/super-admin/:ruta*", destination: organizaciones },
  ];
}
