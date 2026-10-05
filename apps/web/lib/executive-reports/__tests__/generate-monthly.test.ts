/**
 * [REPORTES-MENSUAL-MES-EQUIVOCADO] (SCRUM-67): qué mes toma el reporte
 * mensual. El cron corre el día 1 a las 13:00 UTC (`vercel.json`), así que
 * tiene que reportar el mes que terminó.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// El módulo importa clientes de Supabase y de la IA; para estas funciones
// puras no hacen falta.
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/ai/anthropic", () => ({
  callClaudeJson: vi.fn(),
  getClientForOrg: vi.fn(),
  getModelForTask: vi.fn(),
}));
vi.mock("@/lib/ai/org-context", () => ({ buildOrgContextText: vi.fn(), getOrgContext: vi.fn() }));
vi.mock("@/lib/intelligence/organizaciones-activas", () => ({
  listActiveOrganizationIds: vi.fn(),
  organizacionSigueActiva: vi.fn(),
}));

import { mesAReportar, monthBounds } from "../generate-monthly";

/** Desfase con UTC, en minutos, el 1 de enero. */
const DESFASE_EN_ENERO: Record<string, number> = {
  UTC: 0,
  "America/Argentina/Buenos_Aires": 180,
  "Asia/Tokyo": -540,
};

describe.each(Object.keys(DESFASE_EN_ENERO))("en %s", (zona) => {
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

  describe("mesAReportar", () => {
    it("⭐ el día 1 de octubre reporta septiembre", () => {
      expect(mesAReportar(new Date(2026, 9, 1, 13, 0))).toEqual({
        start: "2026-09-01",
        end: "2026-09-30",
        label: expect.stringMatching(/^Septiembre/),
      });
    });

    it("⭐ el 1 de enero reporta diciembre del año anterior", () => {
      const m = mesAReportar(new Date(2027, 0, 1, 13, 0));
      expect(m.start).toBe("2026-12-01");
      expect(m.end).toBe("2026-12-31");
      expect(m.label).toMatch(/^Diciembre/);
      expect(m.label).toContain("2026");
    });

    it("el 1 de marzo reporta febrero, también en año bisiesto", () => {
      expect(mesAReportar(new Date(2026, 2, 1)).end).toBe("2026-02-28");
      expect(mesAReportar(new Date(2028, 2, 1)).end).toBe("2028-02-29");
    });

    it("corriendo en cualquier día del mes, reporta el mes anterior", () => {
      expect(mesAReportar(new Date(2026, 9, 15)).start).toBe("2026-09-01");
    });
  });

  describe("monthBounds", () => {
    it("⭐ las fechas no se corren de día por la zona horaria", () => {
      expect(monthBounds(new Date(2026, 9, 15))).toMatchObject({ start: "2026-10-01", end: "2026-10-31" });
    });
  });
});
