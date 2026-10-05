import { describe, expect, it } from "vitest";
import { computeOneOnOneRhythm, computeOneOnOneStats } from "@/lib/fathom/one-on-one-types";
import { fechaDeHoyEnZona } from "@/lib/fechas/calendario";

/** El día de la organización. */
const HOY = "2026-09-20";

describe("⭐ el contador de 1-1 del cliente", () => {
  it("sin llamadas no inventa nada", () => {
    expect(computeOneOnOneStats([], HOY)).toEqual({
      totalCalls: 0,
      firstDate: null,
      lastDate: null,
      everyDays: null,
      daysSinceLast: null,
    });
  });

  /**
   * ⭐ Con un solo punto no hay ritmo. Un "cada 0 días" se leería como que el
   * cliente tiene llamadas todos los días, que es lo contrario de la verdad.
   */
  it("con una sola llamada cuenta una y deja el ritmo en null", () => {
    const stats = computeOneOnOneStats(["2026-09-06"], HOY);
    expect(stats.totalCalls).toBe(1);
    expect(stats.everyDays).toBeNull();
    expect(stats.daysSinceLast).toBe(14);
  });

  it("calcula el ritmo sobre el período, no sobre los huecos", () => {
    // 1 de julio → 20 de septiembre son 81 días, en 4 intervalos: ~20 días.
    const stats = computeOneOnOneStats(
      ["2026-07-01", "2026-07-22", "2026-08-12", "2026-09-02", "2026-09-20"],
      HOY
    );
    expect(stats.totalCalls).toBe(5);
    expect(stats.firstDate).toBe("2026-07-01");
    expect(stats.lastDate).toBe("2026-09-20");
    expect(stats.everyDays).toBe(20);
    expect(stats.daysSinceLast).toBe(0);
  });

  it("no depende del orden en que vengan las fechas", () => {
    const desordenadas = computeOneOnOneStats(
      ["2026-09-02", "2026-07-01", "2026-08-12"],
      HOY
    );
    const ordenadas = computeOneOnOneStats(
      ["2026-07-01", "2026-08-12", "2026-09-02"],
      HOY
    );
    expect(desordenadas).toEqual(ordenadas);
  });

  /**
   * ⭐ Dos llamadas el mismo día darían división por cero si el ritmo se
   * calculara promediando huecos. Acá el piso es un día.
   */
  it("aguanta dos llamadas el mismo día", () => {
    const stats = computeOneOnOneStats(["2026-09-10", "2026-09-10"], HOY);
    expect(stats.totalCalls).toBe(2);
    expect(stats.everyDays).toBe(1);
  });

  it("acepta timestamps completos y descarta lo que no es una fecha", () => {
    const stats = computeOneOnOneStats(
      ["2026-09-01T14:48:50.000Z", "no es una fecha", "2026-09-15T09:00:00Z"],
      HOY
    );
    expect(stats.totalCalls).toBe(2);
    expect(stats.firstDate).toBe("2026-09-01");
    expect(stats.lastDate).toBe("2026-09-15");
    expect(stats.everyDays).toBe(14);
  });

  /**
   * ⭐ Una fecha a medianoche cae en el día anterior en cualquier huso al oeste
   * de Greenwich — o sea, en todo el mercado de Limitless.
   */
  it("no corre las fechas un día para atrás", () => {
    const stats = computeOneOnOneStats(["2026-09-20"], HOY);
    expect(stats.lastDate).toBe("2026-09-20");
    expect(stats.daysSinceLast).toBe(0);
  });
});

/**
 * SCRUM-493: "hace cuántos días" se cuenta desde el hoy de la organización. A
 * las 22:00 de Argentina el servidor (UTC) ya está en el día siguiente.
 */
describe("⭐ días desde la última 1-1 con el hoy de la organización", () => {
  it("una 1-1 de hoy a las 15:00, mirada a las 22:00 de Argentina, es de hace 0 días", () => {
    // 1-oct 15:00 ART = 18:00 UTC; 1-oct 22:00 ART = 2-oct 01:00 UTC.
    const hoy = fechaDeHoyEnZona("America/Argentina/Buenos_Aires", new Date("2026-10-02T01:00:00Z"));
    expect(hoy).toBe("2026-10-01");
    expect(computeOneOnOneStats(["2026-10-01T18:00:00Z"], hoy).daysSinceLast).toBe(0);
  });

  it("el ritmo no depende de hoy", () => {
    expect(computeOneOnOneRhythm(["2026-09-01", "2026-09-15"])).toEqual({
      totalCalls: 2,
      firstDate: "2026-09-01",
      lastDate: "2026-09-15",
      everyDays: 14,
    });
  });
});
