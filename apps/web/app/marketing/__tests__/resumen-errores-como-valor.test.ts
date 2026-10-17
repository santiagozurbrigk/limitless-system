import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-519: las nueve acciones de `app/marketing/actions.ts` que estaban en el
 * conteo devuelven sus errores esperables como valor. Antes, las lecturas
 * devolvían `[]`, `null`, ceros o "no conectado" ante una falla de la base, y
 * las dos escrituras devolvían el texto crudo de la base.
 */

const sim = vi.hoisted(() => ({
  recalculo: null as unknown,
  insight: null as null | (() => Promise<string | null>),
  // `getUTMLinksAction` devuelve `MutationResult` desde SCRUM-520.
  utm: { success: true, data: [] } as unknown,
}));

vi.mock("@/lib/observability/reportar-falla", async () => {
  const { base } = await import("./base-falsa");
  return {
    reportarFalla: (error: unknown, contexto: unknown) => base.reportes.push({ error, contexto }),
  };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", async () => {
  const { base } = await import("./base-falsa");
  return { createClient: async () => base.cliente() };
});
vi.mock("@/lib/supabase/admin", async () => {
  const { base } = await import("./base-falsa");
  return { createAdminClient: () => base.cliente() };
});
vi.mock("@/lib/auth/bootstrap", async () => {
  const { base, ORG } = await import("./base-falsa");
  const { ErrorEsperable } = await import("@/lib/server/error-esperable");
  return {
    requireOrganizationId: async () => {
      if (base.lanzaEnSesion) throw base.lanzaEnSesion;
      if (!base.sesion) throw new ErrorEsperable("Sesión no válida");
      return ORG;
    },
    tryRequireOrganizationId: async () => (base.sesion ? ORG : null),
  };
});
vi.mock("@/lib/marketing/content-attribution", () => ({
  recomputeContentAssetAttribution: async () => {
    if (sim.recalculo) throw sim.recalculo;
  },
}));
vi.mock("@/lib/youtube/analytics", () => ({
  getRetentionAtCTA: async () => 42,
}));
vi.mock("@/lib/content/distribution-insight", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/content/distribution-insight")>();
  return {
    ...real,
    generateDistributionInsight: async () => (sim.insight ? sim.insight() : null),
  };
});
vi.mock("@/app/marketing/utm-actions", () => ({
  getUTMLinksAction: async () => sim.utm,
}));
vi.mock("@/lib/marketing/content-sales-rank", () => ({ getSalesContentRank: async () => [] }));
vi.mock("@/lib/marketing/closed-buyer-journeys", () => ({ getClosedBuyerJourneys: async () => [] }));
vi.mock("@/lib/marketing/analyze-content-patterns", () => ({
  analyzeContentSalesPatterns: async () => [],
}));

import {
  getContentAssetByIdAction,
  getContentDistributionDataAction,
  getContentLabelDistributionAction,
  getInstagramIntegrationStatusAction,
  getMarketingOverviewContextAction,
  getYoutubeIntegrationStatusAction,
  listContentAssetsAction,
  updateCTAMinuteAction,
  updateContentLabelAction,
} from "../actions";
import { AI_KEY_REJECTED_MESSAGE } from "@/lib/ai/anthropic-auth-errors";
import { base, ORG, OTRA_ORG, TEXTO_FIJO } from "./base-falsa";

const VIDEO = "22222222-2222-4222-8222-222222222222";
const VIDEO_AJENO = "33333333-3333-4333-8333-333333333333";
const FETCH_FAILED = { message: "TypeError: fetch failed" };

function activo(id: string, org: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    organization_id: org,
    platform: "youtube",
    external_id: `yt-${id.slice(0, 4)}`,
    title: "Video",
    caption: "",
    views: 10,
    effective_label: "VENTA",
    duration_seconds: 600,
    published_at: "2026-10-01T00:00:00Z",
    ...extra,
  };
}

let consola: ReturnType<typeof vi.spyOn>;
let aviso: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  base.reiniciar();
  sim.recalculo = null;
  sim.insight = null;
  sim.utm = { success: true, data: [] };
  base.tablas.content_assets = [
    activo(VIDEO, ORG),
    activo(VIDEO_AJENO, OTRA_ORG, { effective_label: "AUTORIDAD" }),
  ];
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
  aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  consola.mockRestore();
  aviso.mockRestore();
});

