/**
 * SCRUM-524 (AR pasada 1, MAYOR-1) · ⭐ El menú del celular según la experiencia.
 *
 * Se dibuja el `MobileNav` real, con su `SidebarTwoLevelNavigation`, sus ítems
 * y los providers reales de experiencia y permisos. Lo único reemplazado es el
 * diálogo de `@ai-coo/ui`: el de Radix se dibuja en un portal, que no existe en
 * `renderToStaticMarkup`, así que acá su contenido se dibuja en el lugar, como
 * si el menú estuviera abierto. Todo lo que arma la lista de ítems es el código
 * de la app.
 *
 *   - `full`: los ítems de siempre.
 *   - `webinar`: sólo las entradas listas del menú que el rol ve.
 */

import { createElement, Fragment, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { emptyPermissions } from "@/constants/permission-modules";
import type { UserPermissions } from "@/lib/auth/get-current-permissions";
import type { OrganizationExperience } from "@/lib/organization/experience";

vi.mock("next/navigation", () => ({ usePathname: () => "/team" }));
vi.mock("@/app/fathom/actions", () => ({ countPendingFathomCallsAction: async () => 0 }));
vi.mock("@ai-coo/ui", async (original) => {
  const real = await original<typeof import("@ai-coo/ui")>();
  const enElLugar = ({ children }: { children?: ReactNode }) =>
    createElement("div", { "data-dialogo": "abierto" }, children);
  return {
    ...real,
    Dialog: ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children),
    DialogContent: enElLugar,
    DialogTitle: enElLugar,
  };
});

import { MobileNav } from "../mobile-nav";
import { ExperienciaProvider } from "@/providers/experiencia-provider";
import { PermissionsProvider } from "@/providers/permissions-provider";

/** `children` opcional en el tipo, para pasarlo como hijo de `createElement`. */
const Permisos = PermissionsProvider as ComponentType<{ value: UserPermissions; children?: ReactNode }>;

const FOUNDER: UserPermissions = {
  role: "founder",
  isFounder: true,
  modules: emptyPermissions(),
  enabledAddOns: [],
  hasRoleConfigured: true,
};
const SIN_EQUIPO: UserPermissions = {
  role: "member",
  isFounder: false,
  modules: { ...emptyPermissions(), finance: "full", settings: "view" },
  enabledAddOns: [],
  hasRoleConfigured: true,
};

/** Los ítems del menú abierto: los links con su destino y los grupos (botones). */
function menuAbierto(experiencia: OrganizationExperience, inicio: string, permisos: UserPermissions) {
  const html = renderToStaticMarkup(
    createElement(
      ExperienciaProvider,
      { experiencia, inicio },
      createElement(Permisos, { value: permisos }, createElement(MobileNav))
    )
  );
  const nav = /<nav[^>]*>([\s\S]*?)<\/nav>/.exec(html)?.[1] ?? "";
  const links = [...nav.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(
    (m) => `${m[2]!.replace(/<[^>]+>/g, "").trim()} ${m[1]}`
  );
  const grupos = [...nav.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)]
    .map((m) => m[1]!.replace(/<[^>]+>/g, "").trim())
    .filter(Boolean);
  return { html, links, grupos };
}

describe("⭐ menú del celular de una organización full: igual que antes", () => {
  const menu = menuAbierto("full", "/dashboard", FOUNDER);

  it("el diálogo quedó abierto (si no, el resto no prueba nada)", () => {
    expect(menu.html).toContain('data-dialogo="abierto"');
  });

  it("los links y los grupos de siempre", () => {
    expect(menu.links).toEqual([
      "Panel General /dashboard",
      "Clientes /clients",
      "Equipo /team",
      "Embudos /funnels",
      "Tablero de trabajo /workboard",
      "SOPs /operations/sops",
    ]);
    expect(menu.grupos).toEqual(["Marketing", "Ventas", "Finanzas", "Configuración"]);
  });
});

describe("⭐ menú del celular de una organización webinar", () => {
  it("sólo las entradas listas: Equipo, sin grupos", () => {
    const menu = menuAbierto("webinar", "/team", FOUNDER);
    expect(menu.html).toContain('data-dialogo="abierto"');
    expect(menu.links).toEqual(["Equipo /team"]);
    expect(menu.grupos).toEqual([]);
  });

  it("un miembro sin Equipo no ve ninguna entrada", () => {
    const menu = menuAbierto("webinar", "/settings", SIN_EQUIPO);
    expect(menu.links).toEqual([]);
    expect(menu.grupos).toEqual([]);
  });
});
