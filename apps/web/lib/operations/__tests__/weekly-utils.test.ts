/**
 * SCRUM-493: el lunes de la semana se calcula sobre una fecha calendario que
 * arma quien llama (la de la organización en el servidor). Antes tomaba el
 * reloj del proceso: el domingo a las 22:00 de Argentina el servidor (UTC) ya
 * estaba en lunes y los inputs caían en la semana siguiente.
 */
import { afterEach, describe, expect, it } from "vitest";
import { conZona, restaurarZona } from "@/lib/fechas/__tests__/zona";
import { fechaDeHoyEnZona } from "@/lib/fechas/calendario";
import { getCurrentWeekStart } from "../weekly-utils";

afterEach(restaurarZona);

describe("getCurrentWeekStart", () => {
  it("devuelve el lunes de la semana de la fecha", () => {
    expect(getCurrentWeekStart("2026-10-05")).toBe("2026-10-05"); // lunes
    expect(getCurrentWeekStart("2026-10-07")).toBe("2026-10-05"); // miércoles
    expect(getCurrentWeekStart("2026-10-11")).toBe("2026-10-05"); // domingo
  });

  it("cruza fin de mes y de año", () => {
    expect(getCurrentWeekStart("2026-10-01")).toBe("2026-09-28");
    expect(getCurrentWeekStart("2027-01-01")).toBe("2026-12-28");
  });

  it("no depende de la zona del proceso", () => {
    for (const zona of ["UTC", "America/Argentina/Buenos_Aires", "Asia/Tokyo"]) {
      conZona(zona);
      expect(getCurrentWeekStart("2026-10-11")).toBe("2026-10-05");
    }
  });

  it("⭐ el domingo a las 22:00 de Argentina, en el servidor (UTC), sigue siendo esa semana", () => {
    conZona("UTC");
    // Domingo 11-oct 22:00 en Buenos Aires = lunes 12-oct 01:00 UTC.
    const hoy = fechaDeHoyEnZona("America/Argentina/Buenos_Aires", new Date("2026-10-12T01:00:00Z"));
    expect(getCurrentWeekStart(hoy)).toBe("2026-10-05");
  });
});
