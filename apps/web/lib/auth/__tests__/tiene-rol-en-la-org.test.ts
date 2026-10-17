import { describe, expect, it, vi } from "vitest";

/**
 * SCRUM-527 (AR pasada 1): `tieneRolEnLaOrg` es `requireOrgRole` como
 * respuesta, para decidir si la tarjeta Landing muestra el conteo de claves.
 */

const sim = vi.hoisted(() => ({
  respuesta: { data: true as unknown, error: null as null | { message: string; code?: string } },
  llamadas: [] as Array<{ nombre: string; args: unknown }>,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (nombre: string, args: unknown) => {
      sim.llamadas.push({ nombre, args });
      return sim.respuesta;
    },
  }),
}));

const { tieneRolEnLaOrg, ROLES_CLAVES_DE_INGESTA } = await import("@/lib/auth/require-org-role");
const { FallaDeLaBase } = await import("@/lib/server/action-result");

describe("tieneRolEnLaOrg", () => {
  it("pregunta a current_user_has_org_role con los roles pedidos", async () => {
    sim.llamadas = [];
    sim.respuesta = { data: true, error: null };
    expect(await tieneRolEnLaOrg(ROLES_CLAVES_DE_INGESTA)).toBe(true);
    expect(sim.llamadas).toEqual([
      { nombre: "current_user_has_org_role", args: { roles: ["founder", "admin"] } },
    ]);
  });

  it("false o cualquier otra cosa que no sea true es «no»", async () => {
    for (const data of [false, null, "true"]) {
      sim.respuesta = { data, error: null };
      expect(await tieneRolEnLaOrg(["founder"])).toBe(false);
    }
  });

  it("si la consulta falla, lanza FallaDeLaBase (nunca «sí»)", async () => {
    sim.respuesta = { data: true, error: { message: "timeout", code: "57014" } };
    await expect(tieneRolEnLaOrg(["founder"])).rejects.toBeInstanceOf(FallaDeLaBase);
  });

  it("las claves de ingesta: founder o admin", () => {
    expect([...ROLES_CLAVES_DE_INGESTA]).toEqual(["founder", "admin"]);
  });
});
