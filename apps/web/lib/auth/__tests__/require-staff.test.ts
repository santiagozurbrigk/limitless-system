import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-552 · el guard del staff (`requireStaff` / `isStaffUser`).
 *
 * Decide sólo por la lista de staff (`super_admin_users`) y, para quien está en
 * la lista, por el perfil no desactivado. Estar en la org de Limitless, aunque
 * sea como founder, no da el panel: el guard no lee `organization_id` ni `role`.
 *
 * Igual que `super-admin-una-consulta.test.ts`, carga la versión de servidor de
 * React y simula un pedido con `getCacheForType` para probar la memoización.
 * No se simula el guard: sólo la capa de Supabase.
 */

type Perfil = { is_active: boolean; organization_id?: string | null; role?: string };

const sim = vi.hoisted(() => ({
  configurado: true,
  usuario: { id: "u-1", email: "Staff@Limitless.com" } as { id: string; email: string } | null,
  lista: ["staff@limitless.com"],
  perfil: { is_active: true } as Perfil | null,
  errorPerfil: null as { message: string } | null,
  getUser: 0,
  consultasLista: 0,
  consultasPerfil: 0,
  emailsConsultados: [] as string[],
  columnasPerfil: [] as string[],
}));

vi.mock("react", async () => {
  const { createRequire } = await import("node:module");
  const { dirname, join } = await import("node:path");
  const require = createRequire(import.meta.url);
  const raiz = dirname(require.resolve("react/package.json"));
  return require(join(raiz, "react.react-server.js"));
});

vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => sim.configurado }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => {
        sim.getUser += 1;
        return { data: { user: sim.usuario }, error: null };
      },
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(tabla: string) {
      if (tabla === "super_admin_users") {
        let email = "";
        const builder = {
          select: () => builder,
          eq(columna: string, valor: string) {
            expect(columna).toBe("email");
            email = valor;
            return builder;
          },
          maybeSingle: async () => {
            sim.consultasLista += 1;
            sim.emailsConsultados.push(email);
            return { data: sim.lista.includes(email) ? { id: "sa-1" } : null, error: null };
          },
        };
        return builder;
      }
      expect(tabla).toBe("profiles");
      const builder = {
        select(columnas: string) {
          sim.columnasPerfil.push(columnas);
          return builder;
        },
        eq(columna: string, valor: string) {
          expect(columna).toBe("id");
          expect(valor).toBe(sim.usuario?.id);
          return builder;
        },
        maybeSingle: async () => {
          sim.consultasPerfil += 1;
          if (sim.errorPerfil) return { data: null, error: sim.errorPerfil };
          return { data: sim.perfil, error: null };
        },
      };
      return builder;
    },
  }),
}));

import * as React from "react";
import { paths } from "@/routes";
import { CUENTA_DESACTIVADA_MESSAGE } from "@/lib/auth/cuenta-desactivada";
import {
  DESTINO_DEL_STAFF,
  MENSAJES_DE_RECHAZO_DEL_STAFF,
  isStaffEmail,
  isStaffUser,
  requireStaff,
} from "../require-staff";
import * as alias from "../require-super-admin";

type Despachador = { getCacheForType: <T>(crear: () => T) => T } | null;
const internos = (
  React as unknown as {
    __SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: { A: Despachador };
  }
).__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

/** Corre `fn` dentro de un pedido simulado, con su propia caché. */
async function enUnPedido<T>(fn: () => Promise<T>): Promise<T> {
  const cachePorTipo = new Map<unknown, unknown>();
  const anterior = internos.A;
  internos.A = {
    getCacheForType<C>(crear: () => C): C {
      if (!cachePorTipo.has(crear)) cachePorTipo.set(crear, crear());
      return cachePorTipo.get(crear) as C;
    },
  };
  try {
    return await fn();
  } finally {
    internos.A = anterior;
  }
}

const ORG_LIMITLESS = "11111111-0000-0000-0000-00000000c0de";

beforeEach(() => {
  sim.configurado = true;
  sim.usuario = { id: "u-1", email: "Staff@Limitless.com" };
  sim.lista = ["staff@limitless.com"];
  sim.perfil = { is_active: true };
  sim.errorPerfil = null;
  sim.getUser = 0;
  sim.consultasLista = 0;
  sim.consultasPerfil = 0;
  sim.emailsConsultados = [];
  sim.columnasPerfil = [];
  vi.restoreAllMocks();
});

