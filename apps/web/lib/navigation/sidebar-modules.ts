import { paths } from "@/routes/paths";
import { ESCONDIDO } from "@/lib/release/escondido";
import type { AddOnId } from "@/lib/auth/get-current-permissions";
import type {
  SidebarDirectModule,
  SidebarNavConfig,
  SidebarNavRootItem,
  SidebarParentModule,
} from "./sidebar-nav-config";

export const SIDEBAR_PARENT_KEYS = [
  "finanzas",
  "marketing",
  "ventas",
  "operaciones",
  "agente",
  "configuracion",
] as const;

export type SidebarParentKey = (typeof SIDEBAR_PARENT_KEYS)[number];

export const modulesWithChildren: Record<SidebarParentKey, SidebarParentModule> =
  {
    configuracion: {
      label: "Configuración",
      icon: "settings",
      children: [
        {
          label: "Ajustes",
          href: paths.platform.settings,
          permissionId: "settings",
        },
        {
          label: "Integraciones",
          href: paths.platform.integrations,
          permissionId: "integrations",
        },
      ],
    },
    agente: {
      label: "Agente de negocio",
      icon: "sparkles",
      permissionId: "agent",
      children: [
        {
          label: "Chat",
          href: paths.platform.agent.root,
          permissionId: "agent",
        },
        {
          label: "Base de conocimiento",
          href: paths.platform.businessContext.documents,
          permissionId: "knowledge_base",
        },
      ],
    },
    finanzas: {
      label: "Finanzas",
      icon: "wallet",
      children: [
        {
          label: "Overview",
          href: paths.platform.finance.root,
          permissionId: "finance",
        },
        {
          label: "Gastos",
          href: paths.platform.finance.expenses,
          permissionId: "finance",
        },
      ],
    },
    marketing: {
      label: "Marketing",
      icon: "megaphone",
      permissionId: "marketing",
      children: [
        {
          label: "Overview",
          href: paths.platform.marketing.overview,
          permissionId: "marketing",
          // Escondido para el release (SCRUM-490): lee la integración vieja de
          // Instagram y casi siempre sale vacío. `/marketing` lleva a Contenido.
          hidden: ESCONDIDO.marketingOverview,
        },
        {
          label: "Contenido",
          href: paths.platform.marketing.content,
          permissionId: "marketing",
        },
        {
          label: "Anuncios",
          href: paths.platform.marketing.anuncios,
          permissionId: "marketing",
        },
        {
          label: "Administrar",
          href: paths.platform.marketing.administrar,
          permissionId: "marketing",
          hidden: true,
        },
        {
          label: "Conexión con Ventas",
          href: paths.platform.marketing.salesConnection,
          permissionId: "marketing",
          hidden: true,
        },
        {
          label: "Formularios",
          href: paths.platform.marketing.forms,
          permissionId: "marketing",
        },
        {
          label: "UTMs",
          href: paths.platform.marketing.utms,
          permissionId: "marketing",
          hidden: true,
        },
        {
          label: "Automatizaciones",
          href: paths.platform.marketing.automatizaciones,
          permissionId: "marketing",
        },
        {
          label: "Lead Magnets",
          href: paths.platform.marketing.leadMagnets,
          permissionId: "marketing",
        },
      ],
    },
    ventas: {
      label: "Ventas",
      icon: "message-square",
      children: [
        {
          label: "Bandeja",
          href: paths.platform.sales.inbox,
          permissionId: "sales",
        },
        {
          label: "Métricas",
          href: paths.platform.sales.metrics,
          permissionId: "sales",
        },
        {
          label: "Closing",
          href: paths.platform.sales.closing,
          permissionId: "sales",
        },
        {
          label: "Cobros",
          href: paths.platform.sales.cobros,
          permissionId: "sales",
        },
        {
          label: "Llamadas",
          href: paths.platform.sales.llamadas,
          permissionId: "sales",
        },
      ],
    },
    operaciones: {
      label: "Operaciones",
      icon: "activity",
      children: [
        {
          label: "Overview",
          href: paths.platform.operations.overview,
          permissionId: "operations",
        },
        {
          label: "Inputs",
          href: paths.platform.operations.inputs,
          permissionId: "operations",
        },
        { label: "Inteligencia", href: paths.platform.intelligence.root },
        // "Reportes" salió del sidebar el 2026-08-30: los reportes ejecutivos
        // se leen desde el panel de la barra superior, disponible en cualquier
        // pantalla. Un reporte automático se lee y se cierra; no es un lugar
        // donde se trabaja, y ocupaba un renglón al mismo nivel que SOPs.
        { label: "Área del fundador", href: paths.founder.root },
      ],
    },
  };

export const productDirectModule: SidebarDirectModule = {
  label: "Producto",
  href: paths.platform.product.root,
  icon: "layers",
};

export const embudosDirectModule: SidebarDirectModule = {
  label: "Embudos",
  href: paths.platform.funnels.root,
  icon: "filter",
  permissionId: "funnels",
};

export const lanzamientosDirectModule: SidebarDirectModule = {
  label: "Lanzamientos",
  href: paths.platform.lanzamientos,
  icon: "rocket",
  disabled: true,
  comingSoonLabel: "Próximamente",
};