function esperarFallaRegistrada(etiqueta: string) {
  expect(base.reportes).toHaveLength(1);
  expect(base.reportes[0].contexto).toEqual({ accion: etiqueta });
  expect(consola).toHaveBeenCalledWith(etiqueta, expect.anything());
}

describe("listContentAssetsAction", () => {
  it("devuelve los videos de la organización de la sesión", async () => {
    const r = await listContentAssetsAction();
    expect(r.success && r.data.map((a) => a.id)).toEqual([VIDEO]);
    expect(base.filtrosDe("content_assets", "select")).toEqual([["organization_id", ORG]]);
  });

  it("⭐ una falla de la base ya no es una lista vacía: texto fijo y se registra", async () => {
    base.errores.content_assets = FETCH_FAILED;
    await expect(listContentAssetsAction()).resolves.toEqual({ success: false, error: TEXTO_FIJO });
    esperarFallaRegistrada("[listContentAssets]");
  });

  it("si la consulta lanza (red, bug), texto fijo y se registra", async () => {
    base.lanza = new TypeError("fetch failed");
    await expect(listContentAssetsAction()).resolves.toEqual({ success: false, error: TEXTO_FIJO });
    esperarFallaRegistrada("[listContentAssets]");
  });

  it("sin sesión devuelve el motivo, sin registrar", async () => {
    base.sesion = false;
    await expect(listContentAssetsAction()).resolves.toEqual({
      success: false,
      error: "Sesión no válida",
    });
    expect(base.reportes).toEqual([]);
  });
});

describe("getContentAssetByIdAction", () => {
  it("devuelve el video de la organización", async () => {
    const r = await getContentAssetByIdAction(VIDEO);
    expect(r).toMatchObject({ success: true, data: { id: VIDEO } });
  });

  it("⭐ un video de otra organización es null (filtro por organización)", async () => {
    await expect(getContentAssetByIdAction(VIDEO_AJENO)).resolves.toEqual({
      success: true,
      data: null,
    });
    expect(base.filtrosDe("content_assets", "select")).toEqual([
      ["id", VIDEO_AJENO],
      ["organization_id", ORG],
    ]);
  });

  it("un id que no es UUID vuelve con «ID inválido» sin llegar a la base", async () => {
    await expect(getContentAssetByIdAction("no-es-uuid")).resolves.toEqual({
      success: false,
      error: "ID inválido",
    });
    expect(base.operaciones).toEqual([]);
  });

  it("⭐ una falla de la base ya no es null: texto fijo y se registra", async () => {
    base.errores.content_assets = FETCH_FAILED;
    await expect(getContentAssetByIdAction(VIDEO)).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
    esperarFallaRegistrada("[getContentAssetById]");
  });
});

