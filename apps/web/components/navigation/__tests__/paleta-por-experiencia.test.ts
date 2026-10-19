/**
 * SCRUM-524 (AR pasada 1, MENOR-1) · La paleta de comandos real según la
 * experiencia: el link del pie y lo que lista.
 *
 * Se dibuja `CommandPalette` con los providers reales de experiencia y
 * permisos. El diálogo de `@ai-coo/ui` se dibuja en el lugar (el de Radix usa
 * un portal, que no existe en `renderToStaticMarkup`) y el provider de la
 * paleta se reemplaza por uno abierto.
 */

import { createElement, Fragment, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { emptyPermissions } from "@/constants/permission-modules";
import type { UserPermissions } from "@/lib/auth/get-current-permissions";
import type { OrganizationExperience } from "@/lib/organization/experience";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }) }));
vi.mock("@/providers/command-palette-provider", () => ({
  useCommandPalette: () => ({ open: true, setOpen: () => undefined }),
}));
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

import { CommandPalette } from "../command-palette";
import { ExperienciaProvider } from "@/providers/experiencia-provider";
import { PermissionsProvider } from "@/providers/permissions-provider";

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

function paleta(experiencia: OrganizationExperience, inicio: string, permisos: UserPermissions) {
  const html = renderToStaticMarkup(
    createElement(
      ExperienciaProvider,
      { experiencia, inicio },
      createElement(Permisos, { value: permisos }, createElement(CommandPalette))
    )
  );
  const pie = [...html.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g)].map((m) => `${m[2]} ${m[1]}`);
  const items = [...html.matchAll(/<span class="truncate">([^<]*)<\/span>/g)].map((m) => m[1]);
  return { html, pie, items };
}

describe("⭐ paleta de una organización full: igual que antes", () => {
  const p = paleta("full", "/dashboard", FOUNDER);

  it("el pie lleva al Panel General", () => {
    expect(p.html).toContain('data-dialogo="abierto"');
    expect(p.pie).toEqual(["Panel General /dashboard"]);
  });

  it("lista las acciones rápidas y el menú completo", () => {
    expect(p.items).toEqual(expect.arrayContaining(["Enviar input semanal", "Bandeja de ventas", "Panel General", "Equipo"]));
  });
});

describe("⭐ paleta de una organización webinar", () => {
  it("el pie lleva a la pantalla de inicio y sólo lista Equipo", () => {
    const p = paleta("webinar", "/team", FOUNDER);
    expect(p.pie).toEqual(["Ir al inicio /team"]);
    expect(p.items).toEqual(["Equipo"]);
  });

  it("un miembro sin Equipo: el pie lleva a Ajustes y no lista nada", () => {
    const p = paleta("webinar", "/settings", SIN_EQUIPO);
    expect(p.pie).toEqual(["Ir al inicio /settings"]);
    expect(p.items).toEqual([]);
  });
});
