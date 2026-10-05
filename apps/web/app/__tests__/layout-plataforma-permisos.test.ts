/**
 * SCRUM-18 · [PERMISOS-FOUNDER-AREA]: `/founder` vive bajo `app/(platform)` y
 * su layout le muestra «No tenés acceso» a quien no tiene Operaciones.
 *
 * Se renderiza el layout real con `renderToStaticMarkup`. Los providers y el
 * marco de la plataforma se reemplazan por envoltorios que sólo dibujan a sus
 * hijos: lo que se prueba es la decisión del layout (la pantalla o
 * `SinAcceso`), que usa el helper, la tabla de módulos y `SinAcceso` reales.
 */

import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyPermissions } from "@/constants/permission-modules";
import type { UserPermissions } from "@/lib/auth/get-current-permissions";
import type { HoldingSessionState } from "@/lib/holding/session";

const sim = vi.hoisted(() => ({
  pathname: "/founder",
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

const PANTALLA = "Pantalla del fundador";

async function render(): Promise<string> {
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

beforeEach(() => {
  sim.pathname = "/founder";
  sim.holding = { isHolding: false, viewingBusiness: false, businesses: [] };
});

describe("⭐ /founder dentro del layout de la plataforma", () => {
  it("un member sin acceso a Operaciones ve «No tenés acceso» y no la pantalla", async () => {
    sim.permisos = member({ dashboard: "full", finance: "full" });
    const html = await render();
    expect(html).toContain("No tenés acceso a Operaciones");
    expect(html).not.toContain(PANTALLA);
  });

  it("un member con Operaciones ve la pantalla", async () => {
    sim.permisos = member({ operations: "view" });
    const html = await render();
    expect(html).toContain(PANTALLA);
    expect(html).not.toContain("No tenés acceso");
  });

  it("el founder ve la pantalla", async () => {
    sim.permisos = {
      role: "founder",
      isFounder: true,
      modules: emptyPermissions(),
      hasRoleConfigured: true,
      enabledAddOns: [],
    };
    const html = await render();
    expect(html).toContain(PANTALLA);
    expect(html).not.toContain("No tenés acceso");
  });

  it("sin rol configurado se comporta como el resto de la plataforma: no se bloquea", async () => {
    sim.permisos = member({}, false);
    expect(await render()).toContain(PANTALLA);

    sim.pathname = "/finance";
    expect(await render()).toContain(PANTALLA);
  });

  it("un holding operando un negocio sigue la misma regla", async () => {
    sim.holding = {
      isHolding: true,
      holdingOrgId: "holding-1",
      activeOrgId: "negocio-1",
      viewingBusiness: true,
      activeBusinessName: "Negocio",
      businesses: [],
    };
    sim.permisos = member({ dashboard: "full" });
    expect(await render()).toContain("No tenés acceso a Operaciones");

    sim.permisos = member({ operations: "full" });
    expect(await render()).toContain(PANTALLA);
  });

  it("el mismo member sin Operaciones sigue entrando a los módulos que sí tiene", async () => {
    sim.permisos = member({ finance: "view" });
    sim.pathname = "/finance";
    expect(await render()).toContain(PANTALLA);
  });
});
