import { describe, expect, it } from "vitest";
import { anchoDeBarra, formatearFechaCalendario, textoDeLasFechas } from "../presentacion";

describe("SCRUM-544 · textos de Lanzamientos", () => {
  it("fechas de calendario en dd/mm/aaaa; lo que no es fecha vuelve tal cual", () => {
    expect(formatearFechaCalendario("2026-11-08")).toBe("08/11/2026");
    expect(formatearFechaCalendario("mañana")).toBe("mañana");
  });

  it("el rango con lo que haya cargado", () => {
    expect(textoDeLasFechas("2026-10-28", "2026-11-08")).toBe("Del 28/10/2026 al 08/11/2026");
    expect(textoDeLasFechas("2026-10-28", null)).toBe("Desde el 28/10/2026");
    expect(textoDeLasFechas(null, "2026-11-08")).toBe("Cierra el 08/11/2026");
    expect(textoDeLasFechas(null, null)).toBe("Sin fechas cargadas");
  });

  it("barras: proporcionales al máximo, cero sin barra, un valor chico se ve", () => {
    expect(anchoDeBarra(50, 100)).toBe(50);
    expect(anchoDeBarra(0, 100)).toBe(0);
    expect(anchoDeBarra(1, 1000)).toBe(2);
    expect(anchoDeBarra(5, 0)).toBe(0);
  });
});
