import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRedirectError } from "next/dist/client/components/redirect";
import { RedirectType } from "next/dist/client/components/redirect-error";
import { DynamicServerError } from "next/dist/client/components/hooks-server-context";
import { notFound } from "next/navigation";

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

  // MENOR-2 de la AR: fallas comunes de PostgREST, Postgres y del gateway
  // que un módulo viejo relanza con `new Error(error.message)`.
  it.each([
    "Could not find the table 'public.clients' in the schema cache",
    "Could not find the 'nota' column of 'clients' in the schema cache",
    "value too long for type character varying(200)",
    'value "99999999999" is out of range for type integer',
    "integer out of range",
    "deadlock detected",
    "could not serialize access due to concurrent update",
    "canceling statement due to statement timeout",
    "sorry, too many clients already",
    "An invalid response was received from the upstream server",
    "Bad Gateway",
    "502 Bad Gateway",
    "Service Unavailable",
    "Gateway Timeout",
    "Internal Server Error",
  ])("⭐ se reporta: %s", (mensaje) => {
    expect(esFallaParaReportar(new Error(mensaje))).toBe(true);
  });

  it.each([
    ["PGRST205", true],
    ["PGRST204", true],
    ["PGRST301", true],
    ["08006", true],
    ["22001", true],
    ["23505", true],
    ["40P01", true],
    ["40001", true],
    ["42501", true],
    ["53300", true],
    ["54000", true],
    ["57014", true],
    ["58030", true],
    ["XX000", true],
    ["PGRST116", false],
    ["P0001", false],
  ])("⭐ con code %s y un texto de negocio → %s", (code, esperado) => {
    const error = Object.assign(new Error("No se pudo guardar el cambio"), { code });
    expect(esFallaParaReportar(error)).toBe(esperado);
  });

  it("un rechazo de negocio sin code ni texto de infraestructura no se reporta", () => {
    expect(esFallaParaReportar(new Error("El nombre de la etapa ya está en uso"))).toBe(false);
  });
});

/**
 * SCRUM-503: los errores internos de Next no son fallas. El de ruta dinámica
 * (`DYNAMIC_SERVER_USAGE`) lo lanza `cookies()` en el prerender de `next build`;
 * atrapado, se registraba como falla en cada build (`[getTeamMembers]` desde
 * `/sales/closing`) y llegaba a Sentry si el build tenía DSN. Un redirect dentro
 * de `runMutation` volvía como `{ success: false, error: "NEXT_REDIRECT" }`.
 */
function errorDeNotFound(): unknown {
  try {
    notFound();
  } catch (error) {
    return error;
  }
  throw new Error("notFound no lanzó");
}

const ERRORES_DE_NEXT = [
  ["un redirect", () => getRedirectError("/login", RedirectType.replace)],
  ["un notFound", errorDeNotFound],
  ["el error de ruta dinámica", () => new DynamicServerError("Route /x couldn't be rendered statically because it used `cookies`")],
] as const;

describe.each([
  ["mutacionConErroresEsperables", (fn: () => Promise<unknown>) => mutacionConErroresEsperables("[x]", fn)],
  ["runMutation", (fn: () => Promise<unknown>) => runMutation(fn)],
] as const)("%s y los errores internos de Next", (_helper, correr) => {
  it.each(ERRORES_DE_NEXT)("⭐ %s se relanza sin registrarse ni ir a Sentry", async (_c, crear) => {
    const error = crear();
    await expect(correr(lanza(error))).rejects.toBe(error);
    expect(sim.reportes).toEqual([]);
    expect(consola).not.toHaveBeenCalled();
    expect(aviso).not.toHaveBeenCalled();
  });

  it("un error que envuelve uno de Next relanza el de Next, sin registrarse", async () => {
    const causa = new DynamicServerError("cookies");
    await expect(correr(lanza(new Error("envuelto", { cause: causa })))).rejects.toBe(causa);
    expect(sim.reportes).toEqual([]);
    expect(consola).not.toHaveBeenCalled();
  });

  it("lo demás sigue igual: una falla vuelve como valor y se reporta", async () => {
    const r = await correr(lanza(new TypeError("fetch failed")));
    expect(r).toMatchObject({ success: false });
    expect(sim.reportes).toHaveLength(1);
  });
});
