import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";

/**
 * SCRUM-527: la página de Integraciones monta el panel de la Landing (claves
 * de ingesta) sólo si `ESCONDIDO.ingestaLanding` es false. Escondida, ni lee
 * las claves.
 */

const sim = vi.hoisted(() => ({
  escondido: { ingestaLanding: true },
  listar: vi.fn(),
}));

// Parte del objeto real; `ingestaLanding` con getter para que cada test la
// cambie (la fábrica del mock corre una sola vez).
vi.mock("@/lib/release/escondido", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/release/escondido")>();
  return {
    ESCONDIDO: {
      ...real.ESCONDIDO,
      get ingestaLanding() {
        return sim.escondido.ingestaLanding;
      },
    },
  };
});
vi.mock("@/app/webinar/claves-de-ingesta-actions", () => ({
  listarClavesDeIngestaAction: sim.listar,
}));
vi.mock("@/app/integrations/actions", () => ({
  getIntegrationsOverviewAction: async () => ({ healths: [], summary: {} }),
}));
vi.mock("@/app/payments/actions", () => ({ getPaymentIntegrationsStatusAction: async () => [] }));
vi.mock("@/app/ghl/opportunity-actions", () => ({
  getGHLOpportunitiesStatusAction: async () => ({ connected: false }),
}));
vi.mock("@/app/vturb/actions", () => ({ getVTurbStatusAction: async () => null }));
vi.mock("@/app/webinarjam/actions", () => ({
  getWebinarJamStatusAction: async () => null,
  listWebinarJamWebinarOptionsAction: async () => [],
}));
vi.mock("@/app/hyros/actions", () => ({ getHyrosStatusAction: async () => null }));
vi.mock("@/app/fathom/sales-call-actions", () => ({ listUnlinkedRecordingsAction: async () => [] }));
vi.mock("@/app/auth/current-user-actions", () => ({ getCurrentUserIdAction: async () => null }));
vi.mock("@/app/manychat/actions", () => ({
  getManyChatIntegrationStatusAction: async () => ({ connected: false }),
}));
vi.mock("@/components/integrations", () => ({ IntegrationsBoard: function IntegrationsBoard() { return null; } }));
vi.mock("@/components/integrations/settings/vturb-settings", () => ({ VTurbSettings: () => null }));
vi.mock("@/components/integrations/settings/hyros-settings", () => ({ HyrosSettings: () => null }));
vi.mock("@/components/integrations/settings/webinarjam-settings", () => ({ WebinarJamSettings: () => null }));
vi.mock("@/components/integrations/settings/ghl-opportunities-settings", () => ({
  GHLOpportunitiesSettings: () => null,
}));
vi.mock("@/components/integrations/settings/payment-settings", () => ({ PaymentSettings: () => null }));
vi.mock("@/components/integrations/settings/fathom-settings", () => ({ FathomSettings: () => null }));
vi.mock("@/components/integrations/settings/manychat-settings", () => ({ ManyChatSettings: () => null }));
vi.mock("@/components/integrations/settings/landing-settings", () => ({
  LandingSettings: function LandingSettings() { return null; },
}));
vi.mock("@/components/shared/page-header", () => ({ PageHeader: () => null }));

const { default: IntegrationsPage } = await import("@/app/(platform)/integrations/page");
const { IntegrationsBoard } = await import("@/components/integrations");
const { LandingSettings } = await import("@/components/integrations/settings/landing-settings");

/** Busca en el árbol devuelto por la página el elemento del tablero. */
function buscar(nodo: ReactNode, tipo: unknown): ReactElement | null {
  if (Array.isArray(nodo)) {
    for (const hijo of nodo) {
      const encontrado = buscar(hijo, tipo);
      if (encontrado) return encontrado;
    }
    return null;
  }
  if (!isValidElement(nodo)) return null;
  if (nodo.type === tipo) return nodo;
  return buscar((nodo.props as { children?: ReactNode }).children, tipo);
}

async function settingsDeLaPagina(): Promise<Record<string, ReactElement>> {
  const tablero = buscar(await IntegrationsPage(), IntegrationsBoard);
  if (!tablero) throw new Error("la página no montó el tablero");
  return (tablero.props as { settings: Record<string, ReactElement> }).settings;
}

beforeEach(() => {
  sim.listar.mockReset();
});

describe("Integraciones con la Landing escondida (bandera en true)", () => {
  it("no lee las claves ni monta el panel", async () => {
    sim.escondido.ingestaLanding = true;
    const settings = await settingsDeLaPagina();
    expect(settings.landing).toBeUndefined();
    expect(sim.listar).not.toHaveBeenCalled();
  });
});

describe("Integraciones con la Landing visible (bandera en false)", () => {
  beforeEach(() => {
    sim.escondido.ingestaLanding = false;
  });

  it("lee las claves y monta el panel con la lista", async () => {
    const claves = [
      { id: "1", label: "Landing", createdAt: "2026-10-10T00:00:00Z", lastUsedAt: null, revokedAt: null },
    ];
    sim.listar.mockResolvedValue({ success: true, data: claves });
    const settings = await settingsDeLaPagina();
    expect(sim.listar).toHaveBeenCalledTimes(1);
    expect(settings.landing.type).toBe(LandingSettings);
    expect(settings.landing.props).toEqual({ lectura: { ok: true, data: claves } });
  });

  it("si la lectura vuelve con un motivo, el panel lo recibe", async () => {
    sim.listar.mockResolvedValue({ success: false, error: "Sólo el founder o un admin pueden ver, crear o revocar las claves de ingesta." });
    const settings = await settingsDeLaPagina();
    expect(settings.landing.props).toEqual({
      lectura: {
        ok: false,
        motivo: "Sólo el founder o un admin pueden ver, crear o revocar las claves de ingesta.",
      },
    });
  });
});
