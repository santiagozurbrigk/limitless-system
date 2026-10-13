import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-517: las pantallas del seguimiento de Clientes (recorrido, columnas,
 * revisión semanal, ficha y lista) muestran el motivo que la acción devuelve
 * como valor, y el texto fijo si la acción lanzó (en producción el cliente
 * sólo recibe un digest). Antes una lectura fallida se veía como una lista
 * vacía, una franja en «cargando…» para siempre o una sección que no aparecía.
 */

const ERROR_INESPERADO = "Ocurrió un error inesperado. Intentá de nuevo.";

const sim = vi.hoisted(() => ({ respuestas: {} as Record<string, unknown> }));

/** Devuelve la respuesta simulada de `nombre`, o la lanza si es una excepción. */
function responder(nombre: string) {
  const valor = sim.respuestas[nombre];
  if (valor instanceof Error) return Promise.reject(valor);
  return Promise.resolve(valor);
}

/** Las demás acciones de un módulo: no se llaman en estos tests. */
function resto(nombres: string[]) {
  return Object.fromEntries(nombres.map((n) => [n, () => responder(n)]));
}

vi.mock("server-only", () => ({}));
vi.mock("@/app/clients/checkpoint-actions", () => ({
  getJourneyPageDataAction: () => responder("journeyPage"),
  ...resto([
    "createCheckpointAction",
    "createJourneyStageAction",
    "deleteCheckpointAction",
    "deleteJourneyStageAction",
    "reorderCheckpointsAction",
    "reorderJourneyStagesAction",
    "seedExampleJourneyAction",
    "setCheckpointArchivedAction",
    "setJourneyStageArchivedAction",
    "updateCheckpointAction",
    "updateJourneyStageAction",
  ]),
}));
vi.mock("@/app/clients/custom-field-actions", () => ({
  getCustomFieldsPageDataAction: () => responder("customFieldsPage"),
  listFieldDefinitionsAction: () => responder("listFields"),
  ...resto([
    "createFieldDefinitionAction",
    "deleteFieldDefinitionAction",
    "reorderFieldDefinitionsAction",
    "seedExampleClientGoalFieldAction",
    "seedExampleWinFieldAction",
    "seedLimitlessClientFieldsAction",
    "seedOnboardingQuestionsAction",
    "setFieldDefinitionArchivedAction",
    "updateFieldDefinitionAction",
  ]),
}));
vi.mock("@/app/clients/signals-actions", () => ({
  getClientSilenceDaysAction: () => responder("silenceDays"),
  setClientSilenceDaysAction: () => responder("setSilenceDays"),
  getClientSignalsAction: () => responder("signals"),
}));
vi.mock("@/app/clients/tracking-actions", () => ({
  getWeeklyReviewAction: () => responder("weeklyReview"),
  updateClientCurrentStatusAction: () => responder("currentStatus"),
  updateClientNotesAction: () => responder("notes"),
  updateClientSatisfactionAction: () => responder("satisfaction"),
  updateClientTrackingAction: () => responder("tracking"),
}));
vi.mock("@/app/clients/client-custom-fields-actions", () => ({
  listClientFieldDefinitionsAction: () => responder("clientFields"),
  updateClientCustomFieldsAction: () => responder("updateClientFields"),
}));
vi.mock("@/app/clients/overview-actions", () => ({
  getClientOverviewAction: () => responder("overview"),
}));
vi.mock("@/app/clients/clients-board-actions", () => ({
  getClientsBoardAction: () => responder("board"),
}));
vi.mock("@/app/clients/checkpoint-event-actions", () => ({
  getClientJourneyAction: () => responder("clientJourney"),
  recordCheckpointAction: () => responder("record"),
  undoCheckpointAction: () => responder("undo"),
}));
vi.mock("@/app/clients/checkpoint-derived-actions", () => ({
  listCheckpointProposalsAction: () => responder("proposals"),
  acceptCheckpointProposalAction: () => responder("accept"),
  rejectCheckpointProposalAction: () => responder("reject"),
}));
vi.mock("@/app/clients/stage-actions", () => ({
  setClientManualStageAction: () => responder("manualStage"),
}));

