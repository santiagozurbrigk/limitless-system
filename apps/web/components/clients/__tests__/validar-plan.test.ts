import { describe, expect, it, vi } from "vitest";

/**
 * SCRUM-504 (AR pasada 5, MENOR-1): el editor de planes no deja guardar un
 * monto por cuota con más de dos decimales. Un plan con 333.333 por cuota
 * hacía que, al cerrar una venta, el pago se rechazara después de cerrar la
 * llamada y crear el cliente.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/app/clients/plan-actions", () => ({
  createPlanAction: vi.fn(),
  updatePlanAction: vi.fn(),
  deletePlanAction: vi.fn(),
}));

import { validarPlan } from "../plan-manager-dialog";

const sistema = (amountPerInstallment: string) => ({ id: "s", name: "3 cuotas", count: "3", amountPerInstallment });

describe("validarPlan", () => {
  it("⭐ rechaza un monto por cuota con más de dos decimales, con motivo", () => {
    expect(validarPlan({ name: "Plan", durationDays: "", systems: [sistema("333.333")] })).toBe(
      'Sistema "3 cuotas": el monto por cuota puede tener hasta dos decimales.'
    );
  });

  it("acepta dos decimales y el monto vacío", () => {
    expect(validarPlan({ name: "Plan", durationDays: "", systems: [sistema("333.33")] })).toBeNull();
    expect(validarPlan({ name: "Plan", durationDays: "", systems: [sistema("")] })).toBeNull();
  });

  it("sigue pidiendo nombre y cuotas positivas", () => {
    expect(validarPlan({ name: " ", durationDays: "", systems: [] })).toBe("El nombre del plan es obligatorio.");
    expect(validarPlan({ name: "Plan", durationDays: "", systems: [{ ...sistema("10"), count: "0" }] })).toContain(
      "el número de cuotas debe ser positivo"
    );
  });
});
