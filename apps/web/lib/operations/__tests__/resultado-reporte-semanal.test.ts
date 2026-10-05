import { describe, expect, it } from "vitest";
import { mensajeDelReporteSemanal, pasoDeOperaciones } from "../resultado-reporte-semanal";
import { AVISO_ORG_NO_ACTIVA } from "@/lib/intelligence/organizaciones-activas";

/**
 * El botón de Inputs semanales muestra el mensaje que devuelve la acción (en
 * producción Next no manda al cliente el mensaje de un error lanzado).
 */

describe("mensajeDelReporteSemanal", () => {
  it("⭐ con la org no activa muestra el aviso devuelto", () => {
    expect(
      mensajeDelReporteSemanal({ success: false, error: AVISO_ORG_NO_ACTIVA, motivo: "org-no-activa" })
    ).toEqual({ title: "No se pudo generar el reporte", description: AVISO_ORG_NO_ACTIVA, variant: "default" });
  });

  it("⭐ sin inputs muestra ese mensaje", () => {
    const m = mensajeDelReporteSemanal({
      success: false,
      error: "No hay inputs para esta semana todavía.",
      motivo: "sin-inputs",
    });
    expect(m.description).toBe("No hay inputs para esta semana todavía.");
  });

  it("con éxito avisa que el reporte está listo", () => {
    expect(mensajeDelReporteSemanal({ success: true, data: undefined })).toMatchObject({
      title: "Reporte generado",
      variant: "success",
    });
  });
});

describe("pasoDeOperaciones", () => {
  it("generado, omitido (sin inputs u org no activa) o fallido", () => {
    expect(pasoDeOperaciones({ success: true, data: undefined })).toBe("generated");
    expect(pasoDeOperaciones({ success: false, error: "x", motivo: "sin-inputs" })).toBe("skipped");
    expect(pasoDeOperaciones({ success: false, error: "x", motivo: "org-no-activa" })).toBe("skipped");
    expect(pasoDeOperaciones({ success: false, error: "x", motivo: "falla" })).toBe("failed");
  });
});
