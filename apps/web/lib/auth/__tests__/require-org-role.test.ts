import { describe, expect, it } from "vitest";
import {
  evaluarPermiso,
  ROLES_BORRAR_CLIENTES,
  ROLES_CONFIG_ORG,
} from "@/lib/auth/require-org-role";

describe("evaluarPermiso", () => {
  it("⭐ sólo `true` deja pasar", () => {
    expect(evaluarPermiso({ data: true, error: null })).toBe("permitido");
  });

  it("false, null o cualquier otra cosa no deja pasar", () => {
    expect(evaluarPermiso({ data: false, error: null })).toBe("sin_permiso");
    expect(evaluarPermiso({ data: null, error: null })).toBe("sin_permiso");
    expect(evaluarPermiso({ data: "true", error: null })).toBe("sin_permiso");
  });

  it("⭐ un error de la consulta no deja pasar, aunque venga data", () => {
    expect(evaluarPermiso({ data: true, error: { message: "timeout" } })).toBe("error");
  });
});

describe("roles", () => {
  it("la configuración de la org es sólo del founder", () => {
    expect([...ROLES_CONFIG_ORG]).toEqual(["founder"]);
  });

  it("borrar clientes: founder o admin, nunca member ni viewer", () => {
    expect([...ROLES_BORRAR_CLIENTES]).toEqual(["founder", "admin"]);
    expect(ROLES_BORRAR_CLIENTES).not.toContain("member");
  });
});