describe("getMarketingOverviewContextAction", () => {
  beforeEach(() => {
    base.tablas.closing_calls = [
      { id: "c1", organization_id: ORG },
      { id: "c2", organization_id: ORG },
      { id: "c3", organization_id: OTRA_ORG },
      { id: "c4", organization_id: OTRA_ORG },
      { id: "c5", organization_id: OTRA_ORG },
    ];
    base.tablas.instagram_integrations = [
      { organization_id: OTRA_ORG, status: "active", followers_count: 1000, followers_delta: 100 },
      { organization_id: ORG, status: "active", followers_count: 50, followers_delta: 5 },
    ];
    base.tablas.youtube_integrations = [
      { organization_id: OTRA_ORG, status: "connected", subscriber_count: 2000, subscriber_delta: 200 },
      { organization_id: ORG, status: "connected", subscriber_count: 7, subscriber_delta: 1 },
    ];
  });

  it("junta contenido, audiencia y turnos de la organización de la sesión", async () => {
    const r = await getMarketingOverviewContextAction();
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.assets.map((a) => a.id)).toEqual([VIDEO]);
    expect(r.data.utmSummary.totalBookings).toBe(2);
    expect(r.data.socialAudience).toEqual({ followers: 57, newFollowers: 6 });
    expect(base.filtrosDe("closing_calls", "select")).toEqual([["organization_id", ORG]]);
    expect(base.filtrosDe("instagram_integrations", "select")).toEqual([
      ["organization_id", ORG],
      ["status", "active"],
    ]);
    expect(base.filtrosDe("youtube_integrations", "select")).toEqual([
      ["organization_id", ORG],
      ["status", "connected"],
    ]);
  });

  it("⭐ si falla el conteo de turnos, texto fijo (antes eran 0 turnos)", async () => {
    base.errores.closing_calls = { message: "" };
    await expect(getMarketingOverviewContextAction()).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
    esperarFallaRegistrada("[getMarketingOverviewContext]");
  });

  it("⭐ si falla la audiencia, texto fijo (antes eran 0 seguidores)", async () => {
    base.errores.youtube_integrations = FETCH_FAILED;
    await expect(getMarketingOverviewContextAction()).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
    esperarFallaRegistrada("[getMarketingOverviewContext]");
  });

  it("⭐ si falla la audiencia de Instagram, texto fijo (antes eran 0 seguidores)", async () => {
    base.errores.instagram_integrations = FETCH_FAILED;
    await expect(getMarketingOverviewContextAction()).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
    esperarFallaRegistrada("[getMarketingOverviewContext]");
  });

  it("⭐ suma los UTMs que devuelve la lectura de UTMs (SCRUM-520)", async () => {
    sim.utm = {
      success: true,
      data: [{ clicks: 3, bookings_attributed: 4, sales_attributed: 1, revenue_attributed: 900 }],
    };
    const r = await getMarketingOverviewContextAction();
    expect(r.success && r.data.utmSummary).toEqual({
      totalBookings: 4,
      totalSales: 1,
      totalRevenue: 900,
      totalClicks: 3,
    });
    expect(r.success && r.data.hasUtmAttributions).toBe(true);
  });

  it("⭐ si fallan los UTMs, el motivo que devolvió su lectura y no ceros (SCRUM-520)", async () => {
    // La lectura de UTMs ya registró la falla con su etiqueta: el resumen pasa
    // su motivo sin registrarla otra vez.
    sim.utm = { success: false, error: TEXTO_FIJO };
    await expect(getMarketingOverviewContextAction()).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
    expect(base.reportes).toEqual([]);
  });

  it("si falla el contenido, texto fijo", async () => {
    base.errores.content_assets = FETCH_FAILED;
    await expect(getMarketingOverviewContextAction()).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
  });

  it("si falla el recálculo de la atribución, el resumen sale igual y la falla se registra", async () => {
    sim.recalculo = new TypeError("fetch failed");
    const r = await getMarketingOverviewContextAction();
    expect(r.success).toBe(true);
    expect(base.reportes).toHaveLength(1);
    expect(base.reportes[0].contexto).toEqual({
      accion: "[getMarketingOverviewContext] recálculo de atribución",
    });
  });

  it("sin sesión devuelve el motivo", async () => {
    base.sesion = false;
    await expect(getMarketingOverviewContextAction()).resolves.toEqual({
      success: false,
      error: "Sesión no válida",
    });
  });
});

describe("updateContentLabelAction", () => {
  it("cambia la etiqueta del video de la organización", async () => {
    await expect(updateContentLabelAction(VIDEO, "NUTRICION")).resolves.toEqual({
      success: true,
      data: undefined,
    });
    expect(base.tablas.content_assets[0].manual_content_label).toBe("NUTRICION");
  });

  it("⭐ un video de otra organización no se toca y vuelve el motivo", async () => {
    await expect(updateContentLabelAction(VIDEO_AJENO, "VENTA")).resolves.toEqual({
      success: false,
      error: "No encontramos ese contenido.",
    });
    expect(base.tablas.content_assets[1].manual_content_label).toBeUndefined();
  });

  it("⭐ con una fila gemela de otra organización, sólo cambia la propia", async () => {
    base.tablas.content_assets.push(activo(VIDEO, OTRA_ORG));
    await updateContentLabelAction(VIDEO, "ATRACCION");
    expect(base.tablas.content_assets[2].manual_content_label).toBeUndefined();
    expect(base.tablas.content_assets[0].manual_content_label).toBe("ATRACCION");
  });

  it("una etiqueta inválida vuelve con el motivo sin escribir", async () => {
    await expect(
      updateContentLabelAction(VIDEO, "OTRA" as unknown as "VENTA")
    ).resolves.toEqual({ success: false, error: "Etiqueta inválida." });
    expect(base.operaciones).toEqual([]);
  });

  it("sacar la etiqueta (null) es válido", async () => {
    await expect(updateContentLabelAction(VIDEO, null)).resolves.toMatchObject({ success: true });
  });

  it("un id inválido vuelve con «ID inválido»", async () => {
    await expect(updateContentLabelAction("x", "VENTA")).resolves.toEqual({
      success: false,
      error: "ID inválido",
    });
  });

  it("⭐ una falla de la base ya no llega cruda: texto fijo y se registra", async () => {
    base.errores["content_assets:update"] = {
      code: "42501",
      message: 'new row violates row-level security policy for table "content_assets"',
    };
    await expect(updateContentLabelAction(VIDEO, "VENTA")).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
    esperarFallaRegistrada("[updateContentLabel]");
  });
});

