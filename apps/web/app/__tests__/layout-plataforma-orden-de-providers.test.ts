/**
 * SCRUM-540 · AR pasada 1 (MENOR-1, X2): en el layout de la plataforma, los
 * permisos envuelven a `AppProviders`. Los providers del marco (clientes,
 * Finanzas, conversaciones) viven adentro de `AppProviders` y deciden qué
 * pedir con `usePermisosDeModulo`: si `PermissionsProvider` quedara adentro,
 * leerían el valor por defecto (sin rol, que no bloquea) y pedirían todo.
 *
 * Se dibuja el layout real con el `PermissionsProvider` real; `AppProviders` se
 * reemplaza por uno que escribe los permisos que ve.
 */

import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { emptyPermissions } from "@/constants/permission-modules";
import type { UserPermissions } from "@/lib/auth/get-current-permissions";

const sim = vi.hoisted(() => ({ permisos: null as unknown as UserPermissions }));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-pathname": "/team" }),
}));
vi.mock("@/lib/auth/get-current-permissions", () => ({
  getCurrentUserPermissions: async () => sim.permisos,
}));
vi.mock("@/lib/holding/session", () => ({
  getHoldingSessionState: async () => ({ isHolding: false, viewingBusiness: false, businesses: [] }),
}));
vi.mock("@/lib/onboarding/current", () => ({ getCurrentOnboardingContext: async () => null }));
vi.mock("@/lib/fechas/organizacion-activa", () => ({ zonaDeLaOrganizacionActiva: async () => null }));

function envoltorio({ children }: { children?: ReactNode }) {
  return createElement(Fragment, null, children);
}
vi.mock("@/providers", async () => {
  const { usePermisosDeModulo } = await import("@/providers/permissions-provider");
  return {
    AppProviders: ({ children }: { children?: ReactNode }) => {
      const p = usePermisosDeModulo();
      return createElement(
        Fragment,
        null,
        createElement("p", null, `MARCO ve rol=${p.hasRoleConfigured} ventas=${p.modules.sales}`),
        children
      );
    },
  };
});
vi.mock("@/components/platform/welcome-gate", () => ({ WelcomeGate: envoltorio }));
vi.mock("@/components/holding/holding-platform-provider", () => ({ HoldingPlatformProvider: envoltorio }));
vi.mock("@/layouts", () => ({ PlatformLayout: envoltorio }));
vi.mock("@/providers/onboarding-provider", () => ({ OnboardingProvider: envoltorio }));
vi.mock("@/providers/zona-de-la-organizacion-provider", () => ({ ZonaDeLaOrganizacionProvider: envoltorio }));
vi.mock("@/components/onboarding/tour-runner", () => ({ TourRunner: () => null }));
vi.mock("@/components/platform/aviso-clave-ia", () => ({ AvisoClaveIa: () => null }));

import PlatformRouteLayout from "../(platform)/layout";

describe("orden de los providers del layout de la plataforma", () => {
  it("⭐ los providers del marco ven los permisos de quien entra, no el valor por defecto", async () => {
    sim.permisos = {
      role: "member",
      isFounder: false,
      modules: { ...emptyPermissions(), team: "full", sales: "view" },
      hasRoleConfigured: true,
      enabledAddOns: [],
    };
    const html = renderToStaticMarkup(
      await PlatformRouteLayout({ children: createElement("p", null, "PANTALLA") })
    );
    expect(html).toContain("MARCO ve rol=true ventas=view");
  });
});
