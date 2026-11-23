import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-551 · cambiar la experiencia de una organización desde Administración:
 * sólo entre webinar y full; nadie pasa a limitless y la org de Limitless no
 * cambia desde la consola. Base falsa de SCRUM-523 (`base-falsa.ts`).
 */

const sim = vi.hoisted(() => ({
  estado: null as unknown as import("@/lib/organization/__tests__/base-falsa").EstadoDeLaBase,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-staff", () => ({ requireStaff: async () => ({ id: "staff" }) }));
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

import { estadoInicial } from "@/lib/organization/__tests__/base-falsa";
import { MOTIVO_NO_ELEGIBLE, MOTIVO_ORG_DE_LIMITLESS } from "@/lib/administracion/experiencia";
import { setOrganizationExperienceAction } from "../actions";

const CLIENTE = "11111111-1111-4111-8111-111111111111";
const LIMITLESS = "22222222-2222-4222-8222-222222222222";

function experienciaDe(id: string): unknown {
  return sim.estado.tablas.organizations.find((o) => o.id === id)?.experience;
}

beforeEach(() => {
  sim.estado = estadoInicial({
    organizations: [
      { id: CLIENTE, name: "Cliente", experience: "full" },
      { id: LIMITLESS, name: "Limitless", experience: "limitless" },
    ],
  });
});

describe("setOrganizationExperienceAction", () => {
  it("⭐ pasa una org de full a webinar y de vuelta", async () => {
    expect(await setOrganizationExperienceAction(CLIENTE, "webinar")).toMatchObject({ success: true });
    expect(experienciaDe(CLIENTE)).toBe("webinar");
    expect(await setOrganizationExperienceAction(CLIENTE, "full")).toMatchObject({ success: true });
    expect(experienciaDe(CLIENTE)).toBe("full");
  });

  it("⭐ nadie pasa a limitless", async () => {
    expect(await setOrganizationExperienceAction(CLIENTE, "limitless")).toEqual({
      success: false,
      error: MOTIVO_NO_ELEGIBLE,
    });
    expect(experienciaDe(CLIENTE)).toBe("full");
  });

  it("⭐ la org de Limitless no cambia desde la consola", async () => {
    expect(await setOrganizationExperienceAction(LIMITLESS, "full")).toEqual({
      success: false,
      error: MOTIVO_ORG_DE_LIMITLESS,
    });
    expect(experienciaDe(LIMITLESS)).toBe("limitless");
  });

  it("un id que no es un UUID se rechaza sin tocar la base", async () => {
    const r = await setOrganizationExperienceAction("no-es-uuid", "webinar");
    expect(r.success).toBe(false);
    expect(experienciaDe(CLIENTE)).toBe("full");
  });
});
