import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-210 · [CRONS-ORGS-INACTIVAS]: los procesos automáticos de IA corren
 * sólo sobre organizaciones founder activas, nunca sobre una pausada o dada
 * de baja.
 */

const sim = vi.hoisted(() => ({
  filas: [] as Array<{ id: string; account_type: string; status: string }>,
  error: null as { message: string } | null,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(tabla: string) {
      expect(tabla).toBe("organizations");
      const filtros: Array<[string, unknown]> = [];
      const builder = {
        select: () => builder,
        eq(columna: string, valor: unknown) {
          filtros.push([columna, valor]);
          return builder;
        },
        then(resolver: (r: unknown) => void) {
          const data = sim.filas.filter((f) =>
            filtros.every(([c, v]) => (f as Record<string, unknown>)[c] === v)
          );
          resolver({ data: sim.error ? null : data, error: sim.error });
        },
      };
      return builder;
    },
  }),
}));

import { listActiveOrganizationIds } from "../organizaciones-activas";
import * as generateSnapshot from "../generate-snapshot";

beforeEach(() => {
  sim.error = null;
  sim.filas = [
    { id: "activa", account_type: "founder", status: "active" },
    { id: "pausada", account_type: "founder", status: "paused" },
    { id: "baja", account_type: "founder", status: "churned" },
    { id: "holding", account_type: "holding", status: "active" },
  ];
});

describe("listActiveOrganizationIds", () => {
  it("⭐ sólo devuelve las founder activas: ni pausadas, ni dadas de baja, ni holdings", async () => {
    await expect(listActiveOrganizationIds()).resolves.toEqual(["activa"]);
  });

  it("hay una sola definición: generate-snapshot ya no la reexporta", () => {
    // Los crons y generadores la importan de `organizaciones-activas`; si
    // generate-snapshot volviera a exportar una, podría ser otra copia.
    expect(generateSnapshot).not.toHaveProperty("listActiveOrganizationIds");
  });

  it("si la base falla, el error sube en vez de devolver una lista vacía", async () => {
    sim.error = { message: "fallo de red" };
    await expect(listActiveOrganizationIds()).rejects.toThrow("fallo de red");
  });
});