import {
  cambiarRecorrido,
  recargarRecorrido,
} from "@/components/clients/checkpoints/journey-page";
import {
  cambiarColumnas,
  cargarDiasSinNovedades,
  recargarColumnas,
} from "@/components/clients/custom-fields/custom-fields-page";
import {
  guardarEstadoActual,
  recargarRevision,
} from "@/components/clients/weekly-review/weekly-review-page";
import { guardarNotas } from "@/components/clients/client-notes-section";
import { guardarSatisfaccion } from "@/components/clients/client-satisfaction-section";
import {
  cargarColumnasDelCliente,
  guardarCamposDelCliente,
} from "@/components/clients/client-custom-fields-section";
import { cargarResumenDelCliente } from "@/components/clients/client-overview-strip";
import { cargarTableroYSenales } from "@/components/clients/clients-list";
import {
  cambiarRecorridoDelCliente,
  cargarRecorridoDelCliente,
} from "@/components/clients/checkpoints/client-journey-section";
import CheckpointsRoute from "@/app/(platform)/clients/checkpoints/page";
import CustomFieldsRoute from "@/app/(platform)/clients/campos/page";
import WeeklyReviewRoute from "@/app/(platform)/clients/revision/page";
import { AvisoDeLecturaFallida } from "@/components/shared/aviso-de-lectura-fallida";
import { createElement } from "react";

const caida = () => new Error("An error occurred in the Server Components render.");
const rechazo = (error: string) => ({ success: false, error });

let consola: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  sim.respuestas = {};
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => consola.mockRestore());

describe("pantallas del servidor", () => {
  const PANTALLAS: Array<[string, string, () => Promise<unknown>, string]> = [
    ["recorrido", "journeyPage", CheckpointsRoute, "No se pudo cargar el recorrido"],
    ["columnas", "customFieldsPage", CustomFieldsRoute, "No se pudieron cargar las columnas"],
    [
      "revisión semanal",
      "weeklyReview",
      WeeklyReviewRoute,
      "No se pudo armar la revisión semanal",
    ],
  ];

  it.each(PANTALLAS)("⭐ %s: muestra el motivo de la lectura", async (_n, clave, pagina, titulo) => {
    sim.respuestas[clave] = rechazo("Sesión no válida");
    const html = renderToStaticMarkup((await pagina()) as never);
    expect(html).toContain(titulo);
    expect(html).toContain("Sesión no válida");
  });

  it.each(PANTALLAS)("%s: una falla muestra el texto fijo", async (_n, clave, pagina, titulo) => {
    sim.respuestas[clave] = rechazo(ERROR_INESPERADO);
    const html = renderToStaticMarkup((await pagina()) as never);
    expect(html).toContain(titulo);
    expect(html).toContain(ERROR_INESPERADO);
  });
});

describe("recargas después de un cambio", () => {
  const RECARGAS: Array<[string, string, (avisar: (a: unknown) => void) => Promise<unknown>, string]> = [
    ["recorrido", "journeyPage", recargarRecorrido, "No se pudo actualizar el recorrido"],
    ["columnas", "customFieldsPage", recargarColumnas, "No se pudieron actualizar las columnas"],
    ["revisión", "weeklyReview", recargarRevision, "No se pudo actualizar la revisión"],
  ];

  it.each(RECARGAS)("⭐ %s: avisa el motivo y no pisa lo que se mostraba", async (_n, clave, recargar, titulo) => {
    sim.respuestas[clave] = rechazo("Sesión no válida");
    const avisar = vi.fn();
    await expect(recargar(avisar)).resolves.toBeNull();
    expect(avisar).toHaveBeenCalledWith({ title: titulo, description: "Sesión no válida" });
  });

  it.each(RECARGAS)("%s: si la acción lanzó, el texto fijo", async (_n, clave, recargar, titulo) => {
    sim.respuestas[clave] = caida();
    const avisar = vi.fn();
    await expect(recargar(avisar)).resolves.toBeNull();
    expect(avisar).toHaveBeenCalledWith({ title: titulo, description: ERROR_INESPERADO });
    expect(consola).toHaveBeenCalled();
  });

  it("columnas: con éxito devuelve las columnas", async () => {
    sim.respuestas.customFieldsPage = { success: true, data: { fields: [{ id: "c1" }], canManage: true } };
    await expect(recargarColumnas(vi.fn())).resolves.toEqual([{ id: "c1" }]);
  });
});