describe("updateCTAMinuteAction", () => {
  it("guarda el segundo del CTA y la retención", async () => {
    await expect(updateCTAMinuteAction(VIDEO, 90)).resolves.toEqual({
      success: true,
      data: { retentionAtCtaPct: 42 },
    });
    expect(base.tablas.content_assets[0]).toMatchObject({
      cta_minute: 90,
      retention_at_cta_pct: 42,
    });
  });

  it("⭐ un video de otra organización vuelve con «Video no encontrado»", async () => {
    await expect(updateCTAMinuteAction(VIDEO_AJENO, 90)).resolves.toEqual({
      success: false,
      error: "Video no encontrado",
    });
    expect(base.escrituras()).toEqual([]);
  });

  it("⭐ con una fila gemela de otra organización, sólo escribe la propia", async () => {
    base.tablas.content_assets.push(activo(VIDEO, OTRA_ORG));
    await updateCTAMinuteAction(VIDEO, 30);
    expect(base.tablas.content_assets[2].cta_minute).toBeUndefined();
  });

  it.each([0, -5, 1.5])("un segundo inválido (%s) vuelve con el motivo de la pantalla", async (segundo) => {
    await expect(updateCTAMinuteAction(VIDEO, segundo)).resolves.toEqual({
      success: false,
      error: "Indicá en qué segundo ocurre el CTA.",
    });
    expect(base.operaciones).toEqual([]);
  });

  it("⭐ si falla la lectura del video, texto fijo (antes, el texto crudo)", async () => {
    base.errores["content_assets:select"] = FETCH_FAILED;
    await expect(updateCTAMinuteAction(VIDEO, 30)).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
    esperarFallaRegistrada("[updateCTAMinute]");
  });

  it("si falla la escritura, texto fijo", async () => {
    base.errores["content_assets:update"] = FETCH_FAILED;
    await expect(updateCTAMinuteAction(VIDEO, 30)).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
  });
});

describe("getContentLabelDistributionAction", () => {
  it("cuenta las etiquetas de la organización", async () => {
    const r = await getContentLabelDistributionAction();
    expect(r).toEqual({
      success: true,
      data: { AUTORIDAD: 0, ATRACCION: 0, NUTRICION: 0, VENTA: 1 },
    });
  });

  it("⭐ una falla ya no es una distribución en cero", async () => {
    base.errores.content_assets = FETCH_FAILED;
    await expect(getContentLabelDistributionAction()).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
  });
});

