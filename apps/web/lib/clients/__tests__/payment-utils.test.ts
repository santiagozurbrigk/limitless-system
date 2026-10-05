/**
 * [T-4] (SCRUM-104): cómo se lee del payload de cierre de venta el monto
 * pagado, la fecha del pago y el número de cuota que se registran en
 * `client_payments`.
 *
 * Dos arreglos salieron al escribirlos: la fecha de "hoy" era la de UTC (un
 * pago registrado de noche en Argentina quedaba con fecha de mañana) y, con
 * montos manuales por cuota, el respaldo usaba el promedio en vez de la
 * primera cuota. El caso marcado "hoy" deja escrito un comportamiento que no
 * se cambia acá: el modal de pago no deja cerrar con `paidAmount <= 0`
 * (`payment-modal.tsx`), así que esa rama no se usa en la práctica.
 *
 * Desde SCRUM-493 el "hoy" del pago es el de la zona de la organización
 * (`fechaDeHoyEnZona`), que arma quien llama; sus casos, incluido el de las
 * 22:00 de Argentina, están en `lib/fechas/__tests__/calendario.test.ts`.
 */

import { describe, expect, it } from "vitest";
import type { ClosePaymentPayload } from "@/types/closing";
import {
  getPaidAmountFromClosePayload,
  getPaymentDateFromClosePayload,
  installmentNumberForClosePayload,
} from "../payment-utils";

function payload(overrides: Partial<ClosePaymentPayload> = {}): ClosePaymentPayload {
  return {
    clientName: "Cliente de prueba",
    paymentReceivedFrom: "Banco",
    paymentDestinationPlatformId: "plataforma-1",
    paymentType: "upfront",
    paidAmount: 0,
    paymentDate: "",
    proof: { storagePath: "", mimeType: "", fileName: "" },
    ...overrides,
  };
}

describe("getPaidAmountFromClosePayload", () => {
  it("⭐ si viene el monto pagado, usa ese, sea cual sea el tipo de pago", () => {
    expect(getPaidAmountFromClosePayload(payload({ paymentType: "upfront", paidAmount: 1500, totalAmount: 2000 }))).toBe(1500);
    expect(
      getPaidAmountFromClosePayload(payload({ paymentType: "installments", paidAmount: 300, installmentAmount: 500 }))
    ).toBe(300);
    expect(getPaidAmountFromClosePayload(payload({ paymentType: "upfront_fee", paidAmount: 800, upfrontAmount: 1000 }))).toBe(800);
  });

  it("pago único sin monto pagado: usa el total", () => {
    expect(getPaidAmountFromClosePayload(payload({ paymentType: "upfront", totalAmount: 2000 }))).toBe(2000);
  });

  it("cuotas sin monto pagado: usa el monto de la cuota", () => {
    expect(
      getPaidAmountFromClosePayload(payload({ paymentType: "installments", installmentCount: 3, installmentAmount: 500 }))
    ).toBe(500);
  });

  it("adelanto más fee sin monto pagado: usa el adelanto", () => {
    expect(getPaidAmountFromClosePayload(payload({ paymentType: "upfront_fee", upfrontAmount: 1000, feeAmount: 200 }))).toBe(1000);
  });

  it("un monto pagado negativo no cuenta: cae al respaldo del tipo de pago", () => {
    expect(getPaidAmountFromClosePayload(payload({ paymentType: "upfront", paidAmount: -100, totalAmount: 2000 }))).toBe(2000);
  });

  it("⭐ cuotas con montos manuales: usa la primera cuota, no el promedio", () => {
    expect(
      getPaidAmountFromClosePayload(
        payload({
          paymentType: "installments",
          installmentCount: 2,
          installmentAmount: 750,
          customInstallmentAmounts: [1000, 500],
        })
      )
    ).toBe(1000);
  });

  it("cuotas con una primera cuota manual en 0: cae al promedio, no registra un pago de 0", () => {
    expect(
      getPaidAmountFromClosePayload(
        payload({ paymentType: "installments", installmentAmount: 250, customInstallmentAmounts: [0, 500] })
      )
    ).toBe(250);
  });

  it("hoy: un payload incompleto devuelve 0 en vez de marcar que falta el monto", () => {
    expect(getPaidAmountFromClosePayload(payload({ paymentType: "upfront" }))).toBe(0);
    expect(getPaidAmountFromClosePayload(payload({ paymentType: "installments" }))).toBe(0);
    expect(getPaidAmountFromClosePayload(payload({ paymentType: "upfront_fee" }))).toBe(0);
  });
});

describe("getPaymentDateFromClosePayload", () => {
  /** El hoy de la organización, que arma quien llama (SCRUM-493). */
  const HOY = "2026-10-02";

  it("⭐ si viene la fecha del pago, usa esa", () => {
    expect(getPaymentDateFromClosePayload(payload({ paymentDate: "2026-09-15" }), HOY)).toBe(
      "2026-09-15"
    );
    expect(
      getPaymentDateFromClosePayload(
        payload({ paymentType: "installments", paymentDate: "2026-09-15", firstInstallmentDate: "2026-10-01" }),
        HOY
      )
    ).toBe("2026-09-15");
  });

  it("cuotas sin fecha de pago: usa la fecha de la primera cuota", () => {
    expect(
      getPaymentDateFromClosePayload(
        payload({ paymentType: "installments", firstInstallmentDate: "2026-10-01" }),
        HOY
      )
    ).toBe("2026-10-01");
  });

  it("la primera cuota sólo se usa en pagos en cuotas", () => {
    expect(
      getPaymentDateFromClosePayload(
        payload({ paymentType: "upfront", firstInstallmentDate: "2026-10-01" }),
        HOY
      )
    ).toBe("2026-10-02");
  });

  it("sin ninguna fecha: usa el hoy de la organización que recibe", () => {
    expect(getPaymentDateFromClosePayload(payload(), HOY)).toBe("2026-10-02");
  });
});

describe("installmentNumberForClosePayload", () => {
  it("⭐ un cierre en cuotas registra la cuota 1", () => {
    expect(installmentNumberForClosePayload(payload({ paymentType: "installments" }))).toBe(1);
  });

  it("pago único y adelanto más fee no tienen número de cuota", () => {
    expect(installmentNumberForClosePayload(payload({ paymentType: "upfront" }))).toBeNull();
    expect(installmentNumberForClosePayload(payload({ paymentType: "upfront_fee" }))).toBeNull();
  });
});
