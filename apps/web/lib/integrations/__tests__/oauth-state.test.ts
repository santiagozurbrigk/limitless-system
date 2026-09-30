import { describe, expect, it } from "vitest";
import { mismoUsuario, stateCoincide } from "@/lib/integrations/oauth-state";

describe("stateCoincide", () => {
  it("el mismo state coincide", () => {
    expect(stateCoincide("abc123", "abc123")).toBe(true);
  });

  it("⭐ un state distinto, vacío o ausente no coincide", () => {
    expect(stateCoincide("abc123", "abc124")).toBe(false);
    expect(stateCoincide("abc123", "abc12")).toBe(false);
    expect(stateCoincide("", "")).toBe(false);
    expect(stateCoincide(undefined, "abc")).toBe(false);
    expect(stateCoincide("abc", null)).toBe(false);
  });

  it("un state que no es texto no coincide", () => {
    expect(stateCoincide(123, "123")).toBe(false);
    expect(stateCoincide({ state: "x" }, "x")).toBe(false);
  });
});

describe("mismoUsuario", () => {
  it("el usuario que empezó y el de la sesión son el mismo", () => {
    expect(mismoUsuario("u-1", "u-1")).toBe(true);
  });

  it("⭐ otro usuario o sin sesión no pasa", () => {
    expect(mismoUsuario("u-1", "u-2")).toBe(false);
    expect(mismoUsuario("u-1", null)).toBe(false);
    expect(mismoUsuario(undefined, undefined)).toBe(false);
    expect(mismoUsuario("", "")).toBe(false);
  });
});
