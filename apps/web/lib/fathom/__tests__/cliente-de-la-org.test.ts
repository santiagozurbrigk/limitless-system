import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { assertClienteDeLaOrg, CLIENTE_DE_OTRA_ORG } from "@/lib/fathom/cliente-de-la-org";

type Cliente = { id: string; organization_id: string; name: string };
type Consulta = { tabla: string; filtros: Array<[string, unknown]> };

/**
 * Base simulada: clientes por organización. Registra cada consulta (tabla y
 * filtros `.eq`) y responde aplicando sólo los filtros que de verdad se
 * pidieron: si el código deja de filtrar por organización, encuentra el
 * cliente ajeno y el test falla por la aserción, no por el mock.
 */
function baseCon(clientes: Cliente[], error: string | null = null) {
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
            : clientes.find((c) =>
                consulta.filtros.every(([col, val]) => (c as Record<string, unknown>)[col] === val)
              ) ?? null,
          error: error ? { message: error } : null,
        }),
      };
      return builder;
    },
  };
  return { base: base as unknown as Pick<SupabaseClient, "from">, consultas };
}

const CLIENTES: Cliente[] = [
  { id: "cli-a", organization_id: "org-a", name: "Ana" },
  { id: "cli-b", organization_id: "org-b", name: "Beto" },
];

describe("assertClienteDeLaOrg", () => {
  it("un cliente de la propia organización pasa y devuelve su nombre", async () => {
    const { base } = baseCon(CLIENTES);
    await expect(assertClienteDeLaOrg(base, "cli-a", "org-a")).resolves.toEqual({ name: "Ana" });
  });

  it("⭐ la consulta filtra por el cliente y por la organización pedida", async () => {
    const { base, consultas } = baseCon(CLIENTES);
    await assertClienteDeLaOrg(base, "cli-a", "org-a");
    expect(consultas).toHaveLength(1);
    expect(consultas[0].tabla).toBe("clients");
    expect(consultas[0].filtros).toContainEqual(["id", "cli-a"]);
    expect(consultas[0].filtros).toContainEqual(["organization_id", "org-a"]);
  });

  it("⭐ un cliente de otra organización se rechaza por el filtro de organización (y no se filtra su nombre)", async () => {
    const { base, consultas } = baseCon(CLIENTES);
    await expect(assertClienteDeLaOrg(base, "cli-b", "org-a")).rejects.toThrow(CLIENTE_DE_OTRA_ORG);
    expect(consultas[0].filtros).toContainEqual(["organization_id", "org-a"]);
  });

  it("un cliente que no existe se rechaza", async () => {
    const { base } = baseCon(CLIENTES);
    await expect(assertClienteDeLaOrg(base, "cli-x", "org-a")).rejects.toThrow(CLIENTE_DE_OTRA_ORG);
  });

  it("un error de la consulta no deja pasar", async () => {
    const { base } = baseCon([], "timeout");
    await expect(assertClienteDeLaOrg(base, "cli-a", "org-a")).rejects.toThrow("timeout");
  });
});
