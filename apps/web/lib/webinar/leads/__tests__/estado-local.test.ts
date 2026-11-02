import { describe, expect, it } from "vitest";
import {
  agregarNotaLocal,
  aplicarAvance,
  aplicarResponsable,
  estadoInicial,
  type EstadoLocalDelLead,
} from "@/lib/webinar/leads/estado-local";
import type { EstadoDeVenta } from "@/lib/webinar/vistas/contratos";

/**
 * SCRUM-545 · El cambio simulado vive sólo en el estado local de la ficha
 * (AC-9, DT-18): funciones puras que no mutan la entrada.
 */

const LANZAMIENTO = "8f0e7c52-3a1b-4c6d-9e2f-1a2b3c4d5e6f";
const SETTER = { userId: "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e", nombre: "Sofía" };

const VENTA: EstadoDeVenta = {
  etapa: "raised_hand",
  responsable: null,
  ultimoContactoAt: null,
};

function congelado(estado: EstadoLocalDelLead): EstadoLocalDelLead {
  return Object.freeze({ ...estado, notasLocales: Object.freeze([...estado.notasLocales]) as never });
}

describe("estadoInicial", () => {
  it("toma etapa y responsable del estado de venta, sin notas ni cambios", () => {
    expect(estadoInicial(VENTA)).toEqual({
      etapa: "raised_hand",
      responsable: null,
      notasLocales: [],
      huboCambios: false,
    });
  });
});

describe("aplicarAvance", () => {
  it("cambia la etapa y marca el cambio, sin mutar la entrada", () => {
    const antes = congelado(estadoInicial(VENTA));
    const despues = aplicarAvance(antes, "contacted");
    expect(despues).toEqual({ ...antes, etapa: "contacted", huboCambios: true });
    expect(antes.etapa).toBe("raised_hand");
    expect(antes.huboCambios).toBe(false);
  });
});

describe("aplicarResponsable", () => {
  it("asigna y quita responsable, sin mutar la entrada", () => {
    const antes = congelado(estadoInicial(VENTA));
    const asignado = aplicarResponsable(antes, SETTER);
    expect(asignado).toEqual({ ...antes, responsable: SETTER, huboCambios: true });
    expect(antes.responsable).toBeNull();
    expect(aplicarResponsable(congelado(asignado), null)).toMatchObject({
      responsable: null,
      huboCambios: true,
    });
  });
});

describe("agregarNotaLocal", () => {
  it("la nota nueva va primero, con id local, sin autor y marcada de ejemplo", () => {
    const antes = congelado(estadoInicial(VENTA));
    const una = agregarNotaLocal(antes, {
      launchId: LANZAMIENTO,
      texto: "Primera",
      creadaAt: "2026-11-02T10:00:00.000Z",
    });
    const dos = agregarNotaLocal(congelado(una), {
      launchId: LANZAMIENTO,
      texto: "Segunda",
      creadaAt: "2026-11-02T11:00:00.000Z",
    });
    expect(dos.notasLocales).toEqual([
      {
        id: "local-2",
        launchId: LANZAMIENTO,
        texto: "Segunda",
        autor: null,
        creadaAt: "2026-11-02T11:00:00.000Z",
        deEjemplo: true,
      },
      {
        id: "local-1",
        launchId: LANZAMIENTO,
        texto: "Primera",
        autor: null,
        creadaAt: "2026-11-02T10:00:00.000Z",
        deEjemplo: true,
      },
    ]);
    expect(dos.huboCambios).toBe(true);
    expect(antes.notasLocales).toEqual([]);
    expect(una.notasLocales).toHaveLength(1);
  });

  it("no toca la etapa ni el responsable (ni inventa un último contacto)", () => {
    const antes = estadoInicial(VENTA);
    const despues = agregarNotaLocal(antes, {
      launchId: LANZAMIENTO,
      texto: "Hola",
      creadaAt: "2026-11-02T10:00:00.000Z",
    });
    expect(despues.etapa).toBe(antes.etapa);
    expect(despues.responsable).toBe(antes.responsable);
    expect(Object.keys(despues).sort()).toEqual(["etapa", "huboCambios", "notasLocales", "responsable"]);
  });
});