describe("getContentDistributionDataAction", () => {
  beforeEach(() => {
    base.tablas.content_pieces = [
      { id: "p1", organization_id: ORG, analysis: { hook_type: "curiosidad", cta_type: "none" } },
      { id: "p2", organization_id: OTRA_ORG, analysis: { hook_type: "contrarian", cta_type: "none" } },
      { id: "p3", organization_id: ORG, analysis: null },
    ];
  });

  it("junta los videos y las piezas analizadas de la organización", async () => {
    sim.insight = async () => "Publicá más contenido de venta.";
    const r = await getContentDistributionDataAction();
    expect(r).toEqual({
      success: true,
      data: {
        counts: { AUTORIDAD: 0, ATRACCION: 1, NUTRICION: 0, VENTA: 1 },
        total: 2,
        insight: "Publicá más contenido de venta.",
        hasContentAssets: true,
      },
    });
    expect(base.filtrosDe("content_pieces", "select")).toEqual([
      ["organization_id", ORG],
      ["not:analysis", null],
    ]);
  });

  it("⭐ si falla la lectura de las piezas, texto fijo (antes se ignoraba)", async () => {
    base.errores.content_pieces = FETCH_FAILED;
    await expect(getContentDistributionDataAction()).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
    esperarFallaRegistrada("[getContentDistributionData]");
  });

  it("si la frase de la IA falla, el gráfico sale sin ella y la falla se registra", async () => {
    sim.insight = async () => {
      throw new TypeError("fetch failed");
    };
    const r = await getContentDistributionDataAction();
    expect(r).toMatchObject({ success: true, data: { insight: null, total: 2 } });
    expect(base.reportes).toHaveLength(1);
    expect(base.reportes[0].contexto).toEqual({ lectura: "marketing:insight-de-distribucion" });
  });

  it("con la clave de Claude rechazada, sin frase y sin registrar (ya se ve en Ajustes)", async () => {
    sim.insight = async () => {
      throw new Error(AI_KEY_REJECTED_MESSAGE);
    };
    const r = await getContentDistributionDataAction();
    expect(r).toMatchObject({ success: true, data: { insight: null } });
    expect(base.reportes).toEqual([]);
  });
});

describe("getYoutubeIntegrationStatusAction", () => {
  it("lee el estado del canal de la organización", async () => {
    base.tablas.youtube_integrations = [
      { organization_id: OTRA_ORG, status: "disconnected", channel_name: "Ajeno", last_sync_at: null },
      { organization_id: ORG, status: "connected", channel_name: "Mi canal", last_sync_at: "2026-10-01" },
    ];
    await expect(getYoutubeIntegrationStatusAction()).resolves.toEqual({
      success: true,
      data: { connected: true, channelName: "Mi canal", lastSyncAt: "2026-10-01" },
    });
  });

  it("⭐ el canal conectado de otra organización no cuenta (filtro por organización)", async () => {
    base.tablas.youtube_integrations = [
      { organization_id: OTRA_ORG, status: "connected", channel_name: "Ajeno", last_sync_at: null },
    ];
    await expect(getYoutubeIntegrationStatusAction()).resolves.toEqual({
      success: true,
      data: { connected: false, channelName: null, lastSyncAt: null },
    });
  });

  it("⭐ si la lectura falla, el texto fijo y no «no conectado»", async () => {
    base.errores.youtube_integrations = FETCH_FAILED;
    await expect(getYoutubeIntegrationStatusAction()).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
    esperarFallaRegistrada("[getYoutubeIntegrationStatus]");
  });

  it("sin sesión devuelve el motivo", async () => {
    base.sesion = false;
    await expect(getYoutubeIntegrationStatusAction()).resolves.toEqual({
      success: false,
      error: "Sesión no válida",
    });
  });
});

describe("getInstagramIntegrationStatusAction", () => {
  it("lee el estado de la cuenta de la organización", async () => {
    base.tablas.instagram_integrations = [
      { organization_id: ORG, status: "active", instagram_username: "yo", connected_at: "a", last_sync_at: "b" },
    ];
    await expect(getInstagramIntegrationStatusAction()).resolves.toEqual({
      success: true,
      data: { connected: true, username: "yo", connectedAt: "a", lastSyncAt: "b", status: "active" },
    });
  });

  it("⭐ la cuenta activa de otra organización no cuenta (filtro por organización)", async () => {
    base.tablas.instagram_integrations = [
      { organization_id: OTRA_ORG, status: "active", instagram_username: "ajeno" },
    ];
    const r = await getInstagramIntegrationStatusAction();
    expect(r).toMatchObject({ success: true, data: { connected: false, status: null } });
  });

  it("⭐ si la lectura falla, el texto fijo y no «no conectado»", async () => {
    base.errores.instagram_integrations = FETCH_FAILED;
    await expect(getInstagramIntegrationStatusAction()).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
    esperarFallaRegistrada("[getInstagramIntegrationStatus]");
  });
});

describe("errores internos de Next", () => {
  it("un error de ruta dinámica de Next se relanza, no es una falla", async () => {
    const dinamico = Object.assign(new Error("Dynamic server usage"), {
      digest: "DYNAMIC_SERVER_USAGE",
    });
    base.lanzaEnSesion = dinamico;
    await expect(listContentAssetsAction()).rejects.toBe(dinamico);
    expect(base.reportes).toEqual([]);
  });
});
