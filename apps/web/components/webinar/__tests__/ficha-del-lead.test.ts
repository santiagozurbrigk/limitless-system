/**
 * SCRUM-545 · La ficha del lead (AC-5, AC-7). El envoltorio cliente del panel
 * usa `useToast`, que lanza fuera de `ToastProvider`: acá se reemplaza por uno
 * que sólo anota lo que recibe. El panel en sí se prueba aparte.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../panel-de-venta-cliente", () => ({
  PanelDeVentaCliente: (props: { leadId: string; launchId: string }) =>
    createElement("div", { "data-panel": `${props.leadId}|${props.launchId}` }),
}));

import type { VistaFichaDelLead } from "@/lib/webinar/vistas/contratos";
import { conError, medido, sinFuente } from "@/lib/webinar/vistas/dato";
import { FichaDelLead } from "../ficha-del-lead";

const AHORA = "2026-11-02T12:00:00.000Z";
const LEAD = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const NOV = { id: "8f0e7c52-3a1b-4c6d-9e2f-1a2b3c4d5e6f", nombre: "Webinar de noviembre", estado: "active" as const };
const OCT = { id: "9a0e7c52-3a1b-4c6d-9e2f-1a2b3c4d5e6f", nombre: "Webinar de octubre", estado: "closed" as const };
const SOFIA = { userId: "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e", nombre: "Sofía" };
const SIN_ORIGEN = { utmSource: null, utmMedium: null, utmCampaign: null, utmContent: null };

function vista(cambios: Partial<VistaFichaDelLead> = {}): VistaFichaDelLead {
  return {
    esEjemplo: true,
    lead: { id: LEAD, nombre: "Ana Pérez", email: "ana@correo.com", telefono: "+54 9 11 5555-0000", primeraVezAt: AHORA },
    whatsappUrl: "https://wa.me/5491155550000",
    registros: [
      { lanzamiento: NOV, registradoAt: AHORA, origen: { ...SIN_ORIGEN, utmSource: "instagram" }, calificacion: "Facturo más de 10k" },
      { lanzamiento: OCT, registradoAt: "2026-10-01T12:00:00.000Z", origen: SIN_ORIGEN, calificacion: null },
    ],
    lanzamientoElegido: NOV,
    lineaDeTiempo: medido(
      [
        { id: "ev-1", launchId: NOV.id, tipo: "registered", occurredAt: AHORA, fuente: "landing", cargadoPor: null, sesionId: null },
        { id: "ev-2", launchId: NOV.id, tipo: "contacted", occurredAt: AHORA, fuente: "manual", cargadoPor: SOFIA, sesionId: null },
      ],
      "calculado",
      AHORA
    ),
    avisosDeFuentes: [
      { fuente: "zoom", state: "sin_fuente", reason: "Zoom sin conectar: no sabemos si asistió.", ultimaLecturaAt: null },
    ],
    estadoDeVenta: medido({ etapa: "raised_hand", responsable: null, ultimoContactoAt: null }, "manual", AHORA),
    notas: medido([], "manual", AHORA),
    compras: medido(
      [
        { eventoId: "c-1", launchId: NOV.id, producto: "Programa", monto: null, moneda: "USD", estado: "cobrada", fuente: "whop", occurredAt: AHORA },
        { eventoId: "c-2", launchId: NOV.id, producto: "VIP", monto: 97, moneda: "USD", estado: "reembolsada", fuente: "whop", occurredAt: AHORA },
      ],
      "whop",
      AHORA
    ),
    equipo: [SOFIA],
    ...cambios,
  };
}

const render = (v: VistaFichaDelLead) => renderToStaticMarkup(createElement(FichaDelLead, { vista: v }));

describe("contacto y WhatsApp (AC-7)", () => {
  it("con teléfono: el enlace de WhatsApp tal cual viene del contrato", () => {
    const html = render(vista());
    expect(html).toContain("Ana Pérez");
    expect(html).toContain("ana@correo.com");
    expect(html).toMatch(
      /<a href="https:\/\/wa\.me\/5491155550000" target="_blank" rel="noopener noreferrer"[^>]*>.*Escribir por WhatsApp<\/a>/
    );
    expect(html).not.toContain("No dejó teléfono");
  });

  it("sin teléfono: «No dejó teléfono» y sin enlace", () => {
    const html = render(vista({ whatsappUrl: null, lead: { ...vista().lead, telefono: null } }));
    expect(html).toContain("No dejó teléfono");
    expect(html).not.toContain("wa.me");
  });

  it("sin nombre: el email como título", () => {
    expect(render(vista({ lead: { ...vista().lead, nombre: null } }))).toContain(
      '<h2 class="text-lg font-semibold">ana@correo.com</h2>'
    );
  });
});

describe("registros, línea de tiempo y avisos de fuentes (AC-7)", () => {
  const html = render(vista());

  it("cada registro con su lanzamiento, origen y calificación", () => {
    expect(html).toContain("Webinar de noviembre");
    expect(html).toContain("Webinar de octubre");
    expect(html).toContain("Origen: instagram");
    expect(html).toContain("Origen: Directo o sin dato");
    expect(html).toContain("Calificación: Facturo más de 10k");
  });

  it("⭐ cada evento con la etiqueta de su fuente y quién lo cargó", () => {
    expect(html).toContain("Se registró");
    expect(html).toContain("Fuente: Landing");
    expect(html).toContain("Contactado");
    expect(html).toContain("Fuente: Equipo");
    expect(html).toContain("Cargado por Sofía");
  });

  it("los avisos de fuentes que no están al día", () => {
    expect(html).toContain("Zoom");
    expect(html).toContain("Zoom sin conectar: no sabemos si asistió.");
    expect(html).toContain('data-estado="sin_fuente"');
  });

  it("una línea de tiempo con error: el estado y el motivo, sin eventos", () => {
    const conFalla = render(vista({ lineaDeTiempo: conError("zoom", "No pudimos leer Zoom.") }));
    expect(conFalla).toContain("No pudimos leer Zoom.");
    expect(conFalla).not.toContain('data-evento="');
  });
});

describe("compras (AC-7, CD-4)", () => {
  it("un monto null no es cero", () => {
    const html = render(vista());
    const programa = html.match(/<li[^>]*data-compra="c-1"[^>]*>.*?<\/li>/)?.[0] ?? "";
    expect(programa).toContain('<span class="font-medium">Programa</span><span>—</span>');
    expect(programa).not.toMatch(/<span>[^<]*\b0\b[^<]*<\/span>/);
    expect(html).toContain("USD 97");
    expect(html).toContain("Reembolsada");
  });

  it("compras sin fuente: el estado, sin lista", () => {
    const html = render(vista({ compras: sinFuente("whop", "Whop sin conectar.") }));
    expect(html).toContain("Whop sin conectar.");
    expect(html).not.toContain('data-compra="');
  });
});

describe("cartel y panel (AC-5, AC-11)", () => {
  it("el cartel de ejemplo arriba de todo", () => {
    const html = render(vista());
    expect(html).toMatch(/^<div[^>]*><div role="status" data-cartel="datos-de-ejemplo"/);
    expect(html.indexOf('data-cartel="datos-de-ejemplo"')).toBeLessThan(html.indexOf("Ana Pérez"));
    expect(render(vista({ esEjemplo: false }))).not.toContain("datos-de-ejemplo");
  });

  it("el panel de venta está, con el lead y el lanzamiento elegido", () => {
    expect(render(vista())).toContain(`data-panel="${LEAD}|${NOV.id}"`);
  });

  it("ficha-del-lead.tsx no tiene hooks, \"use client\" ni acciones (CD-13)", () => {
    const fuente = readFileSync(join(process.cwd(), "components", "webinar", "ficha-del-lead.tsx"), "utf8");
    expect(fuente).not.toMatch(/\buse[A-Z]\w*\(/);
    expect(fuente).not.toContain("use client");
    expect(fuente).not.toContain("actions");
  });
});
