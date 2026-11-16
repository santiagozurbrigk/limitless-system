import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-523 y SCRUM-552 · un negocio que se crea dentro de un holding toma la
 * experiencia de la organización del holding, salvo `limitless`, que da `full`
 * (`experienciaDelNegocioDeUnHolding`). Vale en las dos altas que lo vinculan
 * en el mismo flujo: "Agregar negocio" (`addBusinessToMyHoldingAction`) y el
 * onboarding del holding (`completeHoldingOnboardingAction`). Así un founder
 * con Limitless completo que suma un negocio no pierde el menú completo, y
 * ningún negocio nace en Limitless de gestión. La entrada no elige la
 * experiencia: la decide el servidor.
 *
 * Si la experiencia del holding no se puede leer, no se crea ningún negocio:
 * el default de la base (`full`) decidiría por el holding.
 */

const sim = vi.hoisted(() => ({
  estado: null as unknown as import("@/lib/organization/__tests__/base-falsa").EstadoDeLaBase,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  redirect: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", async () => {
  const { crearBaseFalsa } = await import("@/lib/organization/__tests__/base-falsa");
  return { createAdminClient: () => crearBaseFalsa(sim.estado) };
});
vi.mock("@/lib/supabase/server", async () => {
  const { crearBaseFalsa } = await import("@/lib/organization/__tests__/base-falsa");
  return { createClient: async () => crearBaseFalsa(sim.estado) };
});
vi.mock("@/lib/auth/bootstrap", () => ({
  loadProfileOrganizationContext: async () => ({
    organizationId: "holding-1",
    accountType: "holding",
    canManageHolding: true,
    isActive: true,
  }),
  isMissingTableError: () => false,
  tryRequireOrganizationId: async () => "holding-1",
}));
vi.mock("@/lib/holding/refresh-auth-session", () => ({ refreshAuthSessionAfterHoldingSwitch: vi.fn() }));
vi.mock("@/lib/holding/switch-org", () => ({ getHoldingBusinesses: vi.fn() }));
vi.mock("@/lib/auth/regenerate-temp-password", () => ({ regenerateUserTempPassword: vi.fn() }));

import { estadoInicial, experienciaGuardada } from "@/lib/organization/__tests__/base-falsa";
import { addBusinessToMyHoldingAction } from "../actions";
import { completeHoldingOnboardingAction } from "../../onboarding/holding/actions";

function holdingCon(experience: "full" | "webinar" | "limitless") {
  sim.estado = estadoInicial({
    organizations: [
      {
        id: "holding-1",
        name: "Holding",
        account_type: "holding",
        holding_billing_model: "revenue_share",
        experience,
      },
    ],
    holding_businesses: [],
    onboarding_responses: [],
  });
}

let consola: ReturnType<typeof vi.spyOn>;
let aviso: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  holdingCon("full");
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
  aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
  return () => {
    consola.mockRestore();
    aviso.mockRestore();
  };
});

describe("Agregar negocio desde el holding", () => {
  it("⭐ holding con Limitless completo: el negocio nuevo queda en full", async () => {
    const r = await addBusinessToMyHoldingAction({ businessName: "Negocio A", revenueSharePct: 10 });
    expect(r.success).toBe(true);
    expect(sim.estado.insertsDeOrganizaciones[0]).toMatchObject({ experience: "full" });
    expect(experienciaGuardada(sim.estado, "Negocio A")).toBe("full");
    expect(sim.estado.tablas.holding_businesses).toHaveLength(1);
  });

  it("⭐ holding en Webinars: el negocio nuevo queda en webinar, y lo manda explícito", async () => {
    holdingCon("webinar");
    const r = await addBusinessToMyHoldingAction({ businessName: "Negocio W", revenueSharePct: 10 });
    expect(r.success).toBe(true);
    expect(sim.estado.insertsDeOrganizaciones[0]).toMatchObject({ experience: "webinar" });
    expect(experienciaGuardada(sim.estado, "Negocio W")).toBe("webinar");
  });

  it("⭐ holding en Limitless de gestión: el negocio nuevo queda en full", async () => {
    holdingCon("limitless");
    const r = await addBusinessToMyHoldingAction({
      businessName: "Negocio L",
      revenueSharePct: 10,
      founderEmail: "founder-l@test.com",
    });
    expect(r.success).toBe(true);
    expect(sim.estado.insertsDeOrganizaciones[0]).toMatchObject({ experience: "full" });
    expect(experienciaGuardada(sim.estado, "Negocio L")).toBe("full");
    expect(sim.estado.tablas.holding_businesses).toHaveLength(1);
    if (r.success) expect(r.data.tempCredentials).toBeDefined();
    for (const fila of sim.estado.insertsDeOrganizaciones) expect(fila.experience).not.toBe("limitless");
  });

  it("⭐ la entrada no elige la experiencia", async () => {
    holdingCon("webinar");
    await addBusinessToMyHoldingAction({ businessName: "Pide L", revenueSharePct: 10, experience: "limitless" });
    expect(sim.estado.insertsDeOrganizaciones[0]).toMatchObject({ experience: "webinar" });

    holdingCon("webinar");
    await addBusinessToMyHoldingAction({ businessName: "Pide F", revenueSharePct: 10, experience: "full" });
    expect(sim.estado.insertsDeOrganizaciones[0]).toMatchObject({ experience: "webinar" });

    holdingCon("limitless");
    await addBusinessToMyHoldingAction({ businessName: "Pide L en L", revenueSharePct: 10, experience: "limitless" });
    expect(sim.estado.insertsDeOrganizaciones[0]).toMatchObject({ experience: "full" });
    for (const fila of sim.estado.insertsDeOrganizaciones) expect(fila.experience).not.toBe("limitless");
  });

  it("⭐ si no se puede leer la experiencia del holding, no se crea el negocio", async () => {
    sim.estado.fallaLecturaDeExperiencia = true;
    const r = await addBusinessToMyHoldingAction({ businessName: "Negocio X", revenueSharePct: 10 });
    expect(r.success).toBe(false);
    expect(sim.estado.insertsDeOrganizaciones).toEqual([]);
    expect(sim.estado.tablas.holding_businesses).toEqual([]);
  });
});

