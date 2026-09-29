import { describe, expect, it } from "vitest";
import {
  accionSesion,
  BAN_CUENTA_DESACTIVADA,
  banParaEstado,
  estaDesactivado,
} from "@/lib/auth/cuenta-desactivada";

describe("estaDesactivado", () => {
  it("⭐ sólo false explícito corta el acceso", () => {
    expect(estaDesactivado(false)).toBe(true);
  });

  it("activo, sin perfil o sin la columna no cortan", () => {
    expect(estaDesactivado(true)).toBe(false);
    expect(estaDesactivado(null)).toBe(false);
    expect(estaDesactivado(undefined)).toBe(false);
  });
});

describe("banParaEstado", () => {
  it("⭐ desactivar banea y reactivar desbanea", () => {
    expect(banParaEstado(false)).toBe(BAN_CUENTA_DESACTIVADA);
    expect(banParaEstado(true)).toBe("none");
  });
});

describe("accionSesion (middleware)", () => {
  it("⭐ un perfil desactivado navegando se desloguea y va al login", () => {
    expect(accionSesion(false, false)).toBe("cerrar_y_redirigir");
  });

  it("⭐ en una server action se desloguea sin redirect", () => {
    expect(accionSesion(false, true)).toBe("cerrar");
  });

  it("un perfil activo o sin perfil sigue", () => {
    expect(accionSesion(true, false)).toBe("seguir");
    expect(accionSesion(true, true)).toBe("seguir");
    expect(accionSesion(null, false)).toBe("seguir");
    expect(accionSesion(undefined, true)).toBe("seguir");
  });
});
