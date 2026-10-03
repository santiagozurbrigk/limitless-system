/**
 * [T-1] (SCRUM-101): el resumen de Finanzas (facturación, gastos, margen, por
 * cobrar, saldo por plataforma) y el desglose por closer.
 *
 * Corre en UTC (como Vercel), en Argentina (como el navegador de los usuarios)
 * y en Madrid, para que se note si una fecha se corre de mes.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client, ClientInstallment, ClientPayment } from "@/types/clients";
import type { ClosingCall } from "@/types/closing";
import type { ExpensesSummary } from "@/types/expenses";
import type { PaymentPlatformConfig } from "@/types/finance";
import { deriveCloserBreakdown, deriveFinanceSummary } from "../derive-finance-summary";

const DESFASE_EN_ENERO: Record<string, number> = {
  UTC: 0,
  "America/Argentina/Buenos_Aires": 180,
  "Europe/Madrid": -60,
};

function llamada(overrides: Partial<ClosingCall> = {}): ClosingCall {
  return {
    id: "l1",
    leadName: "Lead",
    scheduledAt: "2026-10-05T15:00:00Z",
    status: "closed",
    formAnswers: [],
    outcome: { revenue: 1000 },
    closedByName: "Ana",
    ...overrides,
  } as ClosingCall;
}

function cliente(overrides: Partial<Client> = {}): Client {
  return {
    id: "c1",
    name: "Cliente",
    joinDate: "2026-10-03",
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
  return { id: "i", label: "Cuota", amount: 100, status: "pending", ...overrides };
}

function gastos(totalMonthly = 0): ExpensesSummary {
  return { fixedMonthly: 0, subscriptionsMonthly: 0, teamFixedMonthly: 0, teamCommissionsMonthly: 0, totalMonthly };
}

const octubre = { preset: "month" as const, anchor: "2026-10-15" };

describe("deriveCloserBreakdown", () => {
  it("sin cierres no hay closers", () => {
    expect(deriveCloserBreakdown([])).toEqual([]);
    expect(deriveCloserBreakdown([llamada({ status: "not_closed" as ClosingCall["status"] })])).toEqual([]);
  });

  it("⭐ un closer: suma sus cierres, su facturación y la comisión (10 % por defecto)", () => {
    const r = deriveCloserBreakdown([llamada({ id: "a", outcome: { revenue: 1000 } } as Partial<ClosingCall>), llamada({ id: "b", outcome: { revenue: 555 } } as Partial<ClosingCall>)]);
    expect(r).toEqual([{ id: "closer-0", name: "Ana", dealsClosed: 2, revenue: 1555, commission: 156 }]);
  });

  it("varios closers y una comisión distinta", () => {
    const r = deriveCloserBreakdown(
      [llamada({ closedByName: "Ana" }), llamada({ closedByName: "Beto", outcome: { revenue: 2000 } } as Partial<ClosingCall>)],
      0.2
    );
    expect(r.map((c) => [c.name, c.commission])).toEqual([["Ana", 200], ["Beto", 400]]);
  });

  it("⭐ un cierre sin quién lo cerró va a «Sin asignar»", () => {
    const r = deriveCloserBreakdown([llamada({ closedByName: undefined }), llamada({ closedByName: "   " })]);
    expect(r).toEqual([expect.objectContaining({ name: "Sin asignar", dealsClosed: 2 })]);
  });

  it("un cierre sin resultado cargado no cuenta", () => {
    expect(deriveCloserBreakdown([llamada({ outcome: undefined })])).toEqual([]);
  });

  it("hoy: un cierre con facturación 0 no cuenta como cierre", () => {
    // Una venta cerrada a 0 (bonificada) no suma al closer. Se deja escrito.
    expect(deriveCloserBreakdown([llamada({ outcome: { revenue: 0 } } as Partial<ClosingCall>)])).toEqual([]);
  });
});

describe.each(Object.keys(DESFASE_EN_ENERO))("deriveFinanceSummary en %s", (zona) => {
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

  it("⭐ facturación del período, gastos, ganancia y margen", () => {
    const r = deriveFinanceSummary([cliente({ totalAmount: 2000, joinDate: "2026-10-03" })], [], gastos(500), [], octubre);
    expect(r.facturacion).toBe(2000);
    expect(r.gastosTotales).toBe(500);
    expect(r.cashCollected).toBe(1500);
    expect(r.margenPercent).toBeCloseTo(75);
  });

  it("sin facturación el margen es 0, no NaN", () => {
    const r = deriveFinanceSummary([], [], gastos(500), [], octubre);
    expect(r.facturacion).toBe(0);
    expect(r.margenPercent).toBe(0);
    expect(r.cashCollected).toBe(-500);
  });

  it("lo cobrado en otro mes no entra en el período", () => {
    const r = deriveFinanceSummary([cliente({ joinDate: "2026-09-30" })], [], gastos(), [], octubre);
    expect(r.facturacion).toBe(0);
  });

  it("⭐ por cobrar no queda negativo si un cliente pagó de más", () => {
    const pagado = cliente({ totalAmount: 1000, paymentType: "installments", installments: [cuota({ status: "paid", amount: 1500, paidAt: "2026-10-03" })] });
    const debe = cliente({ id: "c2", totalAmount: 900, paymentType: "installments", installments: [cuota({ status: "paid", amount: 300, paidAt: "2026-10-03" })] });
    expect(deriveFinanceSummary([pagado, debe], [], gastos(), [], octubre).porCobrar).toBe(600);
  });

  it("⭐ una cuota que vence el día 1 cuenta en ese mes, no en el anterior", () => {
    const c = cliente({ paymentType: "installments", installments: [cuota({ dueDate: "2026-10-01", amount: 300 })] });
    const r = deriveFinanceSummary([c], [], gastos(), [], octubre);
    expect(r.porCobrarByMonth).toEqual([{ month: "octubre", amount: 300 }]);
  });

  it("⭐ por cobrar por mes: en orden y sin mezclar el mismo mes de dos años", () => {
    const c = cliente({
      paymentType: "installments",
      installments: [
        cuota({ id: "a", dueDate: "2027-10-10", amount: 100 }),
        cuota({ id: "b", dueDate: "2026-11-10", amount: 200 }),
        cuota({ id: "c", dueDate: "2026-10-10", amount: 300 }),
        cuota({ id: "d", dueDate: "2026-10-20", amount: 50 }),
      ],
    });
    const r = deriveFinanceSummary([c], [], gastos(), [], octubre);
    expect(r.porCobrarByMonth).toEqual([
      { month: "octubre 2026", amount: 350 },
      { month: "noviembre 2026", amount: 200 },
      { month: "octubre 2027", amount: 100 },
    ]);
  });

  it("una cuota con un vencimiento que no se puede leer no entra en el gráfico por mes", () => {
    const c = cliente({ paymentType: "installments", installments: [cuota({ dueDate: "basura" }), cuota({ id: "ok", dueDate: "2026-10-10" })] });
    expect(deriveFinanceSummary([c], [], gastos(), [], octubre).porCobrarByMonth).toEqual([{ month: "octubre", amount: 100 }]);
  });

  it("una cuota pendiente sin vencimiento no entra en el gráfico por mes", () => {
    const c = cliente({ paymentType: "installments", installments: [cuota({ dueDate: undefined })] });
    expect(deriveFinanceSummary([c], [], gastos(), [], octubre).porCobrarByMonth).toEqual([]);
  });

  it("saldo por plataforma: por destino del pago y, si no, por el tipo de plataforma del cliente", () => {
    const plataformas: PaymentPlatformConfig[] = [
      { id: "pp-mp", name: "Mercado Pago", slug: "mercadopago", currency: "ARS", totalReceived: 0, lastTransactionAt: "" },
      { id: "pp-banco", name: "Banco", currency: "USD", totalReceived: 0, lastTransactionAt: "" },
    ];
    const clientes = [cliente({ id: "c1", platform: "mercadopago" as Client["platform"] }), cliente({ id: "c2" })];
    const pagos: ClientPayment[] = [
      { id: "p1", clientId: "c1", amount: 400, paymentDate: "2026-10-05", storagePath: null, createdAt: "" },
      { id: "p2", clientId: "c2", amount: 250, paymentDate: "2026-10-06", storagePath: null, createdAt: "", paymentDestinationPlatformId: "pp-banco" },
    ];
    const r = deriveFinanceSummary(clientes, [], gastos(), plataformas, octubre, pagos);
    expect(r.platformBalances).toEqual([
      { platformId: "pp-mp", amount: 400 },
      { platformId: "pp-banco", amount: 250 },
    ]);
  });

  it("hoy: no hay reembolsos en el modelo; un monto negativo resta de la facturación", () => {
    // El esquema de pagos no admite montos negativos (moneySchema min 0), así
    // que esto no se puede cargar por la app. Se deja escrito cómo se suma.
    const pagos: ClientPayment[] = [
      { id: "p1", clientId: "c1", amount: 1000, paymentDate: "2026-10-05", storagePath: null, createdAt: "" },
      { id: "p2", clientId: "c1", amount: -200, paymentDate: "2026-10-06", storagePath: null, createdAt: "" },
    ];
    expect(deriveFinanceSummary([cliente()], [], gastos(), [], octubre, pagos).facturacion).toBe(800);
  });
});
