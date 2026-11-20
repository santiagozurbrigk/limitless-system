/**
 * SCRUM-543 · Inicio de Limitless Webinars: textos del cierre, formatos y el
 * aviso de registros que dejan de llegar. Fixtures a mano con los
 * constructores de `dato.ts`.
 */
import { describe, expect, it } from "vitest";
import type { EstadoDeFuente, InicioDelLanzamientoActivo } from "@/lib/webinar/vistas/contratos";
import { conError, medido, sinFuente } from "@/lib/webinar/vistas/dato";
import {
  avisoDeRegistros,
  formatearMonto,
  formatearTasa,
  formatearVeces,
  fuentesConProblemas,
  fuentesOrdenadas,
  textoDelCierre,
} from "../presentacion";

const AHORA = "2026-11-05T12:00:00.000Z";

const LANDING_OK: EstadoDeFuente = { fuente: "landing", state: "medido", reason: null, ultimaLecturaAt: AHORA };

function inicio(cambios: Partial<InicioDelLanzamientoActivo> = {}): InicioDelLanzamientoActivo {
  return {
    lanzamiento: {
      id: "l1",
      nombre: "Webinar de noviembre",
      variante: "paid",
      estado: "active",
      moneda: "USD",
      precioDeLaOferta: 997,
      captaDesde: "2026-10-28",
      cierraEl: "2026-11-08",
      cerradoAt: null,
    },
    diasParaElCierre: 3,
    proximaSesion: null,
    registrados: medido(210, "landing", AHORA),
    registradosUltimas24h: medido(12, "landing", AHORA),
    embudo: [],
    tasas: {
      asistencia: medido(0.4, "calculado", AHORA),
      conversionDeAsistentes: medido(0.1, "calculado", AHORA),
      conversionDeRegistrados: medido(0.04, "calculado", AHORA),
    },
    ventas: {
      ventas: medido(8, "whop", AHORA),
      ingresos: medido(7976, "whop", AHORA),
      reembolsos: medido(0, "whop", AHORA),
      ventasVip: null,
    },
    anuncios: null,
    sesiones: [],
    pendientesDelEquipo: {
      levantaronLaManoSinContactar: medido(5, "manual", AHORA),
      agendadosSinCerrar: medido(2, "calendly", AHORA),
    },
    fuentes: [LANDING_OK],
    ...cambios,
  };
}

describe("textoDelCierre", () => {
  it("⭐ la cuenta regresiva en días calendario", () => {
    expect(textoDelCierre(3)).toBe("Cierra en 3 días");
    expect(textoDelCierre(1)).toBe("Cierra mañana");
    expect(textoDelCierre(0)).toBe("Cierra hoy");
    expect(textoDelCierre(-2)).toBe("La fecha de cierre ya pasó");
    expect(textoDelCierre(null)).toBe("Sin fecha de cierre");
  });
});

describe("formatos", () => {
  it("montos en la moneda del lanzamiento; una moneda desconocida no rompe", () => {
    expect(formatearMonto(7976, "USD")).toMatch(/7\.976/);
    expect(formatearMonto(7976, "USD")).toMatch(/US\$|USD/);
    expect(formatearMonto(1500, "XYZ1")).toBe("XYZ1 1.500");
  });

  it("tasas y ROAS: null es «—», nunca un cero", () => {
    expect(formatearTasa(0.4)).toBe("40 %");
    expect(formatearTasa(0.125)).toBe("12,5 %");
    expect(formatearTasa(null)).toBe("—");
    expect(formatearVeces(3.24)).toBe("3,2x");
    expect(formatearVeces(null)).toBe("—");
  });
});

describe("⭐ avisoDeRegistros: registros que dejan de llegar", () => {
  it("con la landing al día y registros recientes, no avisa", () => {
    expect(avisoDeRegistros(inicio())).toBeNull();
  });

  it("⭐ la landing con error: avisa con el motivo de la fuente", () => {
    const caida: EstadoDeFuente = {
      fuente: "landing",
      state: "error",
      reason: "La landing no envía registros desde ayer a las 18:00.",
      ultimaLecturaAt: AHORA,
    };
    expect(avisoDeRegistros(inicio({ fuentes: [caida] }))).toEqual({
      titulo: "Los registros pueden no estar llegando",
      detalle: "La landing no envía registros desde ayer a las 18:00.",
    });
  });

  it("la landing desactualizada también avisa", () => {
    const vieja: EstadoDeFuente = { fuente: "landing", state: "desactualizado", reason: "Hace 2 días.", ultimaLecturaAt: AHORA };
    expect(avisoDeRegistros(inicio({ fuentes: [vieja] }))?.detalle).toBe("Hace 2 días.");
  });

  it("⭐ cero registros medidos en 24 h con la captación abierta: avisa", () => {
    const aviso = avisoDeRegistros(inicio({ registradosUltimas24h: medido(0, "landing", AHORA) }));
    expect(aviso?.titulo).toBe("No entró ningún registro en las últimas 24 horas");
  });

  it("cero registros con la fecha de cierre pasada: no avisa (ya no capta)", () => {
    expect(
      avisoDeRegistros(inicio({ registradosUltimas24h: medido(0, "landing", AHORA), diasParaElCierre: -1 }))
    ).toBeNull();
  });

  it("nunca avisa por un cero que no se midió", () => {
    expect(
      avisoDeRegistros(inicio({ registradosUltimas24h: conError("landing", "Falló la lectura.", AHORA) }))
    ).toBeNull();
    expect(avisoDeRegistros(inicio({ registradosUltimas24h: sinFuente("landing", "Sin conectar.") }))).toBeNull();
  });
});

describe("fuentes", () => {
  it("las que no están al día primero; cuenta las que tienen problemas", () => {
    const fuentes: EstadoDeFuente[] = [
      LANDING_OK,
      { fuente: "meta_ads", state: "desactualizado", reason: "x", ultimaLecturaAt: AHORA },
      { fuente: "commas", state: "error", reason: "y", ultimaLecturaAt: null },
      { fuente: "ghl", state: "sin_fuente", reason: "z", ultimaLecturaAt: null },
    ];
    expect(fuentesOrdenadas(fuentes).map((f) => f.fuente)).toEqual(["commas", "ghl", "meta_ads", "landing"]);
    expect(fuentesConProblemas(fuentes)).toBe(3);
  });
});
