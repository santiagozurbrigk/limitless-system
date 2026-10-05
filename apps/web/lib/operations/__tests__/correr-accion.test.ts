import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ERROR_INESPERADO, correrAccion, correrMutacion } from "../correr-accion";
import { manejarReporteSemanal } from "../resultado-reporte-semanal";
import { AVISO_ORG_NO_ACTIVA } from "@/lib/intelligence/organizaciones-activas";

/**
 * Cómo los componentes de Operaciones corren sus server actions: un error
 * esperable se muestra con su mensaje; uno inesperado se registra en consola
 * y se avisa con un texto fijo, nunca con el párrafo técnico de Next.
 */

let consola: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => consola.mockRestore());

const PARRAFO_DE_NEXT =
  "An error occurred in the Server Components render. The specific message is omitted in production builds";

describe("correrAccion", () => {
  it("⭐ ante un error inesperado muestra el texto fijo y lo registra en consola", async () => {
    const avisar = vi.fn();
    const alTerminar = vi.fn();
    const error = new Error(PARRAFO_DE_NEXT);
    await correrAccion({
      accion: async () => {
        throw error;
      },
      alTerminar,
      avisar,
      tituloError: "No se pudo generar",
      etiqueta: "[test]",
    });
    expect(avisar).toHaveBeenCalledWith({
      title: "No se pudo generar",
      description: ERROR_INESPERADO,
      variant: "default",
    });
    expect(JSON.stringify(avisar.mock.calls)).not.toContain("Server Components");
    expect(consola).toHaveBeenCalledWith("[test]", error);
    expect(alTerminar).not.toHaveBeenCalled();
  });

  it("con un resultado se lo pasa a alTerminar", async () => {
    const alTerminar = vi.fn();
    await correrAccion({ accion: async () => 7, alTerminar, avisar: vi.fn(), tituloError: "x", etiqueta: "x" });
    expect(alTerminar).toHaveBeenCalledWith(7);
  });

  it("el texto fijo está en voseo, como el resto de la interfaz", () => {
    expect(ERROR_INESPERADO).toBe("Ocurrió un error inesperado. Intentá de nuevo.");
  });
});

describe("correrMutacion", () => {
  it("⭐ un error esperable devuelto se muestra con su mensaje", async () => {
    const avisar = vi.fn();
    const alExito = vi.fn();
    await correrMutacion({
      accion: async () => ({ success: false, error: "Solo podés eliminar tus propios inputs." }),
      alExito,
      avisar,
      tituloError: "No se pudo eliminar",
      etiqueta: "[test]",
    });
    expect(avisar).toHaveBeenCalledWith({
      title: "No se pudo eliminar",
      description: "Solo podés eliminar tus propios inputs.",
      variant: "default",
    });
    expect(alExito).not.toHaveBeenCalled();
  });

  it("con éxito llama a alExito y no avisa error", async () => {
    const avisar = vi.fn();
    const alExito = vi.fn();
    await correrMutacion({
      accion: async () => ({ success: true, data: undefined }),
      alExito,
      avisar,
      tituloError: "x",
      etiqueta: "x",
    });
    expect(alExito).toHaveBeenCalledTimes(1);
    expect(avisar).not.toHaveBeenCalled();
  });
});

describe("manejarReporteSemanal (botón de Inputs semanales)", () => {
  it("⭐ con éxito avisa y lleva a Operaciones", () => {
    const avisar = vi.fn();
    const irAOperaciones = vi.fn();
    manejarReporteSemanal({ success: true, data: undefined }, { avisar, irAOperaciones });
    expect(avisar).toHaveBeenCalledWith(expect.objectContaining({ title: "Reporte generado" }));
    expect(irAOperaciones).toHaveBeenCalledTimes(1);
  });

  it("⭐ con un error devuelto muestra ese mensaje y no navega", () => {
    const avisar = vi.fn();
    const irAOperaciones = vi.fn();
    manejarReporteSemanal(
      { success: false, error: AVISO_ORG_NO_ACTIVA, motivo: "org-no-activa" },
      { avisar, irAOperaciones }
    );
    expect(avisar).toHaveBeenCalledWith(expect.objectContaining({ description: AVISO_ORG_NO_ACTIVA }));
    expect(irAOperaciones).not.toHaveBeenCalled();
  });
});
