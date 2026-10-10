/**
 * SCRUM-108: una lectura secundaria rota no tumba la plataforma.
 *
 * El layout de `(platform)` esperaba cinco lecturas con un `Promise.all` y con
 * que fallara una, toda la app quedaba en la pantalla de error. Ahora:
 *   - holding, onboarding y zona son degradables: si fallan, la plataforma se
 *     dibuja igual con un valor por defecto seguro y la falla va a Sentry;
 *   - los permisos son imprescindibles: si fallan, el layout lanza (cae en la
 *     pantalla de error) y nunca se abre el acceso;
 *   - una sesión no válida o una cuenta desactivada no se degradan.
 *
 * Mismo armado que `layout-plataforma-permisos.test.ts`: el layout real con
 * `renderToStaticMarkup` y los providers reemplazados por envoltorios. Los
 * providers de holding, onboarding y zona además anotan el valor que reciben.
 */

import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DynamicServerError } from "next/dist/client/components/hooks-server-context";
import { emptyPermissions } from "@/constants/permission-modules";
import type { UserPermissions } from "@/lib/auth/get-current-permissions";
import type { HoldingSessionState } from "@/lib/holding/session";
import type { OnboardingContext } from "@/lib/onboarding/current";
import { TOUR_IDS } from "@/lib/onboarding/tours";
import { ErrorEsperable } from "@/lib/server/error-esperable";

const sim = vi.hoisted(() => ({
  pathname: "/dashboard",
  fallas: {} as Partial<Record<"holding" | "permisos" | "onboarding" | "zona", unknown>>,
  recibido: {} as { holding?: unknown; onboarding?: unknown; zona?: unknown },
  reportes: [] as Array<{ error: unknown; contexto: unknown }>,
}));

function leer<T>(clave: keyof typeof sim.fallas, valor: T): () => Promise<T> {
  return async () => {
    if (sim.fallas[clave]) throw sim.fallas[clave];
    return valor;
  };
}

const PERMISOS_MEMBER: UserPermissions = {
  role: "member",
  isFounder: false,
  modules: { ...emptyPermissions(), dashboard: "full" },
  hasRoleConfigured: true,
  enabledAddOns: [],
};
const HOLDING: HoldingSessionState = {
  isHolding: true,
  holdingOrgId: "holding-1",
  activeOrgId: "negocio-1",
  viewingBusiness: true,
  activeBusinessName: "Negocio",
  businesses: [],
};
const ONBOARDING: OnboardingContext = { state: null, toursSeen: ["agent"] };

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-pathname": sim.pathname }),
}));
vi.mock("@/lib/auth/get-current-permissions", () => ({
  getCurrentUserPermissions: () => leer("permisos", PERMISOS_MEMBER)(),
}));
vi.mock("@/lib/holding/session", () => ({
  getHoldingSessionState: () => leer("holding", HOLDING)(),
}));
vi.mock("@/lib/onboarding/current", () => ({
  getCurrentOnboardingContext: () => leer("onboarding", ONBOARDING)(),
}));
vi.mock("@/lib/fechas/organizacion-activa", () => ({
  zonaDeLaOrganizacionActiva: () => leer("zona", "America/Lima")(),
}));
vi.mock("@/lib/observability/reportar-falla", () => ({
  reportarFalla: (error: unknown, contexto: unknown) => sim.reportes.push({ error, contexto }),
}));

function envoltorio({ children }: { children?: ReactNode }) {
  return createElement(Fragment, null, children);
}
function anotador(clave: "holding" | "onboarding") {
  return function Anotador({ value, children }: { value: unknown; children?: ReactNode }) {
    sim.recibido[clave] = value;
    return createElement(Fragment, null, children);
  };
}
function nada() {
  return null;
}

vi.mock("@/providers", () => ({ AppProviders: envoltorio }));
vi.mock("@/components/platform/welcome-gate", () => ({ WelcomeGate: envoltorio }));
vi.mock("@/components/holding/holding-platform-provider", () => ({
  HoldingPlatformProvider: anotador("holding"),
}));
vi.mock("@/layouts", () => ({ PlatformLayout: envoltorio }));
vi.mock("@/providers/permissions-provider", () => ({ PermissionsProvider: envoltorio }));
vi.mock("@/providers/onboarding-provider", () => ({ OnboardingProvider: anotador("onboarding") }));
vi.mock("@/providers/zona-de-la-organizacion-provider", () => ({
  ZonaDeLaOrganizacionProvider: ({ zona, children }: { zona: unknown; children?: ReactNode }) => {
    sim.recibido.zona = zona;
    return createElement(Fragment, null, children);
  },
}));
vi.mock("@/components/onboarding/tour-runner", () => ({ TourRunner: nada }));
vi.mock("@/components/platform/aviso-clave-ia", () => ({ AvisoClaveIa: nada }));

