/**
 * [T-2] (SCRUM-102): de dónde sale cada ingreso (cobro) y en qué fecha cuenta.
 *
 * Hay dos fuentes:
 *   - los pagos registrados (`client_payments`), si la organización tiene al
 *     menos uno;
 *   - si no tiene ninguno, lo que dice cada cliente: el pago único en la fecha
 *     de alta y cada cuota pagada en la fecha en que se cobró.
 */

import { describe, expect, it } from "vitest";
import type { Client, ClientInstallment, ClientPayment } from "@/types/clients";
import {
  collectRevenueEvents,
  filterRevenueEvents,
  getInstallmentPaidAt,
  sumAllRecognizedRevenue,
  sumRevenueInPeriod,
} from "../revenue-events";
import { resolveRevenueDateRange } from "../revenue-period";

function cliente(overrides: Partial<Client> = {}): Client {
  return {
    id: "c1",
    name: "Cliente Uno",
    joinDate: "2026-09-10",
    paymentType: "upfront",
    platform: "other",
    totalAmount: 1000,
    status: "active",
    isSuccessCase: false,
    aiInsights: [],
    linkedCalls: [],
    ...overrides,
  } as Client;
}

function cuota(overrides: Partial<ClientInstallment> = {}): ClientInstallment {
  return { id: "i1", label: "Cuota 1", amount: 300, status: "paid", ...overrides };
}

function pago(overrides: Partial<ClientPayment> = {}): ClientPayment {
  return {
    id: "p1",
    clientId: "c1",
    amount: 500,
    paymentDate: "2026-10-05",
    storagePath: null,
    createdAt: "2026-10-05T12:00:00Z",
    ...overrides,
  };
}

const octubre = () => resolveRevenueDateRange({ preset: "month", anchor: "2026-10-15" });

describe("getInstallmentPaidAt", () => {
  const c = cliente({ paymentType: "installments", joinDate: "2026-09-10" });

  it("una cuota pendiente no cuenta", () => {
    expect(getInstallmentPaidAt(cuota({ status: "pending" }), c, 0)).toBeNull();
  });

  it("⭐ una cuota pagada cuenta en la fecha en que se cobró", () => {
    expect(getInstallmentPaidAt(cuota({ paidAt: "2026-10-03T15:00:00Z" }), c, 1)).toBe("2026-10-03");
  });

  it("⭐ la primera cuota pagada sin fecha de cobro cuenta en la fecha de alta", () => {
    expect(getInstallmentPaidAt(cuota(), c, 0)).toBe("2026-09-10");
  });

  it("⭐ otra cuota pagada sin fecha de cobro no cuenta en ningún período (no cae en el mes actual)", () => {
    expect(getInstallmentPaidAt(cuota(), c, 2)).toBeNull();
  });
});

describe("collectRevenueEvents sin pagos registrados (sale de los clientes)", () => {
  it("pago único: un ingreso por el total en la fecha de alta", () => {
    const eventos = collectRevenueEvents([cliente({ totalAmount: 2000, joinDate: "2026-10-02" })]);
    expect(eventos).toEqual([
      expect.objectContaining({ amount: 2000, date: "2026-10-02", source: "upfront", clientName: "Cliente Uno" }),
    ]);
  });

  it("⭐ cuotas que cruzan meses: cada una cuenta en el mes en que se cobró", () => {
    const c = cliente({
      paymentType: "installments",
      totalAmount: 900,
      joinDate: "2026-09-10",
      installments: [
        cuota({ id: "i1", amount: 300, paidAt: "2026-09-10" }),
        cuota({ id: "i2", amount: 300, paidAt: "2026-10-10" }),
        cuota({ id: "i3", amount: 300, status: "pending", dueDate: "2026-11-10" }),
      ],
    });
    const eventos = collectRevenueEvents([c]);
    expect(eventos.map((e) => e.date)).toEqual(["2026-09-10", "2026-10-10"]);
    expect(filterRevenueEvents(eventos, octubre()).map((e) => e.installmentId)).toEqual(["i2"]);
    expect(sumRevenueInPeriod([c], octubre())).toBe(300);
    expect(sumAllRecognizedRevenue([c])).toBe(600);
  });

  it("adelanto más fee: el adelanto en la fecha de alta y cada fee cuando se cobró", () => {
    const c = cliente({
      paymentType: "upfront_fee",
      upfrontAmount: 1000,
      joinDate: "2026-09-20",
      installments: [cuota({ id: "f1", amount: 200, paidAt: "2026-10-20" })],
    });
    const eventos = collectRevenueEvents([c]);
    expect(eventos).toEqual([
      expect.objectContaining({ amount: 1000, date: "2026-09-20", source: "upfront_portion" }),
      expect.objectContaining({ amount: 200, date: "2026-10-20", source: "recurring_fee", installmentId: "f1" }),
    ]);
  });

  it("adelanto en 0: no genera un ingreso de 0", () => {
    const c = cliente({ paymentType: "upfront_fee", upfrontAmount: 0, installments: [] });
    expect(collectRevenueEvents([c])).toEqual([]);
  });
});

