/**
 * SCRUM-493: el gráfico de ingresos de los últimos 7 días del panel. Los días
 * son fechas locales, igual que las fechas de cobro: con la de UTC, a las
 * 22:00 de Argentina el último punto ya era mañana y lo cobrado hoy no
 * aparecía.
 */
import { afterEach, describe, expect, it } from "vitest";
import { conZona, restaurarZona } from "@/lib/fechas/__tests__/zona";
import type { Client } from "@/types/clients";
import { deriveDashboardRevenueTrend } from "../derive-dashboard-data";

afterEach(restaurarZona);

function cliente(joinDate: string, totalAmount: number): Client {
  return {
    id: joinDate,
    name: "Cliente",
    joinDate,
    paymentType: "upfront",
    platform: "other",
    totalAmount,
    status: "active",
    isSuccessCase: false,
    aiInsights: [],
    linkedCalls: [],
  } as Client;
}

describe("⭐ deriveDashboardRevenueTrend a las 22:00 de Argentina", () => {
  /** 1-oct-2026, 22:00 en Buenos Aires = 2-oct, 01:00 UTC. */
  const ahora = new Date("2026-10-02T01:00:00Z");

  it("lo cobrado hoy cae en el último punto, y lo de hace 6 días en el primero", () => {
    conZona("America/Argentina/Buenos_Aires");
    const puntos = deriveDashboardRevenueTrend(
      [cliente("2026-10-01", 1000), cliente("2026-09-25", 300), cliente("2026-09-24", 50)],
      ahora
    );
    expect(puntos).toHaveLength(7);
    expect(puntos[6]!.value).toBe(1000);
    expect(puntos[0]!.value).toBe(300);
    expect(puntos.reduce((total, p) => total + p.value, 0)).toBe(1300);
  });
});
