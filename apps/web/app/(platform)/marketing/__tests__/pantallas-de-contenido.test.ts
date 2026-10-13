import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-502: las pantallas de Contenido y de Anuncios (server components, sin
 * error boundary propio) muestran el motivo cuando una lectura vuelve con
 * error, en vez de la pantalla de error de Next. El detalle de una pieza
 * responde 404 sólo si la pieza no existe; antes cualquier falla era un 404, y
 * las lecturas secundarias (promedio de la org, Trial Reels) quedaban vacías
 * sin aviso.
 */

const sim = vi.hoisted(() => ({
  resultados: {} as Record<string, unknown>,
  llamadas: [] as unknown[][],
}));

function responder(nombre: string) {
  return async (...args: unknown[]) => {
    sim.llamadas.push([nombre, ...args]);
    return sim.resultados[nombre];
  };
}

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/app/marketing/content/actions", () => ({
  getContentPiecesAction: responder("getContentPiecesAction"),
  getContentDraftsAction: responder("getContentDraftsAction"),
  getContentPieceAction: responder("getContentPieceAction"),
}));
vi.mock("@/app/marketing/content/reel-variation-actions", () => ({
  listReelVariationJobsForPieceAction: responder("listReelVariationJobsForPieceAction"),
}));
vi.mock("@/app/marketing/content/sync-actions", () => ({
  maybeSyncZernioContentAction: async () => undefined,
}));
vi.mock("@/app/marketing/content/ad-actions", () => ({
  getMarketingAdsAction: responder("getMarketingAdsAction"),
}));
vi.mock("@/components/marketing/content-piece-grid", () => ({
  ContentPieceGrid: (p: { pieces: Array<{ id: string }> }) => `grilla:${p.pieces.map((x) => x.id).join(",")}`,
}));
vi.mock("@/components/marketing/content-drafts-library", () => ({
  ContentDraftsLibrary: (p: { drafts: Array<{ id: string }> }) => `borradores:${p.drafts.map((x) => x.id).join(",")}`,
}));
vi.mock("@/components/marketing/content-tab-switcher", () => ({ ContentTabSwitcher: () => "pestañas" }));
vi.mock("@/components/marketing/marketing-content-detail-page-client", () => ({
  MarketingContentDetailPageClient: (p: {
    piece: { id: string };
    orgAvg: unknown;
    initialReelJobs: Array<{ id: string }>;
  }) => `detalle:${p.piece.id}|promedio:${JSON.stringify(p.orgAvg)}|jobs:${p.initialReelJobs.map((j) => j.id).join(",")}`,
}));
vi.mock("@/components/marketing/ads-dashboard", () => ({
  AdsDashboard: (p: { initialAds: Array<{ _id: string }>; initialError: string | null }) =>
    `anuncios:${p.initialAds.map((a) => a._id).join(",")}|error:${p.initialError}`,
}));

import ContenidoPage from "../content/page";
import DetallePage from "../content/[id]/page";
import AnunciosPage from "../anuncios/page";

const PIEZA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ok = <T,>(data: T) => ({ success: true, data });
const falla = (error: string) => ({ success: false, error });

beforeEach(() => {
  sim.llamadas = [];
  sim.resultados = {
    getContentPiecesAction: ok([{ id: "p1", type: "reel", analysis: null, metrics: { views: 10 } }]),
    getContentDraftsAction: ok([{ id: "b1" }]),
    getContentPieceAction: ok({ id: PIEZA, variants: [] }),
    listReelVariationJobsForPieceAction: ok([{ id: "job-1" }]),
    getMarketingAdsAction: ok({ ads: [{ _id: "ad-1" }], pagination: null }),
  };
});

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const busqueda = (tab?: string) => ({ searchParams: Promise.resolve({ tab }) });

