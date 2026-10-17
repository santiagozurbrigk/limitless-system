import { describe, expect, it } from "vitest";

/**
 * SCRUM-506: qué motivo de un envío rechazado muestra la pantalla del Agente.
 * La ruta `/api/agent/send` manda en el evento `error` el mensaje de cualquier
 * error; sólo los rechazos conocidos se muestran, nunca el texto de una falla.
 */

import {
  avisoDeEnvioFallido,
  EnvioRechazado,
  motivoDelEnvio,
  TEXTO_DE_CONEXION,
} from "../motivo-del-envio";
import { AI_KEY_REJECTED_MESSAGE, NO_AI_CREDENTIALS_MESSAGE } from "@/lib/ai/anthropic-auth-errors";
import { claudeNoCreditsUserMessage } from "@/lib/ai/anthropic-errors";

const AGENT_ERROR_REPLY = "No pudimos generar la respuesta. Intentá de nuevo en unos segundos.";

describe("motivoDelEnvio", () => {
  it.each([
    ["sin clave de Claude", NO_AI_CREDENTIALS_MESSAGE],
    ["clave rechazada por Anthropic", AI_KEY_REJECTED_MESSAGE],
    ["cuenta sin créditos", claudeNoCreditsUserMessage()],
    ["límite de pedidos", "Demasiadas solicitudes. Intentá de nuevo en 42 segundos."],
    ["sin sesión (acción)", "Sesión no válida"],
    ["sin sesión (ruta)", "No autenticado"],
  ])("⭐ %s se muestra tal cual", (_n, mensaje) => {
    expect(motivoDelEnvio(mensaje, "hola")).toBe(mensaje);
  });

  it("⭐ el \"Unauthorized\" de requireAuthContext se muestra como \"Sesión no válida\"", () => {
    expect(motivoDelEnvio("Unauthorized", "hola")).toBe("Sesión no válida");
  });

  it("⭐ el rechazo de validación del texto enviado se muestra", () => {
    const largo = "a".repeat(4001);
    expect(motivoDelEnvio("El mensaje no puede superar los 4.000 caracteres", largo)).toBe(
      "El mensaje no puede superar los 4.000 caracteres"
    );
  });

  it("un texto de validación que no corresponde a lo enviado no se muestra", () => {
    expect(motivoDelEnvio("El mensaje no puede superar los 4.000 caracteres", "hola")).toBeNull();
  });

  it.each([
    ["el texto crudo de la base", "boom en la tabla"],
    ["el de PostgREST sin filas", "JSON object requested, multiple (or no) rows returned"],
    ["la red", "TypeError: fetch failed"],
    ["la respuesta vacía del agente (una falla)", AGENT_ERROR_REPLY],
    ["el texto fijo de una falla de las acciones", "Ocurrió un error inesperado. Intentá de nuevo."],
    ["un límite con otra forma", "Demasiadas solicitudes. Intentá de nuevo en unos minutos."],
  ])("⭐ %s no se muestra (aviso de conexión)", (_n, mensaje) => {
    expect(motivoDelEnvio(mensaje, "hola")).toBeNull();
  });
});

describe("avisoDeEnvioFallido", () => {
  it("⭐ con un envío rechazado muestra su motivo", () => {
    expect(avisoDeEnvioFallido(new EnvioRechazado(AI_KEY_REJECTED_MESSAGE))).toEqual({
      title: "No se pudo enviar el mensaje",
      description: AI_KEY_REJECTED_MESSAGE,
      variant: "default",
    });
  });

  it.each([
    ["un Error con el texto de la falla", new Error("boom en la tabla")],
    ["un TypeError de la red", new TypeError("Failed to fetch")],
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
