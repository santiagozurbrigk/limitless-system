import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-502: los componentes que usan las acciones de Contenido muestran el
 * motivo que la acción devuelve como valor, y el texto fijo si la acción lanzó
 * (en producción el navegador sólo recibe un digest). Antes renovar las vistas
 * previas, recargar los Trial Reels, cargar las piezas para vincular Drive e
 * incluir o excluir una variante fallaban en silencio.
 */

const ERROR_INESPERADO = "Ocurrió un error inesperado. Intentá de nuevo.";

const sim = vi.hoisted(() => ({ resultados: {} as Record<string, unknown>, llamadas: [] as unknown[][] }));

/** Devuelve el resultado simulado de la acción, o lo lanza si es una excepción. */
function responder(nombre: string) {
  return (...args: unknown[]) => {
    sim.llamadas.push([nombre, ...args]);
    const valor = sim.resultados[nombre];
    return valor instanceof Error ? Promise.reject(valor) : Promise.resolve(valor);
  };
}

vi.mock("@/app/marketing/content/actions", () => ({
  getContentPiecesAction: responder("getContentPiecesAction"),
}));
vi.mock("@/app/marketing/content/drive-actions", () => ({
  createDriveFolderAction: responder("x"),
  linkDriveFileToContentAction: responder("x"),
  listDriveFilesAction: responder("x"),
}));
vi.mock("@/app/marketing/content/ad-actions", () => ({
  getContentPieceAdsAction: responder("getContentPieceAdsAction"),
  getMarketingAdsAction: responder("getMarketingAdsAction"),
}));
vi.mock("@/app/marketing/content/comment-actions", () => ({
  getContentPieceCommentsAction: responder("getContentPieceCommentsAction"),
}));
vi.mock("@/app/marketing/content/reel-variation-actions", () => ({
  publishVariationsAction: responder("x"),
  retryVariationAction: responder("x"),
  regenerateCaptionAction: responder("x"),
  setReelVariationDelayAction: responder("setReelVariationDelayAction"),
  refreshVariationPreviewUrlsAction: responder("refreshVariationPreviewUrlsAction"),
  listReelVariationJobsForPieceAction: responder("listReelVariationJobsForPieceAction"),
  updateReelVariationAction: responder("updateReelVariationAction"),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

import { cargarPiezasParaVincular } from "../drive-admin-view";
import { cargarAnunciosDeLaPieza } from "../zernio-post-ads";
import { cargarComentariosDeLaPieza } from "../zernio-post-comments";
import { cargarAnuncios } from "../ads-dashboard";
import { cambiarDemora, recargarTrabajos, renovarVistasPrevias } from "../trial-reels/trial-reels-panel";
import { guardarCambioDeVariante } from "../trial-reels/variation-card";

const JOB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MOTIVO = "Zernio no está conectado";

let consola: ReturnType<typeof vi.spyOn>;
let avisos: Array<{ title: string; description?: string }>;
const avisar = (aviso: { title: string; description?: string }) => void avisos.push(aviso);
beforeEach(() => {
  sim.resultados = {};
  sim.llamadas = [];
  avisos = [];
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => consola.mockRestore());

describe("vincular un archivo de Drive: las piezas", () => {
  it("con éxito devuelve las piezas sin avisar", async () => {
    sim.resultados.getContentPiecesAction = { success: true, data: [{ id: "p1" }] };
    await expect(cargarPiezasParaVincular(avisar)).resolves.toEqual([{ id: "p1" }]);
    expect(avisos).toEqual([]);
  });

  it("⭐ con un rechazo avisa el motivo (antes la lista quedaba vacía sin aviso)", async () => {
    sim.resultados.getContentPiecesAction = { success: false, error: "Sesión no válida" };
    await expect(cargarPiezasParaVincular(avisar)).resolves.toEqual([]);
    expect(avisos).toEqual([{ title: "No se pudieron cargar las piezas", description: "Sesión no válida" }]);
  });

  it("⭐ si la acción lanzó, el texto fijo", async () => {
    sim.resultados.getContentPiecesAction = new Error("digest 123");
    await cargarPiezasParaVincular(avisar);
    expect(avisos).toEqual([{ title: "No se pudieron cargar las piezas", description: ERROR_INESPERADO }]);
    expect(consola).toHaveBeenCalled();
  });
});

describe("anuncios y comentarios de la pieza", () => {
  it("⭐ los anuncios vuelven con el motivo o el texto fijo", async () => {
    sim.resultados.getContentPieceAdsAction = { success: false, error: MOTIVO };
    await expect(cargarAnunciosDeLaPieza(JOB)).resolves.toEqual({ ok: false, motivo: MOTIVO });
    sim.resultados.getContentPieceAdsAction = new Error("digest");
    await expect(cargarAnunciosDeLaPieza(JOB)).resolves.toEqual({ ok: false, motivo: ERROR_INESPERADO });
    sim.resultados.getContentPieceAdsAction = { success: true, data: { ads: [{ _id: "a" }] } };
    await expect(cargarAnunciosDeLaPieza(JOB)).resolves.toEqual({ ok: true, data: { ads: [{ _id: "a" }] } });
  });

  it("⭐ los comentarios piden la página con el cursor y vuelven con el motivo", async () => {
    sim.resultados.getContentPieceCommentsAction = { success: false, error: MOTIVO };
    await expect(cargarComentariosDeLaPieza(JOB, "c2")).resolves.toEqual({ ok: false, motivo: MOTIVO });
    expect(sim.llamadas).toEqual([["getContentPieceCommentsAction", JOB, "c2"]]);
    sim.resultados.getContentPieceCommentsAction = new Error("digest");
    await expect(cargarComentariosDeLaPieza(JOB)).resolves.toEqual({ ok: false, motivo: ERROR_INESPERADO });
  });
});

describe("tablero de anuncios: recargar", () => {
  it("con éxito, los anuncios y sin error", async () => {
    sim.resultados.getMarketingAdsAction = { success: true, data: { ads: [{ _id: "a" }], pagination: null } };
    await expect(cargarAnuncios({ status: "active" })).resolves.toEqual({ ads: [{ _id: "a" }], error: null });
    expect(sim.llamadas).toEqual([["getMarketingAdsAction", { status: "active" }]]);
  });

  it("⭐ con un rechazo, sin anuncios y el motivo", async () => {
    sim.resultados.getMarketingAdsAction = { success: false, error: MOTIVO };
    await expect(cargarAnuncios({})).resolves.toEqual({ ads: [], error: MOTIVO });
  });

  it("⭐ si la acción lanzó, el texto fijo (antes escapaba de la transición)", async () => {
    sim.resultados.getMarketingAdsAction = new Error("digest");
    await expect(cargarAnuncios({})).resolves.toEqual({ ads: [], error: ERROR_INESPERADO });
  });
});

describe("Trial Reels: panel", () => {
  it("⭐ cambiar la demora: con éxito actualiza, con un rechazo avisa el motivo sin actualizar", async () => {
    const alCambiar = vi.fn();
    sim.resultados.setReelVariationDelayAction = { success: true, data: undefined };
    await cambiarDemora({ jobId: JOB, horas: 4, alCambiar, avisar });
    expect(alCambiar).toHaveBeenCalledTimes(1);
    expect(sim.llamadas).toEqual([["setReelVariationDelayAction", JOB, 4]]);

    alCambiar.mockClear();
    sim.resultados.setReelVariationDelayAction = {
      success: false,
      error: "La demora tiene que ser un número entero de horas entre 0 y 72.",
    };
    await cambiarDemora({ jobId: JOB, horas: 100, alCambiar, avisar });
    expect(alCambiar).not.toHaveBeenCalled();
    expect(avisos).toEqual([
      {
        title: "No se pudo cambiar el delay",
        description: "La demora tiene que ser un número entero de horas entre 0 y 72.",
        variant: "default",
      },
    ]);
  });

  it("⭐ renovar las vistas previas: avisa el motivo (antes se ignoraba)", async () => {
    sim.resultados.refreshVariationPreviewUrlsAction = { success: false, error: ERROR_INESPERADO };
    await expect(renovarVistasPrevias(JOB, avisar)).resolves.toBeNull();
    expect(avisos).toEqual([{ title: "No se pudieron renovar las vistas previas", description: ERROR_INESPERADO }]);

    avisos = [];
    sim.resultados.refreshVariationPreviewUrlsAction = { success: true, data: { id: JOB } };
    await expect(renovarVistasPrevias(JOB, avisar)).resolves.toEqual({ id: JOB });
    expect(avisos).toEqual([]);
  });

  it("⭐ recargar los jobs: avisa el motivo y no pisa el panel (antes se ignoraba)", async () => {
    sim.resultados.listReelVariationJobsForPieceAction = new Error("digest");
    await expect(recargarTrabajos(JOB, avisar)).resolves.toBeNull();
    expect(avisos).toEqual([{ title: "No se pudieron recargar los Trial Reels", description: ERROR_INESPERADO }]);

    avisos = [];
    sim.resultados.listReelVariationJobsForPieceAction = { success: true, data: [] };
    await expect(recargarTrabajos(JOB, avisar)).resolves.toEqual([]);
    expect(avisos).toEqual([]);
  });
});

describe("Trial Reels: variante", () => {
  it("⭐ guardar: con éxito llama a alGuardar; con un rechazo avisa con el título y el motivo", async () => {
    const alGuardar = vi.fn();
    sim.resultados.updateReelVariationAction = { success: true, data: undefined };
    await guardarCambioDeVariante({ jobId: JOB, index: 1, cambio: { included: false }, alGuardar, avisar, tituloError: "No se pudo cambiar la variante" });
    expect(alGuardar).toHaveBeenCalledTimes(1);
    expect(sim.llamadas).toEqual([["updateReelVariationAction", JOB, 1, { included: false }]]);

    alGuardar.mockClear();
    sim.resultados.updateReelVariationAction = { success: false, error: "Job no encontrado" };
    await guardarCambioDeVariante({ jobId: JOB, index: 1, cambio: { included: false }, alGuardar, avisar, tituloError: "No se pudo cambiar la variante" });
    expect(alGuardar).not.toHaveBeenCalled();
    expect(avisos).toEqual([{ title: "No se pudo cambiar la variante", description: "Job no encontrado", variant: "default" }]);
  });

  it("⭐ si la acción lanzó, el texto fijo", async () => {
    const alGuardar = vi.fn();
    sim.resultados.updateReelVariationAction = new Error("digest");
    await guardarCambioDeVariante({ jobId: JOB, index: 0, cambio: { description: "x" }, alGuardar, avisar, tituloError: "No se pudo guardar" });
    expect(alGuardar).not.toHaveBeenCalled();
    expect(avisos).toEqual([{ title: "No se pudo guardar", description: ERROR_INESPERADO, variant: "default" }]);
  });
});
