/**
 * SCRUM-543 · ⭐ Inicio punta a punta, con la función de lectura real y el
 * escenario de la organización de demo: página, `leer`, escenario y markup,
 * sin base. El escenario llega sólo a través de `leer` (regla de SCRUM-542).
 *
 * Mocks: `server-only`, la organización activa, la zona, los permisos y Sentry.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const DEMO = "11111111-2222-4333-8444-555555555555";
const REAL = "99999999-8888-4777-8666-555555555555";

const sim = vi.hoisted(() => ({
  organizacionActiva: null as string | null,
  permisos: { isFounder: true, hasRoleConfigured: true, modules: {} as Record<string, string> } as {
    isFounder: boolean;
    hasRoleConfigured: boolean;
    modules: Record<string, string>;
  } | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/bootstrap", async () => {
  const { SIN_ORGANIZACION_VINCULADA } = await vi.importActual<typeof import("@/lib/auth/bootstrap")>(
    "@/lib/auth/bootstrap"
  );
  return {
    SIN_ORGANIZACION_VINCULADA,
    requireOrganizationId: async () => {
      if (sim.organizacionActiva === null) throw new Error(SIN_ORGANIZACION_VINCULADA);
      return sim.organizacionActiva;
    },
  };
});
vi.mock("@/lib/auth/get-current-permissions", () => ({
  getCurrentUserPermissions: async () => {
    if (sim.permisos === null) throw new Error("Auth caído");
    return sim.permisos;
  },
}));
vi.mock("@/lib/fechas/organizacion-activa", () => ({ zonaDeLaOrganizacionActiva: async () => null }));
vi.mock("@/lib/observability/reportar-falla", () => ({ reportarFalla: vi.fn() }));

import { SIN_ORGANIZACION_VINCULADA } from "@/lib/auth/bootstrap";
import { getPageMeta } from "@/lib/navigation/page-meta";
import InicioPage from "../page";

async function inicio(): Promise<string> {
  return renderToStaticMarkup(await InicioPage());
}

beforeEach(() => {
  vi.stubEnv("WEBINAR_DEMO_ORGANIZATION_ID", DEMO);
  sim.organizacionActiva = DEMO;
  sim.permisos = { isFounder: true, hasRoleConfigured: true, modules: {} };
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("⭐ organización de demo: el escenario de ejemplo", () => {
  it("el lanzamiento activo (Pago, cierra en 3 días) con el cartel de ejemplo", async () => {
    const html = await inicio();
    expect(html).toContain('data-cartel="datos-de-ejemplo"');
    expect(html).toMatch(/data-cuenta-regresiva="true"[^>]*>Cierra en 3 días</);
    expect(html).toContain("Pago");
  });

  it("⭐ los cinco estados del escenario se ven: medido, sin fuente, falta configurar, desactualizado y error", async () => {
    const html = await inicio();
    for (const estado of ["medido", "sin_fuente", "falta_configurar", "desactualizado", "error"]) {
      expect(html, estado).toContain(`data-estado="${estado}"`);
    }
  });

  it("las fuentes caídas del escenario (Commas con error, GoHighLevel sin conectar) aparecen antes que las al día", async () => {
    const html = await inicio();
    expect(html.indexOf('data-fuente="commas"')).toBeLessThan(html.indexOf('data-fuente="landing"'));
    expect(html.indexOf('data-fuente="ghl"')).toBeLessThan(html.indexOf('data-fuente="landing"'));
  });

  it("los pendientes del equipo enlazan a Leads con su filtro", async () => {
    const html = await inicio();
    expect(html).toMatch(/href="\/leads\?filtro=levanto_la_mano_sin_contactar&amp;lanzamiento=[^"]+"/);
  });

  it("⭐ revisión de #153: con un rol sin Ventas, los pendientes van sin enlace a Leads", async () => {
    sim.permisos = { isFounder: false, hasRoleConfigured: true, modules: { sales: "none", dashboard: "read" } };
    const html = await inicio();
    expect(html).not.toContain('href="/leads?');
    expect(html).toContain('data-pendiente="levanto_la_mano_sin_contactar"');
  });

  it("si los permisos no se pueden leer, Inicio se ve igual, sin el enlace a Leads", async () => {
    sim.permisos = null;
    const html = await inicio();
    expect(html).toContain('data-cuenta-regresiva="true"');
    expect(html).not.toContain('href="/leads?');
  });
});

describe("⭐ organización que no es la de demo", () => {
  it("muestra «Sin fuente» con su motivo: ni números, ni estado vacío, ni cartel", async () => {
    sim.organizacionActiva = REAL;
    const html = await inicio();
    expect(html).toContain("Sin fuente");
    expect(html).not.toContain("data-numero");
    expect(html).not.toContain("No hay un lanzamiento activo.");
    expect(html).not.toContain("datos-de-ejemplo");
  });
});

describe("cuenta sin organización", () => {
  it("rechaza con SIN_ORGANIZACION_VINCULADA", async () => {
    sim.organizacionActiva = null;
    await expect(inicio()).rejects.toThrow(SIN_ORGANIZACION_VINCULADA);
  });
});

describe("título (getPageMeta)", () => {
  it("/inicio: «Inicio»", () => {
    expect(getPageMeta("/inicio")).toEqual({ title: "Inicio", subtitle: undefined });
  });
});
