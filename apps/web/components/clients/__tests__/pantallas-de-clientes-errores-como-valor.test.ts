import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-516: los componentes que usan las acciones de carga y negocio de
 * Clientes muestran el motivo que la acción devuelve como valor, y el texto
 * fijo si la acción lanzó (en producción el navegador sólo recibe un digest).
 * Antes una lectura fallida se veía como "sin datos" (sin tareas, sin
 * clientes, sin link, sin planes) y una importación mostraba el párrafo
 * técnico de Next.
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

vi.mock("server-only", () => ({}));
vi.mock("@/app/clients/onboarding-link-actions", () => ({
  getOnboardingStatusAction: responder("getOnboardingStatusAction"),
  getGeneralOnboardingAction: responder("getGeneralOnboardingAction"),
  createOnboardingLinkAction: responder("x"),
  revokeOnboardingLinkAction: responder("x"),
  createGeneralOnboardingLinkAction: responder("x"),
  discardOnboardingSubmissionAction: responder("x"),
  assignOnboardingSubmissionAction: responder("x"),
}));
vi.mock("@/app/clients/sub-client-actions", () => ({
  listSubClientsAction: responder("listSubClientsAction"),
  updateSubClientFieldsAction: responder("updateSubClientFieldsAction"),
  createSubClientAction: responder("x"),
  updateSubClientAction: responder("x"),
  deleteSubClientAction: responder("x"),
  moveLegacySectionValuesAction: responder("x"),
}));
vi.mock("@/app/clients/task-actions", () => ({
  listClientTasksAction: responder("listClientTasksAction"),
  createClientTaskAction: responder("x"),
  deleteClientTaskAction: responder("x"),
  sendClientTaskToBoardAction: responder("x"),
  toggleClientTaskAction: responder("x"),
}));
vi.mock("@/app/clients/revenue-actions", () => ({
  listClientRevenueAction: responder("listClientRevenueAction"),
  saveClientRevenueAction: responder("x"),
  deleteClientRevenueAction: responder("x"),
}));
vi.mock("@/app/clients/plan-actions", () => ({
  listPlansAction: responder("listPlansAction"),
  createPlanAction: responder("x"),
  updatePlanAction: responder("x"),
  deletePlanAction: responder("x"),
}));
vi.mock("@/app/clients/plan-duration-actions", () => ({
  getClientsTableEnrichmentAction: responder("x"),
}));
vi.mock("@/app/clients/win-actions", () => ({
  prepareWinAttachmentUploadAction: responder("prepareWinAttachmentUploadAction"),
  finalizeWinAttachmentAction: responder("finalizeWinAttachmentAction"),
  deleteWinAttachmentAction: responder("x"),
}));
vi.mock("@/app/clients/import-actions", () => ({
  getExcelPreviewAction: responder("getExcelPreviewAction"),
  importClientsFromExcelAction: responder("importClientsFromExcelAction"),
  importSalesMetricsManualAction: responder("importSalesMetricsManualAction"),
}));
vi.mock("@/app/clients/custom-field-actions", () => ({ listFieldDefinitionsAction: async () => [] }));

import { cargarEstadoDelOnboarding } from "../sub-client-onboarding";
import { cargarBandejaDeOnboarding, cargarCreadores } from "../client-onboarding-inbox";
import { cargarSubClientes, guardarCamposDelSubCliente } from "../client-sub-clients-card";
import { cargarTareasDelCliente } from "../client-tasks-section";
import { cargarFacturacion } from "../client-revenue-card";
import { subirCapturaDeWin } from "../wins/win-form-modal";
import { cargarPlanes } from "@/components/closing/payment-modal";
import { cargarPlanesDeCobros } from "@/components/sales/cobros-page";
import {
  StepMapper,
  importarClientesDelArchivo,
  importarMetricasManuales,
  leerVistaPrevia,
} from "@/components/integrations/data-import-wizard";

/** Lo que el navegador recibe en producción cuando una server action lanza. */
const caida = () => new Error("An error occurred in the Server Components render.");

let consola: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  sim.resultados = {};
  sim.llamadas = [];
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  consola.mockRestore();
  vi.unstubAllGlobals();
});

const lecturas = [
  ["el onboarding del creador", "getOnboardingStatusAction", () => cargarEstadoDelOnboarding("s1"), { link: null, submissions: [] }],
  ["la bandeja de onboarding", "getGeneralOnboardingAction", () => cargarBandejaDeOnboarding(), { link: null, pending: [] }],
  ["los creadores para asignar", "listSubClientsAction", () => cargarCreadores("c1"), []],
  ["los clientes del cliente", "listSubClientsAction", () => cargarSubClientes("c1"), []],
  ["las tareas", "listClientTasksAction", () => cargarTareasDelCliente("c1"), []],
  ["la facturación", "listClientRevenueAction", () => cargarFacturacion("c1"), []],
  ["los planes del cierre de venta", "listPlansAction", () => cargarPlanes(), []],
  ["los planes de Cobros", "listPlansAction", () => cargarPlanesDeCobros(), []],
  ["la vista previa del archivo", "getExcelPreviewAction", () => leerVistaPrevia("YQ=="), { headers: [] }],
  ["la importación de clientes", "importClientsFromExcelAction", () => importarClientesDelArchivo("YQ==", undefined, undefined), { inserted: 1 }],
  ["la importación de métricas", "importSalesMetricsManualAction", () => importarMetricasManuales([]), { inserted: 1 }],
] as const;

