/**
 * SCRUM-545 · La pantalla de Leads: tabla, filtros, buscador, paginación y
 * estados sin medir (AC-1 a AC-6, AC-11). Fixtures a mano con los
 * constructores de `dato.ts` (CD-14).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ETIQUETA_DEL_FILTRO,
  FILTROS_DE_LEADS,
  type FilaDeLead,
  type VistaLeads,
} from "@/lib/webinar/vistas/contratos";
import { conError, medido, sinFuente } from "@/lib/webinar/vistas/dato";
import { PantallaDeLeads } from "../pantalla-de-leads";

const AHORA = "2026-11-02T12:00:00.000Z";
const LANZAMIENTO = { id: "8f0e7c52-3a1b-4c6d-9e2f-1a2b3c4d5e6f", nombre: "Webinar de noviembre", estado: "active" as const };
const OTRO = { id: "9a0e7c52-3a1b-4c6d-9e2f-1a2b3c4d5e6f", nombre: "Webinar de octubre", estado: "closed" as const };
const SIN_ORIGEN = { utmSource: null, utmMedium: null, utmCampaign: null, utmContent: null };

function fila(id: string, cambios: Partial<FilaDeLead> = {}): FilaDeLead {
  return {
    leadId: id,
    nombre: `Persona ${id}`,
    email: `${id}@correo.com`,
    telefono: null,
    etapa: "raised_hand",
    origen: SIN_ORIGEN,
    registradoAt: AHORA,
    responsable: null,
    ultimoContactoAt: null,
    ...cambios,
  };
}

// El orden del contrato no es alfabético a propósito: la pantalla no reordena.
const FILAS: FilaDeLead[] = [
  fila("zeta", { origen: { ...SIN_ORIGEN, utmSource: "instagram" }, responsable: { userId: "u1", nombre: "Sofía" } }),
  fila("alfa", { nombre: null, etapa: "contacted", ultimoContactoAt: "2026-11-01T15:30:00.000Z" }),
  fila("medio", { etapa: "call_booked" }),
];

function vista(cambios: Partial<VistaLeads> = {}): VistaLeads {
  return {
    esEjemplo: true,
    lanzamientos: medido([LANZAMIENTO, OTRO], "landing", AHORA),
    lanzamientoElegido: LANZAMIENTO,
    filtroElegido: "levanto_la_mano_sin_contactar",
    busqueda: "ana",
    filtros: FILTROS_DE_LEADS.map((f, i) => ({
      filtro: f,
      etiqueta: ETIQUETA_DEL_FILTRO[f],
      personas: medido(10 + i, "calculado", AHORA),
    })),
    total: medido(3, "calculado", AHORA),
    filas: medido(FILAS, "landing", AHORA),
    siguienteCursor: null,
    ...cambios,
  };
}

function render(v: VistaLeads, extra: { cursor?: string | null; hrefCrearLanzamiento?: string | null } = {}) {
  return renderToStaticMarkup(
    createElement(PantallaDeLeads, { vista: v, cursor: extra.cursor ?? null, ...("hrefCrearLanzamiento" in extra ? { hrefCrearLanzamiento: extra.hrefCrearLanzamiento } : {}) })
  );
}

/** Los `href` de los enlaces, decodificados del HTML. */
function hrefs(html: string): string[] {
  return [...html.matchAll(/<a [^>]*href="([^"]*)"/g)].map((m) => m[1].replaceAll("&amp;", "&"));
}

