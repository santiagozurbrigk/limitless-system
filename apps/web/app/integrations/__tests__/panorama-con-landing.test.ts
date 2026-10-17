import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-527: el panorama de Integraciones (`getIntegrationsOverviewAction`)
 * arma la tarjeta Landing con `saludDeLaLanding` sólo si
 * `ESCONDIDO.ingestaLanding` es false. Escondida, no lee las claves ni la
 * lista. Todos los demás proveedores se simulan desconectados.
 */

const sim = vi.hoisted(() => ({
  escondido: { ingestaLanding: true },
  salud: vi.fn(),
  requireOrganizationId: async () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
}));

vi.mock("@/lib/release/escondido", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/release/escondido")>();
  // Con getter: la fábrica del mock no se vuelve a correr después de
  // `vi.resetModules`, pero el registro sí se reevalúa y lee el valor actual.
  return {
    ESCONDIDO: {
      ...real.ESCONDIDO,
      get ingestaLanding() {
        return sim.escondido.ingestaLanding;
      },
    },
  };
});
vi.mock("@/lib/webinar/claves-de-ingesta", () => ({ saludDeLaLanding: sim.salud }));
vi.mock("@/lib/auth/bootstrap", () => ({ requireOrganizationId: sim.requireOrganizationId }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/auth/require-org-role", () => ({
  requireOrgRole: vi.fn(),
  ROLES_CONFIG_ORG: ["founder"],
  SIN_PERMISO_CONFIG_ORG: "",
}));
vi.mock("@/lib/discord/intent-contenido", () => ({
  MENSAJES_RECIENTES_A_REVISAR: 20,
  diagnosticarIntentDeContenido: vi.fn(),
}));
vi.mock("@/app/calendly/actions", () => ({
  getCalendlyIntegrationStatusAction: async () => ({ connected: false, webhookEnabled: false }),
}));
vi.mock("@/app/fathom/actions", () => ({
  getFathomIntegrationStatusAction: async () => ({ connected: false }),
}));
vi.mock("@/app/forms/actions", () => ({
  getGoogleFormsIntegrationStatusAction: async () => ({ connected: false }),
  getTypeformIntegrationStatusAction: async () => ({ connected: false }),
}));
vi.mock("@/app/manychat/actions", () => ({
  getManyChatIntegrationStatusAction: async () => ({ connected: false }),
}));
vi.mock("@/app/marketing/actions", () => ({
  getYoutubeIntegrationStatusAction: async () => ({ success: true, data: { connected: false } }),
}));
vi.mock("@/app/integrations/zernio/actions", () => ({
  getZernioIntegrationStatusAction: async () => ({
    connected: false,
    accountName: null,
    lastSyncAt: null,
    connectedAccounts: [],
  }),
}));
vi.mock("@/app/discord/actions", () => ({ getDiscordIntegrationStatusAction: async () => null }));
vi.mock("@/app/ghl/actions", () => ({
  getGHLIntegrationStatusAction: async () => ({ connected: false, selectedCalendarIds: [] }),
}));
vi.mock("@/app/vturb/actions", () => ({ getVTurbStatusAction: async () => null }));
vi.mock("@/app/webinarjam/actions", () => ({ getWebinarJamStatusAction: async () => null }));
vi.mock("@/app/hyros/actions", () => ({ getHyrosStatusAction: async () => null }));
vi.mock("@/app/payments/actions", () => ({ getPaymentIntegrationsStatusAction: async () => [] }));
vi.mock("@/app/ghl/opportunity-actions", () => ({ getGHLOpportunitiesStatusAction: async () => null }));
vi.mock("@/app/fathom/sales-call-actions", () => ({ listUnlinkedRecordingsAction: async () => [] }));

async function panoramaCon(ingestaLanding: boolean) {
  sim.escondido.ingestaLanding = ingestaLanding;
  vi.resetModules();
  const { getIntegrationsOverviewAction } = await import("@/app/integrations/actions");
  return getIntegrationsOverviewAction();
}

afterEach(() => sim.salud.mockReset());

describe("panorama de Integraciones y la Landing", () => {
  it("escondida: no lee las claves y la Landing no está en el panorama", async () => {
    const { healths } = await panoramaCon(true);
    expect(sim.salud).not.toHaveBeenCalled();
    expect(healths.map((h) => h.provider)).not.toContain("landing");
  });

  it("visible: la tarjeta sale de saludDeLaLanding con la organización de la sesión", async () => {
    const salud = {
      provider: "landing",
      state: "connected",
      accountLabel: null,
      lastSyncAt: "2026-10-16T00:00:00Z",
      records: 2,
      recordsLabel: "claves activas",
      issues: [],
    };
    sim.salud.mockResolvedValue(salud);
    const { healths } = await panoramaCon(false);
    expect(sim.salud).toHaveBeenCalledTimes(1);
    expect(sim.salud).toHaveBeenCalledWith(sim.requireOrganizationId);
    expect(healths.find((h) => h.provider === "landing")).toEqual(salud);
  });
});
