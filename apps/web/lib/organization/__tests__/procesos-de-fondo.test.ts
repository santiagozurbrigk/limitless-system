import { describe, expect, it, vi } from "vitest";
import { EXPERIENCIAS } from "../experience";
import { correProcesosDeFondo, EXPERIENCIAS_SIN_PROCESOS_DE_FONDO } from "../procesos-de-fondo";

vi.mock("server-only", () => ({}));

/**
 * SCRUM-525 · Las cuentas webinar no corren los procesos de fondo por
 * organización (reportes, inteligencia, tono, señales, métricas de contenido).
 */
describe("correProcesosDeFondo", () => {
  it("⭐ webinar no corre; full y limitless sí", () => {
    expect(correProcesosDeFondo("webinar")).toBe(false);
    expect(correProcesosDeFondo("full")).toBe(true);
    expect(correProcesosDeFondo("limitless")).toBe(true);
  });

  it("un valor desconocido o vacío corre, como antes de la columna (default full)", () => {
    expect(correProcesosDeFondo(undefined)).toBe(true);
    expect(correProcesosDeFondo(null)).toBe(true);
  });

  it("las experiencias excluidas son experiencias que existen", () => {
    for (const experiencia of EXPERIENCIAS_SIN_PROCESOS_DE_FONDO) {
      expect(EXPERIENCIAS).toContain(experiencia);
    }
  });
});
