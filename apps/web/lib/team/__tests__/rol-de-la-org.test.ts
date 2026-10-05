import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { assertRolDeLaOrg, ROL_DE_OTRA_ORG } from "@/lib/team/rol-de-la-org";

type Rol = { id: string; organization_id: string };
type Consulta = { tabla: string; filtros: Array<[string, unknown]> };

/**
 * Base simulada: roles por organización. Registra cada consulta (tabla y
 * filtros `.eq`) y responde aplicando sólo los filtros que de verdad se
 * pidieron: si el código deja de filtrar por organización, encuentra el rol
 * ajeno y el test falla por la aserción, no por el mock.
 */
function baseCon(roles: Rol[], error: string | null = null) {
  const consultas: Consulta[] = [];
  const base = {
    from(tabla: string) {
      const consulta: Consulta = { tabla, filtros: [] };
      consultas.push(consulta);
      const builder = {
        select: () => builder,
        eq(columna: string, valor: unknown) {
          consulta.filtros.push([columna, valor]);
          return builder;
        },
        maybeSingle: async () => ({
          data: error
            ? null
            : roles.find((r) =>
                consulta.filtros.every(([col, val]) => (r as Record<string, unknown>)[col] === val)
              ) ?? null,
          error: error ? { message: error } : null,
        }),
      };
      return builder;
    },
  };
  return { base: base as unknown as Pick<SupabaseClient, "from">, consultas };
}

const ROLES: Rol[] = [
  { id: "rol-a", organization_id: "org-a" },
  { id: "rol-b", organization_id: "org-b" },
];

describe("assertRolDeLaOrg", () => {
  it("un rol de la propia organización pasa", async () => {
    const { base } = baseCon(ROLES);
    await expect(assertRolDeLaOrg(base, "rol-a", "org-a")).resolves.toBeUndefined();
  });

  it("⭐ la consulta filtra por el rol y por la organización pedida", async () => {
    const { base, consultas } = baseCon(ROLES);
    await assertRolDeLaOrg(base, "rol-a", "org-a");
    expect(consultas).toHaveLength(1);
    expect(consultas[0].tabla).toBe("team_roles");
    expect(consultas[0].filtros).toContainEqual(["id", "rol-a"]);
    expect(consultas[0].filtros).toContainEqual(["organization_id", "org-a"]);
  });

  it("⭐ un rol de otra organización se rechaza por el filtro de organización", async () => {
    const { base, consultas } = baseCon(ROLES);
    await expect(assertRolDeLaOrg(base, "rol-b", "org-a")).rejects.toThrow(ROL_DE_OTRA_ORG);
    expect(consultas[0].filtros).toContainEqual(["organization_id", "org-a"]);
  });

  it("un rol que no existe se rechaza", async () => {
    const { base } = baseCon(ROLES);
    await expect(assertRolDeLaOrg(base, "rol-x", "org-a")).rejects.toThrow(ROL_DE_OTRA_ORG);
  });

  it("sin rol no hay nada que validar (y no se consulta la base)", async () => {
    const { base, consultas } = baseCon(ROLES);
    await expect(assertRolDeLaOrg(base, null, "org-a")).resolves.toBeUndefined();
    await expect(assertRolDeLaOrg(base, "", "org-a")).resolves.toBeUndefined();
    expect(consultas).toHaveLength(0);
  });

  it("un error de la consulta no deja pasar", async () => {
    const { base } = baseCon([], "timeout");
    await expect(assertRolDeLaOrg(base, "rol-a", "org-a")).rejects.toThrow("timeout");
  });
});
