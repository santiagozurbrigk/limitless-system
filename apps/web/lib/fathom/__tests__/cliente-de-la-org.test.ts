import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { assertClienteDeLaOrg, CLIENTE_DE_OTRA_ORG } from "@/lib/fathom/cliente-de-la-org";

/** Base simulada: clientes por organización. */
function baseCon(
  clientes: Array<{ id: string; organization_id: string; name: string }>,
  error: string | null = null
): Pick<SupabaseClient, "from"> {
  const base = {
    from: () => ({
      select: () => ({
        eq: (_c1: "id", id: string) => ({
          eq: (_c2: "organization_id", org: string) => ({
            maybeSingle: async () => ({
              data: error ? null : clientes.find((c) => c.id === id && c.organization_id === org) ?? null,
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
  { id: "cli-a", organization_id: "org-a", name: "Ana" },
  { id: "cli-b", organization_id: "org-b", name: "Beto" },
]);

describe("assertClienteDeLaOrg", () => {
  it("un cliente de la propia organización pasa y devuelve su nombre", async () => {
    await expect(assertClienteDeLaOrg(BASE, "cli-a", "org-a")).resolves.toEqual({ name: "Ana" });
  });

  it("⭐ un cliente de otra organización se rechaza (y no se filtra su nombre)", async () => {
    await expect(assertClienteDeLaOrg(BASE, "cli-b", "org-a")).rejects.toThrow(CLIENTE_DE_OTRA_ORG);
  });

  it("un cliente que no existe se rechaza", async () => {
    await expect(assertClienteDeLaOrg(BASE, "cli-x", "org-a")).rejects.toThrow(CLIENTE_DE_OTRA_ORG);
  });

  it("un error de la consulta no deja pasar", async () => {
    await expect(assertClienteDeLaOrg(baseCon([], "timeout"), "cli-a", "org-a")).rejects.toThrow("timeout");
  });
});
