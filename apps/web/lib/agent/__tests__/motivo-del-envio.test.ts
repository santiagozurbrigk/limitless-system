import { describe, expect, it } from "vitest";

/**
 * SCRUM-506: el aviso de la pantalla del Agente cuando falla un envío. La ruta
 * `/api/agent/send` manda en el evento `error` un texto para el usuario (el
 * motivo o un texto fijo; ver `app/api/agent/send/__tests__`), y la pantalla
 * lo muestra tal cual. El aviso de conexión queda para la red caída o un
 * stream cortado, que no llegan como evento.
 */

import { avisoDeEnvioFallido, EnvioRechazado, TEXTO_DE_CONEXION } from "../motivo-del-envio";

describe("avisoDeEnvioFallido", () => {
  it("⭐ con un envío rechazado por la ruta muestra su mensaje tal cual", () => {
    expect(avisoDeEnvioFallido(new EnvioRechazado("Conversación no encontrada"))).toEqual({
      title: "No se pudo enviar el mensaje",
      description: "Conversación no encontrada",
      variant: "default",
    });
  });

  it.each([
    ["la red caída", new TypeError("Failed to fetch")],
    ["un stream cortado sin respuesta", new Error("Stream terminó sin respuesta completa")],
    ["algo que no es un Error", "x"],
  ])("⭐ con %s muestra el texto de conexión de siempre", (_n, error) => {
    expect(avisoDeEnvioFallido(error)).toEqual({
      title: "No se pudo enviar el mensaje",
      description: TEXTO_DE_CONEXION,
      variant: "default",
    });
    expect(TEXTO_DE_CONEXION).toBe("Revisá tu conexión o la API de Claude e intentá de nuevo.");
  });
});
