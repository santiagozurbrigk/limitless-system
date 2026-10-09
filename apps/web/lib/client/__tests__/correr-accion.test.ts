import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRedirectError } from "next/dist/client/components/redirect";
import { RedirectType } from "next/dist/client/components/redirect-error";
import { notFound } from "next/navigation";
import {
  ERROR_INESPERADO,
  correrAccion,
  correrMutacion,
  datoDeLaMutacion,
  falloInesperado,
  leerConMotivo,
} from "../correr-accion";
import { actionErrorMessage } from "@/lib/server/action-result";

/**
 * Cómo los componentes corren sus server actions (módulo común de cliente): un
 * error esperable se muestra con su mensaje; uno inesperado se registra en
 * consola y se avisa con un texto fijo, nunca con el párrafo técnico de Next;
 * un redirect o un notFound de Next no se muestra como error.
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

  it("⭐ un redirect o un notFound de Next no se avisa ni se registra (Next ya navega)", async () => {
    let errorDeNotFound: unknown;
    try {
      notFound();
    } catch (e) {
      errorDeNotFound = e;
    }
    for (const error of [getRedirectError("/auth/force-password-change", RedirectType.replace), errorDeNotFound]) {
      const avisar = vi.fn();
      const alTerminar = vi.fn();
      await correrAccion({
        accion: async () => {
          throw error;
        },
        alTerminar,
        avisar,
        tituloError: "No se pudo guardar",
        etiqueta: "[test]",
      });
      expect(avisar).not.toHaveBeenCalled();
      expect(alTerminar).not.toHaveBeenCalled();
    }
    expect(consola).not.toHaveBeenCalled();
  });

  it("con un resultado se lo pasa a alTerminar", async () => {
    const alTerminar = vi.fn();
    await correrAccion({ accion: async () => 7, alTerminar, avisar: vi.fn(), tituloError: "x", etiqueta: "x" });
    expect(alTerminar).toHaveBeenCalledWith(7);
  });

  it("el texto fijo está en voseo, como el resto de la interfaz", () => {
    expect(ERROR_INESPERADO).toBe("Ocurrió un error inesperado. Intentá de nuevo.");
  });

  it("⭐ el respaldo del servidor (`actionErrorMessage`) usa el mismo texto fijo", () => {
    // `runMutation` lo devuelve como `error` y el componente lo muestra tal cual.
    expect(actionErrorMessage({ code: "sin-mensaje" })).toBe(ERROR_INESPERADO);
    expect(actionErrorMessage(new Error(""))).toBe(ERROR_INESPERADO);
    expect(actionErrorMessage(new Error("Cliente no encontrado"))).toBe("Cliente no encontrado");
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

  it("⭐ espera a un alExito asíncrono (p. ej. refrescar la lista) antes de terminar", async () => {
    const pasos: string[] = [];
    await correrMutacion({
      accion: async () => ({ success: true, data: undefined }),
      alExito: async () => {
        await new Promise((r) => setTimeout(r, 5));
        pasos.push("refrescó");
      },
      avisar: vi.fn(),
      tituloError: "x",
      etiqueta: "x",
    });
    pasos.push("terminó");
    expect(pasos).toEqual(["refrescó", "terminó"]);
  });
});

describe("datoDeLaMutacion (capa que devuelve el dato o lanza, como PlatformDataProvider)", () => {
  it("con éxito devuelve el dato", async () => {
    await expect(datoDeLaMutacion(async () => ({ success: true, data: 7 }), "[test]")).resolves.toBe(7);
    expect(consola).not.toHaveBeenCalled();
  });

  it("⭐ un error esperable devuelto se lanza en el cliente con su mensaje", async () => {
    await expect(
      datoDeLaMutacion(async () => ({ success: false, error: "Cliente no encontrado" }), "[test]")
    ).rejects.toThrow(new Error("Cliente no encontrado"));
    expect(consola).not.toHaveBeenCalled();
  });

  it("⭐ un error inesperado se registra y se lanza con el texto fijo, nunca el párrafo de Next", async () => {
    const error = new Error(PARRAFO_DE_NEXT);
    await expect(
      datoDeLaMutacion(async () => {
        throw error;
      }, "[test]")
    ).rejects.toThrow(new Error(ERROR_INESPERADO));
    expect(consola).toHaveBeenCalledWith("[test]", error);
  });

  it("⭐ un redirect de Next se relanza tal cual y no se registra", async () => {
    const redirect = getRedirectError("/auth/login", RedirectType.replace);
    await expect(
      datoDeLaMutacion(async () => {
        throw redirect;
      }, "[test]")
    ).rejects.toBe(redirect);
    expect(consola).not.toHaveBeenCalled();
  });
});

describe("leerConMotivo", () => {
  it("con éxito devuelve el dato", async () => {
    await expect(leerConMotivo(async () => ({ success: true, data: 1 }), "[x]")).resolves.toEqual({
      ok: true,
      data: 1,
    });
  });

  it("⭐ con un error devuelto como valor da ese motivo, sin registrar nada", async () => {
    await expect(
      leerConMotivo(async () => ({ success: false, error: "Sesión no válida" }), "[x]")
    ).resolves.toEqual({ ok: false, motivo: "Sesión no válida" });
    expect(consola).not.toHaveBeenCalled();
  });

  it("⭐ si la acción lanza, el motivo es el texto fijo y queda en la consola", async () => {
    const error = new Error("An error occurred in the Server Components render.");
    await expect(leerConMotivo(() => Promise.reject(error), "[x]")).resolves.toEqual({
      ok: false,
      motivo: ERROR_INESPERADO,
    });
    expect(consola).toHaveBeenCalledWith("[x]", error);
  });

  it("un redirect de Next se relanza para que Next navegue", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/login;307;",
    });
    await expect(leerConMotivo(() => Promise.reject(redirect), "[x]")).rejects.toBe(redirect);
    expect(consola).not.toHaveBeenCalled();
  });
});

describe("falloInesperado", () => {
  it("registra con la etiqueta y devuelve el texto fijo", () => {
    const error = new TypeError("fetch failed");
    expect(falloInesperado("[x]", error)).toBe(ERROR_INESPERADO);
    expect(consola).toHaveBeenCalledWith("[x]", error);
  });

  it("relanza un redirect de Next", () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/login;307;",
    });
    expect(() => falloInesperado("[x]", redirect)).toThrow(redirect);
  });
});
