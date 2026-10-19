import { describe, expect, it } from "vitest";
import { buildPlatformSidebarNav } from "@/lib/navigation/sidebar-modules";
import type { SidebarNavConfig, SidebarNavRootItem } from "@/lib/navigation/sidebar-nav-config";
import { emptyPermissions, type PermissionModuleId } from "@/constants/permission-modules";
import { canSeeNavItem } from "@/providers/permissions-provider";
import { itemsDeLaPaleta } from "@/components/navigation/command-palette";
import { platformNavigation } from "@/routes/navigation";
import type { PermissionLevel } from "@/types/team";

/**
 * SCRUM-524 · La barra y la paleta de comandos según la experiencia.
 *
 * La barra filtra los items del config con `canSeeNavItem` (notch nav y menú
 * móvil); acá se aplica la misma regla al config que arma
 * `buildPlatformSidebarNav`. La paleta usa `itemsDeLaPaleta`, el mismo que
 * llama el componente.
 */

type Permisos = { isFounder: boolean; modules: Record<PermissionModuleId, PermissionLevel> };

const FOUNDER: Permisos = { isFounder: true, modules: emptyPermissions() };
const MIEMBRO_CON_EQUIPO: Permisos = {
  isFounder: false,
  modules: { ...emptyPermissions(), team: "view", finance: "full" },
};
const MIEMBRO_SIN_EQUIPO: Permisos = {
  isFounder: false,
  modules: { ...emptyPermissions(), finance: "full", sales: "full" },
};

function describir(item: SidebarNavRootItem): string {
  if (item.type === "divider") return "—";
  if (item.type === "parent") return `[${item.key}]`;
  return item.module.href;
}

/** Lo que dibuja la barra: los links y grupos que el permiso deja ver. */
function visibles(config: SidebarNavConfig, permisos: Permisos): string[] {
  const acceso = (m: PermissionModuleId) =>
    permisos.isFounder || (permisos.modules[m] ?? "none") !== "none";
  const out: string[] = [];
  for (const item of config.rootItems) {
    if (item.type === "link") {
      if (!item.module.disabled && canSeeNavItem(item.module.permissionId, acceso, permisos.isFounder)) {
        out.push(item.module.label);
      }
    } else if (item.type === "parent") {
      const hijos = config.modulesWithChildren[item.key]?.children.filter(
        (c) => !c.hidden && canSeeNavItem(c.permissionId, acceso, permisos.isFounder)
      );
      if (hijos?.length) out.push(config.modulesWithChildren[item.key]!.label);
    }
  }
  return out;
}

describe("⭐ barra de una organización full: igual que antes", () => {
  it("sin experiencia o con full, el mismo config", () => {
    for (const addOns of [[], ["operaciones", "producto"]] as const) {
      expect(buildPlatformSidebarNav([...addOns], "full")).toEqual(buildPlatformSidebarNav([...addOns]));
    }
  });

  it("los items de siempre, en el orden de siempre", () => {
    expect(buildPlatformSidebarNav([], "full").rootItems.map(describir)).toEqual([
      "/dashboard",
      "/clients",
      "/team",
      "—",
      "[marketing]",
      "[ventas]",
      "[finanzas]",
      "/funnels",
      "—",
      "/workboard",
      "/operations/sops",
      "[configuracion]",
    ]);
    expect(buildPlatformSidebarNav(["operaciones", "producto"], "full").rootItems.map(describir)).toContain(
      "[operaciones]"
    );
  });

  it("un founder ve todos los módulos", () => {
    expect(visibles(buildPlatformSidebarNav([], "full"), FOUNDER)).toEqual([
      "Panel General",
      "Clientes",
      "Equipo",
      "Marketing",
      "Ventas",
      "Finanzas",
      "Embudos",
      "Tablero de trabajo",
      "SOPs",
      "Configuración",
    ]);
  });
});

describe("⭐ barra de una organización webinar", () => {
  const webinar = buildPlatformSidebarNav(["operaciones", "producto"], "webinar");

  it("sólo las entradas listas del menú (hoy, Equipo), aunque tenga add-ons", () => {
    expect(webinar.rootItems.map(describir)).toEqual(["/team"]);
  });

  it("cada entrada lleva su módulo de permisos", () => {
    const [equipo] = webinar.rootItems;
    expect(equipo).toMatchObject({ type: "link", module: { label: "Equipo", permissionId: "team" } });
  });

  it("sin grupos: ni Configuración ni Integraciones en la isla derecha", () => {
    expect(webinar.modulesWithChildren).toEqual({});
    expect(webinar.getParentFromPath("/finance")).toBeNull();
  });

  it("además, filtrada por los permisos de siempre", () => {
    expect(visibles(webinar, FOUNDER)).toEqual(["Equipo"]);
    expect(visibles(webinar, MIEMBRO_CON_EQUIPO)).toEqual(["Equipo"]);
    expect(visibles(webinar, MIEMBRO_SIN_EQUIPO)).toEqual([]);
  });
});

describe("⭐ paleta de comandos", () => {
  it("full: lo de siempre, sin importar los permisos (las acciones rápidas y todo el menú)", () => {
    const founder = itemsDeLaPaleta("full", FOUNDER);
    expect(itemsDeLaPaleta("full", MIEMBRO_SIN_EQUIPO)).toEqual(founder);
    const labels = founder.map((i) => i.label);
    expect(labels).toEqual(
      expect.arrayContaining(["Enviar input semanal", "Crear SOP", "Bandeja de ventas", "Panel General"])
    );
    const delMenu = platformNavigation.flatMap((i) =>
      i.children?.length ? i.children.map((c) => c.href) : [i.href]
    );
    expect(founder.slice(4).map((i) => i.href)).toEqual(delMenu);
  });

  it("webinar: sólo las entradas listas, filtradas por permiso, sin acciones rápidas", () => {
    expect(itemsDeLaPaleta("webinar", FOUNDER)).toEqual([
      { label: "Equipo", href: "/team", group: "Plataforma", keywords: "Equipo" },
    ]);
    expect(itemsDeLaPaleta("webinar", MIEMBRO_CON_EQUIPO).map((i) => i.href)).toEqual(["/team"]);
    expect(itemsDeLaPaleta("webinar", MIEMBRO_SIN_EQUIPO)).toEqual([]);
  });
});
