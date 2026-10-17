import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

/**
 * SCRUM-506: si no se pudieron leer los mensajes de una conversación, el chat
 * del Agente muestra el motivo. Antes la pantalla quedaba en "Cargando…" (la
 * acción lanzaba dentro de un efecto) o, con la lectura vacía, mostraba las
 * sugerencias como si la conversación no tuviera mensajes.
 */

import { MotivoDeCargaDelChat, queMostrarEnElChat } from "../agent-module";

const quieto = { isLoading: false, cantidadDeMensajes: 0, motivoDeCarga: null, agenteOcupado: false };

describe("queMostrarEnElChat", () => {
  it("⭐ con un motivo de carga y sin mensajes muestra el motivo, no la pantalla vacía", () => {
    expect(queMostrarEnElChat({ ...quieto, motivoDeCarga: "ID inválido" })).toBe("motivo");
  });

  it("mientras carga muestra \"Cargando…\"", () => {
    expect(queMostrarEnElChat({ ...quieto, isLoading: true, motivoDeCarga: "x" })).toBe("cargando");
  });

  it("sin motivo y sin mensajes muestra las sugerencias, como antes", () => {
    expect(queMostrarEnElChat(quieto)).toBe("vacio");
  });

  it("con mensajes (por ejemplo, uno nuevo después del error) muestra los mensajes", () => {
    expect(queMostrarEnElChat({ ...quieto, cantidadDeMensajes: 1, motivoDeCarga: "x" })).toBe("mensajes");
  });

  it("con el agente ocupado y sin mensajes no muestra las sugerencias", () => {
    expect(queMostrarEnElChat({ ...quieto, agenteOcupado: true })).toBe("mensajes");
  });
});

describe("MotivoDeCargaDelChat", () => {
  it("⭐ muestra el motivo que devolvió la acción", () => {
    const html = renderToStaticMarkup(createElement(MotivoDeCargaDelChat, { motivo: "Sesión no válida" }));
    expect(html).toContain("No se pudo cargar la conversación");
    expect(html).toContain("Sesión no válida");
  });

  it("con el texto fijo de un error inesperado, lo muestra tal cual", () => {
    const motivo = "Ocurrió un error inesperado. Intentá de nuevo.";
    expect(renderToStaticMarkup(createElement(MotivoDeCargaDelChat, { motivo }))).toContain(motivo);
  });
});
