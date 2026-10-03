/**
 * [T-1] (SCRUM-101): la serie de los últimos 6 meses del Panel y de Finanzas.
 *
 * Corre en UTC, Argentina, Madrid y Tokio: antes, en una zona al este de UTC,
 * cada barra mostraba los datos del mes anterior.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client, ClientPayment } from "@/types/clients";
import type { ExpensesSummary } from "@/types/expenses";
import { deriveMonthlySeries } from "../derive-monthly-series";

const DESFASE_EN_ENERO: Record<string, number> = {
  UTC: 0,
  "America/Argentina/Buenos_Aires": 180,
  "Europe/Madrid": -60,
  "Asia/Tokyo": -540,
};

function gastos(totalMonthly = 0): ExpensesSummary {
  return { fixedMonthly: 0, subscriptionsMonthly: 0, teamFixedMonthly: 0, teamCommissionsMonthly: 0, totalMonthly };
}

function cliente(overrides: Partial<Client> = {}): Client {
  return {
    id: "c1",
    name: "Cliente",
    joinDate: "2026-10-01",
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

function pago(overrides: Partial<ClientPayment>): ClientPayment {
  return { id: "p", clientId: "c1", amount: 100, paymentDate: "2026-10-01", storagePath: null, createdAt: "", ...overrides };
}

const hoy = () => new Date(2026, 9, 15, 12, 0); // 15 de octubre de 2026, hora local

describe.each(Object.keys(DESFASE_EN_ENERO))("deriveMonthlySeries en %s", (zona) => {
  let tzAnterior: string | undefined;
  beforeAll(() => {
    tzAnterior = process.env.TZ;
    process.env.TZ = zona;
    expect(new Date(2026, 0, 1).getTimezoneOffset(), "la zona horaria no cambió").toBe(DESFASE_EN_ENERO[zona]);
  });
  afterAll(() => {
    if (tzAnterior === undefined) delete process.env.TZ;
    else process.env.TZ = tzAnterior;
  });

  it("⭐ son los últimos 6 meses, terminando en el actual", () => {
    expect(deriveMonthlySeries([], gastos(), undefined, hoy()).map((p) => p.month)).toEqual([
      "May",
      "Jun",
      "Jul",
      "Ago",
      "Sep",
      "Oct",
    ]);
  });

  it("⭐ un cobro del día 1 cae en su mes, no en el anterior", () => {
    const serie = deriveMonthlySeries([cliente({ joinDate: "2026-10-01", totalAmount: 700 })], gastos(), undefined, hoy());
    expect(serie.find((p) => p.month === "Oct")!.facturacion).toBe(700);
    expect(serie.find((p) => p.month === "Sep")!.facturacion).toBe(0);
  });

  it("los meses sin cobros quedan en 0, sin NaN", () => {
    const serie = deriveMonthlySeries([], gastos(300), undefined, hoy());
    for (const p of serie) {
      expect(p.facturacion).toBe(0);
      expect(p.marginPercent).toBe(0);
      expect(p.cashCollected).toBe(-300);
    }
  });

  it("separa pagos únicos, cuotas y fees", () => {
    const clientes = [
      cliente({ id: "u", paymentType: "upfront" }),
      cliente({ id: "i", paymentType: "installments" }),
      cliente({ id: "f", paymentType: "upfront_fee" }),
    ];
    const pagos = [
      pago({ id: "1", clientId: "u", amount: 500, paymentDate: "2026-10-02" }),
      pago({ id: "2", clientId: "i", amount: 200, paymentDate: "2026-10-03", installmentNumber: 2 }),
      pago({ id: "3", clientId: "f", amount: 50, paymentDate: "2026-10-04", installmentNumber: 3 }),
    ];
    const oct = deriveMonthlySeries(clientes, gastos(250), pagos, hoy()).find((p) => p.month === "Oct")!;
    expect(oct).toMatchObject({ facturacion: 750, upfront: 500, installments: 200, fees: 50, cashCollected: 500 });
    expect(oct.marginPercent).toBeCloseTo((500 / 750) * 100);
  });

  it("el cambio de año: en enero la serie arranca en agosto del año anterior", () => {
    expect(deriveMonthlySeries([], gastos(), undefined, new Date(2027, 0, 10)).map((p) => p.month)).toEqual([
      "Ago",
      "Sep",
      "Oct",
      "Nov",
      "Dic",
      "Ene",
    ]);
  });
});
