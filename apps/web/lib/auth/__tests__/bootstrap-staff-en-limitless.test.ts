import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-552 · AC-13: un email del staff sin perfil que entra por primera vez
 * nace founder de la org de Limitless (la única con experience = 'limitless'),
 * sin crear una organización propia ni sus roles por defecto.
 *
 * Sin org marcada (o en una base sin la columna `experience`) nace sin org,
 * como antes; con más de una no se adivina, y una falla de la base no deja un
 * perfil a medias.
 *
 * El admin simulado se arma acá (como pide `docs/operacion/testing.md` para los
 * tests que necesitan `.limit()`): registra consultas, inserts y rpc.
 */

type Consulta = { tabla: string; select: string; eqs: [string, unknown][]; limit: number | null };

const sim = vi.hoisted(() => ({
  esStaff: true,
  perfilExistente: null as Record<string, unknown> | null,
  limitless: [] as { id: string }[],
  errorLimitless: null as { message: string; code?: string } | null,
  consultas: [] as { tabla: string; select: string; eqs: [string, unknown][]; limit: number | null }[],
  inserts: {} as Record<string, Record<string, unknown>[]>,
  rpcs: [] as string[],
}));

vi.mock("@/lib/auth/require-staff", () => ({ isStaffEmail: async () => sim.esStaff }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (nombre: string) => {
      sim.rpcs.push(nombre);
      return { data: null, error: null };
    },
    from(tabla: string) {
      const consulta: Consulta = { tabla, select: "", eqs: [], limit: null };
      let fila: Record<string, unknown> | null = null;
      const resultado = () => {
        if (fila) {
          if (tabla === "organizations") return { data: { id: "org-propia" }, error: null };
          return {
            data: { id: fila.id, organization_id: fila.organization_id, role: fila.role },
            error: null,
          };
        }
        if (tabla === "profiles") return { data: sim.perfilExistente, error: null };
        if (tabla === "organizations") {
          return sim.errorLimitless
            ? { data: null, error: sim.errorLimitless }
            : { data: sim.limitless, error: null };
        }
        return { data: null, error: null };
      };
      const builder = {
        select(columnas: string) {
          if (!fila) {
            consulta.select = columnas;
            sim.consultas.push(consulta);
          }
          return builder;
        },
        eq(columna: string, valor: unknown) {
          consulta.eqs.push([columna, valor]);
          return builder;
        },
        limit(n: number) {
          consulta.limit = n;
          return builder;
        },
        insert(row: Record<string, unknown>) {
          fila = row;
          (sim.inserts[tabla] ??= []).push(row);
          return builder;
        },
        maybeSingle: async () => resultado(),
        single: async () => resultado(),
        then(ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) {
          return Promise.resolve(resultado()).then(ok, ko);
        },
      };
      return builder;
    },
  }),
}));

import type { User } from "@supabase/supabase-js";
import { FallaDeLaBase } from "@/lib/server/action-result";
import { ensureUserBootstrap } from "../bootstrap";

const ORG_LIMITLESS = "11111111-1111-4111-8111-11111111c0de";
const STAFF = { id: "u-staff", email: "staff@limitless.test", user_metadata: { full_name: "Sol" } } as unknown as User;

beforeEach(() => {
  sim.esStaff = true;
  sim.perfilExistente = null;
  sim.limitless = [{ id: ORG_LIMITLESS }];
  sim.errorLimitless = null;
  sim.consultas = [];
  sim.inserts = {};
  sim.rpcs = [];
});

function consultaDeLimitless() {
  return sim.consultas.find((c) => c.tabla === "organizations");
}

describe("bootstrap del staff", () => {
  it("⭐ un staff sin perfil nace founder de la org de Limitless, sin org propia ni roles", async () => {
    const perfil = await ensureUserBootstrap(STAFF);
    expect(perfil).toEqual({ id: "u-staff", organization_id: ORG_LIMITLESS, role: "founder" });
    expect(sim.inserts.profiles).toEqual([
      { id: "u-staff", organization_id: ORG_LIMITLESS, email: "staff@limitless.test", full_name: "Sol", role: "founder" },
    ]);
    expect(sim.inserts.organizations).toBeUndefined();
    expect(sim.rpcs).toEqual([]);
  });

  it("busca la org con experience = limitless y limit(2)", async () => {
    await ensureUserBootstrap(STAFF);
    expect(consultaDeLimitless()).toEqual({
      tabla: "organizations",
      select: "id",
      eqs: [["experience", "limitless"]],
      limit: 2,
    });
  });

  it("sin org marcada nace sin org, como antes", async () => {
    sim.limitless = [];
    const perfil = await ensureUserBootstrap(STAFF);
    expect(perfil).toMatchObject({ organization_id: null, role: "founder" });
    expect(sim.inserts.organizations).toBeUndefined();
  });

  it("en una base sin la columna experience nace sin org", async () => {
    sim.errorLimitless = { message: 'column organizations.experience does not exist', code: "42703" };
    const perfil = await ensureUserBootstrap(STAFF);
    expect(perfil).toMatchObject({ organization_id: null, role: "founder" });
  });

  it("otra falla de la base lanza FallaDeLaBase y no crea el perfil", async () => {
    sim.errorLimitless = { message: "canceling statement due to statement timeout", code: "57014" };
    await expect(ensureUserBootstrap(STAFF)).rejects.toBeInstanceOf(FallaDeLaBase);
    expect(sim.inserts.profiles).toBeUndefined();
  });

  it("con dos orgs marcadas lanza y no crea el perfil", async () => {
    sim.limitless = [{ id: ORG_LIMITLESS }, { id: "otra-org" }];
    await expect(ensureUserBootstrap(STAFF)).rejects.toThrow("Hay más de una organización marcada como Limitless");
    expect(sim.inserts.profiles).toBeUndefined();
  });

  it("un staff con perfil lo recibe sin cambios", async () => {
    sim.perfilExistente = { id: "u-staff", organization_id: null, role: "founder" };
    expect(await ensureUserBootstrap(STAFF)).toEqual(sim.perfilExistente);
    expect(sim.inserts).toEqual({});
    expect(consultaDeLimitless()).toBeUndefined();
  });

  it("quien no es staff sigue creando su org en webinar", async () => {
    sim.esStaff = false;
    const perfil = await ensureUserBootstrap({ id: "u-2", email: "dani@test.com", user_metadata: {} } as User);
    expect(sim.inserts.organizations).toEqual([{ name: "Dani", experience: "webinar" }]);
    expect(perfil).toMatchObject({ id: "u-2", organization_id: "org-propia", role: "founder" });
    expect(consultaDeLimitless()).toBeUndefined();
  });
});
