/**
 * SCRUM-524 · ⭐ La barra real (`PlatformNotchNav`) según la experiencia.
 *
 * Se dibuja el adaptador real con `renderToStaticMarkup`, con los providers
 * reales de experiencia y permisos. `NotchNav` (presentacional, con Framer
 * Motion) se reemplaza por uno que dibuja lo que recibe: el logo, los ítems
 * como links y la isla derecha. Los componentes de la isla que leen datos se
 * reemplazan por marcas, para ver si la barra los pone o no.
 *
 *   - `full`: igual que antes. Logo al Panel, menú completo, reportes y
 *     configuración pendiente en la isla, Integraciones.
 *   - `webinar`: logo a la pantalla de inicio, sólo las entradas del menú que
 *     el rol ve, sin reportes, sin configuración pendiente, sin Integraciones.
 */

import { createElement, Fragment, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { emptyPermissions } from "@/constants/permission-modules";
import type { UserPermissions } from "@/lib/auth/get-current-permissions";
import type { OrganizationExperience } from "@/lib/organization/experience";

vi.mock("next/navigation", () => ({ usePathname: () => "/team" }));
vi.mock("@/components/holding/holding-platform-provider", () => ({
  useHoldingSession: () => ({ isHolding: false, viewingBusiness: false, businesses: [] }),
}));
vi.mock("@/providers", () => ({ usePlatformData: () => ({ clients: [] }) }));
vi.mock("@/components/executive-reports/reports-panel", () => ({
  ReportsPanel: () => createElement("i", { "data-marca": "reportes" }),
}));
vi.mock("@/components/onboarding/notch-setup-indicator", () => ({
  NotchSetupIndicator: () => createElement("i", { "data-marca": "configuracion-pendiente" }),
}));
vi.mock("@/components/holding/holding-business-switcher", () => ({ HoldingBusinessSwitcher: () => null }));
vi.mock("@/components/navigation/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/components/layout/mobile-nav", () => ({ MobileNav: () => null }));
vi.mock("../notch-profile-menu", () => ({
  NotchProfileMenu: () => createElement("a", { href: "/settings" }, "Ajustes"),
}));
vi.mock("../notch-nav", () => ({
  NotchNav: ({
    items,
    logo,
    rightContent,
  }: {
    items: Array<{ type: string; href?: string; label: string; children?: Array<{ href: string }> }>;
    logo: ReactNode;
    rightContent: ReactNode;
  }) =>
    createElement(
      Fragment,
      null,
      createElement("div", { "data-zona": "logo" }, logo),
      createElement(
        "div",
        { "data-zona": "items" },
        items.map((item) =>
          item.type === "link"
            ? createElement("a", { key: item.label, href: item.href }, item.label)
            : createElement("b", { key: item.label }, item.label)
        )
      ),
      createElement("div", { "data-zona": "isla" }, rightContent)
    ),
}));

import { PlatformNotchNav } from "../platform-notch-nav";
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

function dibujar(experiencia: OrganizationExperience, inicio: string, permisos: UserPermissions) {
  const html = renderToStaticMarkup(
    createElement(
      ExperienciaProvider,
      { experiencia, inicio },
      createElement(Permisos, { value: permisos }, createElement(PlatformNotchNav))
    )
  );
  const zona = (nombre: string) =>
    new RegExp(`<div data-zona="${nombre}">([\\s\\S]*?)</div>(?=<div data-zona|$)`).exec(html)?.[1] ?? "";
  const hrefs = (texto: string) => [...texto.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  return {
    logo: hrefs(zona("logo")),
    items: [...zona("items").matchAll(/>([^<]+)<\/(?:a|b)>/g)].map((m) => m[1]),
    isla: zona("isla"),
    islaHrefs: hrefs(zona("isla")),
  };
}

describe("⭐ barra de una organización full: igual que antes", () => {
  const barra = dibujar("full", "/dashboard", FOUNDER);

  it("el logo lleva al Panel", () => {
    expect(barra.logo).toEqual(["/dashboard"]);
  });

  it("el menú completo", () => {
    expect(barra.items).toEqual([
      "Panel General",
      "Clientes",
      "Equipo",
      "Marketing",
      "Ventas",
      "Finanzas",
      "Embudos",
      "Tablero de trabajo",
      "SOPs",
    ]);
  });

  it("la isla: configuración pendiente, Integraciones, reportes y Ajustes", () => {
    expect(barra.isla).toContain('data-marca="configuracion-pendiente"');
    expect(barra.isla).toContain('data-marca="reportes"');
    expect(barra.islaHrefs).toEqual(["/integrations", "/settings"]);
  });
});

describe("⭐ barra de una organización webinar", () => {
  const barra = dibujar("webinar", "/team", FOUNDER);

  it("el logo lleva a la pantalla de inicio", () => {
    expect(barra.logo).toEqual(["/team"]);
  });

  it("sólo las entradas listas del menú", () => {
    expect(barra.items).toEqual(["Equipo"]);
  });

  it("⭐ la isla sin reportes ejecutivos, sin configuración pendiente y sin Integraciones: sólo Ajustes", () => {
    expect(barra.isla).not.toContain('data-marca="reportes"');
    expect(barra.isla).not.toContain('data-marca="configuracion-pendiente"');
    expect(barra.islaHrefs).toEqual(["/settings"]);
  });

  it("ningún link de la barra sale del menú o de las rutas libres", () => {
    const todos = [...barra.logo, ...barra.islaHrefs, "/team"];
    for (const href of todos) expect(["/team", "/settings"]).toContain(href);
  });

  it("un miembro sin Equipo: sin entradas y el logo a Ajustes", () => {
    const miembro = dibujar("webinar", "/settings", SIN_EQUIPO);
    expect(miembro.items).toEqual([]);
    expect(miembro.logo).toEqual(["/settings"]);
    expect(miembro.isla).not.toContain('data-marca="reportes"');
  });
});
