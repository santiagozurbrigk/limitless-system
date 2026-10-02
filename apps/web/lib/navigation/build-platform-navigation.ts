import {
  platformSidebarNav,
  type SidebarParentKey,
} from "@/lib/navigation/sidebar-modules";
import type { NavItem } from "@/lib/navigation/nav-types";

/** Deriva la navegación de command palette / breadcrumbs desde el sidebar real. */
export function buildPlatformNavigation(): NavItem[] {
  const { rootItems, modulesWithChildren } = platformSidebarNav;
  const items: NavItem[] = [];

  for (const entry of rootItems) {
    if (entry.type === "divider") continue;

    if (entry.type === "link") {
      items.push({
        label: entry.module.label,
        href: entry.module.href,
        icon: entry.module.icon,
      });
      continue;
    }

    const parent = modulesWithChildren[entry.key as SidebarParentKey];
    // ⭐ Lo escondido del menú tampoco aparece en el buscador ⌘K (SCRUM-490).
    // Antes el ⌘K listaba pantallas que el menú ya no mostraba.
    const visibles = parent.children.filter((child) => !child.hidden);
    const firstChild = visibles[0];
    items.push({
      label: parent.label,
      href: firstChild?.href ?? "/",
      icon: parent.icon,
      children: visibles.map((child) => ({
        label: child.label,
        href: child.href,
      })),
    });
  }

  return items;
}