describe("lecturas y formularios de Clientes", () => {
  it.each(lecturas)("%s: con éxito, el dato", async (_n, accion, leer, dato) => {
    sim.resultados[accion] = { success: true, data: dato };
    await expect(leer()).resolves.toEqual({ ok: true, data: dato });
  });

  it.each(lecturas)("⭐ %s: el motivo que devolvió la acción, no la lista vacía", async (_n, accion, leer) => {
    sim.resultados[accion] = { success: false, error: "Sesión no válida" };
    await expect(leer()).resolves.toEqual({ ok: false, motivo: "Sesión no válida" });
  });

  it.each(lecturas)("⭐ %s: si la acción lanzó, el texto fijo y queda en la consola", async (_n, accion, leer) => {
    const error = caida();
    sim.resultados[accion] = error;
    await expect(leer()).resolves.toEqual({ ok: false, motivo: ERROR_INESPERADO });
    expect(consola).toHaveBeenCalledWith(expect.any(String), error);
  });
});

describe("guardarCamposDelSubCliente (el panel de Marketing, Ventas y Sistemas)", () => {
  it("con éxito, los valores guardados", async () => {
    sim.resultados.updateSubClientFieldsAction = { success: true, data: { seguidores: 1 } };
    await expect(guardarCamposDelSubCliente("s1", { seguidores: 1 })).resolves.toEqual({
      ok: true,
      data: { seguidores: 1 },
    });
  });

  it("⭐ el motivo de la acción va al panel", async () => {
    sim.resultados.updateSubClientFieldsAction = { success: false, error: '"Seguidores" tiene que ser un número.' };
    await expect(guardarCamposDelSubCliente("s1", {})).resolves.toEqual({
      ok: false,
      motivo: '"Seguidores" tiene que ser un número.',
    });
  });

  it("⭐ si la acción lanzó, el texto fijo (antes el panel quedaba esperando una promesa rechazada)", async () => {
    sim.resultados.updateSubClientFieldsAction = caida();
    await expect(guardarCamposDelSubCliente("s1", {})).resolves.toEqual({
      ok: false,
      motivo: ERROR_INESPERADO,
    });
  });
});

describe("subirCapturaDeWin", () => {
  const archivo = { name: "foto.png", size: 10, type: "image/png" } as File;
  const preparado = { success: true, data: { storagePath: "org/wins/w/foto.png", signedUrl: "https://s/subir", contentType: "image/png" } };

  it("sube y registra la captura", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: true }));
    sim.resultados.prepareWinAttachmentUploadAction = preparado;
    sim.resultados.finalizeWinAttachmentAction = { success: true, data: { id: "a1" } };
    await expect(subirCapturaDeWin({ winId: "w" }, archivo)).resolves.toEqual({ ok: true, data: { id: "a1" } });
  });

  it("⭐ el motivo de la acción va al formulario", async () => {
    sim.resultados.prepareWinAttachmentUploadAction = {
      success: false,
      error: "La captura no puede superar 10 MB.",
    };
    await expect(subirCapturaDeWin({ winId: "w" }, archivo)).resolves.toEqual({
      ok: false,
      motivo: "La captura no puede superar 10 MB.",
    });
  });

  it("⭐ si una acción lanzó, el texto fijo y no el párrafo de Next", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: true }));
    sim.resultados.prepareWinAttachmentUploadAction = preparado;
    sim.resultados.finalizeWinAttachmentAction = caida();
    const r = await subirCapturaDeWin({ winId: "w" }, archivo);
    expect(r).toEqual({ ok: false, motivo: ERROR_INESPERADO });
    expect(JSON.stringify(r)).not.toContain("Server Components");
  });

  it("si la subida a Storage falla, su motivo", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false }));
    sim.resultados.prepareWinAttachmentUploadAction = preparado;
    await expect(subirCapturaDeWin({ winId: "w" }, archivo)).resolves.toEqual({
      ok: false,
      motivo: "No se pudo subir la captura.",
    });
  });
});

describe("el paso de mapeo del asistente de importación", () => {
  const props = {
    clientsPreview: null,
    clientsFile: null,
    mapping: {},
    onMapping: () => {},
    loading: false,
    clientsSheetLoading: false,
    onClientsSheetChange: () => {},
    sheetConfirmed: false,
    onSheetConfirm: () => {},
  };

  it("⭐ si no se pudo leer el archivo, muestra el motivo (antes quedaba en blanco)", () => {
    const html = renderToStaticMarkup(
      createElement(StepMapper, {
        ...props,
        motivo: "No se pudo leer el archivo. Revisá que sea una planilla de Excel (.xlsx o .xls) o un CSV.",
      })
    );
    expect(html).toContain("No se pudo leer el archivo.");
    expect(html).toContain("Revisá que sea una planilla");
  });

  it("⭐ si la acción lanzó, el texto fijo", () => {
    const html = renderToStaticMarkup(createElement(StepMapper, { ...props, motivo: ERROR_INESPERADO }));
    expect(html).toContain(ERROR_INESPERADO);
  });

  it("sin motivo, el mapeo de siempre", () => {
    const html = renderToStaticMarkup(createElement(StepMapper, props));
    expect(html).toContain("Mapeo de columnas");
  });
});