describe("/marketing/content", () => {
  it("con éxito muestra la biblioteca", async () => {
    const html = renderToStaticMarkup(await ContenidoPage(busqueda()));
    expect(html).toContain("grilla:p1");
  });

  it("⭐ con las piezas rechazadas muestra el motivo", async () => {
    sim.resultados.getContentPiecesAction = falla("Sesión no válida");
    const html = renderToStaticMarkup(await ContenidoPage(busqueda()));
    expect(html).toContain("No se pudo cargar el contenido");
    expect(html).toContain("Sesión no válida");
    expect(html).not.toContain("grilla:");
  });

  it("⭐ con los borradores rechazados muestra el motivo", async () => {
    sim.resultados.getContentDraftsAction = falla("Ocurrió un error inesperado. Intentá de nuevo.");
    const html = renderToStaticMarkup(await ContenidoPage(busqueda("borradores")));
    expect(html).toContain("No se pudo cargar el contenido");
    expect(html).toContain("Ocurrió un error inesperado. Intentá de nuevo.");
    expect(html).not.toContain("borradores:");
  });
});

describe("/marketing/content/[id]", () => {
  it("con éxito muestra el detalle con el promedio y los Trial Reels, sin avisos", async () => {
    const html = renderToStaticMarkup(await DetallePage(params(PIEZA)));
    expect(html).toContain(`detalle:${PIEZA}`);
    expect(html).toContain("jobs:job-1");
    expect(html).toContain("&quot;views&quot;:10");
    expect(html).not.toContain('role="alert"');
  });

  it("⭐ los Trial Reels se buscan con el ID interno aunque la URL tenga el de la plataforma", async () => {
    await DetallePage(params("17896293831516409"));
    expect(sim.llamadas).toContainEqual(["listReelVariationJobsForPieceAction", PIEZA]);
  });

  it("⭐ una pieza que no existe responde 404", async () => {
    sim.resultados.getContentPieceAction = ok(null);
    await expect(DetallePage(params(PIEZA))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("⭐ una falla al leer la pieza ya no es un 404: muestra el motivo", async () => {
    sim.resultados.getContentPieceAction = falla("Ocurrió un error inesperado. Intentá de nuevo.");
    const html = renderToStaticMarkup(await DetallePage(params(PIEZA)));
    expect(html).toContain("No se pudo cargar la pieza");
    expect(html).toContain("Ocurrió un error inesperado. Intentá de nuevo.");
  });

  it("⭐ si fallan las lecturas secundarias, avisa cada una y sigue con el detalle", async () => {
    sim.resultados.getContentPiecesAction = falla("motivo de las piezas");
    sim.resultados.listReelVariationJobsForPieceAction = falla("motivo de los jobs");
    const html = renderToStaticMarkup(await DetallePage(params(PIEZA)));
    expect(html).toContain(`detalle:${PIEZA}|promedio:null|jobs:`);
    expect(html).toContain("No se pudo calcular el promedio de la organización.");
    expect(html).toContain("motivo de las piezas");
    expect(html).toContain("No se pudieron cargar los Trial Reels.");
    expect(html).toContain("motivo de los jobs");
  });

  it("si sólo fallan los Trial Reels, el promedio se calcula igual", async () => {
    sim.resultados.listReelVariationJobsForPieceAction = falla("motivo de los jobs");
    const html = renderToStaticMarkup(await DetallePage(params(PIEZA)));
    expect(html).toContain("&quot;views&quot;:10");
    expect(html).not.toContain("No se pudo calcular el promedio");
    expect(html).toContain("No se pudieron cargar los Trial Reels.");
  });
});

describe("/marketing/anuncios", () => {
  it("con éxito pasa los anuncios sin error", async () => {
    const html = renderToStaticMarkup(await AnunciosPage());
    expect(html).toContain("anuncios:ad-1|error:null");
  });

  it("⭐ con un rechazo pasa el motivo y ningún anuncio", async () => {
    sim.resultados.getMarketingAdsAction = falla("Zernio no está conectado");
    const html = renderToStaticMarkup(await AnunciosPage());
    expect(html).toContain("anuncios:|error:Zernio no está conectado");
  });
});
