import { describe, expect, it } from "vitest";
import { mensajeDelPipeline, type ResultadoDelPipeline } from "../mensaje-del-pipeline";
import { AVISO_ORG_NO_ACTIVA } from "@/lib/intelligence/organizaciones-activas";

/** Qué muestra el botón "Generar reporte ahora" según el resultado. */

const NADA: ResultadoDelPipeline = {
  operationsReport: "skipped",
  executiveReport: "skipped",
  intelligence: "skipped",
  errors: [],
};

describe("mensajeDelPipeline", () => {
  it("⭐ con la org no activa muestra el aviso, no 'Sin datos suficientes'", () => {
    const m = mensajeDelPipeline({ ...NADA, errors: [AVISO_ORG_NO_ACTIVA] });
    expect(m.title).toBe("Organización no activa");
    expect(m.description).toBe(AVISO_ORG_NO_ACTIVA);
  });

  it("⭐ el aviso se muestra aunque se haya generado algo", () => {
    const m = mensajeDelPipeline({
      ...NADA,
      operationsReport: "generated",
      errors: ["otro error", AVISO_ORG_NO_ACTIVA],
    });
    expect(m.title).toBe("Organización no activa");
    expect(m.description).toContain("Listo: Operaciones.");
    expect(m.description).toContain(AVISO_ORG_NO_ACTIVA);
  });

  it("sin aviso, lo generado se informa como antes", () => {
    const m = mensajeDelPipeline({ ...NADA, executiveReport: "generated", intelligence: "generated" });
    expect(m).toEqual({
      title: "Reportes generados",
      description: "Listo: Reporte ejecutivo, Inteligencia.",
      variant: "success",
    });
  });

  it("sin nada generado, el primer error o 'Sin datos suficientes'", () => {
    expect(mensajeDelPipeline({ ...NADA, errors: ["falló"] }).description).toBe("falló");
    expect(mensajeDelPipeline(NADA)).toEqual({
      title: "Sin datos suficientes",
      // Texto de la interfaz en voseo, como el resto de la app: que no cambie sin querer.
      description:
        "Completá al menos 2 inputs semanales y asegurate de tener actividad en ventas u operaciones.",
      variant: "default",
    });
  });
});
