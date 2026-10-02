import { describe, expect, it } from "vitest";
import { cantidadPendienteVisible } from "../llamadas-sin-asociar";

describe("cantidadPendienteVisible (SCRUM-31)", () => {
  it("⭐ muestra la cantidad de llamadas pendientes", () => {
    expect(cantidadPendienteVisible(1)).toBe("1");
    expect(cantidadPendienteVisible(42)).toBe("42");
  });

  it("sin pendientes no muestra número", () => {
    expect(cantidadPendienteVisible(0)).toBeNull();
    expect(cantidadPendienteVisible(-3)).toBeNull();
    expect(cantidadPendienteVisible(Number.NaN)).toBeNull();
  });

  it("más de 99 se abrevia", () => {
    expect(cantidadPendienteVisible(99)).toBe("99");
    expect(cantidadPendienteVisible(100)).toBe("99+");
  });
});
