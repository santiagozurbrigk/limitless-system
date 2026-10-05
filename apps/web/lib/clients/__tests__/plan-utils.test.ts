/**
 * SCRUM-493: los días que le quedan al programa se cuentan desde el hoy de la
 * organización, en días calendario. Con el hoy del navegador, un miembro en
 * otra zona veía otro número.
 */
import { afterEach, describe, expect, it } from "vitest";
import { conZona, restaurarZona } from "@/lib/fechas/__tests__/zona";
import { fechaDeHoyEnZona } from "@/lib/fechas/calendario";
import { computeRemainingProgramDays } from "../plan-utils";

afterEach(restaurarZona);

describe("⭐ computeRemainingProgramDays con el hoy de la organización", () => {
  it("un miembro en Madrid a las 22:00 de Argentina ve los mismos días que la org", () => {
    conZona("Europe/Madrid");
    const hoy = fechaDeHoyEnZona("America/Argentina/Buenos_Aires", new Date("2026-10-02T01:00:00Z"));
    // Alta el 2-sep, 30 días: termina el 2-oct. Hoy en la org es el 1-oct: falta 1 día.
    expect(computeRemainingProgramDays("2026-09-02", 30, hoy)).toBe(1);
  });

  it("termina hoy, ya terminó, y sin duración", () => {
    expect(computeRemainingProgramDays("2026-09-02", 30, "2026-10-02")).toBe(0);
    expect(computeRemainingProgramDays("2026-09-02", 30, "2026-10-05")).toBe(-3);
    expect(computeRemainingProgramDays("2026-09-02", null, "2026-10-01")).toBeNull();
    expect(computeRemainingProgramDays("no es fecha", 30, "2026-10-01")).toBeNull();
  });
});
