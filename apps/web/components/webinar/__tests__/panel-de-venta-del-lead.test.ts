/**
 * SCRUM-545 · El panel de venta de la ficha (AC-9, AC-9b, AC-11): un solo
 * botón de avance sin menú, avisos de que el cambio es de ejemplo, responsable
 * y notas. Es presentación pura (DT-11): se dibuja con `renderToStaticMarkup`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  agregarNotaLocal,
  aplicarAvance,
  estadoInicial,
  type EstadoLocalDelLead,
} from "@/lib/webinar/leads/estado-local";
import type { EstadoDeVenta, NotaDelLead } from "@/lib/webinar/vistas/contratos";
import { conError, medido, sinFuente, type Dato } from "@/lib/webinar/vistas/dato";
import { PanelDeVentaDelLead } from "../panel-de-venta-del-lead";

const AHORA = "2026-11-02T12:00:00.000Z";
const LANZAMIENTO = "8f0e7c52-3a1b-4c6d-9e2f-1a2b3c4d5e6f";
const SOFIA = { userId: "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e", nombre: "Sofía" };
const TOMAS = { userId: "3c4d5e6f-7a8b-4c9d-8e0f-2a3b4c5d6e7f", nombre: "Tomás" };
const NOTA: NotaDelLead = {
  id: "nota-1",
  launchId: LANZAMIENTO,
  texto: "Pidió que lo llamen a la tarde",
  autor: SOFIA,
  creadaAt: AHORA,
};

function venta(cambios: Partial<EstadoDeVenta> = {}): EstadoDeVenta {
  return { etapa: "raised_hand", responsable: null, ultimoContactoAt: null, ...cambios };
}

function render({
  estadoDeVenta = medido(venta(), "manual", AHORA) as Dato<EstadoDeVenta>,
  notas = medido([NOTA], "manual", AHORA) as Dato<NotaDelLead[]>,
  local,
}: {
  estadoDeVenta?: Dato<EstadoDeVenta>;
  notas?: Dato<NotaDelLead[]>;
  local?: EstadoLocalDelLead | null;
} = {}) {
  const nada = () => {};
  return renderToStaticMarkup(
    createElement(PanelDeVentaDelLead, {
      estadoDeVenta,
      notas,
      equipo: [SOFIA, TOMAS],
      local:
        local !== undefined
          ? local
          : estadoDeVenta.state === "medido"
            ? estadoInicial(estadoDeVenta.value)
            : null,
      borradorDeNota: "",
      ocupado: false,
      alMarcarAvance: nada,
      alAsignarResponsable: nada,
      alCambiarBorrador: nada,
      alAgregarNota: nada,
    })
  );
}

describe("⭐ botón de avance (AC-9b, AC-11)", () => {
  it("levantó la mano: un solo botón «Marcar como Contactado», sin menú", () => {
    const html = render();
    expect(html.match(/data-accion="marcar-avance"/g)).toHaveLength(1);
    expect(html).toMatch(/<button[^>]*data-accion="marcar-avance"[^>]*>Marcar como Contactado<\/button>/);
    expect(html).not.toContain("aria-haspopup");
    expect(html).not.toContain('role="menu"');
    expect(html).not.toContain("<details");
  });

  it("contactado: «Marcar como Calificado»", () => {
    const html = render({ estadoDeVenta: medido(venta({ etapa: "contacted" }), "manual", AHORA) });
    expect(html).toContain(">Marcar como Calificado</button>");
  });

  it("después del avance local, el botón sigue al estado local", () => {
    const local = aplicarAvance(estadoInicial(venta()), "contacted");
    expect(render({ local })).toContain(">Marcar como Calificado</button>");
    expect(render({ local: aplicarAvance(local, "qualified") })).not.toContain("Marcar como");
  });

  it("una etapa sin paso en el mapa no tiene botón", () => {
    for (const etapa of ["registered", "qualified", "call_booked", "purchased"] as const) {
      const html = render({ estadoDeVenta: medido(venta({ etapa }), "manual", AHORA) });
      expect(html, etapa).not.toContain("Marcar como");
      expect(html, etapa).not.toContain('data-accion="marcar-avance"');
    }
  });
});

describe("avisos de ejemplo (AC-9, CD-8)", () => {
  it("el aviso fijo siempre; el de cambio, sólo después de un cambio", () => {
    const antes = render();
    expect(antes).toContain("Estas acciones son de ejemplo: no se guardan.");
    expect(antes).not.toContain("Cambio de ejemplo");

    const despues = render({ local: aplicarAvance(estadoInicial(venta()), "contacted") });
    expect(despues).toContain("Estas acciones son de ejemplo: no se guardan.");
    expect(despues).toMatch(/<p role="status"[^>]*>Cambio de ejemplo: no se guardó y se pierde al recargar\.<\/p>/);
    expect(despues).toContain(">Contactado</div>");
  });
});

describe("responsable y equipo", () => {
  it("sin responsable: la opción «Sin responsable» elegida y el equipo", () => {
    const html = render();
    expect(html).toContain('<option value="" selected="">Sin responsable</option>');
    expect(html).toContain(`<option value="${SOFIA.userId}">Sofía</option>`);
    expect(html).toContain(`<option value="${TOMAS.userId}">Tomás</option>`);
  });

  it("con responsable: elegido", () => {
    const html = render({ estadoDeVenta: medido(venta({ responsable: TOMAS }), "manual", AHORA) });
    expect(html).toContain(`<option value="${TOMAS.userId}" selected="">Tomás</option>`);
  });

  it("sin contacto: «Sin contactar»", () => {
    expect(render()).toContain("Sin contactar");
  });
});

describe("notas", () => {
  it("la nota local primero, marcada de ejemplo; después las del contrato con su autor", () => {
    const local = agregarNotaLocal(estadoInicial(venta()), {
      launchId: LANZAMIENTO,
      texto: "Nota nueva",
      creadaAt: AHORA,
    });
    const html = render({ local });
    expect(html.indexOf('data-nota="local-1"')).toBeGreaterThan(-1);
    expect(html.indexOf('data-nota="local-1"')).toBeLessThan(html.indexOf('data-nota="nota-1"'));
    expect(html).toContain("Nota de ejemplo");
    expect(html).toContain("Pidió que lo llamen a la tarde");
    expect(html).toContain("Sofía · ");
    expect(html).toContain(">Agregar nota</button>");
  });
});

describe("⭐ un Dato sin valor no muestra sus controles (AC-4)", () => {
  it("estado de venta sin fuente: el estado, sin botón ni selector", () => {
    const html = render({ estadoDeVenta: sinFuente("ghl", "GoHighLevel sin conectar.") });
    expect(html).toContain("Sin fuente");
    expect(html).toContain("GoHighLevel sin conectar.");
    expect(html).not.toContain("Marcar como");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("Agregar nota");
  });

  it("notas con error: el estado, sin formulario ni lista", () => {
    const html = render({ notas: conError("manual", "No pudimos leer las notas.") });
    expect(html).toContain("No pudimos leer las notas.");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("Agregar nota");
    expect(html).toContain("Marcar como Contactado");
  });
});

describe("⭐ lectura del fuente (DT-11, CD-13)", () => {
  const dir = join(process.cwd(), "components", "webinar");

  it("panel-de-venta-del-lead.tsx no tiene hooks, \"use client\" ni acciones", () => {
    const fuente = readFileSync(join(dir, "panel-de-venta-del-lead.tsx"), "utf8");
    expect(fuente).not.toMatch(/\buse[A-Z]\w*\(/);
    expect(fuente).not.toContain("use client");
    expect(fuente).not.toContain("actions");
  });

  it("panel-de-venta-cliente.tsx es el envoltorio \"use client\"", () => {
    const fuente = readFileSync(join(dir, "panel-de-venta-cliente.tsx"), "utf8");
    expect(fuente.startsWith('"use client";')).toBe(true);
    expect(fuente).toContain('from "@/app/leads/actions"');
  });
});
