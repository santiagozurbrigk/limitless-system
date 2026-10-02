/**
 * [T-2] (SCRUM-102): períodos de facturación (día, semana, mes, personalizado),
 * pertenencia de una fecha al período y prorrateo de gastos mensuales.
 *
 * Todas las fechas se leen como día local (`parseDateOnly`). Los casos corren
 * en tres zonas horarias: UTC (como Vercel), Argentina (como el navegador de
 * los usuarios) y Madrid, que tiene cambio de horario, para que se note un
 * cambio que mezcle UTC con hora local o que cuente días por milisegundos.
 *
 * Cambiar `process.env.TZ` en tiempo de ejecución funciona con el pool
 * `forks` de vitest (el de por defecto). El `beforeAll` comprueba que la zona
 * cambió de verdad, así que si alguien pasa a `threads` el test falla en vez
 * de pasar sin probar nada.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  isDateInRange,
  parseDateOnly,
  prorateMonthlyExpenses,
  resolveRevenueDateRange,
} from "../revenue-period";

/** YYYY-MM-DD de una fecha local, para comparar sin depender del huso. */
function dia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Desfase con UTC, en minutos, el 1 de enero (como lo da getTimezoneOffset). */
const DESFASE_EN_ENERO: Record<string, number> = {
  UTC: 0,
  "America/Argentina/Buenos_Aires": 180,
  "Europe/Madrid": -60,
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

  describe("parseDateOnly", () => {
    it("⭐ lee sólo la parte de la fecha, sin correrse de día por la hora", () => {
      expect(dia(parseDateOnly("2026-10-01"))).toBe("2026-10-01");
      expect(dia(parseDateOnly("2026-10-01T23:30:00Z"))).toBe("2026-10-01");
      expect(dia(parseDateOnly("2026-10-01T00:30:00-03:00"))).toBe("2026-10-01");
    });
  });

  describe("resolveRevenueDateRange", () => {
    it("día: empieza y termina el mismo día", () => {
      const p = resolveRevenueDateRange({ preset: "day", anchor: "2026-10-07" });
      expect(dia(p.start)).toBe("2026-10-07");
      expect(dia(p.end)).toBe("2026-10-07");
      expect(p.dayCount).toBe(1);
    });

    it("semana: de lunes a domingo", () => {
      const p = resolveRevenueDateRange({ preset: "week", anchor: "2026-10-07" }); // miércoles
      expect(dia(p.start)).toBe("2026-10-05");
      expect(dia(p.end)).toBe("2026-10-11");
      expect(p.dayCount).toBe(7);
    });

    it("⭐ semana con el ancla en domingo: es la semana que termina ese domingo, no la siguiente", () => {
      const p = resolveRevenueDateRange({ preset: "week", anchor: "2026-10-11" });
      expect(dia(p.start)).toBe("2026-10-05");
      expect(dia(p.end)).toBe("2026-10-11");
    });

    it("⭐ semana que cruza de mes", () => {
      const p = resolveRevenueDateRange({ preset: "week", anchor: "2026-09-30" });
      expect(dia(p.start)).toBe("2026-09-28");
      expect(dia(p.end)).toBe("2026-10-04");
      expect(p.dayCount).toBe(7);
    });

    it("mes: del 1 al último día, con el nombre del mes en mayúscula", () => {
      const p = resolveRevenueDateRange({ preset: "month", anchor: "2026-02-15" });
      expect(dia(p.start)).toBe("2026-02-01");
      expect(dia(p.end)).toBe("2026-02-28");
      expect(p.dayCount).toBe(28);
      expect(p.label).toMatch(/^Febrero/);
      expect(p.label).toContain("2026");
    });

    it("mes de febrero en año bisiesto", () => {
      const p = resolveRevenueDateRange({ preset: "month", anchor: "2028-02-10" });
      expect(dia(p.end)).toBe("2028-02-29");
      expect(p.dayCount).toBe(29);
    });

    it("mes de diciembre termina el 31", () => {
      const p = resolveRevenueDateRange({ preset: "month", anchor: "2026-12-31" });
      expect(dia(p.start)).toBe("2026-12-01");
      expect(dia(p.end)).toBe("2026-12-31");
      expect(p.dayCount).toBe(31);
    });

    it("personalizado: cuenta los días incluidos los dos extremos", () => {
      const p = resolveRevenueDateRange({ preset: "custom", customFrom: "2026-09-25", customTo: "2026-10-05" });
      expect(dia(p.start)).toBe("2026-09-25");
      expect(dia(p.end)).toBe("2026-10-05");
      expect(p.dayCount).toBe(11);
    });

    it("⭐ un rango que cruza el cambio de horario cuenta todos los días", () => {
      // En Europa el horario de verano empieza el último domingo de marzo.
      const marzo = resolveRevenueDateRange({ preset: "custom", customFrom: "2026-03-01", customTo: "2026-03-31" });
      expect(marzo.dayCount).toBe(31);
      const octubreEuropa = resolveRevenueDateRange({ preset: "custom", customFrom: "2026-10-20", customTo: "2026-10-31" });
      expect(octubreEuropa.dayCount).toBe(12);
    });

    it("personalizado con las fechas invertidas: las ordena", () => {
      const p = resolveRevenueDateRange({ preset: "custom", customFrom: "2026-10-05", customTo: "2026-09-25" });
      expect(dia(p.start)).toBe("2026-09-25");
      expect(dia(p.end)).toBe("2026-10-05");
    });

    it("personalizado sin una de las fechas: usa el ancla", () => {
      const p = resolveRevenueDateRange({ preset: "custom", anchor: "2026-10-10", customFrom: "2026-10-01" });
      expect(dia(p.start)).toBe("2026-10-01");
      expect(dia(p.end)).toBe("2026-10-10");
    });

    it("sin ancla: usa el día de `now`", () => {
      const p = resolveRevenueDateRange({ preset: "day" }, new Date(2026, 9, 15, 18, 30));
      expect(dia(p.start)).toBe("2026-10-15");
    });
  });

  describe("isDateInRange", () => {
    const octubre = () => resolveRevenueDateRange({ preset: "month", anchor: "2026-10-15" });

    it("⭐ los dos extremos del período cuentan", () => {
      expect(isDateInRange("2026-10-01", octubre())).toBe(true);
      expect(isDateInRange("2026-10-31", octubre())).toBe(true);
    });

    it("⭐ el día anterior y el siguiente no cuentan", () => {
      expect(isDateInRange("2026-09-30", octubre())).toBe(false);
      expect(isDateInRange("2026-11-01", octubre())).toBe(false);
    });

    it("una fecha con hora se ubica por su día, sin correrse al mes siguiente", () => {
      expect(isDateInRange("2026-10-31T23:59:59Z", octubre())).toBe(true);
    });
  });

  describe("prorateMonthlyExpenses", () => {
    it("⭐ un mes calendario completo lleva el gasto entero", () => {
      const p = resolveRevenueDateRange({ preset: "month", anchor: "2026-02-10" });
      expect(prorateMonthlyExpenses(2800, p)).toBe(2800);
    });

    it("medio mes lleva la mitad", () => {
      const p = resolveRevenueDateRange({ preset: "custom", customFrom: "2026-09-01", customTo: "2026-09-15" });
      expect(prorateMonthlyExpenses(3000, p)).toBeCloseTo(1500);
    });

    it("una semana lleva 7 días del mes en que empieza", () => {
      const p = resolveRevenueDateRange({ preset: "week", anchor: "2026-10-07" });
      expect(prorateMonthlyExpenses(3100, p)).toBeCloseTo(700);
    });

    it("⭐ un rango que cruza de mes suma la parte de cada mes", () => {
      // 25-sep al 5-oct: 6 de 30 días de septiembre + 5 de 31 de octubre.
      const p = resolveRevenueDateRange({ preset: "custom", customFrom: "2026-09-25", customTo: "2026-10-05" });
      expect(prorateMonthlyExpenses(3000, p)).toBeCloseTo(3000 * (6 / 30) + 3000 * (5 / 31));
    });

    it("⭐ dos meses completos llevan dos veces el gasto", () => {
      const p = resolveRevenueDateRange({ preset: "custom", customFrom: "2026-09-01", customTo: "2026-10-31" });
      expect(prorateMonthlyExpenses(3000, p)).toBeCloseTo(6000);
    });

    it("un rango del mismo mes que no es el mes entero se prorratea por días", () => {
      const p = resolveRevenueDateRange({ preset: "custom", customFrom: "2026-10-10", customTo: "2026-10-20" });
      expect(prorateMonthlyExpenses(3100, p)).toBeCloseTo(1100);
    });
  });
});
