/**
 * SCRUM-108 · El escenario del AR (pasada 1, MAYOR-1), con la función de
 * permisos real.
 *
 * Supabase responde un usuario, pero toda consulta a tablas devuelve
 * `57014` (statement timeout). Con onboarding, holding y zona degradables, el
 * layout ya no caía por ellos; si `getCurrentUserPermissions` se tragaba el
 * error, el miembro quedaba "sin rol" y el layout dibujaba Finanzas. Ahora la
 * lectura de permisos lanza y el layout cae en la pantalla de error: nunca se
 * dibuja la pantalla.
 */

import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TIMEOUT = { message: "canceling statement due to statement timeout", code: "57014" };

const sim = vi.hoisted(() => ({
  pathname: "/finance",
  caida: true,
  filas: {} as Record<string, Record<string, unknown>>,
  reportes: [] as unknown[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
    from(tabla: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () =>
          sim.caida ? { data: null, error: TIMEOUT } : { data: sim.filas[tabla] ?? null, error: null },
      };
      return builder;
    },
  }),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-pathname": sim.pathname }),
}));
// Las tres degradables fallan con el mismo timeout, como en la base caída.
function falla(): never {
  throw Object.assign(new Error(TIMEOUT.message), { code: TIMEOUT.code });
}
vi.mock("@/lib/holding/session", () => ({
  getHoldingSessionState: async () => (sim.caida ? falla() : { isHolding: false, viewingBusiness: false, businesses: [] }),
}));
vi.mock("@/lib/onboarding/current", () => ({
  getCurrentOnboardingContext: async () => (sim.caida ? falla() : { state: null, toursSeen: [] }),
}));
vi.mock("@/lib/fechas/organizacion-activa", () => ({
  zonaDeLaOrganizacionActiva: async () => (sim.caida ? falla() : null),
}));
vi.mock("@/lib/observability/reportar-falla", () => ({
  reportarFalla: (error: unknown) => sim.reportes.push(error),
}));

function envoltorio({ children }: { children?: ReactNode }) {
  return createElement(Fragment, null, children);
}
function nada() {
  return null;
}
vi.mock("@/providers", () => ({ AppProviders: envoltorio }));
vi.mock("@/components/platform/welcome-gate", () => ({ WelcomeGate: envoltorio }));
vi.mock("@/components/holding/holding-platform-provider", () => ({ HoldingPlatformProvider: envoltorio }));
vi.mock("@/layouts", () => ({ PlatformLayout: envoltorio }));
vi.mock("@/providers/permissions-provider", () => ({ PermissionsProvider: envoltorio }));
vi.mock("@/providers/onboarding-provider", () => ({ OnboardingProvider: envoltorio }));
vi.mock("@/providers/zona-de-la-organizacion-provider", () => ({ ZonaDeLaOrganizacionProvider: envoltorio }));
vi.mock("@/components/onboarding/tour-runner", () => ({ TourRunner: nada }));
vi.mock("@/components/platform/aviso-clave-ia", () => ({ AvisoClaveIa: nada }));

import PlatformRouteLayout from "../(platform)/layout";
import { FallaDeLaBase } from "@/lib/server/action-result";

const FINANZAS = "PANTALLA DE FINANZAS";

async function render(): Promise<string> {
  const arbol = await PlatformRouteLayout({ children: createElement("p", null, FINANZAS) });
  return renderToStaticMarkup(arbol);
}

beforeEach(() => {
  sim.pathname = "/finance";
  sim.caida = true;
  sim.reportes = [];
  sim.filas = {
    profiles: { role: "member", custom_role_id: "rol-1", organization_id: "org-1" },
    organizations: { enabled_add_ons: [] },
    team_roles: { permissions: { dashboard: "full", finance: "none" } },
  };
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("⭐ base caída (57014) con los permisos reales", () => {
  it("un miembro sin Finanzas que abre /finance: el layout lanza y nunca dibuja Finanzas", async () => {
    let html: string | null = null;
    let error: unknown = null;
    try {
      html = await render();
    } catch (e) {
      error = e;
    }
    expect(html).toBeNull();
    expect(error).toBeInstanceOf(FallaDeLaBase);
    expect(error).toMatchObject({ code: "57014" });
  });
});

describe("con la base andando, la regla no cambia", () => {
  it("el mismo miembro ve «No tenés acceso a Finanzas»", async () => {
    sim.caida = false;
    const html = await render();
    expect(html).toContain("No tenés acceso a Finanzas");
    expect(html).not.toContain(FINANZAS);
  });

  it("con Finanzas en su rol ve la pantalla", async () => {
    sim.caida = false;
    sim.filas.team_roles = { permissions: { finance: "view" } };
    expect(await render()).toContain(FINANZAS);
  });
});
