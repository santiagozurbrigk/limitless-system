import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRedirectError } from "next/dist/client/components/redirect";
import { RedirectType } from "next/dist/client/components/redirect-error";

/**
 * SCRUM-497: cómo las server actions separan lo esperable de lo inesperado.
 *
 * - `mutacionConErroresEsperables` (módulos ya arreglados): sólo un
 *   `ErrorEsperable` vuelve con su mensaje; lo demás se registra, va a Sentry y
 *   vuelve con un texto fijo.
 * - `runMutation` (módulos de SCRUM-496): el mensaje que ve el usuario no
 *   cambia, pero una falla de infraestructura o un bug se registra y va a
 *   Sentry, en vez de perderse.
 */

const sim = vi.hoisted(() => ({
  reportes: [] as Array<{ error: unknown; contexto: unknown }>,
}));
vi.mock("@/lib/observability/reportar-falla", () => ({
  reportarFalla: (error: unknown, contexto: unknown) => sim.reportes.push({ error, contexto }),
}));

import {
  ErrorEsperable,
  FallaDeLaBase,
  esFallaParaReportar,
  mutacionConErroresEsperables,
  runMutation,
} from "../action-result";

const TEXTO_FIJO = "Ocurrió un error inesperado. Intentá de nuevo.";

let consola: ReturnType<typeof vi.spyOn>;
let aviso: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  sim.reportes = [];
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
  aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  consola.mockRestore();
  aviso.mockRestore();
});

const lanza = (error: unknown) => async () => {
  throw error;
};

describe("mutacionConErroresEsperables", () => {
  it("con éxito devuelve el dato", async () => {
    await expect(mutacionConErroresEsperables("[x]", async () => 7)).resolves.toEqual({
      success: true,
      data: 7,
    });
  });

  it("⭐ un ErrorEsperable vuelve con su mensaje y no se registra", async () => {
    await expect(
      mutacionConErroresEsperables("[x]", lanza(new ErrorEsperable("Sesión no válida")))
    ).resolves.toEqual({ success: false, error: "Sesión no válida" });
    expect(consola).not.toHaveBeenCalled();
    expect(sim.reportes).toEqual([]);
  });

  it.each([
    ["un TypeError de la red", new TypeError("fetch failed")],
    ["una falla de la base", new FallaDeLaBase({ message: "TypeError: fetch failed" })],
    ["un Error común sin marcar", new Error("Algo con texto")],
    ["algo que no es un Error", "texto suelto"],
  ])("⭐ %s vuelve con el texto fijo, se registra y va a Sentry", async (_c, error) => {
    await expect(mutacionConErroresEsperables("[accion]", lanza(error))).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
    expect(consola).toHaveBeenCalledWith("[accion]", error);
    expect(sim.reportes).toEqual([{ error, contexto: { accion: "[accion]" } }]);
  });

  it("acepta un texto fijo propio", async () => {
    await expect(
      mutacionConErroresEsperables("[x]", lanza(new TypeError("boom")), "No se pudo leer.")
    ).resolves.toEqual({ success: false, error: "No se pudo leer." });
  });

  it("un redirect de Next se relanza, no se registra", async () => {
    const redirect = getRedirectError("/login", RedirectType.replace);
    await expect(mutacionConErroresEsperables("[x]", lanza(redirect))).rejects.toBe(redirect);
    expect(sim.reportes).toEqual([]);
  });
});

describe("runMutation (módulos todavía sin separar, SCRUM-496)", () => {
  it("⭐ el mensaje que ve el usuario no cambia", async () => {
    await expect(runMutation(lanza(new Error("Rol no encontrado")))).resolves.toEqual({
      success: false,
      error: "Rol no encontrado",
    });
    await expect(runMutation(lanza(new TypeError("fetch failed")))).resolves.toEqual({
      success: false,
      error: "fetch failed",
    });
  });

  it("⭐ una falla de infraestructura se registra y va a Sentry", async () => {
    const error = new Error("TypeError: fetch failed");
    await runMutation(lanza(error));
    expect(consola).toHaveBeenCalledWith("[runMutation]", error);
    expect(sim.reportes).toEqual([{ error, contexto: { accion: "[runMutation]" } }]);
  });

  it("un rechazo de negocio sin marcar queda como aviso en el log, sin Sentry", async () => {
    await runMutation(lanza(new Error("No se pueden eliminar roles default")));
    expect(sim.reportes).toEqual([]);
    expect(aviso).toHaveBeenCalledWith(
      "[runMutation] rechazo sin marcar:",
      "No se pueden eliminar roles default"
    );
  });

  it("un ErrorEsperable no se registra", async () => {
    await runMutation(lanza(new ErrorEsperable("Sesión no válida")));
    expect(sim.reportes).toEqual([]);
    expect(consola).not.toHaveBeenCalled();
    expect(aviso).not.toHaveBeenCalled();
  });
});

describe("esFallaParaReportar", () => {
  it.each([
    [new TypeError("x"), true],
    [new FallaDeLaBase({ message: "x", code: "42501" }), true],
    [{ message: "objeto" }, true],
    [new Error("fetch failed"), true],
    [new Error('new row violates row-level security policy for table "clients"'), true],
    [new Error('relation "x" does not exist'), true],
    [new Error("duplicate key value violates unique constraint"), true],
    [new Error("Este email ya es miembro de la organización"), false],
    [new Error("Solo podés editar tus propios inputs."), false],
    [new ErrorEsperable("Sesión no válida"), false],
  ])("%s → %s", (error, esperado) => {
    expect(esFallaParaReportar(error)).toBe(esperado);
  });
});
