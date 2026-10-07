import { beforeEach, describe, expect, it, vi } from "vitest";
import { MENSAJE_RECUPERACION_ENVIADA } from "@/lib/auth/recuperar-contrasena";

/**
 * SCRUM-16 · [AUTH-RECUPERAR-PASSWORD]: "¿Olvidaste tu contraseña?" manda el mail
 * de recuperación y responde lo mismo exista o no la cuenta.
 */

const sim = vi.hoisted(() => ({
  permitido: true,
  errorDeSupabase: null as null | { message: string },
  pedidos: [] as Array<{ email: string; redirectTo?: string }>,
  claves: [] as string[],
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: () => undefined }),
  headers: async () => new Headers({ "x-forwarded-for": "1.2.3.4" }),
}));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/rate-limit", () => ({
  authRateLimit: async () => ({ allowed: true, resetAt: 0 }),
  rateLimitErrorMessage: () => "Demasiados intentos. Probá más tarde.",
  rateLimit: () => async (clave: string) => {
    sim.claves.push(clave);
    return { allowed: sim.permitido, remaining: 0, resetAt: Date.now() + 1000 };
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      resetPasswordForEmail: async (email: string, opts: { redirectTo?: string }) => {
        sim.pedidos.push({ email, redirectTo: opts.redirectTo });
        return { error: sim.errorDeSupabase };
      },
    },
  }),
}));

import { requestPasswordResetAction } from "@/app/auth/actions";

function form(email: string) {
  const fd = new FormData();
  fd.set("email", email);
  return fd;
}

beforeEach(() => {
  sim.permitido = true;
  sim.errorDeSupabase = null;
  sim.pedidos = [];
  sim.claves = [];
  process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
});

describe("requestPasswordResetAction", () => {
  it("manda el mail con el link de vuelta al callback de recuperación", async () => {
    const r = await requestPasswordResetAction({}, form("ana@test.com"));
    expect(r).toEqual({ success: MENSAJE_RECUPERACION_ENVIADA });
    expect(sim.pedidos).toEqual([
      { email: "ana@test.com", redirectTo: "https://app.test/auth/callback?type=recovery" },
    ]);
    expect(sim.claves).toEqual(["recuperar:ana@test.com", "recuperar-ip:1.2.3.4"]);
  });

  it("si Supabase falla (o la cuenta no existe) responde lo mismo: no revela nada", async () => {
    sim.errorDeSupabase = { message: "User not found" };
    const r = await requestPasswordResetAction({}, form("nadie@test.com"));
    expect(r).toEqual({ success: MENSAJE_RECUPERACION_ENVIADA });
  });

  it("con el límite agotado no manda nada", async () => {
    sim.permitido = false;
    const r = await requestPasswordResetAction({}, form("ana@test.com"));
    expect(r.error).toMatch(/Demasiados intentos/);
    expect(sim.pedidos).toHaveLength(0);
  });

  it("un email inválido se rechaza sin llamar a Supabase", async () => {
    const r = await requestPasswordResetAction({}, form("no-es-un-mail"));
    expect(r.error).toBe("Ingresá un email válido.");
    expect(sim.pedidos).toHaveLength(0);
  });
});
