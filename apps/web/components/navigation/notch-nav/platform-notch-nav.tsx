"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { Plug } from "lucide-react";
import { Button } from "@ai-coo/ui";
import Link from "next/link";
import { paths } from "@/routes";
import { AppLogo } from "@/components/brand";
import { NavIcon } from "@/components/navigation/nav-icons";
import { ThemeToggle } from "@/components/navigation/theme-toggle";
import { ReportsPanel } from "@/components/executive-reports/reports-panel";
import { MobileNav } from "@/components/layout/mobile-nav";
import { HoldingBusinessSwitcher } from "@/components/holding/holding-business-switcher";
import { useHoldingSession } from "@/components/holding/holding-platform-provider";
import { usePlatformData } from "@/providers";
import { NotchSetupIndicator } from "@/components/onboarding/notch-setup-indicator";
import { NotchProfileMenu } from "./notch-profile-menu";
import {
  buildPlatformSidebarNav,
  isSidebarDirectActive,
  isSidebarChildActive,
} from "@/lib/navigation/sidebar-modules";
import type { PermissionModuleId } from "@/constants/permission-modules";
import {
  canSeeNavItem,
  useEnabledAddOns,
  usePermissions,
} from "@/providers/permissions-provider";
import { useExperiencia, usePantallaDeInicio } from "@/providers/experiencia-provider";
import { ACCESOS_DE_LA_ISLA } from "@/lib/navigation/menu-por-experiencia";
import { NotchNav, type NotchNavItem } from "./notch-nav";

/**
 * Adaptador de la NotchNav a la plataforma.
 *
 * La única fuente de verdad de navegación sigue siendo
 * `lib/navigation/sidebar-modules.ts`: de ahí salen los items, los permisos,
 * los add-ons y el estado activo. Para agregar o sacar un módulo se toca ese
 * config, nunca este archivo.
 *
 * Reparto de la barra:
 * - Isla central: los módulos. Los que tienen hijos abren un dropdown.
 * - Isla derecha: configuración pendiente, switcher de holding, Integraciones,
 *   tema y perfil.
 * - Ajustes NO está en la barra: se llega desde el menú de perfil.
 * - La paleta de comandos no tiene botón propio; se abre con ⌘K / Ctrl+K.
 */
export function PlatformNotchNav({ showItems = true }: { showItems?: boolean }) {
  const pathname = usePathname();
  const enabledAddOns = useEnabledAddOns();
  const experiencia = useExperiencia();
  const inicio = usePantallaDeInicio();
  const accesos = ACCESOS_DE_LA_ISLA[experiencia];
  const { isFounder, modules } = usePermissions();
  const { isHolding } = useHoldingSession();
  const { clients } = usePlatformData();

  const checkAccess = (moduleId: PermissionModuleId) =>
    isFounder || (modules[moduleId] ?? "none") !== "none";

  const config = useMemo(
    () => buildPlatformSidebarNav(enabledAddOns, experiencia),
    [enabledAddOns, experiencia]
  );
  const activeParent = config.getParentFromPath(pathname);

  const items: NotchNavItem[] = useMemo(() => {
    if (!showItems) return [];
    const result: NotchNavItem[] = [];

    // Cuenta holding: acceso al portfolio, como en el sidebar
    if (isHolding) {
      result.push({
        type: "link",
        id: paths.platform.holding,
        label: "Mi Holding",
        icon: <NavIcon name="layers" className="h-4 w-4" />,
        href: paths.platform.holding,
        active: isSidebarDirectActive(paths.platform.holding, pathname),
      });
    }

    for (const item of config.rootItems) {
      if (item.type === "divider") continue;

      if (item.type === "link") {
        const m = item.module;
        if (!canSeeNavItem(m.permissionId, checkAccess, isFounder)) continue;
        if (m.disabled) continue;
        result.push({
          type: "link",
          id: m.href,
          label: m.label,
          icon: <NavIcon name={m.icon} className="h-4 w-4" />,
          href: m.href,
          active: isSidebarDirectActive(m.href, pathname),
          badge:
            m.href === paths.platform.clients.root ? clients.length : undefined,
        });
        continue;
      }

      // Configuración vive en la isla derecha
      if (item.key === "configuracion") continue;

      const parent = config.modulesWithChildren[item.key];
      if (!parent) continue;
      const children = parent.children.filter(
        (c) => !c.hidden && canSeeNavItem(c.permissionId, checkAccess, isFounder)
      );
      if (children.length === 0) continue;

      result.push({
        type: "menu",
        id: item.key,
        label: parent.label,
        icon: <NavIcon name={parent.icon} className="h-4 w-4" />,
        active: activeParent === item.key,
        children: children.map((c) => ({
          label: c.label,
          href: c.href,
          active: isSidebarChildActive(c.href, pathname),
        })),
      });
    }

    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, pathname, activeParent, isFounder, modules, showItems, isHolding, clients.length]);

  /**
   * Isla derecha. Ajustes no va acá: se llega desde el menú de perfil.
   * Sólo queda Integraciones, como acceso directo, derivado del mismo config
   * para que respete permisos.
   */
  const integrationsItem = (
    config.modulesWithChildren.configuracion?.children ?? []
  ).find((c) => c.href === paths.platform.integrations);

  const showIntegrations =
    integrationsItem !== undefined &&
    !integrationsItem.hidden &&
    canSeeNavItem(integrationsItem.permissionId, checkAccess, isFounder);

  const rightContent = (
    <>
      {accesos.configuracionPendiente && <NotchSetupIndicator />}
      <HoldingBusinessSwitcher />
      {showIntegrations && (
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
        >
          <Link
            href={paths.platform.integrations}
            aria-label={integrationsItem.label}
            title={integrationsItem.label}
            aria-current={
              isSidebarChildActive(paths.platform.integrations, pathname)
                ? "page"
                : undefined
            }
          >
            <Plug className="h-4 w-4" />
          </Link>
        </Button>
      )}
      {/* Los reportes se leen y se cierran: panel, no una entrada del navbar. */}
      {accesos.reportes && <ReportsPanel />}
      <ThemeToggle />
      <NotchProfileMenu />
    </>
  );

  return (
    <NotchNav
      items={items}
      logo={<AppLogo href={inicio} display="compact" height={16} />}
      rightContent={rightContent}
      mobileContent={
        <>
          <MobileNav />
          <AppLogo href={inicio} display="compact" height={14} />
          <ThemeToggle />
        </>
      }
    />
  );
}
