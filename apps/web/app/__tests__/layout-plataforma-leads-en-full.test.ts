/**
 * SCRUM-545 · AC-13 / DT-24: en una organización `full`, `/leads` se abre
 * tipeando la URL y el layout real de la plataforma decide con la regla
 * general de módulos (`moduloBloqueadoParaRuta`, módulo `sales`):
 *   (a) rol configurado sin Ventas: «No tenés acceso a Ventas», sin la pantalla;
 *   (b) el founder (aun sin módulos) y una cuenta sin rol configurado: la pantalla;
 *   (c) con Ventas: la pantalla.
 *
 * Mocks como `layout-plataforma-permisos.test.ts`: providers y marco se
 * reemplazan por envoltorios. No prueba que la página exista (eso lo cubren
 * `rutas-por-experiencia-en-disco.test.ts` y `pantallas-de-leads.test.ts`).
 */

import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/organization/experience", () => ({
  getOrganizationExperience: async () => "full",
}));
import { emptyPermissions } from "@/constants/permission-modules";
import type { UserPermissions } from "@/lib/auth/get-current-permissions";
import type { HoldingSessionState } from "@/lib/holding/session";

const sim = vi.hoisted(() => ({
  pathname: "/leads",
  permisos: null as unknown as UserPermissions,
  holding: {
    isHolding: false,
    viewingBusiness: false,
    businesses: [],
  } as HoldingSessionState,
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-pathname": sim.pathname }),
}));
vi.mock("@/lib/auth/get-current-permissions", () => ({
  getCurrentUserPermissions: async () => sim.permisos,
}));
vi.mock("@/lib/holding/session", () => ({
  getHoldingSessionState: async () => sim.holding,
}));
vi.mock("@/lib/onboarding/current", () => ({
  getCurrentOnboardingContext: async () => null,
}));
vi.mock("@/lib/fechas/organizacion-activa", () => ({
  zonaDeLaOrganizacionActiva: async () => "America/Lima",
}));

function envoltorio({ children }: { children?: ReactNode }) {
  return createElement(Fragment, null, children);
}
function nada() {
  return null;
}

vi.mock("@/providers", () => ({ AppProviders: envoltorio }));
vi.mock("@/components/platform/welcome-gate", () => ({ WelcomeGate: envoltorio }));
vi.mock("@/components/holding/holding-platform-provider", () => ({
  HoldingPlatformProvider: envoltorio,
}));
vi.mock("@/layouts", () => ({ PlatformLayout: envoltorio }));
vi.mock("@/providers/permissions-provider", () => ({
  PermissionsProvider: envoltorio,
}));
vi.mock("@/providers/onboarding-provider", () => ({
  OnboardingProvider: envoltorio,
}));
vi.mock("@/providers/zona-de-la-organizacion-provider", () => ({
  ZonaDeLaOrganizacionProvider: envoltorio,
}));
vi.mock("@/components/onboarding/tour-runner", () => ({ TourRunner: nada }));
vi.mock("@/components/platform/aviso-clave-ia", () => ({ AvisoClaveIa: nada }));

import PlatformRouteLayout from "../(platform)/layout";

const PANTALLA = "Pantalla de Leads";
const RUTAS = ["/leads", "/leads/abc"];

async function render(pathname: string): Promise<string> {
  sim.pathname = pathname;
  const arbol = await PlatformRouteLayout({
    children: createElement("p", null, PANTALLA),
  });
  return renderToStaticMarkup(arbol);
}

function member(
  modulos: Partial<UserPermissions["modules"]>,
  hasRoleConfigured = true
): UserPermissions {
  return {
    role: "member",
    isFounder: false,
    modules: { ...emptyPermissions(), ...modulos },
    hasRoleConfigured,
    enabledAddOns: [],
  };
}

describe("⭐ /leads en una organización full, dentro del layout de la plataforma (AC-13)", () => {
  it("(a) rol configurado sin Ventas: «No tenés acceso a Ventas» y no la pantalla", async () => {
    sim.permisos = member({ dashboard: "full" });
    for (const ruta of RUTAS) {
      const html = await render(ruta);
      expect(html, ruta).toContain("No tenés acceso a Ventas");
      expect(html, ruta).not.toContain(PANTALLA);
    }
  });

  it("(b) el founder, aun sin módulos, ve la pantalla", async () => {
    sim.permisos = {
      role: "founder",
      isFounder: true,
      modules: emptyPermissions(),
      hasRoleConfigured: true,
      enabledAddOns: [],
    };
    for (const ruta of RUTAS) {
      const html = await render(ruta);
      expect(html, ruta).toContain(PANTALLA);
      expect(html, ruta).not.toContain("No tenés acceso");
    }
  });

  it("(b) una cuenta sin rol configurado ve la pantalla (regla general de módulos)", async () => {
    sim.permisos = member({}, false);
    for (const ruta of RUTAS) {
      const html = await render(ruta);
      expect(html, ruta).toContain(PANTALLA);
      expect(html, ruta).not.toContain("No tenés acceso");
    }
  });

  it("(c) con Ventas ve la pantalla", async () => {
    sim.permisos = member({ sales: "view" });
    for (const ruta of RUTAS) {
      const html = await render(ruta);
      expect(html, ruta).toContain(PANTALLA);
      expect(html, ruta).not.toContain("No tenés acceso");
    }
  });
});
