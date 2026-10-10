import { describe, expect, it } from "vitest";
// @ts-expect-error: módulo compilado de Next sin tipos.
import stringHash from "next/dist/compiled/string-hash";
import { createHTMLReactServerErrorHandler } from "next/dist/server/app-render/create-error-handler";
import { digestDeNext, etiquetarDigest, hashDeTexto } from "../digest-de-next";

/**
 * SCRUM-108 (AR pasada 1, MAYOR-2): el evento del servidor lleva el mismo
 * código de referencia que ve el usuario. El SDK captura el error de un Server
 * Component antes de que Next le ponga el digest, así que se calcula igual que
 * Next; acá se compara contra el propio Next.
 */

/** El digest que Next le asigna a un error al renderizar (producción). */
function digestQuePoneNext(error: unknown): string | undefined {
  const manejar = createHTMLReactServerErrorHandler(false, false, new Map(), true, undefined);
  return manejar(error) as string | undefined;
}

describe("digestDeNext", () => {
  it("⭐ el hash es el string-hash de Next", () => {
    for (const texto of ["", "a", "boom en la tabla", "canceling statement due to statement timeout\n    at x (y.js:1:2)"]) {
      expect(hashDeTexto(texto)).toBe(stringHash(texto));
    }
  });

  it("⭐ un error sin digest da el mismo código que después le pone Next", () => {
    const error = new Error("canceling statement due to statement timeout");
    const calculado = digestDeNext(error);
    expect(calculado).toBe(digestQuePoneNext(error));
  });

  it("con __NEXT_ERROR_CODE lleva el sufijo, como lo que Next le manda al navegador", () => {
    // Next le escribe el digest al error al manejarlo: un error para cada lado.
    const crear = () => {
      const error = new Error("x");
      error.stack = "Error: x\n    at y (z.js:1:1)";
      return Object.assign(error, { __NEXT_ERROR_CODE: "E394" });
    };
    const calculado = digestDeNext(crear());
    expect(calculado).toBe(digestQuePoneNext(crear()));
    expect(calculado).toMatch(/@E394$/);
  });

  it("el error que ya pasó por Next (digest sin sufijo) da el mismo código que vio el usuario", () => {
    const error = Object.assign(new Error("x"), { __NEXT_ERROR_CODE: "E394" });
    const visto = digestQuePoneNext(error);
    expect(digestDeNext(error)).toBe(visto);
  });

  it("si el error ya trae digest, usa ése (recortado)", () => {
    expect(digestDeNext({ digest: "668109338" })).toBe("668109338");
    expect(digestDeNext({ digest: "x".repeat(100) })).toHaveLength(64);
    expect(digestDeNext({ digest: "" })).toBeNull();
  });

  it("lo que no es un error no tiene código", () => {
    expect(digestDeNext(null)).toBeNull();
    expect(digestDeNext("texto")).toBeNull();
    expect(digestDeNext({ algo: 1 })).toBeNull();
  });
});

describe("etiquetarDigest (beforeSend del servidor)", () => {
  const deNext = (tipo: string) => ({ exception: { values: [{ mechanism: { type: tipo } }] } }) as {
    tags?: Record<string, unknown>;
    exception: { values: Array<{ mechanism: { type: string } }> };
  };

  it("⭐ un error de un Server Component capturado por el SDK lleva el código", () => {
    const error = new Error("boom en la tabla");
    const evento = etiquetarDigest(deNext("auto.function.nextjs.server_component"), error);
    expect(evento.tags).toEqual({ error_digest: digestQuePoneNext(error) });
  });

  it("el de onRequestError también", () => {
    const evento = etiquetarDigest(deNext("auto.function.nextjs.on_request_error"), { digest: "1", message: "x" });
    expect(evento.tags).toEqual({ error_digest: "1" });
  });

  it("no pisa un tag que ya venía", () => {
    const evento = { ...deNext("auto.function.nextjs.server_component"), tags: { error_digest: "2" } };
    expect(etiquetarDigest(evento, new Error("x")).tags).toEqual({ error_digest: "2" });
  });

  it("una server action o un cron no llevan código: nadie lo vio", () => {
    expect(etiquetarDigest(deNext("generic"), new Error("x")).tags).toBeUndefined();
    expect(etiquetarDigest({} as { tags?: Record<string, unknown> }, new Error("x")).tags).toBeUndefined();
  });
});
