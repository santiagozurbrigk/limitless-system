import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-108: la ficha de un cliente decide en el servidor si existe. Misma
 * consulta que la lista (`listClientsAction`): sólo la RLS de `clients`, sin
 * filtros nuevos. Una falla de la base lanza; no se confunde con "no existe".
 */

const sim = vi.hoisted(() => ({
  configurado: true,
  respuesta: { data: null as unknown, error: null as unknown },
  consultas: [] as Array<{ tabla: string; select?: string; filtros: Array<[string, unknown]> }>,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => sim.configurado }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (tabla: string) => {
      const consulta = { tabla, select: undefined as string | undefined, filtros: [] as Array<[string, unknown]> };
      sim.consultas.push(consulta);
      const cadena = {
        select: (columnas: string) => ((consulta.select = columnas), cadena),
        eq: (columna: string, valor: unknown) => (consulta.filtros.push([columna, valor]), cadena),
        maybeSingle: async () => sim.respuesta,
      };
      return cadena;
    },
  }),
}));

import { clienteVisibleExiste } from "../cliente-visible";
import { FallaDeLaBase } from "@/lib/server/action-result";

const ID = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  sim.configurado = true;
  sim.respuesta = { data: null, error: null };
  sim.consultas = [];
});

describe("clienteVisibleExiste", () => {
  it("⭐ un cliente que la RLS deja ver existe; la consulta es la de la lista, sin filtros nuevos", async () => {
    sim.respuesta = { data: { id: ID }, error: null };
    await expect(clienteVisibleExiste(ID)).resolves.toBe(true);
    expect(sim.consultas).toEqual([{ tabla: "clients", select: "id", filtros: [["id", ID]] }]);
  });

  it("⭐ inexistente o de otra organización (la RLS no lo devuelve) → no existe", async () => {
    await expect(clienteVisibleExiste(ID)).resolves.toBe(false);
  });

  it("un id que no es un UUID no existe y no consulta la base", async () => {
    await expect(clienteVisibleExiste("no-es-un-id")).resolves.toBe(false);
    expect(sim.consultas).toEqual([]);
  });

  it("sin Supabase configurado no existe (la lista también está vacía)", async () => {
    sim.configurado = false;
    await expect(clienteVisibleExiste(ID)).resolves.toBe(false);
    expect(sim.consultas).toEqual([]);
  });

  it("⭐ si la base falla, lanza: una caída no es 'no existe'", async () => {
    sim.respuesta = { data: null, error: { message: "fetch failed", code: "" } };
    await expect(clienteVisibleExiste(ID)).rejects.toBeInstanceOf(FallaDeLaBase);
  });
});
