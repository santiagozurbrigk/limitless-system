import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-523 · las tres altas del super admin crean organizaciones que nacen en
 * Limitless Webinars: no mandan `experience` y queda el default de la base
 * (`webinar`). Ninguna crea un negocio dentro de una cuenta holding:
 * `createOrganizationFromHoldingAction` lo vincula a `holdings` (el portfolio
 * del super admin), que no tiene experiencia propia, y `createHoldingOrgAction`
 * crea la cuenta holding misma.
 */

const sim = vi.hoisted(() => ({
  estado: null as unknown as import("@/lib/organization/__tests__/base-falsa").EstadoDeLaBase,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-super-admin", () => ({
  requireSuperAdmin: async () => ({ id: "super" }),
}));
vi.mock("@/lib/supabase/admin", async () => {
  const { crearBaseFalsa } = await import("@/lib/organization/__tests__/base-falsa");
  return { createAdminClient: () => crearBaseFalsa(sim.estado) };
});
vi.mock("@/lib/ai/platform-credential", () => ({ getPlatformAnthropicClient: vi.fn() }));
vi.mock("@/lib/track-token-usage", () => ({ trackTokenUsage: vi.fn() }));
vi.mock("@/lib/ai-brain/process-document", () => ({ processAiBrainDocument: vi.fn() }));
vi.mock("@/lib/super-admin/org-health", () => ({ loadOrgHealthScores: vi.fn() }));
vi.mock("@/lib/super-admin/queries", () => ({
  loadAICostsSummary: vi.fn(),
  loadAdminUsers: vi.fn(),
  loadOrganizationDetail: vi.fn(),
  loadOrganizationsList: vi.fn(),
}));
vi.mock("@/lib/auth/regenerate-temp-password", () => ({ regenerateUserTempPassword: vi.fn() }));

import { estadoInicial, experienciaGuardada } from "@/lib/organization/__tests__/base-falsa";
import {
  createFounderAccountAction,
  createHoldingOrgAction,
  createOrganizationFromHoldingAction,
} from "../actions";

beforeEach(() => {
  sim.estado = estadoInicial({ holdings: [{ id: "portfolio" }], holding_organizations: [] });
});

describe("altas del super admin", () => {
  it("⭐ cuenta de founder nueva: queda en webinar, sin mandar experience", async () => {
    const r = await createFounderAccountAction({
      organizationName: "Org Founder",
      founderName: "Ana",
      email: "ana@test.com",
    });
    expect(r.success).toBe(true);
    expect(sim.estado.insertsDeOrganizaciones).toHaveLength(1);
    expect(sim.estado.insertsDeOrganizaciones[0]).not.toHaveProperty("experience");
    expect(experienciaGuardada(sim.estado, "Org Founder")).toBe("webinar");
  });

  it("⭐ organización del portfolio: queda en webinar (el portfolio no es una cuenta holding)", async () => {
    const r = await createOrganizationFromHoldingAction({
      name: "Org Portfolio",
      founderEmail: "bea@test.com",
      plan: "pro",
    });
    expect(r.success).toBe(true);
    expect(sim.estado.tablas.holding_organizations).toHaveLength(1);
    expect(sim.estado.insertsDeOrganizaciones[0]).not.toHaveProperty("experience");
    expect(experienciaGuardada(sim.estado, "Org Portfolio")).toBe("webinar");
  });

  it("⭐ cuenta holding nueva: queda en webinar", async () => {
    const r = await createHoldingOrgAction({ name: "Holding Nuevo", founderEmail: "caro@test.com" });
    expect(r.success).toBe(true);
    expect(sim.estado.insertsDeOrganizaciones[0]).toMatchObject({ account_type: "holding" });
    expect(sim.estado.insertsDeOrganizaciones[0]).not.toHaveProperty("experience");
    expect(experienciaGuardada(sim.estado, "Holding Nuevo")).toBe("webinar");
  });
});