describe("tabla (AC-1, AC-11)", () => {
  const html = render(vista());

  it("las columnas y los textos de cada fila", () => {
    for (const columna of ["Lead", "Etapa", "Origen", "Responsable", "Último contacto"]) {
      expect(html).toContain(`>${columna}</th>`);
    }
    expect(html).toContain("Persona zeta");
    expect(html).toContain("Levantó la mano");
    expect(html).toContain("instagram");
    expect(html).toContain("Directo o sin dato");
    expect(html).toContain("Sofía");
    expect(html).toContain("Sin responsable");
  });

  it("nombre null: muestra el email", () => {
    expect(html).toContain("alfa@correo.com");
    expect(html).not.toContain("Persona alfa");
  });

  it("sin contacto: «Sin contactar»; con contacto, la fecha", () => {
    expect(html).toContain("Sin contactar");
    expect(html).toContain('<time dateTime="2026-11-01T15:30:00.000Z">01/11/2026 12:30</time>');
  });

  it("el orden recibido, sin tocar (CD-16)", () => {
    const orden = ["zeta", "alfa", "medio"].map((id) => html.indexOf(`data-lead="${id}"`));
    expect(orden.every((i) => i >= 0)).toBe(true);
    expect([...orden].sort((a, b) => a - b)).toEqual(orden);
  });

  it("⭐ la fila enlaza a la ficha con el lanzamiento, cubriendo toda la fila", () => {
    expect(hrefs(html)).toContain(`/leads/zeta?lanzamiento=${LANZAMIENTO.id}`);
    expect(html).toMatch(/<tr class="[^"]*\brelative\b[^"]*" data-lead="zeta">/);
    expect(html).toMatch(/<a class="[^"]*after:absolute after:inset-0[^"]*" href="\/leads\/zeta\?lanzamiento=/);
  });

  it("el cartel de datos de ejemplo arriba (AC-5)", () => {
    expect(html).toContain('data-cartel="datos-de-ejemplo"');
    expect(html.indexOf("datos-de-ejemplo")).toBeLessThan(html.indexOf("<table"));
    expect(render(vista({ esEjemplo: false }))).not.toContain("datos-de-ejemplo");
  });
});

describe("filtros (AC-2, AC-3)", () => {
  const html = render(vista(), { cursor: "50" });

  it("los 5 filtros con su conteo y su href (sin cursor, con búsqueda y lanzamiento)", () => {
    FILTROS_DE_LEADS.forEach((f, i) => {
      expect(html).toContain(ETIQUETA_DEL_FILTRO[f]);
      const href = `/leads?filtro=${f}&busqueda=ana&lanzamiento=${LANZAMIENTO.id}`;
      expect(hrefs(html)).toContain(href);
      expect(html).toMatch(new RegExp(`data-filtro="${f}"[^>]*>.*?<span class="font-medium" data-conteo="medido">${10 + i}</span>`));
    });
  });

  it("el filtro elegido queda marcado (y sólo ése)", () => {
    expect(html).toMatch(/aria-current="page" data-filtro="levanto_la_mano_sin_contactar"/);
    expect(html.match(/aria-current="page" data-filtro=/g)).toHaveLength(1);
  });

  it("el total del filtro", () => {
    expect(html).toContain("3 leads");
  });

  it("el selector de lanzamiento conserva filtro y búsqueda y vuelve a la primera página", () => {
    expect(hrefs(html)).toContain(
      `/leads?filtro=levanto_la_mano_sin_contactar&busqueda=ana&lanzamiento=${OTRO.id}`
    );
  });
});

describe("⭐ estados sin medir (AC-4)", () => {
  const SIN = "La landing todavía no está conectada.";
  const ERR = "No pudimos leer los registros.";

  it("sin_fuente: estado y motivo, sin cero ni filas", () => {
    const html = render(
      vista({
        esEjemplo: false,
        lanzamientos: sinFuente("landing", SIN),
        lanzamientoElegido: null,
        filtros: FILTROS_DE_LEADS.map((f) => ({ filtro: f, etiqueta: ETIQUETA_DEL_FILTRO[f], personas: sinFuente("landing", SIN) })),
        total: sinFuente("landing", SIN),
        filas: sinFuente("landing", SIN),
      })
    );
    expect(html).toContain("Sin fuente");
    expect(html).toContain(SIN);
    expect(html).not.toContain(">0<");
    expect(html).not.toContain("<table");
    expect(html).not.toContain("leads</p>");
    expect(html).not.toContain("Ningún lead coincide");
    expect(html).toContain('data-conteo="sin_fuente">Sin fuente<');
  });

  it("error: estado y motivo, sin cero ni filas", () => {
    const html = render(
      vista({
        filtros: FILTROS_DE_LEADS.map((f) => ({ filtro: f, etiqueta: ETIQUETA_DEL_FILTRO[f], personas: conError("landing", ERR) })),
        total: conError("landing", ERR),
        filas: conError("landing", ERR),
      })
    );
    expect(html).toContain("Error");
    expect(html).toContain(ERR);
    expect(html).not.toContain(">0<");
    expect(html).not.toContain("<table");
    expect(html).not.toContain("Persona zeta");
  });
});

describe("vacíos (AC-6)", () => {
  it("medido con [] filas: «Ningún lead coincide con este filtro.»", () => {
    const html = render(vista({ total: medido(0, "calculado", AHORA), filas: medido([], "landing", AHORA) }));
    expect(html).toContain("Ningún lead coincide con este filtro.");
    expect(html).not.toContain("<table");
  });

  it("sin lanzamientos y sin ruta (hoy): el texto, sin enlace", () => {
    const html = render(vista({ lanzamientos: medido([], "landing", AHORA), lanzamientoElegido: null }));
    expect(html).toContain("Todavía no hay lanzamientos.");
    expect(html).toContain("Cuando exista uno, sus leads van a aparecer acá.");
    expect(html).not.toContain("Crear un lanzamiento");
    expect(html).not.toContain("<table");
  });

  it("sin lanzamientos y con ruta: el enlace para crear uno", () => {
    const html = render(vista({ lanzamientos: medido([], "landing", AHORA), lanzamientoElegido: null }), {
      hrefCrearLanzamiento: "/lanzamientos/nuevo",
    });
    expect(html).toContain("Crear un lanzamiento");
    expect(hrefs(html)).toContain("/lanzamientos/nuevo");
  });
});

describe("paginación y buscador", () => {
  it("«Siguiente» con el cursor del contrato; sin cursor en la URL no hay «Volver al principio»", () => {
    const html = render(vista({ siguienteCursor: "50" }));
    expect(html).toContain(">Siguiente</a>");
    expect(hrefs(html)).toContain(
      `/leads?filtro=levanto_la_mano_sin_contactar&busqueda=ana&lanzamiento=${LANZAMIENTO.id}&cursor=50`
    );
    expect(html).not.toContain("Volver al principio");
    expect(html).not.toContain("Anterior");
  });

  it("con cursor: «Volver al principio» sin cursor; en la última página no hay «Siguiente»", () => {
    const html = render(vista({ siguienteCursor: null }), { cursor: "50" });
    expect(html).toContain(">Volver al principio</a>");
    expect(hrefs(html)).toContain(`/leads?filtro=levanto_la_mano_sin_contactar&busqueda=ana&lanzamiento=${LANZAMIENTO.id}`);
    expect(html).not.toContain(">Siguiente</a>");
  });

  it("el buscador es un GET a /leads con filtro y lanzamiento ocultos, sin cursor", () => {
    const html = render(vista(), { cursor: "50" });
    const form = html.match(/<form[^>]*>.*?<\/form>/)?.[0] ?? "";
    expect(form).toMatch(/method="get"/);
    expect(form).toMatch(/action="\/leads"/);
    expect(form).toContain('<input type="hidden" name="filtro" value="levanto_la_mano_sin_contactar"/>');
    expect(form).toContain(`<input type="hidden" name="lanzamiento" value="${LANZAMIENTO.id}"/>`);
    expect(form).not.toContain('name="cursor"');
    expect(form).toMatch(/name="busqueda"[^>]*value="ana"|value="ana"[^>]*name="busqueda"/);
  });
});

describe("lectura del fuente (CD-13)", () => {
  it("pantalla, filtros, tabla y avisos no tienen hooks, \"use client\" ni acciones", () => {
    for (const archivo of ["pantalla-de-leads.tsx", "filtros-de-leads.tsx", "tabla-de-leads.tsx", "aviso-de-estado.tsx"]) {
      const fuente = readFileSync(join(process.cwd(), "components", "webinar", archivo), "utf8");
      expect(fuente, archivo).not.toMatch(/\buse[A-Z]\w*\(/);
      expect(fuente, archivo).not.toContain("use client");
      expect(fuente, archivo).not.toContain("actions");
    }
  });
});
