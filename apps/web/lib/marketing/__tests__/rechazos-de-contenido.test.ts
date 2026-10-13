import { describe, expect, it } from "vitest";
import { AI_KEY_REJECTED_MESSAGE } from "@/lib/ai/anthropic-auth-errors";
import { claudeNoCreditsUserMessage } from "@/lib/ai/anthropic-errors";
import { GoogleIntegrationPermissionError } from "@/lib/google/errors";
import { ErrorEsperable } from "@/lib/server/error-esperable";
import { ZernioHttpError, ZernioTimeoutError } from "@/lib/zernio/client";
import {
  DRIVE_NO_CONECTADO,
  rechazoDeClaude,
  rechazoDeDrive,
  rechazoDeZernio,
  ZERNIO_NO_CONECTADO,
  ZERNIO_SIN_ACCESO,
} from "../rechazos-de-contenido";

/**
 * SCRUM-502: qué fallas de Zernio, Drive y Claude son rechazos con motivo
 * (vuelven como valor) y cuáles son fallas (se registran). Se decide por la
 * clase, el status o el texto exacto que escribe nuestro código, nunca por un
 * texto del proveedor.
 */

function esperable(resultado: unknown, motivo: string) {
  expect(resultado).toBeInstanceOf(ErrorEsperable);
  expect((resultado as Error).message).toBe(motivo);
}

describe("rechazoDeZernio", () => {
  it("sin integración y 401/403 son rechazos", () => {
    esperable(rechazoDeZernio(new Error(ZERNIO_NO_CONECTADO)), ZERNIO_NO_CONECTADO);
    esperable(rechazoDeZernio(new ZernioHttpError("x", 401)), ZERNIO_SIN_ACCESO);
    esperable(rechazoDeZernio(new ZernioHttpError("x", 403)), ZERNIO_SIN_ACCESO);
  });

  it.each([
    ["404", new ZernioHttpError("Zernio x: HTTP 404", 404)],
    ["429", new ZernioHttpError("Zernio x: HTTP 429", 429)],
    ["500", new ZernioHttpError("Zernio x: HTTP 500", 500)],
    ["tiempo agotado", new ZernioTimeoutError("x", 15_000)],
    ["red", new TypeError("fetch failed")],
    ["otra clase con el mismo texto", new TypeError(ZERNIO_NO_CONECTADO)],
  ])("%s es una falla: devuelve el mismo error", (_caso, error) => {
    expect(rechazoDeZernio(error)).toBe(error);
  });
});

describe("rechazoDeDrive", () => {
  it("los textos fijos de Drive y el error de permisos son rechazos", () => {
    esperable(rechazoDeDrive(new Error("GOOGLE_NOT_CONNECTED")), DRIVE_NO_CONECTADO);
    esperable(
      rechazoDeDrive(new Error("GOOGLE_INSUFFICIENT_PERMISSIONS")),
      "Reconectá tu cuenta de Google para actualizar los permisos"
    );
    esperable(
      rechazoDeDrive(new GoogleIntegrationPermissionError(401)),
      "Reconectá tu cuenta de Google para actualizar los permisos"
    );
    esperable(rechazoDeDrive(new Error("El archivo supera el límite de 500 MB")), "El archivo supera el límite de 500 MB");
    esperable(rechazoDeDrive(new Error("Sesión no válida")), "Sesión no válida");
  });

  it.each([
    ["status de Drive", new Error("Error de Google Drive (500)")],
    ["descarga", new Error("Error al descargar archivo de Drive")],
    ["red", new TypeError("fetch failed")],
    ["otra clase con el mismo texto", new TypeError("GOOGLE_NOT_CONNECTED")],
  ])("%s es una falla: devuelve el mismo error", (_caso, error) => {
    expect(rechazoDeDrive(error)).toBe(error);
  });
});

describe("rechazoDeClaude", () => {
  it("clave rechazada y sin créditos son rechazos con el mismo texto", () => {
    esperable(rechazoDeClaude(new Error(AI_KEY_REJECTED_MESSAGE)), AI_KEY_REJECTED_MESSAGE);
    esperable(rechazoDeClaude(new Error(claudeNoCreditsUserMessage())), claudeNoCreditsUserMessage());
  });

  it("cualquier otra cosa es una falla", () => {
    const red = new TypeError("fetch failed");
    const otra = new Error("overloaded_error");
    expect(rechazoDeClaude(red)).toBe(red);
    expect(rechazoDeClaude(otra)).toBe(otra);
  });
});