describe("cambios desde botones", () => {
  type Correr = (avisar: (a: unknown) => void, alExito: () => void) => Promise<void>;
  const CAMBIOS: Array<[string, string, Correr, string]> = [
    [
      "recorrido",
      "x",
      (avisar, alExito) => cambiarRecorrido(() => responder("x") as never, avisar, alExito),
      "No se pudo guardar",
    ],
    [
      "columnas",
      "x",
      (avisar, alExito) =>
        cambiarColumnas(() => responder("x") as never, avisar, "No se pudo cargar", alExito),
      "No se pudo cargar",
    ],
    [
      "estado actual (revisión)",
      "currentStatus",
      (avisar, alExito) => guardarEstadoActual("c1", "nota", avisar, async () => alExito()),
      "No se pudo guardar",
    ],
    [
      "notas",
      "notes",
      (avisar, alExito) => guardarNotas("c1", "nota", avisar, alExito),
      "No se pudieron guardar las notas",
    ],
    [
      "satisfacción",
      "satisfaction",
      (avisar, alExito) => guardarSatisfaccion("c1", "conforme", avisar, alExito),
      "No se pudo guardar",
    ],
    [
      "campos del cliente",
      "updateClientFields",
      (avisar, alExito) => guardarCamposDelCliente("c1", {}, avisar, async () => alExito()),
      "No se pudo guardar",
    ],
    [
      "recorrido del cliente",
      "x",
      (avisar, alExito) =>
        cambiarRecorridoDelCliente(() => responder("x") as never, avisar, "No se pudo deshacer", alExito),
      "No se pudo deshacer",
    ],
  ];

  it.each(CAMBIOS)("⭐ %s: el rechazo se avisa con su motivo", async (_n, clave, correr, titulo) => {
    sim.respuestas[clave] = rechazo("Ese nivel de satisfacción no existe.");
    const avisar = vi.fn();
    const alExito = vi.fn();
    await correr(avisar, alExito);
    expect(avisar).toHaveBeenCalledWith({
      title: titulo,
      description: "Ese nivel de satisfacción no existe.",
      variant: "default",
    });
    expect(alExito).not.toHaveBeenCalled();
  });

  it.each(CAMBIOS)("%s: si la acción lanzó, el texto fijo", async (_n, clave, correr, titulo) => {
    sim.respuestas[clave] = caida();
    const avisar = vi.fn();
    const alExito = vi.fn();
    await correr(avisar, alExito);
    expect(avisar).toHaveBeenCalledWith({
      title: titulo,
      description: ERROR_INESPERADO,
      variant: "default",
    });
    expect(alExito).not.toHaveBeenCalled();
    expect(consola).toHaveBeenCalled();
  });

  it.each(CAMBIOS)("%s: con éxito sigue", async (_n, clave, correr) => {
    sim.respuestas[clave] = { success: true, data: { updatedAt: null } };
    const alExito = vi.fn();
    await correr(vi.fn(), alExito);
    expect(alExito).toHaveBeenCalled();
  });
});

describe("lecturas de la ficha y la lista", () => {
  const LECTURAS: Array<[string, string[], () => Promise<{ ok: boolean; motivo?: string }>]> = [
    ["días sin novedades", ["silenceDays"], cargarDiasSinNovedades],
    ["columnas del cliente", ["clientFields"], cargarColumnasDelCliente],
    ["resumen del cliente", ["overview"], () => cargarResumenDelCliente("c1")],
    ["recorrido del cliente", ["clientJourney", "proposals"], () => cargarRecorridoDelCliente("c1")],
    ["propuestas del cliente", ["proposals", "clientJourney"], () => cargarRecorridoDelCliente("c1")],
  ];

  const okDe: Record<string, unknown> = {
    clientJourney: { success: true, data: { progress: [], checkpointFields: [], journeyConfigured: true } },
    proposals: { success: true, data: [] },
  };

  it.each(LECTURAS)("⭐ %s: el motivo", async (_n, [clave, otra], leer) => {
    if (otra) sim.respuestas[otra] = okDe[otra];
    sim.respuestas[clave as string] = rechazo("Sesión no válida");
    await expect(leer()).resolves.toEqual({ ok: false, motivo: "Sesión no válida" });
  });

  it.each(LECTURAS)("%s: si la acción lanzó, el texto fijo", async (_n, [clave, otra], leer) => {
    if (otra) sim.respuestas[otra] = okDe[otra];
    sim.respuestas[clave as string] = caida();
    await expect(leer()).resolves.toEqual({ ok: false, motivo: ERROR_INESPERADO });
    expect(consola).toHaveBeenCalled();
  });

  it("⭐ la lista: el tablero y las señales, cada uno con su motivo", async () => {
    sim.respuestas.board = rechazo("Sesión no válida");
    sim.respuestas.signals = caida();
    await expect(cargarTableroYSenales()).resolves.toEqual([
      { ok: false, motivo: "Sesión no válida" },
      { ok: false, motivo: ERROR_INESPERADO },
    ]);
  });

  it("el aviso de lectura fallida muestra el motivo", () => {
    const html = renderToStaticMarkup(
      createElement(AvisoDeLecturaFallida, {
        titulo: "No se pudo cargar el resumen del cliente.",
        motivo: ERROR_INESPERADO,
      })
    );
    expect(html).toContain("No se pudo cargar el resumen del cliente.");
    expect(html).toContain(ERROR_INESPERADO);
  });
});
