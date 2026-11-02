import { describe, expect, it } from "vitest";
import {
  lanzamientoDesdeUrl,
  parametrosDesdeUrl,
  urlDeLaFicha,
  urlDeLeads,
} from "@/lib/webinar/leads/url";

/**
 * SCRUM-545 · Filtro, búsqueda, lanzamiento y cursor viven en la URL (AC-2,
 * AC-3); la fila enlaza a la ficha con su lanzamiento (DT-15).
 */

const LANZAMIENTO = "8f0e7c52-3a1b-4c6d-9e2f-1a2b3c4d5e6f";
const LEAD = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";

/** Los parámetros de una URL armada por `urlDeLeads`, como los vería la página. */
function leer(url: string) {
  const [ruta, query = ""] = url.split("?");
  const params: Record<string, string | string[]> = {};
  for (const [clave, valor] of new URLSearchParams(query)) {
    const previo = params[clave];
    params[clave] = previo === undefined ? valor : [...[previo].flat(), valor];
  }
  return { ruta, params };
}

describe("parametrosDesdeUrl", () => {
  it("lee los cuatro parámetros de /leads", () => {
    expect(
      parametrosDesdeUrl({
        filtro: "levanto_la_mano_sin_contactar",
        busqueda: "ana",
        lanzamiento: LANZAMIENTO,
        cursor: "50",
      })
    ).toEqual({
      filtro: "levanto_la_mano_sin_contactar",
      busqueda: "ana",
      launchId: LANZAMIENTO,
      cursor: "50",
    });
  });

  it("sin parámetros, todo null", () => {
    expect(parametrosDesdeUrl({})).toEqual({
      filtro: null,
      busqueda: null,
      launchId: null,
      cursor: null,
    });
  });

  it("tolera valores repetidos en la URL: se queda con el primero", () => {
    expect(
      parametrosDesdeUrl({
        filtro: ["agendado_sin_cerrar", "todos"],
        busqueda: ["uno", "dos"],
        lanzamiento: [LANZAMIENTO, "otro"],
        cursor: ["100", "150"],
      })
    ).toEqual({
      filtro: "agendado_sin_cerrar",
      busqueda: "uno",
      launchId: LANZAMIENTO,
      cursor: "100",
    });
  });

  it("una lista vacía o un texto vacío es null", () => {
    expect(parametrosDesdeUrl({ filtro: [], busqueda: "" })).toMatchObject({
      filtro: null,
      busqueda: null,
    });
  });
});

describe("urlDeLeads", () => {
  const actual = {
    filtro: "registrado_sin_asistir",
    busqueda: "ana",
    launchId: LANZAMIENTO,
    cursor: "50",
  };

  it("sin cambios, la misma URL (con cursor)", () => {
    expect(leer(urlDeLeads(actual))).toEqual({
      ruta: "/leads",
      params: { filtro: "registrado_sin_asistir", busqueda: "ana", lanzamiento: LANZAMIENTO, cursor: "50" },
    });
  });

  it("cambiar el filtro borra el cursor y conserva lo demás", () => {
    expect(leer(urlDeLeads(actual, { filtro: "agendado_sin_cerrar" }))).toEqual({
      ruta: "/leads",
      params: { filtro: "agendado_sin_cerrar", busqueda: "ana", lanzamiento: LANZAMIENTO },
    });
  });

  it("cambiar el lanzamiento también borra el cursor", () => {
    expect(leer(urlDeLeads(actual, { launchId: "otro" })).params).toEqual({
      filtro: "registrado_sin_asistir",
      busqueda: "ana",
      lanzamiento: "otro",
    });
  });

  it("pasar de página cambia sólo el cursor; volver al principio lo borra", () => {
    expect(leer(urlDeLeads(actual, { cursor: "100" })).params.cursor).toBe("100");
    expect(leer(urlDeLeads(actual, { cursor: null })).params).toEqual({
      filtro: "registrado_sin_asistir",
      busqueda: "ana",
      lanzamiento: LANZAMIENTO,
    });
  });

  it("sin parámetros, /leads a secas", () => {
    expect(urlDeLeads({})).toBe("/leads");
  });

  it("una búsqueda con caracteres especiales va codificada y vuelve igual", () => {
    const busqueda = "ana+pérez & co/?#=%";
    const url = urlDeLeads({ busqueda });
    expect(url).not.toContain("#");
    expect(url).not.toContain(" ");
    expect(leer(url).params.busqueda).toBe(busqueda);
  });

  it("ida y vuelta: la URL armada se lee como los mismos parámetros", () => {
    const parametros = {
      filtro: "levanto_la_mano_sin_contactar",
      busqueda: "josé & maría",
      launchId: LANZAMIENTO,
      cursor: "150",
    };
    expect(parametrosDesdeUrl(leer(urlDeLeads(parametros)).params)).toEqual(parametros);
  });
});

describe("urlDeLaFicha", () => {
  it("con lanzamiento, lo lleva en ?lanzamiento=", () => {
    expect(urlDeLaFicha(LEAD, LANZAMIENTO)).toBe(`/leads/${LEAD}?lanzamiento=${LANZAMIENTO}`);
  });

  it("sin lanzamiento, la ficha a secas", () => {
    expect(urlDeLaFicha(LEAD)).toBe(`/leads/${LEAD}`);
    expect(urlDeLaFicha(LEAD, null)).toBe(`/leads/${LEAD}`);
  });
});

describe("lanzamientoDesdeUrl", () => {
  it("el ?lanzamiento= de la ficha, el primero si se repite, o null", () => {
    expect(lanzamientoDesdeUrl({ lanzamiento: LANZAMIENTO })).toBe(LANZAMIENTO);
    expect(lanzamientoDesdeUrl({ lanzamiento: [LANZAMIENTO, "otro"] })).toBe(LANZAMIENTO);
    expect(lanzamientoDesdeUrl({})).toBeNull();
    expect(lanzamientoDesdeUrl({ lanzamiento: "" })).toBeNull();
  });

  it("ida y vuelta con urlDeLaFicha", () => {
    expect(lanzamientoDesdeUrl(leer(urlDeLaFicha(LEAD, LANZAMIENTO)).params)).toBe(LANZAMIENTO);
  });
});
