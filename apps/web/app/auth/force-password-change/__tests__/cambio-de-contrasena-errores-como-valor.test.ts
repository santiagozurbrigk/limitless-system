import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-497: el cambio de contraseña obligatorio devuelve sus errores
 * esperables como valor (`MutationResult`). En producción Next no le manda al
 * cliente el mensaje de un error lanzado por una server action: la pantalla
 * quedaba en "Guardando…" sin decir qué pasó.
 */

const sim = vi.hoisted(() => ({
  usuario: { id: "user-1" } as { id: string } | null,
  errorCambio: null as { message: string; code?: string; reasons?: string[] } | null,
  reportes: [] as Array<{ error: unknown; contexto: unknown }>,
  errorPerfil: null as { message: string } | null,
  cambios: [] as unknown[],
  perfiles: [] as Array<{ valores: unknown; filtros: Array<[string, unknown]> }>,
}));

vi.mock("@/lib/observability/reportar-falla", () => ({
  reportarFalla: (error: unknown, contexto: unknown) => sim.reportes.push({ error, contexto }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: sim.usuario } }),
      updateUser: async (cambio: unknown) => {
        sim.cambios.push(cambio);
        return { error: sim.errorCambio };
      },
    },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(tabla: string) {
      expect(tabla).toBe("profiles");
      return {
        update(valores: unknown) {
          const filtros: Array<[string, unknown]> = [];
          sim.perfiles.push({ valores, filtros });
          return {
            eq: async (columna: string, valor: unknown) => {
              filtros.push([columna, valor]);
              return { error: sim.errorPerfil };
            },
          };
        },
      };
    },
  }),
}));

import { completePasswordChangeAction } from "../actions";

let consola: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  sim.usuario = { id: "user-1" };
  sim.errorCambio = null;
  sim.reportes = [];
  sim.errorPerfil = null;
  sim.cambios = [];
  sim.perfiles = [];
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
  return () => consola.mockRestore();
});

describe("completePasswordChangeAction", () => {
  it("con éxito cambia la contraseña y baja la marca sólo en el perfil del usuario", async () => {
    await expect(completePasswordChangeAction("nueva-clave-1")).resolves.toEqual({
      success: true,
      data: undefined,
    });
    expect(sim.cambios).toEqual([{ password: "nueva-clave-1" }]);
    expect(sim.perfiles).toEqual([
      {
        valores: { must_change_password: false, temp_password_expires_at: null },
        filtros: [["id", "user-1"]],
      },
    ]);
  });

  it("una contraseña corta vuelve con el mensaje de validación, sin tocar nada", async () => {
    await expect(completePasswordChangeAction("corta")).resolves.toEqual({
      success: false,
      error: "La contraseña debe tener al menos 8 caracteres",
    });
    expect(sim.cambios).toEqual([]);
    expect(sim.perfiles).toEqual([]);
  });

  it("⭐ sin sesión no lanza: vuelve con el motivo, sin cambiar la contraseña", async () => {
    sim.usuario = null;
    await expect(completePasswordChangeAction("nueva-clave-1")).resolves.toEqual({
      success: false,
      error: "Tu sesión venció. Volvé a iniciar sesión para cambiar la contraseña.",
    });
    expect(sim.cambios).toEqual([]);
  });

  it.each([
    [
      "same_password",
      { message: "New password should be different from the old password.", code: "same_password" },
      "La nueva contraseña tiene que ser distinta de la actual. Si ya la cambiaste en un intento anterior, elegí otra.",
    ],
    [
      "weak_password por filtración",
      { message: "Password is known to be weak", code: "weak_password", reasons: ["pwned"] },
      "Esa contraseña aparece en filtraciones conocidas. Elegí otra.",
    ],
    [
      "weak_password por longitud o caracteres",
      { message: "Password should contain at least one character of each", code: "weak_password", reasons: ["characters"] },
      "La contraseña no cumple los requisitos de seguridad. Probá con una más larga que combine letras, números y símbolos.",
    ],
    [
      "session_not_found",
      { message: "Session not found", code: "session_not_found" },
      "Tu sesión venció. Volvé a iniciar sesión para cambiar la contraseña.",
    ],
    [
      "over_request_rate_limit",
      { message: "Request rate limit reached", code: "over_request_rate_limit" },
      "Hiciste muchos intentos seguidos. Esperá unos minutos y probá de nuevo.",
    ],
  ])("⭐ si Auth rechaza con %s vuelve con un motivo claro, no baja la marca ni lo reporta", async (_c, rechazo, mensaje) => {
    sim.errorCambio = rechazo;
    await expect(completePasswordChangeAction("nueva-clave-1")).resolves.toEqual({
      success: false,
      error: mensaje,
    });
    expect(sim.perfiles).toEqual([]);
    expect(sim.reportes).toEqual([]);
  });

  it("un rechazo de Auth desconocido vuelve con el texto de siempre y se registra y reporta", async () => {
    const rechazo = { message: "unexpected_failure", code: "unexpected_failure" };
    sim.errorCambio = rechazo;
    await expect(completePasswordChangeAction("nueva-clave-1")).resolves.toEqual({
      success: false,
      error: "Error al actualizar la contraseña",
    });
    expect(sim.perfiles).toEqual([]);
    expect(consola).toHaveBeenCalledWith("[completePasswordChange] updateUser", rechazo);
    expect(sim.reportes).toEqual([
      { error: rechazo, contexto: { accion: "[completePasswordChange] updateUser" } },
    ]);
  });

  it("⭐ si falla bajar la marca no lanza el error de la base: vuelve con un motivo en voseo, lo registra y lo reporta", async () => {
    sim.errorPerfil = { message: "permission denied for table profiles" };
    const resultado = await completePasswordChangeAction("nueva-clave-1");
    expect(resultado).toEqual({
      success: false,
      error:
        "La contraseña se cambió, pero no se pudo terminar de guardar el cambio. Intentá de nuevo con otra contraseña.",
    });
    expect(consola).toHaveBeenCalledWith(
      "[completePasswordChange] bajar la marca de contraseña temporal",
      sim.errorPerfil
    );
    expect(sim.reportes).toHaveLength(1);
  });
});
