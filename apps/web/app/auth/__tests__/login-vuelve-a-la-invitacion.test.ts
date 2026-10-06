import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-495 · [AUTH-ALTA-EMAIL-AJENO] parte A: `/invite` manda a iniciar
 * sesión con `?next=/invite?token=…` y el login vuelve ahí.
 *
 * Antes `signInAction` ignoraba el `next`: el invitado terminaba en el panel y,
 * peor, `ensureUserBootstrap` le creaba una org propia a una cuenta sin perfil,
 * con lo que ya no podía aceptar la invitación (una cuenta, una org). Ahora, si
 * el `next` es una invitación válida, no se crea la org y se vuelve a la
 * invitación; cualquier otro `next` se ignora (sin open redirect).
 */

class Redireccion extends Error {
  constructor(readonly destino: string) {
    super(`redirect ${destino}`);
  }
}

const sim = vi.hoisted(() => ({
  bootstraps: 0,
  mustChangePassword: false,
}));

vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Redireccion(destino);
  },
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: () => undefined }) }));
vi.mock("@/lib/auth/limite-login", () => ({
  limiteDeLogin: async () => ({ allowed: true, resetAt: 0 }),
}));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/auth/require-super-admin", () => ({ isSuperAdminEmail: async () => false }));
vi.mock("@/lib/auth/bootstrap", () => ({
  ensureCurrentUserBootstrap: async () => {
    sim.bootstraps += 1;
    return { id: "u1", organization_id: "org-propia", role: "founder" };
  },
  loadProfileOrganizationContext: async () => ({
    organizationId: "org-propia",
    accountType: "founder",
    canManageHolding: true,
    isActive: true,
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signInWithPassword: async () => ({ error: null }),
      getUser: async () => ({ data: { user: { id: "u1", email: "ana@test.com" } } }),
    },
    from: () => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({
          data: { must_change_password: sim.mustChangePassword, temp_password_expires_at: null },
        }),
      };
      return builder;
    },
  }),
}));

import { signInAction } from "@/app/auth/actions";

async function entrar(next?: string): Promise<{ destino: string; bootstraps: number }> {
  const form = new FormData();
  form.set("email", "ana@test.com");
  form.set("password", "secreta123");
  if (next !== undefined) form.set("next", next);
  try {
    await signInAction({}, form);
  } catch (e) {
    if (e instanceof Redireccion) return { destino: e.destino, bootstraps: sim.bootstraps };
    throw e;
  }
  throw new Error("signInAction no redirigió");
}

beforeEach(() => {
  sim.bootstraps = 0;
  sim.mustChangePassword = false;
});

describe("signInAction con next", () => {
  it("vuelve a la invitación y no le crea una org propia a la cuenta", async () => {
    expect(await entrar("/invite?token=tok-1")).toEqual({ destino: "/invite?token=tok-1", bootstraps: 0 });
  });

  it("de la invitación sólo pasa el token", async () => {
    expect((await entrar("/invite?token=tok-1&next=https://evil.com")).destino).toBe("/invite?token=tok-1");
  });

  it("el cambio de contraseña obligatorio va primero", async () => {
    sim.mustChangePassword = true;
    expect((await entrar("/invite?token=tok-1")).destino).toBe("/auth/force-password-change");
  });

  it.each([
    "https://evil.com/invite?token=tok-1",
    "//evil.com/invite?token=tok-1",
    "/\\evil.com/invite?token=tok-1",
    "/dashboard",
    "/invite",
  ])("ignora %s: login de siempre, al panel", async (next) => {
    expect(await entrar(next)).toEqual({ destino: "/dashboard", bootstraps: 1 });
  });

  it("sin next, el login de siempre", async () => {
    expect(await entrar()).toEqual({ destino: "/dashboard", bootstraps: 1 });
  });
});