describe("Onboarding del holding", () => {
  const NEGOCIOS = {
    businesses: [
      { name: "Uno", revenueSharePct: 10 },
      { name: "Dos", revenueSharePct: 20 },
    ],
  };

  it("⭐ holding con Limitless completo: todos los negocios quedan en full", async () => {
    await completeHoldingOnboardingAction(NEGOCIOS);
    expect(sim.estado.insertsDeOrganizaciones).toHaveLength(2);
    for (const fila of sim.estado.insertsDeOrganizaciones) expect(fila).toMatchObject({ experience: "full" });
    expect(experienciaGuardada(sim.estado, "Uno")).toBe("full");
    expect(experienciaGuardada(sim.estado, "Dos")).toBe("full");
    expect(sim.estado.tablas.holding_businesses).toHaveLength(2);
  });

  it("⭐ holding en Webinars: los negocios quedan en webinar", async () => {
    holdingCon("webinar");
    await completeHoldingOnboardingAction(NEGOCIOS);
    expect(experienciaGuardada(sim.estado, "Uno")).toBe("webinar");
    expect(experienciaGuardada(sim.estado, "Dos")).toBe("webinar");
    for (const fila of sim.estado.insertsDeOrganizaciones) expect(fila).toMatchObject({ experience: "webinar" });
  });

  it("⭐ holding en Limitless de gestión: los negocios quedan en full", async () => {
    holdingCon("limitless");
    await expect(completeHoldingOnboardingAction(NEGOCIOS)).resolves.not.toThrow();
    expect(sim.estado.insertsDeOrganizaciones).toHaveLength(2);
    expect(experienciaGuardada(sim.estado, "Uno")).toBe("full");
    expect(experienciaGuardada(sim.estado, "Dos")).toBe("full");
    for (const fila of sim.estado.insertsDeOrganizaciones) {
      expect(fila).toMatchObject({ experience: "full" });
      expect(fila.experience).not.toBe("limitless");
    }
    expect(sim.estado.tablas.onboarding_responses.length).toBeGreaterThanOrEqual(1);
    expect(sim.estado.tablas.holding_businesses).toHaveLength(2);
  });

  it("⭐ la entrada no elige la experiencia", async () => {
    holdingCon("webinar");
    await completeHoldingOnboardingAction({
      businesses: [{ name: "Pide L", revenueSharePct: 10, experience: "limitless" }],
      experience: "limitless",
    });
    expect(sim.estado.insertsDeOrganizaciones).toHaveLength(1);
    for (const fila of sim.estado.insertsDeOrganizaciones) expect(fila).toMatchObject({ experience: "webinar" });

    holdingCon("webinar");
    await completeHoldingOnboardingAction({
      businesses: [
        { name: "Pide F1", revenueSharePct: 10, experience: "full" },
        { name: "Pide F2", revenueSharePct: 20, experience: "full" },
      ],
      experience: "full",
    });
    expect(sim.estado.insertsDeOrganizaciones).toHaveLength(2);
    for (const fila of sim.estado.insertsDeOrganizaciones) expect(fila).toMatchObject({ experience: "webinar" });
  });

  it("⭐ si no se puede leer la experiencia del holding, no se crea ningún negocio", async () => {
    sim.estado.fallaLecturaDeExperiencia = true;
    await expect(completeHoldingOnboardingAction(NEGOCIOS)).rejects.toThrow();
    expect(sim.estado.insertsDeOrganizaciones).toEqual([]);
    expect(sim.estado.tablas.onboarding_responses).toEqual([]);
  });
});