import PlatformRouteLayout from "../(platform)/layout";

const PANTALLA = "Pantalla del módulo";

async function render(): Promise<string> {
  const arbol = await PlatformRouteLayout({ children: createElement("p", null, PANTALLA) });
  return renderToStaticMarkup(arbol);
}

beforeEach(() => {
  sim.pathname = "/dashboard";
  sim.fallas = {};
  sim.recibido = {};
  sim.reportes = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("sin fallas", () => {
  it("cada provider recibe lo que se leyó y no se registra nada", async () => {
    expect(await render()).toContain(PANTALLA);
    expect(sim.recibido).toEqual({ holding: HOLDING, onboarding: ONBOARDING, zona: "America/Lima" });
    expect(sim.reportes).toEqual([]);
  });
});

describe("⭐ lecturas degradables: si fallan, la plataforma sigue y queda registrado", () => {
  it("holding caído → cuenta sin holding (sin selector de negocios)", async () => {
    sim.fallas.holding = new Error("fetch failed");
    expect(await render()).toContain(PANTALLA);
    expect(sim.recibido.holding).toEqual({ isHolding: false, viewingBusiness: false, businesses: [] });
    expect(sim.reportes).toEqual([
      { error: sim.fallas.holding, contexto: { lectura: "layout-plataforma:holding" } },
    ]);
  });

  it("onboarding caído → sin checklist y con todos los tours vistos (no se lanza ninguno)", async () => {
    sim.fallas.onboarding = { message: "boom en la tabla", code: "XX000" };
    expect(await render()).toContain(PANTALLA);
    expect(sim.recibido.onboarding).toEqual({ state: null, toursSeen: [...TOUR_IDS] });
    expect(sim.reportes).toEqual([
      { error: sim.fallas.onboarding, contexto: { lectura: "layout-plataforma:onboarding" } },
    ]);
  });

  it("zona caída → zona por defecto (null)", async () => {
    sim.fallas.zona = new Error("fetch failed");
    expect(await render()).toContain(PANTALLA);
    expect(sim.recibido.zona).toBeNull();
    expect(sim.reportes).toEqual([
      { error: sim.fallas.zona, contexto: { lectura: "layout-plataforma:zona" } },
    ]);
  });

  it("las tres caídas a la vez → la plataforma se dibuja igual y hay tres registros", async () => {
    sim.fallas = { holding: new Error("a"), onboarding: new Error("b"), zona: new Error("c") };
    expect(await render()).toContain(PANTALLA);
    expect(sim.reportes).toHaveLength(3);
  });

  it("el permiso se sigue aplicando con una lectura degradada", async () => {
    sim.fallas.holding = new Error("fetch failed");
    sim.pathname = "/finance";
    const html = await render();
    expect(html).toContain("No tenés acceso a Finanzas");
    expect(html).not.toContain(PANTALLA);
  });
});

describe("⭐ lo que no se degrada", () => {
  it("permisos caídos → el layout lanza (pantalla de error), nunca abre el acceso", async () => {
    const error = new Error("fetch failed");
    sim.fallas.permisos = error;
    await expect(render()).rejects.toBe(error);
    expect(sim.reportes).toEqual([]);
  });

  it("una cuenta desactivada en la lectura de onboarding se relanza", async () => {
    const error = new ErrorEsperable("Tu cuenta está desactivada.");
    sim.fallas.onboarding = error;
    await expect(render()).rejects.toBe(error);
    expect(sim.reportes).toEqual([]);
  });

  it("el error de ruta dinámica de Next se relanza y no se registra", async () => {
    const error = new DynamicServerError("Route usó `cookies`");
    sim.fallas.zona = error;
    await expect(render()).rejects.toBe(error);
    expect(sim.reportes).toEqual([]);
  });
});
