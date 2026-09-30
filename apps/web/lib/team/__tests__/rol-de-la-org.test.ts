import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { assertRolDeLaOrg, ROL_DE_OTRA_ORG } from "@/lib/team/rol-de-la-org";

/** Base simulada: roles por organización. */
function baseCon(
  roles: Array<{ id: string; organization_id: string }>,
  error: string | null = null
): Pick<SupabaseClient, "from"> {
  const base = {
    from: () => ({
      select: () => ({
        eq: (_c1: "id", id: string) => ({
          eq: (_c2: "organization_id", org: string) => ({
            maybeSingle: async () => ({
              data: error ? null : roles.find((r) => r.id === id && r.organization_id === org) ?? null,
              error: error ? { message: error } : null,
            }),
          }),
        }),
      }),
    }),
  };
  return base as unknown as Pick<SupabaseClient, "from">;
}

const BASE = baseCon([
  { id: "rol-a", organization_id: "org-a" },
  { id: "rol-b", organization_id: "org-b" },
]);

describe("assertRolDeLaOrg", () => {
  it("un rol de la propia organización pasa", async () => {
    await expect(assertRolDeLaOrg(BASE, "rol-a", "org-a")).resolves.toBeUndefined();
  });

  it("⭐ un rol de otra organización se rechaza", async () => {
    await expect(assertRolDeLaOrg(BASE, "rol-b", "org-a")).rejects.toThrow(ROL_DE_OTRA_ORG);
  });

  it("un rol que no existe se rechaza", async () => {
    await expect(assertRolDeLaOrg(BASE, "rol-x", "org-a")).rejects.toThrow(ROL_DE_OTRA_ORG);
  });

  it("sin rol no hay nada que validar", async () => {
    await expect(assertRolDeLaOrg(BASE, null, "org-a")).resolves.toBeUndefined();
    await expect(assertRolDeLaOrg(BASE, "", "org-a")).resolves.toBeUndefined();
  });

  it("un error de la consulta no deja pasar", async () => {
    await expect(assertRolDeLaOrg(baseCon([], "timeout"), "rol-a", "org-a")).rejects.toThrow("timeout");
  });
});
