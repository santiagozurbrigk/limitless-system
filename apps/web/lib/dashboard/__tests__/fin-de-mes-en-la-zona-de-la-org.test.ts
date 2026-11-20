/**
 * SCRUM-540 · AR pasada 2 (BLOQUEANTE-1): el Panel y el resumen de Ventas se
 * calculan en el servidor, y "este mes" tiene que ser el de la organización,
 * no el del reloj del proceso (UTC en Vercel). Regla de SCRUM-493.
 *
 * Una org en Honduras (UTC-6), el 31 de octubre a las 21:00 de allá: en UTC ya
 * es 1 de noviembre. Con el proceso en UTC, el Panel y el resumen tienen que
 * dar octubre, como daba el navegador de quien mira en `main`. Las filas son
 * las de la AR (`ar-p2/tz/datos-comunes.ts`).
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { diaLocal, fechaDeHoyEnZona } from "@/lib/fechas/calendario";
import { calcularDatosDelPanel } from "@/lib/dashboard/datos-del-panel";
import {
  calcularResumenFinanciero,
  resumenDeGastos,
  resumenParaVentas,
} from "@/lib/finance/resumen-financiero";
import { ENTRADAS } from "./filas-fin-de-mes";

const ZONA = "America/Tegucigalpa";

const tzOriginal = process.env.TZ;
beforeAll(() => {
  // El proceso en UTC, como en Vercel.
  process.env.TZ = "UTC";
});
afterAll(() => {
  process.env.TZ = tzOriginal;
});
afterEach(() => {
  vi.useRealTimers();
});

function a(instante: string) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(instante));
  return fechaDeHoyEnZona(ZONA);
}

function panel(hoy: string) {
  const { data } = calcularDatosDelPanel({
    ...ENTRADAS,
    conversations: [],
    metricasImportadas: null,
    hoy,
    frequentObjections: [],
  });
  return Object.fromEntries(data.revenueMetrics.map((m) => [m.label, m.value]));
}

describe("el mes del Panel y del resumen de Ventas es el de la organización", () => {
  it("⭐ 31 de octubre 21:00 en Honduras (1 de noviembre 03:00 UTC) con el proceso en UTC: el Panel da octubre", () => {
    const hoy = a("2026-11-01T03:00:00Z");
    expect(hoy).toBe("2026-10-31");
    expect(new Date().getUTCDate()).toBe(1); // el reloj del proceso ya está en noviembre
    const m = panel(hoy);
    expect(m["MRR"]).toBe(panel("2026-10-15")["MRR"]);
    expect(m["MRR"]).not.toBe(panel("2026-11-15")["MRR"]);
    expect(m["Nuevos clientes"]).toBe("1");
    // Gastos del mes con la comisión de octubre (800 de sueldo + 300).
    expect(resumenDeGastos(ENTRADAS, diaLocal(hoy)).totalMonthly).toBe(1100);
  });

  it("⭐ y el resumen de Ventas: facturación de octubre y el último mes de la serie es octubre", () => {
    const hoy = a("2026-11-01T03:00:00Z");
    const r = resumenParaVentas(calcularResumenFinanciero(ENTRADAS, diaLocal(hoy)));
    expect(r.financeSummary.facturacion).toBe(3000);
    expect(r.monthlySeries.at(-1)?.month).toBe("Oct");
    expect(r.expensesSummary.totalMonthly).toBe(1100);
  });

  it("⭐ un cobro con fecha de noviembre no entra al MRR mientras en la org siga siendo octubre (el total precalculado también usa el día de la org)", () => {
    const hoy = a("2026-11-01T03:00:00Z");
    const soloNoviembre = {
      ...ENTRADAS,
      clients: ENTRADAS.clients.map((c) => ({ ...c, joinDate: "2026-09-01" })),
      payments: [{ ...ENTRADAS.payments[0]!, paymentDate: "2026-11-01" }],
    };
    const { data } = calcularDatosDelPanel({
      ...soloNoviembre,
      conversations: [],
      metricasImportadas: null,
      hoy,
      frequentObjections: [],
    });
    const mrrDeOctubre = Object.fromEntries(data.revenueMetrics.map((m) => [m.label, m.value]))["MRR"];
    const conLaOrgEnNoviembre = calcularDatosDelPanel({
      ...soloNoviembre,
      conversations: [],
      metricasImportadas: null,
      hoy: "2026-11-01",
      frequentObjections: [],
    });
    expect(mrrDeOctubre).not.toBe(
      Object.fromEntries(conLaOrgEnNoviembre.data.revenueMetrics.map((m) => [m.label, m.value]))["MRR"]
    );
  });

  it("cuando en Honduras ya es 1 de noviembre, noviembre", () => {
    const hoy = a("2026-11-01T07:00:00Z");
    expect(hoy).toBe("2026-11-01");
    expect(panel(hoy)["Nuevos clientes"]).toBe("0");
    const r = resumenParaVentas(calcularResumenFinanciero(ENTRADAS, diaLocal(hoy)));
    expect(r.financeSummary.facturacion).toBe(0);
    expect(r.monthlySeries.at(-1)?.month).toBe("Nov");
  });
});
