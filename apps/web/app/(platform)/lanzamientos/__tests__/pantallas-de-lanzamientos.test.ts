/**
 * SCRUM-544 · ⭐ Lista y Detalle de lanzamientos punta a punta, con la función
 * de lectura real y el escenario de la organización de demo: página, `leer`,
 * escenario y markup, sin base.
 *
 * Mocks: `server-only`, la organización activa, la zona, Sentry y el
 * escenario (sólo para probar las tres variantes).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const DEMO = "11111111-2222-4333-8444-555555555555";
const REAL = "99999999-8888-4777-8666-555555555555";

const sim = vi.hoisted(() => ({
  organizacionActiva: null as string | null,
  variante: null as null | "organic" | "paid" | "paid_plus",
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
// Sin tipos del escenario: fuera de lib/webinar/vistas sólo se importan leer,
// contratos y dato (las-pantallas-leen-de-su-funcion.test.ts).
type Escenario = (...args: unknown[]) => { lanzamientos: Record<string, unknown>[] };
vi.mock("@/lib/webinar/vistas/escenario-de-ejemplo", async (original) => {
  const real = (await original()) as Record<string, unknown> & { escenarioDeEjemplo: Escenario };
  return {
    ...real,
    escenarioDeEjemplo: (...args: unknown[]) => {
      const filas = real.escenarioDeEjemplo(...args);
      if (!sim.variante) return filas;
      return { ...filas, lanzamientos: filas.lanzamientos.map((l) => ({ ...l, variant: sim.variante! })) };
    },
  };
});

import { getPageMeta } from "@/lib/navigation/page-meta";
import { PASOS_POR_VARIANTE } from "@/lib/webinar/vistas/contratos";
import LanzamientosPage from "../page";
import DetalleDelLanzamientoPage from "../[id]/page";
import ConfiguracionPage from "../[id]/configuracion/page";
import NuevoLanzamientoPage from "../nuevo/page";

async function lista(): Promise<string> {
  return renderToStaticMarkup(await LanzamientosPage());
}
async function detalle(id: string): Promise<string> {
  return renderToStaticMarkup(await DetalleDelLanzamientoPage({ params: Promise.resolve({ id }) }));
}
function primerLanzamiento(html: string): string {
  const m = /data-lanzamiento="[^"]+"><a[^>]*href="\/lanzamientos\/([^"]+)"/.exec(html);
  expect(m, "no hay enlace al detalle").not.toBeNull();
  return m![1]!;
}

beforeEach(() => {
  vi.stubEnv("WEBINAR_DEMO_ORGANIZATION_ID", DEMO);
  sim.organizacionActiva = DEMO;
  sim.variante = null;
});
afterEach(() => vi.unstubAllEnvs());

describe("⭐ lista de la organización de demo", () => {
  it("los dos lanzamientos, el activo primero, con sus números y enlace al detalle", async () => {
    const html = await lista();
    expect(html).toContain('data-cartel="datos-de-ejemplo"');
    expect(html.match(/data-lanzamiento=/g)).toHaveLength(2);
    expect(html.indexOf("Activo")).toBeLessThan(html.indexOf("Cerrado"));
    expect(html).toMatch(/data-celda="Registrados" data-estado="medido"/);
  });
});

describe("⭐ detalle de la organización de demo", () => {
  it("embudo con paso entre etapas y fuente, cortes por origen y anuncio, evolución diaria y sesiones", async () => {
    const html = await detalle(primerLanzamiento(await lista()));
    expect(html).toContain('data-cartel="datos-de-ejemplo"');
    expect(html).toMatch(/data-paso="asistieron"[^]*?data-paso-desde="registrados"/);
    expect(html).toContain("Fuente: Landing");
    expect(html).toContain('data-corte="origen"');
    expect(html).toContain('data-corte="anuncio"');
    expect(html).toMatch(/data-serie="Registros por día" data-estado="medido"/);
    expect(html).toMatch(/data-dia="\d{4}-\d{2}-\d{2}"/);
    expect(html).toContain('aria-label="Sesiones"');
  });

  it("⭐ cada estado sin medir muestra su texto y su acción", async () => {
    // Pago +++ para que el VIP (Commas con error) esté en el embudo.
    sim.variante = "paid_plus";
    const html = await detalle(primerLanzamiento(await lista()));
    // GoHighLevel sin conectar (confirmaron el email), Meta desactualizado, Commas con error, falta el minuto de la oferta.
    expect(html).toContain("Conectá GoHighLevel");
    expect(html).toContain("Ver Meta Ads");
    expect(html).toContain("Reconectá Commas");
    expect(html).toContain("Completá la configuración del lanzamiento");
    expect(html).toMatch(/data-serie="Inversión por día" data-estado="sin_fuente"/);
  });

  it.each(["organic", "paid", "paid_plus"] as const)("⭐ variante %s: sus etapas, en orden", async (variante) => {
    sim.variante = variante;
    const html = await detalle(primerLanzamiento(await lista()));
    const pasos = [...html.matchAll(/data-paso="([a-z_]+)"/g)].map((m) => m[1]);
    expect(pasos).toEqual(PASOS_POR_VARIANTE[variante]);
    if (variante === "organic") {
      expect(html).not.toContain('data-numero="Inversión en anuncios"');
      expect(html).not.toContain("Inversión por día");
    } else {
      expect(html).toContain('data-numero="Inversión en anuncios"');
    }
  });

  it("un lanzamiento que no existe: el 404 de la app", async () => {
    await expect(detalle("99999999-0000-4000-8000-000000000000")).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  });
});

describe("⭐ organización que no es la de demo", () => {
  beforeEach(() => {
    sim.organizacionActiva = REAL;
  });

  it("la lista muestra «Sin fuente» con su motivo; ni filas ni estado vacío", async () => {
    const html = await lista();
    expect(html).toContain("Sin fuente");
    expect(html).not.toContain("data-lanzamiento=");
    expect(html).not.toContain("Todavía no hay lanzamientos.");
  });

  it("el detalle da el 404 de la app", async () => {
    await expect(detalle("abc")).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });
});

describe("títulos (getPageMeta)", () => {
  it("/lanzamientos y /lanzamientos/<id>", () => {
    expect(getPageMeta("/lanzamientos").title).toBe("Lanzamientos");
    expect(getPageMeta("/lanzamientos/abc").title).toBe("Detalle del lanzamiento");
  });
});

async function configuracion(id: string): Promise<string> {
  return renderToStaticMarkup(await ConfiguracionPage({ params: Promise.resolve({ id }) }));
}

describe("⭐ SCRUM-529 · crear y configurar", () => {
  it("la lista tiene «Crear un lanzamiento» y el detalle enlaza a su Configuración", async () => {
    const html = await lista();
    expect(html).toMatch(/href="\/lanzamientos\/nuevo"[^>]*>Crear un lanzamiento</);
    const id = primerLanzamiento(html);
    expect(await detalle(id)).toContain(`href="/lanzamientos/${id}/configuracion"`);
  });

  it("⭐ «Completá la configuración» del detalle lleva a la Configuración", async () => {
    const id = primerLanzamiento(await lista());
    const enlaces = (await detalle(id)).match(/<a [^>]*data-accion="configuracion"[^>]*>/g) ?? [];
    expect(enlaces.length).toBeGreaterThan(0);
    for (const enlace of enlaces) expect(enlace).toContain(`href="/lanzamientos/${id}/configuracion"`);
  });

  it("⭐ la Configuración muestra lo que falta cargar, el formulario con los datos y las sesiones, campañas y productos", async () => {
    const id = primerLanzamiento(await lista());
    const html = await configuracion(id);
    expect(html).toContain('data-cartel="datos-de-ejemplo"');
    expect(html).toContain("data-faltantes");
    expect(html).toContain('data-faltante="segundo_de_la_oferta"');
    expect(html).toContain('data-formulario="editar"');
    expect(html).toMatch(/data-sesion-formulario="0"/);
    expect(html).toContain("Oferta principal");
    expect(html).toContain("Guardar cambios");
  });

  it("la Configuración de un lanzamiento que no existe: el 404 de la app", async () => {
    await expect(configuracion("99999999-0000-4000-8000-000000000000")).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  });

  it("/lanzamientos/nuevo: el formulario vacío para crear", () => {
    const html = renderToStaticMarkup(NuevoLanzamientoPage());
    expect(html).toContain('data-formulario="crear"');
    expect(html).toContain("Crear lanzamiento");
    expect(html).toContain("Todavía no hay sesiones.");
  });

  it("títulos", () => {
    expect(getPageMeta("/lanzamientos/nuevo").title).toBe("Nuevo lanzamiento");
    expect(getPageMeta("/lanzamientos/abc/configuracion").title).toBe("Configuración del lanzamiento");
  });
});
