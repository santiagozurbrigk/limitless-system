/**
 * SCRUM-544 · Cada estado de número tiene su texto y su botón (diseño del
 * producto, sección 11).
 */
import { afterEach, describe, expect, it } from "vitest";
import { conError, desactualizado, faltaConfigurar, medido, sinFuente } from "@/lib/webinar/vistas/dato";
import { DESTINOS_DE_LAS_ACCIONES, accionDelDato, accionDelEstado } from "../acciones-del-estado";

const AHORA = "2026-11-05T12:00:00.000Z";
const original = { ...DESTINOS_DE_LAS_ACCIONES };
afterEach(() => Object.assign(DESTINOS_DE_LAS_ACCIONES, original));

describe("⭐ accionDelEstado", () => {
  it("sin fuente: conectar; desactualizado: ver; error: reconectar; todos a Integraciones", () => {
    expect(accionDelEstado("sin_fuente", "zoom", "l1")).toMatchObject({ texto: "Conectá Zoom", destino: "integraciones" });
    expect(accionDelEstado("desactualizado", "meta_ads", "l1")).toMatchObject({ texto: "Ver Meta Ads", destino: "integraciones" });
    expect(accionDelEstado("error", "commas", "l1")).toMatchObject({ texto: "Reconectá Commas", destino: "integraciones" });
  });

  it("falta configurar, o una fuente que no se conecta: a la configuración del lanzamiento", () => {
    expect(accionDelEstado("falta_configurar", "zoom", "l1").destino).toBe("configuracion");
    expect(accionDelEstado("sin_fuente", "manual", "l1").destino).toBe("configuracion");
    expect(accionDelEstado("error", "calculado", "l1").texto).toBe("Completá la configuración del lanzamiento");
  });

  it("⭐ sin pantalla de destino, sin enlace (nunca un enlace muerto)", () => {
    expect(accionDelEstado("sin_fuente", "zoom", "l1").href).toBeNull();
    expect(accionDelEstado("falta_configurar", "configuracion", "l1").href).toBeNull();
  });

  it("cuando una tarea pone su ruta, el botón la usa con el lanzamiento", () => {
    DESTINOS_DE_LAS_ACCIONES.configuracion = (id) => `/lanzamientos/${id}/configuracion`;
    expect(accionDelEstado("falta_configurar", "configuracion", "l1").href).toBe("/lanzamientos/l1/configuracion");
  });
});

describe("accionDelDato", () => {
  it("un dato medido no tiene acción; los otros cuatro estados sí", () => {
    expect(accionDelDato(medido(3, "zoom", AHORA), "l1")).toBeNull();
    for (const dato of [
      sinFuente("zoom", "x"),
      faltaConfigurar("configuracion", "x"),
      desactualizado(3, "meta_ads", AHORA, "x"),
      conError("commas", "x"),
    ]) {
      expect(accionDelDato(dato, "l1")?.texto, dato.state).toBeTruthy();
    }
  });
});
