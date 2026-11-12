import { describe, expect, it } from "vitest";
import {
  COLUMNAS_DE_LEADS,
  RUTA_PARA_CREAR_LANZAMIENTO,
  SIGUIENTE_ETAPA,
  TEXTO_ORIGEN_VACIO,
  formatearInstante,
  nombreVisible,
  siguienteEtapa,
  textoDelOrigen,
} from "@/lib/webinar/leads/config";
import { ETAPAS_DEL_LEAD, type EtapaDelLead } from "@/lib/webinar/vistas/contratos";

/**
 * SCRUM-545 · El módulo único de etiquetas, columnas y mapa de avance de Leads
 * (DT-13, DT-14).
 */

describe("siguienteEtapa: el mapa explícito de avance (AC-9b)", () => {
  // Tabla de las 12 etapas: sólo `raised_hand` y `contacted` tienen paso.
  const ESPERADO: Record<EtapaDelLead, EtapaDelLead | null> = {
    registered: null,
    attended: null,
    stayed_to_offer: null,
    raised_hand: "contacted",
    contacted: "qualified",
    qualified: null,
    disqualified: null,
    call_booked: null,
    call_attended: null,
    call_no_show: null,
    purchased: null,
    refunded: null,
  };

  it("la tabla cubre las 12 etapas del contrato", () => {
    expect(Object.keys(ESPERADO).sort()).toEqual([...ETAPAS_DEL_LEAD].sort());
  });

  for (const etapa of ETAPAS_DEL_LEAD) {
    it(`${etapa} -> ${ESPERADO[etapa] ?? "sin paso"}`, () => {
      expect(siguienteEtapa(etapa)).toBe(ESPERADO[etapa]);
    });
  }

  it("el mapa tiene exactamente los dos pasos", () => {
    expect(SIGUIENTE_ETAPA).toEqual({ raised_hand: "contacted", contacted: "qualified" });
  });
});

describe("nombreVisible", () => {
  it("el nombre si lo hay", () => {
    expect(nombreVisible({ nombre: "Ana Pérez", email: "ana@correo.com" })).toBe("Ana Pérez");
  });

  it("el email si el nombre es null", () => {
    expect(nombreVisible({ nombre: null, email: "ana@correo.com" })).toBe("ana@correo.com");
  });
});

describe("textoDelOrigen", () => {
  const vacio = { utmSource: null, utmMedium: null, utmCampaign: null, utmContent: null };

  it("el utm_source si lo hay", () => {
    expect(textoDelOrigen({ ...vacio, utmSource: "instagram" })).toBe("instagram");
  });

  it("sin utm_source: «Directo o sin dato»", () => {
    expect(textoDelOrigen(vacio)).toBe("Directo o sin dato");
    expect(TEXTO_ORIGEN_VACIO).toBe("Directo o sin dato");
  });
});

describe("formatearInstante", () => {
  const ISO = "2026-11-02T03:30:00.000Z";

  it("usa la zona pedida", () => {
    expect(formatearInstante(ISO, "UTC")).toBe("02/11/2026 03:30");
    expect(formatearInstante(ISO, "America/Lima")).toBe("01/11/2026 22:30");
  });

  it("sin zona o con una inventada, la de por defecto (Buenos Aires)", () => {
    expect(formatearInstante(ISO, null)).toBe("02/11/2026 00:30");
    expect(formatearInstante(ISO, "Marte/Olympus")).toBe("02/11/2026 00:30");
  });

  it("un texto que no es un instante vuelve tal cual (no inventa una fecha)", () => {
    expect(formatearInstante("no-es-fecha", "UTC")).toBe("no-es-fecha");
  });
});

describe("columnas y ruta de creación", () => {
  it("el orden de las columnas de la tabla", () => {
    expect(COLUMNAS_DE_LEADS.map((c) => c.etiqueta)).toEqual([
      "Lead",
      "Etapa",
      "Origen",
      "Responsable",
      "Último contacto",
    ]);
  });

  it("SCRUM-529: la ruta para crear un lanzamiento es la pantalla de creación", () => {
    expect(RUTA_PARA_CREAR_LANZAMIENTO).toBe("/lanzamientos/nuevo");
  });
});
