/**
 * SCRUM-524 · El layout de la plataforma le pasa a la barra y a la paleta la
 * experiencia de la organización activa, leída en cada pedido.
 *
 * Mismo armado que `layout-plataforma-lecturas.test.ts`: el layout real con
 * `renderToStaticMarkup` y los providers reemplazados por envoltorios. El de
 * la experiencia anota el valor que recibe, y el de los permisos anota si
 * envuelve a `AppProviders` (ahí adentro se dibuja la paleta).
 */

import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyPermissions } from "@/constants/permission-modules";
import type { UserPermissions } from "@/lib/auth/get-current-permissions";

class Redireccion extends Error {
  constructor(readonly destino: string) {
    super(`redirect ${destino}`);
  }
}

const sim = vi.hoisted(() => ({
  experiencia: "full" as "full" | "webinar",
  pathname: "/team",
  recibidas: [] as unknown[],
  inicios: [] as unknown[],
  permisos: null as unknown as UserPermissions,
  orden: [] as string[],
}));

const PERMISOS: UserPermissions = {
  role: "member",
  isFounder: false,
  modules: { ...emptyPermissions(), team: "full" },
  hasRoleConfigured: true,
  enabledAddOns: [],
};

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-pathname": sim.pathname }),
}));
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  redirect: (destino: string) => {
    throw new Redireccion(destino);
  },
}));
vi.mock("@/lib/auth/get-current-permissions", () => ({
  getCurrentUserPermissions: async () => sim.permisos,
}));
vi.mock("@/lib/holding/session", () => ({
  getHoldingSessionState: async () => ({ isHolding: false, viewingBusiness: false, businesses: [] }),
}));
vi.mock("@/lib/onboarding/current", () => ({
  getCurrentOnboardingContext: async () => ({ state: null, toursSeen: [] }),
}));
vi.mock("@/lib/fechas/organizacion-activa", () => ({
  zonaDeLaOrganizacionActiva: async () => null,
}));
vi.mock("@/lib/organization/experience", () => ({
  getOrganizationExperience: async () => sim.experiencia,
}));

function envoltorio(nombre: string) {
  return function Envoltorio({ children }: { children?: ReactNode }) {
    sim.orden.push(nombre);
    return createElement(Fragment, null, children);
  };
}
function nada() {
  return null;
}

vi.mock("@/providers", () => ({ AppProviders: envoltorio("app") }));
vi.mock("@/components/platform/welcome-gate", () => ({ WelcomeGate: envoltorio("welcome") }));
vi.mock("@/components/holding/holding-platform-provider", () => ({
  HoldingPlatformProvider: envoltorio("holding"),
}));
vi.mock("@/layouts", () => ({ PlatformLayout: envoltorio("marco") }));
vi.mock("@/providers/permissions-provider", () => ({ PermissionsProvider: envoltorio("permisos") }));
vi.mock("@/providers/onboarding-provider", () => ({ OnboardingProvider: envoltorio("onboarding") }));
vi.mock("@/providers/experiencia-provider", () => ({
  ExperienciaProvider: ({
    experiencia,
    inicio,
    children,
  }: {
    experiencia: unknown;
    inicio: unknown;
    children?: ReactNode;
  }) => {
    sim.recibidas.push(experiencia);
    sim.inicios.push(inicio);
    sim.orden.push("experiencia");
    return createElement(Fragment, null, children);
  },
}));
vi.mock("@/components/onboarding/tour-runner", () => ({ TourRunner: nada }));
vi.mock("@/components/platform/aviso-clave-ia", () => ({ AvisoClaveIa: nada }));

import PlatformRouteLayout from "../(platform)/layout";

async function render(): Promise<string> {
  const arbol = await PlatformRouteLayout({ children: createElement("p", null, "pantalla") });
  return renderToStaticMarkup(arbol);
}

beforeEach(() => {
  sim.experiencia = "full";
  sim.pathname = "/team";
  sim.recibidas = [];
  sim.inicios = [];
  sim.permisos = PERMISOS;
  sim.orden = [];
});

describe("⭐ la experiencia llega al menú", () => {
  it("full y webinar llegan tal cual al provider de la barra y la paleta", async () => {
    await render();
    sim.experiencia = "webinar";
    await render();
    expect(sim.recibidas).toEqual(["full", "webinar"]);
  });

  it("⭐ se lee en cada pedido: cambiar de organización activa recalcula el menú", async () => {
    sim.experiencia = "webinar";
    await render();
    sim.experiencia = "full";
    await render();
    sim.experiencia = "webinar";
    await render();
    expect(sim.recibidas).toEqual(["webinar", "full", "webinar"]);
  });

  it("los permisos y la experiencia envuelven a AppProviders (la paleta vive ahí adentro)", async () => {
    await render();
    expect(sim.orden.indexOf("experiencia")).toBeLessThan(sim.orden.indexOf("app"));
    expect(sim.orden.indexOf("permisos")).toBeLessThan(sim.orden.indexOf("app"));
  });
});

/** Qué pasa al cargar la página: el HTML o `redirect <destino>`. */
async function cargar(): Promise<string> {
  try {
    return await render();
  } catch (error) {
    if (error instanceof Redireccion) return `redirect ${error.destino}`;
    throw error;
  }
}

describe("⭐ al cargar la página, la experiencia va antes que el permiso", () => {
  it("webinar sin el módulo Marketing que tipea /marketing va a su inicio, no a «No tenés acceso»", async () => {
    sim.experiencia = "webinar";
    sim.pathname = "/marketing/content";
    expect(await cargar()).toBe("redirect /team");
  });

  it("full sin el módulo Marketing sigue viendo «No tenés acceso», como antes", async () => {
    sim.pathname = "/marketing/content";
    const html = await cargar();
    expect(html).toContain("No tenés acceso");
    expect(html).not.toContain("pantalla");
  });

  it("webinar en una ruta abierta dibuja la pantalla", async () => {
    sim.experiencia = "webinar";
    sim.pathname = "/team/roles";
    expect(await cargar()).toContain("pantalla");
  });

  it("sin x-pathname no se redirige (no hay ruta que mirar)", async () => {
    sim.experiencia = "webinar";
    sim.pathname = "";
    expect(await cargar()).toContain("pantalla");
  });
});

// El logo y el pie de la paleta toman de este provider la pantalla de inicio; que
// la usen de verdad lo prueban `barra-por-experiencia.test.ts` y
// `paleta-por-experiencia.test.ts`. Acá, sólo el valor que el layout calcula.
describe("⭐ el layout calcula la pantalla de inicio con los permisos de quien mira y la pasa al provider", () => {
  it("full: /dashboard; webinar con Equipo: /team; webinar sin Equipo: /settings", async () => {
    await render();
    sim.experiencia = "webinar";
    await render();
    sim.permisos = { ...PERMISOS, modules: { ...emptyPermissions(), finance: "full", settings: "view" } };
    sim.pathname = "/settings";
    await render();
    expect(sim.inicios).toEqual(["/dashboard", "/team", "/settings"]);
  });

  it("⭐ webinar sin Equipo que tipea /finance va a Ajustes", async () => {
    sim.experiencia = "webinar";
    sim.permisos = { ...PERMISOS, modules: { ...emptyPermissions(), finance: "full", settings: "view" } };
    sim.pathname = "/finance";
    expect(await cargar()).toBe("redirect /settings");
  });
});
