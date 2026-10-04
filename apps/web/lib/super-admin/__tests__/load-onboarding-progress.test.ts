import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-111 · [SUPERADMIN-ONBOARDING-SIN-GUARD]: el progreso de onboarding de
 * todas las organizaciones se lee con el service role, así que sólo un super
 * admin puede pedirlo, aunque alguien llame a la función sin pasar por el
 * layout del panel.
 */

const sim = vi.hoisted(() => ({
  configurado: true,
  superAdmin: true,
  llamadasRpc: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => sim.configurado }));
vi.mock("@/lib/auth/require-super-admin", () => ({
  requireSuperAdmin: async () => {
    if (!sim.superAdmin) throw new Error("Sin permisos de super admin");
    return { id: "u-1", email: "staff@limitless.com" };
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async () => {
      sim.llamadasRpc += 1;
      return { data: [], error: null };
    },
  }),
}));

import { loadOnboardingProgress } from "../onboarding-progress";

beforeEach(() => {
  sim.configurado = true;
  sim.superAdmin = true;
  sim.llamadasRpc = 0;
});

describe("loadOnboardingProgress", () => {
  it("⭐ quien no es super admin no lee nada: se rechaza antes de consultar la base", async () => {
    sim.superAdmin = false;
    await expect(loadOnboardingProgress()).rejects.toThrow("Sin permisos de super admin");
    expect(sim.llamadasRpc).toBe(0);
  });

  it("un super admin lee el progreso", async () => {
    await expect(loadOnboardingProgress()).resolves.toEqual([]);
    expect(sim.llamadasRpc).toBe(1);
  });

  it("sin Supabase configurado devuelve la lista vacía, como antes", async () => {
    sim.configurado = false;
    sim.superAdmin = false;
    await expect(loadOnboardingProgress()).resolves.toEqual([]);
    expect(sim.llamadasRpc).toBe(0);
  });
});
