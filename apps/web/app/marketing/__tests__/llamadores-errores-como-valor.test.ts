import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * SCRUM-519: los llamadores de las acciones de Marketing, resumen, Drive,
 * sincronización y patrones muestran el motivo o el texto fijo cuando la
 * acción devuelve un error como valor (antes, una lista vacía, "no conectado"
 * o nada).
 */

const sim = vi.hoisted(() => ({
  distribucion: null as unknown,
  resumen: null as unknown,
  activos: null as unknown,
  sincronizacion: null as unknown,
  youtube: null as unknown,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/release/escondido", () => ({ ESCONDIDO: { marketingOverview: false } }));
vi.mock("@/app/marketing/actions", () => ({
  getContentDistributionDataAction: async () => sim.distribucion,
  getMarketingOverviewContextAction: async () => sim.resumen,
  listContentAssetsAction: async () => sim.activos,
  getYoutubeIntegrationStatusAction: async () => sim.youtube,
  getInstagramIntegrationStatusAction: async () => ({ success: true, data: { status: "active" } }),
}));
vi.mock("@/components/marketing/marketing-overview", () => ({
  MarketingOverview: (props: unknown) => props,
}));
vi.mock("@/app/marketing/utm-actions", () => ({
  getUTMLinksAction: async () => [],
  getOrganizationWebsiteAction: async () => null,
}));
vi.mock("@/components/marketing/utm-page-content", () => ({
  UTMPageContent: (props: unknown) => props,
}));
vi.mock("@/app/marketing/content/sync-actions", () => ({
  maybeSyncZernioContentAction: async () => sim.sincronizacion,
}));
vi.mock("@/app/marketing/content/actions", () => ({
  getContentPiecesAction: async () => [],
  getContentDraftsAction: async () => [],
}));
vi.mock("@/components/marketing/content-piece-grid", () => ({ ContentPieceGrid: () => null }));
vi.mock("@/components/marketing/content-drafts-library", () => ({ ContentDraftsLibrary: () => null }));
vi.mock("@/components/marketing/content-tab-switcher", () => ({ ContentTabSwitcher: () => null }));
vi.mock("@/app/marketing/content/pattern-report-actions", () => ({
  generateContentPatternReportAction: vi.fn(),
  getLatestContentPatternReportAction: vi.fn(),
}));

// Integraciones: todas las demás integraciones sin conectar.
const { sinConectar, rechaza } = vi.hoisted(() => ({
  sinConectar: async () => ({ connected: false, lastSyncAt: null }),
  rechaza: async () => {
    throw new Error("no se usa");
  },
}));
vi.mock("@/app/calendly/actions", () => ({
  getCalendlyIntegrationStatusAction: async () => ({ connected: false, webhookEnabled: false }),
}));
vi.mock("@/app/fathom/actions", () => ({ getFathomIntegrationStatusAction: sinConectar }));
vi.mock("@/app/forms/actions", () => ({
  getGoogleFormsIntegrationStatusAction: sinConectar,
  getTypeformIntegrationStatusAction: sinConectar,
}));
vi.mock("@/app/manychat/actions", () => ({ getManyChatIntegrationStatusAction: sinConectar }));
vi.mock("@/app/integrations/zernio/actions", () => ({
  getZernioIntegrationStatusAction: async () => ({
    connected: false,
    accountName: null,
    lastSyncAt: null,
    connectedAccounts: [],
  }),
}));
vi.mock("@/app/discord/actions", () => ({ getDiscordIntegrationStatusAction: rechaza }));
vi.mock("@/app/ghl/actions", () => ({
  getGHLIntegrationStatusAction: async () => ({
    connected: false,
    locationId: null,
    lastSyncAt: null,
    selectedCalendarIds: [],
  }),
}));
vi.mock("@/app/vturb/actions", () => ({ getVTurbStatusAction: rechaza }));
vi.mock("@/app/webinarjam/actions", () => ({ getWebinarJamStatusAction: rechaza }));
vi.mock("@/app/hyros/actions", () => ({ getHyrosStatusAction: rechaza }));
vi.mock("@/app/payments/actions", () => ({ getPaymentIntegrationsStatusAction: rechaza }));
vi.mock("@/app/ghl/opportunity-actions", () => ({ getGHLOpportunitiesStatusAction: rechaza }));
vi.mock("@/app/fathom/sales-call-actions", () => ({ listUnlinkedRecordingsAction: rechaza }));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => false }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/auth/bootstrap", () => ({ requireOrganizationId: async () => "org" }));
vi.mock("@/lib/auth/require-org-role", () => ({
  requireOrgRole: async () => undefined,
  ROLES_CONFIG_ORG: [],
  SIN_PERMISO_CONFIG_ORG: "",
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import MarketingPage from "@/app/(platform)/marketing/page";
import MarketingUTMsPage from "@/app/(platform)/marketing/utms/page";
import MarketingContentPage from "@/app/(platform)/marketing/content/page";
import { EmptyState } from "@/components/shared/empty-state";
import { getIntegrationsOverviewAction } from "@/app/integrations/actions";
import { leerInstagramConectado } from "@/providers/marketing-data-provider";
import { estadoDeLaCarpeta } from "@/components/marketing/drive-admin-view";
import { leerUltimoReporte } from "@/components/marketing/marketing-sales-connection";
import { ContentPatternReport } from "@/components/marketing/content-pattern-report";
import {
  MOTIVO_DRIVE_NO_CONECTADO,
  MOTIVO_DRIVE_NO_ENCONTRADO,
  MOTIVO_DRIVE_SIN_PERMISOS,
} from "@/lib/google/motivos-de-drive";
import { estadoSinLeer } from "@/lib/integrations/health";
import { ERROR_INESPERADO } from "@/lib/client/correr-accion";

const DISTRIBUCION = {
  counts: { AUTORIDAD: 0, ATRACCION: 0, NUTRICION: 0, VENTA: 0 },
  total: 0,
  insight: null,
  hasContentAssets: false,
};

let consola: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  sim.distribucion = { success: true, data: DISTRIBUCION };
  sim.resumen = { success: true, data: { assets: [] } };
  sim.activos = { success: true, data: [] };
  sim.sincronizacion = { success: true, data: { sincronizo: true } };
  sim.youtube = { success: true, data: { connected: true, channelName: "Mi canal", lastSyncAt: null } };
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => consola.mockRestore());

describe("/marketing (resumen)", () => {
  it("con las dos lecturas bien, dibuja el resumen con los datos", async () => {
    const el = (await MarketingPage()) as ReactElement<{ distribution: unknown; overview: unknown }>;
    expect(el.props.distribution).toEqual(DISTRIBUCION);
    expect(el.props.overview).toEqual({ assets: [] });
  });

  it.each([
    ["la distribución", "distribucion"],
    ["el resumen", "resumen"],
  ] as const)("⭐ si falla %s, muestra el motivo en vez de un resumen en cero", async (_caso, clave) => {
    sim[clave] = { success: false, error: ERROR_INESPERADO };
    const el = (await MarketingPage()) as ReactElement<{ title: string; description: string }>;
    expect(el.type).toBe(EmptyState);
    expect(el.props).toMatchObject({
      title: "No se pudo cargar el resumen de Marketing",
      description: ERROR_INESPERADO,
    });
  });
});

describe("/marketing/utms", () => {
  function hijos(el: ReactElement) {
    return (el.props as { children: ReactElement[] }).children;
  }

  it("pasa sólo los videos de YouTube", async () => {
    sim.activos = {
      success: true,
      data: [
        { id: "a", platform: "youtube" },
        { id: "b", platform: "instagram" },
      ],
    };
    const contenido = hijos((await MarketingUTMsPage()) as ReactElement)[1] as ReactElement<{
      youtubeVideos: Array<{ id: string }>;
    }>;
    expect(contenido.props.youtubeVideos.map((v) => v.id)).toEqual(["a"]);
  });

  it("⭐ si la lista de videos falla, el motivo en vez de «sin videos»", async () => {
    sim.activos = { success: false, error: "Sesión no válida" };
    const aviso = hijos((await MarketingUTMsPage()) as ReactElement)[1] as ReactElement<{
      title: string;
      description: string;
    }>;
    expect(aviso.type).toBe(EmptyState);
    expect(aviso.props.description).toBe("Sesión no válida");
  });
});

describe("/marketing/content", () => {
  async function html() {
    const el = await MarketingContentPage({ searchParams: Promise.resolve({}) });
    return renderToStaticMarkup(el);
  }

  it("con la sincronización bien, dice cuándo sincronizó", async () => {
    const pagina = await html();
    expect(pagina).toContain("Sincronizado");
    expect(pagina).not.toContain("Sin sincronizar");
  });

  it("⭐ si la sincronización devuelve un motivo, la página lo dice", async () => {
    sim.sincronizacion = { success: false, error: "Zernio no está conectado" };
    const pagina = await html();
    expect(pagina).toContain("Sin sincronizar: Zernio no está conectado");
    expect(pagina).not.toContain("Sincronizado");
  });
});

describe("Integraciones: YouTube", () => {
  it("conectado, la tarjeta de siempre", async () => {
    const { healths } = await getIntegrationsOverviewAction();
    expect(healths.find((h) => h.provider === "youtube")).toMatchObject({
      accountLabel: "Mi canal",
      state: "connected",
    });
  });

  it("⭐ si el estado no se pudo leer, la tarjeta no dice «Sin conectar»", async () => {
    sim.youtube = { success: false, error: ERROR_INESPERADO };
    const { healths } = await getIntegrationsOverviewAction();
    const youtube = healths.find((h) => h.provider === "youtube");
    expect(youtube).toEqual(
      estadoSinLeer({ provider: "youtube", recordsLabel: "videos", motivo: ERROR_INESPERADO })
    );
    expect(youtube?.state).toBe("error");
    expect(youtube?.issues[0].message).toContain(ERROR_INESPERADO);
  });
});

describe("Provider de Marketing: Instagram", () => {
  it("activa = conectada; otra = no conectada", async () => {
    await expect(
      leerInstagramConectado(async () => ({ success: true, data: { status: "active" } }) as never)
    ).resolves.toBe(true);
    await expect(
      leerInstagramConectado(async () => ({ success: true, data: { status: "disconnected" } }) as never)
    ).resolves.toBe(false);
  });

  it("⭐ si no se pudo leer, null y no «no conectada»", async () => {
    await expect(
      leerInstagramConectado(async () => ({ success: false, error: ERROR_INESPERADO }))
    ).resolves.toBeNull();
  });

  it("si la acción lanza, null y queda en la consola", async () => {
    await expect(
      leerInstagramConectado(async () => {
        throw new Error("digest");
      })
    ).resolves.toBeNull();
    expect(consola).toHaveBeenCalled();
  });
});

describe("Administrar contenido (Drive)", () => {
  it("con archivos, los muestra sin error", () => {
    const archivos = [{ id: "f", name: "a", mimeType: "video/mp4", modifiedTime: "x" }];
    expect(estadoDeLaCarpeta({ ok: true, data: archivos })).toEqual({
      files: archivos,
      error: null,
      needsConnect: false,
      needsReconnect: false,
    });
  });

  it("⭐ sin Google conectado, el motivo y el botón de conectar", () => {
    expect(estadoDeLaCarpeta({ ok: false, motivo: MOTIVO_DRIVE_NO_CONECTADO })).toEqual({
      files: [],
      error: MOTIVO_DRIVE_NO_CONECTADO,
      needsConnect: true,
      needsReconnect: false,
    });
  });

  it("⭐ con el token rechazado, el motivo y el botón de reconectar", () => {
    expect(estadoDeLaCarpeta({ ok: false, motivo: MOTIVO_DRIVE_SIN_PERMISOS })).toMatchObject({
      error: MOTIVO_DRIVE_SIN_PERMISOS,
      needsConnect: false,
      needsReconnect: true,
    });
  });

  it.each([MOTIVO_DRIVE_NO_ENCONTRADO, ERROR_INESPERADO])(
    "otro motivo (%s) se muestra sin botón",
    (motivo) => {
      expect(estadoDeLaCarpeta({ ok: false, motivo })).toMatchObject({
        error: motivo,
        needsConnect: false,
        needsReconnect: false,
      });
    }
  );
});

describe("Conexión con ventas: último reporte de patrones", () => {
  it("con reporte, el reporte y sin motivo", async () => {
    const reporte = { id: "r" };
    await expect(
      leerUltimoReporte(async () => ({ success: true, data: reporte }) as never)
    ).resolves.toEqual({ reporte, motivo: null });
  });

  it("⭐ si no se pudo leer, el motivo (no «todavía no hay reporte»)", async () => {
    await expect(
      leerUltimoReporte(async () => ({ success: false, error: ERROR_INESPERADO }))
    ).resolves.toEqual({ reporte: null, motivo: ERROR_INESPERADO });
  });

  it("⭐ el panel de patrones muestra el motivo con el que arranca", () => {
    const html = renderToStaticMarkup(
      createElement(ContentPatternReport, {
        initialReport: null,
        errorInicial: "No se pudo leer el reporte.",
      })
    );
    expect(html).toContain("No se pudo leer el reporte.");
  });

  it("sin motivo, no muestra ningún error", () => {
    const html = renderToStaticMarkup(createElement(ContentPatternReport, { initialReport: null }));
    expect(html).not.toContain("text-destructive");
  });
});
