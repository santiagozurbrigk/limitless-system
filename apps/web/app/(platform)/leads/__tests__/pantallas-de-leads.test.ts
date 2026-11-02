/**
 * SCRUM-545 · ⭐ Las dos páginas de Leads punta a punta, con la función de
 * lectura real y el escenario de la organización de demo (DT-21): página,
 * `leer`, escenario y markup, sin base. El escenario llega sólo a través de
 * `leer` (CD-14); el id del lead se saca del `href` de la fila.
 *
 * Mocks: `server-only`, la organización activa, la zona, Sentry y el toast del
 * envoltorio cliente del panel. `leerFichaDelLead` se reemplaza sólo en el caso
 * `{ ok: false }`.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const DEMO = "11111111-2222-4333-8444-555555555555";
const REAL = "99999999-8888-4777-8666-555555555555";

const sim = vi.hoisted(() => ({
  organizacionActiva: null as string | null,
  fichaQueFalla: null as string | null,
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
vi.mock("@/lib/fechas/organizacion-activa", () => ({ zonaDeLaOrganizacionActiva: async () => null }));
vi.mock("@/lib/observability/reportar-falla", () => ({ reportarFalla: vi.fn() }));
vi.mock("@/providers/toast-provider", () => ({ useToast: () => ({ push: () => undefined }) }));
vi.mock("@/lib/webinar/vistas/leer", async (original) => {
  const real = await original<typeof import("@/lib/webinar/vistas/leer")>();
  return {
    ...real,
    leerFichaDelLead: (...args: Parameters<typeof real.leerFichaDelLead>) =>
      sim.fichaQueFalla !== null
        ? Promise.resolve({ ok: false as const, motivo: sim.fichaQueFalla })
        : real.leerFichaDelLead(...args),
  };
});

import { SIN_ORGANIZACION_VINCULADA } from "@/lib/auth/bootstrap";
import { getPageMeta } from "@/lib/navigation/page-meta";
import LeadsPage from "../page";
import FichaDelLeadPage from "../[id]/page";

async function leads(params: Record<string, string> = {}): Promise<string> {
  return renderToStaticMarkup(await LeadsPage({ searchParams: Promise.resolve(params) }));
}

async function ficha(id: string, params: Record<string, string> = {}): Promise<string> {
  return renderToStaticMarkup(
    await FichaDelLeadPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve(params) })
  );
}

/** El primer enlace de fila a una ficha: id del lead y lanzamiento. */
function primeraFila(html: string): { id: string; lanzamiento: string } {
  const m = /<tr class="[^"]*" data-lead="[^"]+"><td[^>]*><a[^>]*href="\/leads\/([^"?]+)\?lanzamiento=([^"&]+)"/.exec(html);
  expect(m, "no hay fila con enlace a la ficha").not.toBeNull();
  return { id: m![1]!, lanzamiento: m![2]! };
}

beforeEach(() => {
  vi.stubEnv("WEBINAR_DEMO_ORGANIZATION_ID", DEMO);
  sim.organizacionActiva = DEMO;
  sim.fichaQueFalla = null;
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("⭐ organización de demo: de la lista filtrada al botón de avance (AC-3, AC-7, AC-11)", () => {
  it("/leads?filtro=levanto_la_mano_sin_contactar abre con el filtro aplicado, la fila enlaza a la ficha y la ficha tiene el botón", async () => {
    const html = await leads({ filtro: "levanto_la_mano_sin_contactar" });
    expect(html).toContain('data-cartel="datos-de-ejemplo"');
    expect(html).toMatch(/aria-current="page" data-filtro="levanto_la_mano_sin_contactar"/);
    expect(html.match(/aria-current="page" data-filtro=/g)).toHaveLength(1);
    expect(html).toMatch(/data-total="true">\d+ leads?</);
    expect(html).toContain("<table");

    const { id, lanzamiento } = primeraFila(html);
    const laFicha = await ficha(id, { lanzamiento });
    expect(laFicha).toContain('data-cartel="datos-de-ejemplo"');
    expect(laFicha).toContain("Estas acciones son de ejemplo: no se guardan.");
    expect(laFicha).toMatch(/<button[^>]*data-accion="marcar-avance"[^>]*>Marcar como Contactado<\/button>/);
    expect(laFicha).not.toContain("aria-haspopup");
  });

  it("sin filtro en la URL: «Todos» aplicado", async () => {
    expect(await leads()).toMatch(/aria-current="page" data-filtro="todos"/);
  });

  it("un lead que no existe: el 404 de la app (AC-8)", async () => {
    await expect(ficha("99999999-0000-4000-8000-000000000000")).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  });
});

describe("⭐ organización que no es la de demo (AC-4, AC-13)", () => {
  beforeEach(() => {
    sim.organizacionActiva = REAL;
  });

  it("Leads muestra sin_fuente con su motivo, sin cero ni filas", async () => {
    const html = await leads({ filtro: "levanto_la_mano_sin_contactar" });
    expect(html).toContain("Sin fuente");
    expect(html).toContain('data-estado="sin_fuente"');
    expect(html).not.toContain(">0<");
    expect(html).not.toContain("<table");
    expect(html).not.toContain("datos-de-ejemplo");
  });

  it("la ficha da el 404 de la app", async () => {
    await expect(ficha("abc")).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });
});

describe("la ficha que no se pudo leer (AC-8)", () => {
  it("{ ok: false }: el error de carga con el motivo", async () => {
    sim.fichaQueFalla = "La base no respondió.";
    const html = await ficha("abc");
    expect(html).toContain('role="alert"');
    expect(html).toContain("No pudimos cargar esta ficha.");
    expect(html).toContain("La base no respondió.");
  });
});

describe("⭐ cuenta sin organización (QA-1, DT-28)", () => {
  beforeEach(() => {
    sim.organizacionActiva = null;
  });

  it("las dos páginas rechazan con SIN_ORGANIZACION_VINCULADA y no dibujan sin_fuente", async () => {
    await expect(leads()).rejects.toThrow(SIN_ORGANIZACION_VINCULADA);
    await expect(ficha("abc")).rejects.toThrow(SIN_ORGANIZACION_VINCULADA);
  });
});

describe("título y vuelta (getPageMeta)", () => {
  it("/leads: «Leads», sin vuelta; /leads/<id>: «Ficha del lead», vuelve a Leads", () => {
    expect(getPageMeta("/leads")).toEqual({ title: "Leads", subtitle: undefined });
    expect(getPageMeta("/leads/abc")).toEqual({
      title: "Ficha del lead",
      subtitle: undefined,
      back: { href: "/leads", label: "Leads" },
    });
  });
});