describe("collectRevenueEvents con pagos registrados", () => {
  it("⭐ cada pago es un ingreso en su fecha de pago", () => {
    const eventos = collectRevenueEvents([cliente()], [pago({ amount: 500, paymentDate: "2026-10-05T03:00:00Z" })]);
    expect(eventos).toEqual([expect.objectContaining({ amount: 500, date: "2026-10-05", clientName: "Cliente Uno" })]);
  });

  it("el tipo de ingreso sale del tipo de pago del cliente y del número de cuota", () => {
    const clientes = [
      cliente({ id: "u", paymentType: "upfront" }),
      cliente({ id: "c", paymentType: "installments" }),
      cliente({ id: "f", paymentType: "upfront_fee" }),
    ];
    const eventos = collectRevenueEvents(clientes, [
      pago({ id: "1", clientId: "u" }),
      pago({ id: "2", clientId: "c", installmentNumber: 1 }),
      pago({ id: "3", clientId: "c", installmentNumber: 2 }),
      pago({ id: "4", clientId: "f", installmentNumber: 1 }),
      pago({ id: "5", clientId: "f", installmentNumber: 3 }),
    ]);
    expect(eventos.map((e) => e.source)).toEqual([
      "upfront",
      "installment",
      "installment",
      "upfront_portion",
      "recurring_fee",
    ]);
    expect(eventos[2]!.installmentLabel).toBe("Cuota 2");
  });

  it("un pago de un cliente que ya no está figura como \"Cliente\"", () => {
    const eventos = collectRevenueEvents([], [pago({ clientId: "borrado" })]);
    expect(eventos[0]).toMatchObject({ clientName: "Cliente", platform: "other", source: "upfront" });
  });

  it("los pagos de octubre suman en octubre y no en septiembre", () => {
    const pagos = [pago({ id: "a", amount: 500, paymentDate: "2026-10-01" }), pago({ id: "b", amount: 200, paymentDate: "2026-09-30" })];
    expect(sumRevenueInPeriod([cliente()], octubre(), pagos)).toBe(500);
    expect(sumAllRecognizedRevenue([cliente()], pagos)).toBe(700);
  });

  it("hoy: con un solo pago registrado, los clientes sin pagos dejan de contar", () => {
    // Clientes importados (Excel, ClickUp) o viejos no tienen filas en
    // client_payments. Apenas la organización registra su primer pago, la
    // facturación pasa a salir sólo de los pagos y esos clientes desaparecen.
    // Está anotado para que se decida si es lo buscado.
    const importado = cliente({ id: "importado", totalAmount: 5000, joinDate: "2026-10-03" });
    const nuevo = cliente({ id: "nuevo", totalAmount: 800, joinDate: "2026-10-04" });
    const pagos = [pago({ clientId: "nuevo", amount: 800, paymentDate: "2026-10-04" })];

    expect(sumRevenueInPeriod([importado, nuevo], octubre())).toBe(5800);
    expect(sumRevenueInPeriod([importado, nuevo], octubre(), pagos)).toBe(800);
  });
});
