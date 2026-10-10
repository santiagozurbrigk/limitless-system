import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRedirectError } from "next/dist/client/components/redirect";
import { RedirectType } from "next/dist/client/components/redirect-error";
import { DynamicServerError } from "next/dist/client/components/hooks-server-context";
import { notFound } from "next/navigation";

/**
 * SCRUM-108: una lectura secundaria que falla se reemplaza por su valor por
 * defecto y se registra; lo que no es una caída (errores de Next, rechazos
 * esperables) se relanza tal cual.
 */

const sim = vi.hoisted(() => ({
  reportes: [] as Array<{ error: unknown; contexto: unknown }>,
}));
vi.mock("@/lib/observability/reportar-falla", () => ({
  reportarFalla: (error: unknown, contexto: unknown) => sim.reportes.push({ error, contexto }),
}));

import { lecturaDegradable } from "../lectura-degradable";
import { ErrorEsperable } from "../error-esperable";

let aviso: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  sim.reportes = [];
  aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => aviso.mockRestore());

const falla =
  <T = string>(error: unknown) =>
  async (): Promise<T> => {
    throw error;
  };

describe("lecturaDegradable", () => {
  it("si la lectura anda, devuelve su valor y no registra nada", async () => {
    await expect(lecturaDegradable("x", async () => "dato", "defecto")).resolves.toBe("dato");
    expect(sim.reportes).toEqual([]);
  });

  it("⭐ si la lectura falla, devuelve el valor por defecto y la registra con su etiqueta", async () => {
    const error = new Error("fetch failed");
    await expect(lecturaDegradable("layout-plataforma:zona", falla(error), "defecto")).resolves.toBe(
      "defecto"
    );
    expect(sim.reportes).toEqual([{ error, contexto: { lectura: "layout-plataforma:zona" } }]);
    expect(aviso).toHaveBeenCalledOnce();
  });

  it("un objeto plano de supabase-js también degrada", async () => {
    const error = { message: "boom", code: "XX000" };
    await expect(lecturaDegradable("y", falla<number>(error), 0)).resolves.toBe(0);
    expect(sim.reportes).toHaveLength(1);
  });

  it("⭐ un rechazo esperable (sesión, cuenta desactivada) se relanza: no es una caída", async () => {
    const error = new ErrorEsperable("Tu cuenta está desactivada.");
    await expect(lecturaDegradable("z", falla(error), "defecto")).rejects.toBe(error);
    expect(sim.reportes).toEqual([]);
  });

  it.each([
    ["redirect", () => getRedirectError("/login", RedirectType.replace)],
    [
      "notFound",
      () => {
        try {
          notFound();
        } catch (e) {
          return e;
        }
      },
    ],
    ["ruta dinámica", () => new DynamicServerError("Route usó `cookies`")],
  ])("⭐ el error de Next (%s) se relanza y no se registra", async (_nombre, crear) => {
    const error = crear();
    await expect(lecturaDegradable("w", falla(error), "defecto")).rejects.toBe(error);
    expect(sim.reportes).toEqual([]);
    expect(aviso).not.toHaveBeenCalled();
  });
});
