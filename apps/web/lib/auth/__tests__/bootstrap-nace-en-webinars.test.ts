import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-523 · la organización que crea el bootstrap (un usuario que entra sin
 * perfil) nace en Limitless Webinars: manda `experience: "webinar"` explícito,
 * porque el default de la base es `full` (AR pasada 1, MAYOR-2).
 */

const sim = vi.hoisted(() => ({
  estado: null as unknown as import("@/lib/organization/__tests__/base-falsa").EstadoDeLaBase,
}));

vi.mock("@/lib/supabase/admin", async () => {
  const { crearBaseFalsa } = await import("@/lib/organization/__tests__/base-falsa");
  return { createAdminClient: () => crearBaseFalsa(sim.estado) };
});
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth/require-super-admin", () => ({ isSuperAdminEmail: async () => false }));

import type { User } from "@supabase/supabase-js";
import { estadoInicial, experienciaGuardada } from "@/lib/organization/__tests__/base-falsa";
import { ensureUserBootstrap } from "../bootstrap";

beforeEach(() => {
  sim.estado = estadoInicial();
});

describe("ensureUserBootstrap", () => {
  it("⭐ la organización nueva queda en webinar, mandado explícito", async () => {
    const perfil = await ensureUserBootstrap({ id: "u-1", email: "dani@test.com", user_metadata: {} } as User);
    expect(perfil).toMatchObject({ id: "u-1", role: "founder" });
    expect(sim.estado.insertsDeOrganizaciones).toEqual([{ name: "Dani", experience: "webinar" }]);
    expect(experienciaGuardada(sim.estado, "Dani")).toBe("webinar");
  });

  it("un usuario que ya tiene perfil no crea organización", async () => {
    sim.estado.tablas.profiles.push({ id: "u-1", organization_id: "org-1", role: "founder" });
    await ensureUserBootstrap({ id: "u-1", email: "dani@test.com", user_metadata: {} } as User);
    expect(sim.estado.insertsDeOrganizaciones).toEqual([]);
  });
});
