import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-111 · un solo chequeo de super admin por pedido.
 *
 * `/super-admin/ai-brain/[id]` con imagen encadena tres chequeos (el layout,
 * `loadAiBrainDocument` y `getSignedFileUrl`). Con `cache` de React comparten
 * una sola resolución por pedido.
 *
 * Vitest corre en Node sin la condición `react-server`, y ahí `cache` de React
 * no memoiza nada. Por eso este test carga la versión de servidor de React (la
 * que usa Next en server components) y simula un pedido como lo hace el
 * renderer de Flight: instala un despachador con `getCacheForType` mientras
 * dura el pedido.
 */

const sim = vi.hoisted(() => ({
  configurado: true,
  usuario: { id: "u-1", email: "Staff@Limitless.com" } as { id: string; email: string } | null,
  allowlist: ["staff@limitless.com"],
  getUser: 0,
  consultas: 0,
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
      expect(tabla).toBe("super_admin_users");
      let email = "";
      const builder = {
        select: () => builder,
        eq(columna: string, valor: string) {
          expect(columna).toBe("email");
          email = valor;
          return builder;
        },
        maybeSingle: async () => {
          sim.consultas += 1;
          return { data: sim.allowlist.includes(email) ? { id: "sa-1" } : null, error: null };
        },
      };
      return builder;
    },
  }),
}));

import * as React from "react";
import { isSuperAdminUser, requireSuperAdmin } from "../require-super-admin";

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

beforeEach(() => {
  sim.configurado = true;
  sim.usuario = { id: "u-1", email: "Staff@Limitless.com" };
  sim.allowlist = ["staff@limitless.com"];
  sim.getUser = 0;
  sim.consultas = 0;
});

describe("chequeo de super admin por pedido", () => {
  it("⭐ el layout y dos lecturas del mismo pedido hacen una sola consulta", async () => {
    await enUnPedido(async () => {
      await expect(isSuperAdminUser()).resolves.toBe(true);
      await expect(requireSuperAdmin()).resolves.toMatchObject({ id: "u-1" });
      await expect(requireSuperAdmin()).resolves.toMatchObject({ id: "u-1" });
    });
    expect(sim.getUser).toBe(1);
    expect(sim.consultas).toBe(1);
  });

  it("dos pedidos distintos no comparten el resultado", async () => {
    await enUnPedido(() => requireSuperAdmin());
    sim.allowlist = [];
    await enUnPedido(async () => {
      await expect(requireSuperAdmin()).rejects.toThrow("Sin permisos de super admin");
    });
    expect(sim.consultas).toBe(2);
  });

  it("un rechazo también se comparte dentro del pedido", async () => {
    sim.allowlist = [];
    await enUnPedido(async () => {
      await expect(isSuperAdminUser()).resolves.toBe(false);
      await expect(requireSuperAdmin()).rejects.toThrow("Sin permisos de super admin");
      await expect(requireSuperAdmin()).rejects.toThrow("Sin permisos de super admin");
    });
    expect(sim.consultas).toBe(1);
  });

  it("fuera de un render (server actions, route handlers) cada llamada consulta, como antes", async () => {
    await requireSuperAdmin();
    await requireSuperAdmin();
    expect(sim.consultas).toBe(2);
  });
});

describe("mismos mensajes y resultados que antes", () => {
  it("sin Supabase configurado", async () => {
    sim.configurado = false;
    await expect(requireSuperAdmin()).rejects.toThrow("Supabase no configurado");
    await expect(isSuperAdminUser()).resolves.toBe(false);
    expect(sim.getUser).toBe(0);
  });

  it("sin sesión", async () => {
    sim.usuario = null;
    await expect(requireSuperAdmin()).rejects.toThrow("No autenticado");
    await expect(isSuperAdminUser()).resolves.toBe(false);
    expect(sim.consultas).toBe(0);
  });

  it("con sesión pero fuera de la allowlist", async () => {
    sim.allowlist = [];
    await expect(requireSuperAdmin()).rejects.toThrow("Sin permisos de super admin");
    await expect(isSuperAdminUser()).resolves.toBe(false);
  });

  it("un super admin pasa y recibe su usuario", async () => {
    await expect(requireSuperAdmin()).resolves.toMatchObject({ id: "u-1" });
    await expect(isSuperAdminUser()).resolves.toBe(true);
  });
});