describe("guard del staff por pedido", () => {
  it("⭐ el layout y dos lecturas del mismo pedido hacen un getUser, una consulta a la lista y una al perfil", async () => {
    await enUnPedido(async () => {
      await expect(isStaffUser()).resolves.toBe(true);
      await expect(requireStaff()).resolves.toMatchObject({ id: "u-1" });
      await expect(requireStaff()).resolves.toMatchObject({ id: "u-1" });
    });
    expect(sim.getUser).toBe(1);
    expect(sim.consultasLista).toBe(1);
    expect(sim.consultasPerfil).toBe(1);
  });

  it("dos pedidos distintos no comparten el resultado", async () => {
    await enUnPedido(() => requireStaff());
    sim.lista = [];
    await enUnPedido(async () => {
      await expect(requireStaff()).rejects.toThrow("Sin permisos de super admin");
    });
    expect(sim.consultasLista).toBe(2);
  });

  it("un rechazo también se comparte dentro del pedido", async () => {
    sim.lista = [];
    await enUnPedido(async () => {
      await expect(isStaffUser()).resolves.toBe(false);
      await expect(requireStaff()).rejects.toThrow("Sin permisos de super admin");
      await expect(requireStaff()).rejects.toThrow("Sin permisos de super admin");
    });
    expect(sim.consultasLista).toBe(1);
  });

  it("fuera de un render (server actions, route handlers) cada llamada consulta", async () => {
    await requireStaff();
    await requireStaff();
    expect(sim.consultasLista).toBe(2);
    expect(sim.consultasPerfil).toBe(2);
  });
});

describe("rechazos del guard del staff", () => {
  it("sin Supabase configurado no pregunta por la sesión", async () => {
    sim.configurado = false;
    await expect(requireStaff()).rejects.toThrow("Supabase no configurado");
    await expect(isStaffUser()).resolves.toBe(false);
    expect(sim.getUser).toBe(0);
  });

  it("sin sesión no hace ninguna consulta con service role", async () => {
    sim.usuario = null;
    await expect(requireStaff()).rejects.toThrow("No autenticado");
    await expect(isStaffUser()).resolves.toBe(false);
    expect(sim.consultasLista).toBe(0);
    expect(sim.consultasPerfil).toBe(0);
  });

  it("fuera de la lista rechaza sin leer el perfil", async () => {
    sim.lista = [];
    await expect(requireStaff()).rejects.toThrow("Sin permisos de super admin");
    await expect(isStaffUser()).resolves.toBe(false);
    expect(sim.consultasPerfil).toBe(0);
  });

  it("⭐ un founder de la org de Limitless fuera de la lista no tiene el panel", async () => {
    sim.lista = [];
    sim.perfil = { is_active: true, organization_id: ORG_LIMITLESS, role: "founder" };
    await expect(isStaffUser()).resolves.toBe(false);
    await expect(requireStaff()).rejects.toThrow("Sin permisos de super admin");
    expect(sim.consultasPerfil).toBe(0);
  });

  it("un staff con el perfil desactivado no entra", async () => {
    sim.perfil = { is_active: false };
    await expect(requireStaff()).rejects.toThrow(CUENTA_DESACTIVADA_MESSAGE);
    await expect(isStaffUser()).resolves.toBe(false);
  });

  it("un error al leer el perfil rechaza (nunca da el panel)", async () => {
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    sim.errorPerfil = { message: "timeout" };
    await expect(isStaffUser()).resolves.toBe(false);
    await expect(requireStaff()).rejects.toThrow("Sin permisos de super admin");
    expect(consola).toHaveBeenCalled();
    expect(JSON.stringify(consola.mock.calls)).not.toContain("limitless.com");
  });

  it("el guard no lee organization_id ni role del perfil", async () => {
    await requireStaff();
    expect(sim.columnasPerfil).toEqual(["is_active"]);
  });
});

describe("staff aceptado", () => {
  it("un staff de la lista con perfil activo pasa y recibe su usuario", async () => {
    await expect(requireStaff()).resolves.toMatchObject({ id: "u-1" });
    await expect(isStaffUser()).resolves.toBe(true);
  });

  it("un staff sin perfil todavía (recién dado de alta) pasa", async () => {
    sim.perfil = null;
    await expect(requireStaff()).resolves.toMatchObject({ id: "u-1" });
    await expect(isStaffUser()).resolves.toBe(true);
  });

  it("la consulta a la lista usa el email normalizado", async () => {
    sim.usuario = { id: "u-1", email: "  Staff@Limitless.COM " };
    await expect(isStaffUser()).resolves.toBe(true);
    expect(sim.emailsConsultados).toEqual(["staff@limitless.com"]);
  });

  it("isStaffEmail con un email vacío no consulta", async () => {
    await expect(isStaffEmail("   ")).resolves.toBe(false);
    expect(sim.consultasLista).toBe(0);
  });
});

describe("contrato del módulo", () => {
  it("el alias de require-super-admin es el mismo guard", () => {
    expect(alias.requireSuperAdmin).toBe(requireStaff);
    expect(alias.isSuperAdminUser).toBe(isStaffUser);
    expect(alias.isSuperAdminEmail).toBe(isStaffEmail);
  });

  it("el staff va al panel al iniciar sesión", () => {
    expect(DESTINO_DEL_STAFF).toBe(paths.superAdmin.organizations);
  });

  it("los textos de rechazo son los tres de siempre más el de cuenta desactivada", () => {
    expect([...MENSAJES_DE_RECHAZO_DEL_STAFF].sort()).toEqual(
      [
        "Supabase no configurado",
        "No autenticado",
        "Sin permisos de super admin",
        CUENTA_DESACTIVADA_MESSAGE,
      ].sort()
    );
  });
});