export const directModules: SidebarDirectModule[] = [
  {
    label: "Panel General",
    href: paths.platform.dashboard,
    icon: "layout-dashboard",
    permissionId: "dashboard",
  },
  {
    label: "Tablero de trabajo",
    href: paths.platform.workboard.root,
    icon: "kanban",
    permissionId: "workboard",
  },
  {
    label: "Agente de negocio",
    href: paths.platform.agent.root,
    icon: "sparkles",
    permissionId: "agent",
  },
  {
    label: "Clientes",
    href: paths.platform.clients.root,
    icon: "briefcase",
    permissionId: "clients",
  },
  {
    label: "Base de conocimiento",
    href: paths.platform.businessContext.documents,
    icon: "brain",
    permissionId: "knowledge_base",
  },
  /**
   * SOPs es un módulo propio y **no depende del add-on `operaciones`**.
   *
   * Estaba adentro de ese grupo, así que en una organización sin el add-on
   * —hoy, todas— el creador de SOPs no se veía desde el menú: existía y no
   * había cómo llegar. Se sacó afuera; el resto de Operaciones (Overview,
   * Inputs, Inteligencia, Área del fundador) sigue detrás del add-on.
   */
  {
    label: "SOPs",
    href: paths.platform.operations.sops,
    icon: "book-open",
    permissionId: "operations",
  },
  {
    label: "Equipo",
    href: paths.platform.team.root,
    icon: "users",
    permissionId: "team",
  },
];

const byHref = (href: string) =>
  directModules.find((m) => m.href === href) as SidebarDirectModule;

/** Items base del sidebar (siempre visibles) */
const coreRootItems: SidebarNavRootItem[] = [
  { type: "link", module: byHref(paths.platform.dashboard) },
  { type: "link", module: byHref(paths.platform.clients.root) },
  { type: "link", module: byHref(paths.platform.team.root) },
  { type: "divider" },
  { type: "parent", key: "marketing" },
  { type: "parent", key: "ventas" },
  { type: "parent", key: "finanzas" },
  { type: "divider" },
  { type: "link", module: byHref(paths.platform.workboard.root) },
  { type: "link", module: byHref(paths.platform.operations.sops) },
  { type: "parent", key: "configuracion" },
];

/**
 * Construye los items del sidebar incluyendo los módulos add-on activos.
 * Se llama desde los componentes de navegación con los add-ons de la org.
 */
export function buildPlatformRootItems(enabledAddOns: AddOnId[]): SidebarNavRootItem[] {
  const items: SidebarNavRootItem[] = [];

  for (const item of coreRootItems) {
    items.push(item);
    // Se insertan después de Finanzas (antes del divider)
    if (
      item.type === "parent" &&
      item.key === "finanzas"
    ) {
      if (enabledAddOns.includes("operaciones")) {
        items.push({ type: "parent", key: "operaciones" });
      }
      if (enabledAddOns.includes("producto")) {
        items.push({ type: "link", module: productDirectModule });
      }
      // Embudos NO es add-on: va siempre en la navegación. Quién lo ve lo
      // decide el permiso `funnels`, que filtran los componentes de nav.
      // El AddOnId "embudos" se deja declarado en lib/auth/add-on-ids.ts
      // porque puede haber organizaciones que ya lo tengan guardado.
      items.push({ type: "link", module: embudosDirectModule });
    }
  }

  return items;
}

/** Fallback estático para cuando no se conocen los add-ons (compat.) */
const platformRootItems: SidebarNavRootItem[] = coreRootItems;

export function getParentFromPath(pathname: string): SidebarParentKey | null {
  if (pathname.startsWith(paths.platform.agent.root)) return "agente";
  if (pathname.startsWith(paths.platform.businessContext.documents)) return "agente";
  if (pathname.startsWith("/platform/business-context")) return "agente";
  if (pathname.startsWith(paths.platform.finance.root)) return "finanzas";
  if (pathname.startsWith("/marketing")) return "marketing";
  if (pathname.startsWith(paths.platform.comentarios)) return "marketing";
  if (pathname.startsWith("/sales")) return "ventas";
  // SOPs es un módulo propio: no marca activo al grupo Operaciones.
  if (pathname.startsWith(paths.platform.operations.sops)) return null;
  if (pathname.startsWith("/operations")) return "operaciones";
  if (pathname.startsWith("/intelligence")) return "operaciones";
  if (pathname.startsWith("/executive-reports")) return "operaciones";
  if (pathname.startsWith("/founder")) return "operaciones";
  if (pathname.startsWith(paths.platform.settings)) return "configuracion";
  if (pathname.startsWith(paths.platform.integrations)) return "configuracion";
  if (pathname.startsWith(paths.platform.integrationsDiscord)) return "configuracion";
  return null;
}

export const platformSidebarNav: SidebarNavConfig = {
  modulesWithChildren,
  getParentFromPath,
  rootItems: platformRootItems,
};

/** Versión con add-ons inyectados — usar en componentes que tienen acceso a enabledAddOns */
export function buildPlatformSidebarNav(enabledAddOns: AddOnId[]): SidebarNavConfig {
  return {
    modulesWithChildren,
    getParentFromPath,
    rootItems: buildPlatformRootItems(enabledAddOns),
  };
}

export {
  isSidebarChildActive,
  isSidebarDirectActive,
} from "./sidebar-nav-config";
