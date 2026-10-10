import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-108 (AR pasada 1, MAYOR-2): el evento del servidor de un error no
 * atrapado (`onRequestError`) lleva el tag `error_digest`, el mismo código de
 * referencia que ve el usuario y que lleva el evento del navegador.
 *
 * El SDK se simula: `withScope` apila los tags del scope abierto y
 * `captureRequestError` anota con qué tags se llamó.
 */

const sim = vi.hoisted(() => ({
  pila: [] as Array<Record<string, string>>,
  capturas: [] as Array<{ args: unknown[]; tags: Record<string, string> }>,
}));

vi.mock("@sentry/nextjs", () => ({
  withScope: (fn: (scope: { setTag: (k: string, v: string) => void }) => void) => {
    const tags: Record<string, string> = { ...(sim.pila.at(-1) ?? {}) };
    sim.pila.push(tags);
    try {
      fn({ setTag: (k, v) => (tags[k] = v) });
    } finally {
      sim.pila.pop();
    }
  },
  captureRequestError: (...args: unknown[]) =>
    sim.capturas.push({ args, tags: { ...(sim.pila.at(-1) ?? {}) } }),
}));

import { digestDelError, onRequestError } from "@/instrumentation";

type Args = Parameters<typeof onRequestError>;
const REQUEST = { path: "/workboard", method: "GET", headers: {} } as unknown as Args[1];
const CONTEXTO = { routerKind: "App Router", routePath: "/workboard", routeType: "render" } as unknown as Args[2];

beforeEach(() => {
  sim.pila = [];
  sim.capturas = [];
});

describe("onRequestError", () => {
  it("⭐ manda el error con el tag error_digest y los mismos argumentos", () => {
    const error = Object.assign(new Error("boom en la tabla"), { digest: "668109338" });
    onRequestError(error, REQUEST, CONTEXTO);
    expect(sim.capturas).toEqual([
      { args: [error, REQUEST, CONTEXTO], tags: { error_digest: "668109338" } },
    ]);
  });

  it("sin digest, el error va igual y sin el tag", () => {
    const error = new Error("sin digest");
    onRequestError(error, REQUEST, CONTEXTO);
    expect(sim.capturas).toEqual([{ args: [error, REQUEST, CONTEXTO], tags: {} }]);
  });

  it("el tag no queda pegado para el próximo evento", () => {
    onRequestError(Object.assign(new Error("a"), { digest: "1" }), REQUEST, CONTEXTO);
    expect(sim.pila).toEqual([]);
  });
});

describe("digestDelError", () => {
  it("sólo un texto no vacío, recortado", () => {
    expect(digestDelError({ digest: "123" })).toBe("123");
    expect(digestDelError({ digest: "" })).toBeNull();
    expect(digestDelError({ digest: 42 })).toBeNull();
    expect(digestDelError(null)).toBeNull();
    expect(digestDelError("texto")).toBeNull();
    expect(digestDelError({ digest: "x".repeat(100) })).toHaveLength(64);
  });
});
