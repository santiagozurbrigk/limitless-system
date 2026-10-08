import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-504: los componentes de Ventas que usan las acciones arregladas
 * muestran el motivo que la acción devuelve como valor, y el texto fijo si la
 * acción lanzó (en producción el cliente sólo recibe un digest). Antes
 * mostraban un estado de error sin motivo, el texto crudo de la excepción o un
 * "Sync completado" en verde con el token de Calendly vencido.
 */

const ERROR_INESPERADO = "Ocurrió un error inesperado. Intentá de nuevo.";

const sim = vi.hoisted(() => ({
  ranking: null as unknown,
  evolucion: null as unknown,
  promedio: null as unknown,
  rendimiento: null as unknown,
  sync: null as unknown,
  desconectar: null as unknown,
  metricasDeClosers: null as unknown,
  tablaDeLeads: null as unknown,
  objeciones: null as unknown,
  pagosDelCliente: null as unknown,
  cobrado: null as unknown,
  prepararSubida: null as unknown,
  estadoCalendly: null as unknown,
  recorrido: null as unknown,
}));

/** Devuelve el resultado simulado, o lo lanza si es una excepción. */
function responder(valor: unknown) {
  if (valor instanceof Error) return Promise.reject(valor);
  return Promise.resolve(valor);
}

// El hook de métricas importa los providers de la plataforma, que arrastran
// acciones de servidor (`app/clients/actions.ts`).
vi.mock("server-only", () => ({}));
vi.mock("@/app/sales/actions", () => ({
  getLeadJourneyAction: () => responder(sim.recorrido),
  getZernioLeadJourneyAction: () => responder(sim.recorrido),
  getFrequentObjectionsAction: () => responder(sim.objeciones),
  getTeamRankingAction: () => responder(sim.ranking),
  getCloserEvolutionAction: () => responder(sim.evolucion),
  getTeamAverageEvolutionAction: () => responder(sim.promedio),
}));
vi.mock("@/app/sales/metrics-actions", () => ({
  getSalesPerformanceMetricsAction: () => responder(sim.rendimiento),
}));
vi.mock("@/app/sales/closer-actions", () => ({
  syncCloserCalendlyAction: () => responder(sim.sync),
  disconnectMyCalendlyAction: () => responder(sim.desconectar),
  getMyCalendlyIntegrationAction: () => responder(sim.estadoCalendly),
  getCloserMetricsAction: () => responder(sim.metricasDeClosers),
}));
vi.mock("@/app/sales/payment-actions", () => ({
  listClientPaymentsAction: () => responder(sim.pagosDelCliente),
  prepareClientPaymentReceiptUploadAction: () => responder(sim.prepararSubida),
}));
vi.mock("@/app/clients/plan-duration-actions", () => ({
  getClientsTableEnrichmentAction: () => responder(sim.cobrado),
}));
vi.mock("@/app/sales/lead-actions", () => ({
  listLeadsTableAction: () => responder(sim.tablaDeLeads),
}));

import { leerConMotivo } from "@/lib/client/correr-accion";
import { RendimientoDelEquipo } from "../sales-team-performance-section";
import { cargarMetricasDeRendimiento } from "../sales-performance-metrics-section";
import { AvisoDeLecturaFallida } from "@/components/shared/aviso-de-lectura-fallida";
import {
  cargarEvolucionDelCloser,
  EvolucionDelCloser,
} from "@/components/clients/client-linked-calls";
import {
  cargarEstadoDeMiCalendly,
  desconectarMiCalendly,
  EstadoDeCalendlySinLeer,
  sincronizarMiCalendly,
} from "@/components/settings/closer-calendly-settings";
import {
  cargarMetricasDeClosers,
  sincronizarCalendlyDelCloser,
} from "@/components/closing/closers-ranking";
import {
  guardarCambioDeFila,
  recargarTablaDeLeads,
} from "@/components/closing/leads-table";
import { FrequentObjectionsSection } from "../frequent-objections-section";
import { AvisoDeCobradoSinLeer, cargarCobradoPorCliente } from "../cobros-page";
import { cargarPagosDelCliente } from "../client-payments-section";
import { uploadPaymentReceiptFile } from "../payment-receipt-dropzone";
import { AvisoDeRecorridoIncompleto, cargarRecorridoDelLead } from "../lead-journey-inline";

const caida = () => new Error("An error occurred in the Server Components render.");

let consola: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  sim.ranking = { success: true, data: [] };
  sim.evolucion = { success: true, data: [70, 80] };
  sim.promedio = { success: true, data: [75] };
  sim.rendimiento = { success: true, data: { period: "month" } };
  sim.sync = { success: true, data: { inserted: 2, updated: 1 } };
  sim.desconectar = { success: true, data: undefined };
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => consola.mockRestore());

describe("Rendimiento del equipo (Ventas → Métricas)", () => {
  it("⭐ muestra el motivo que devolvió la acción", async () => {
    sim.ranking = { success: false, error: "Sesión no válida" };
    const { getTeamRankingAction } = await import("@/app/sales/actions");
    const lectura = await leerConMotivo(getTeamRankingAction, "[test]");
    expect(lectura.ok).toBe(false);
    const html = renderToStaticMarkup(
      createElement(RendimientoDelEquipo, {
        loading: false,
        motivo: lectura.ok ? null : lectura.motivo,
        ranking: [],
      })
    );
    expect(html).toContain("No pudimos cargar el rendimiento del equipo");
    expect(html).toContain("Sesión no válida");
  });

  it("⭐ si la acción lanzó muestra el texto fijo", () => {
    const html = renderToStaticMarkup(
      createElement(RendimientoDelEquipo, { loading: false, motivo: ERROR_INESPERADO, ranking: [] })
    );
    expect(html).toContain(ERROR_INESPERADO);
  });

  it("sin error y sin datos muestra el estado vacío de siempre", () => {
    const html = renderToStaticMarkup(
      createElement(RendimientoDelEquipo, { loading: false, motivo: null, ranking: [] })
    );
    expect(html).toContain("Todavía no hay análisis de calls");
  });
});

describe("Evolución del closer (ficha del cliente)", () => {
  it("con las tres lecturas bien devuelve los datos", async () => {
    await expect(cargarEvolucionDelCloser("Laura")).resolves.toEqual({
      ok: true,
      data: { scores: [70, 80], teamAverage: [75], ranking: [] },
    });
  });

  it("⭐ si una lectura devuelve un motivo, el panel lo muestra", async () => {
    sim.promedio = { success: false, error: "Sesión no válida" };
    const lectura = await cargarEvolucionDelCloser("Laura");
    expect(lectura).toEqual({ ok: false, motivo: "Sesión no válida" });
    const html = renderToStaticMarkup(
      createElement(EvolucionDelCloser, {
        loading: false,
        motivo: lectura.ok ? null : lectura.motivo,
        closerName: "Laura",
        scores: [],
        teamAverage: [],
        ranking: [],
      })
    );
    expect(html).toContain("No pudimos cargar la evolución. Sesión no válida");
  });

  it("⭐ si una acción lanzó, el motivo es el texto fijo", async () => {
    sim.ranking = caida();
    await expect(cargarEvolucionDelCloser("Laura")).resolves.toEqual({
      ok: false,
      motivo: ERROR_INESPERADO,
    });
    expect(consola).toHaveBeenCalledWith("[CloserEvolutionSheet] ranking", sim.ranking);
  });
});

describe("Métricas de rendimiento", () => {
  it("⭐ devuelven el motivo de la acción para mostrarlo", async () => {
    sim.rendimiento = { success: false, error: "Sesión no válida" };
    await expect(cargarMetricasDeRendimiento("month")).resolves.toEqual({
      ok: false,
      motivo: "Sesión no válida",
    });
  });

  it("⭐ si la acción lanzó, el texto fijo", async () => {
    sim.rendimiento = caida();
    await expect(cargarMetricasDeRendimiento("30d")).resolves.toEqual({
      ok: false,
      motivo: ERROR_INESPERADO,
    });
  });

  it("el aviso de la pantalla de métricas muestra el motivo", () => {
    const html = renderToStaticMarkup(
      createElement(AvisoDeLecturaFallida, {
        titulo: "No se pudieron cargar las métricas de rendimiento.",
        motivo: "Sesión no válida",
      })
    );
    expect(html).toContain("No se pudieron cargar las métricas de rendimiento.");
    expect(html).toContain("Sesión no válida");
  });
});

describe("Calendly del closer (Configuración)", () => {
  it("con éxito avisa los números y refresca el estado", async () => {
    const avisar = vi.fn();
    const alSincronizar = vi.fn();
    await sincronizarMiCalendly(avisar, alSincronizar);
    expect(avisar).toHaveBeenCalledWith({
      title: "Sync completado: 2 nuevas, 1 actualizadas",
      variant: "success",
    });
    expect(alSincronizar).toHaveBeenCalledTimes(1);
  });

  it("⭐ con el token vencido avisa el motivo, no \"Sync completado\"", async () => {
    const motivo =
      "Tu conexión con Calendly venció o fue revocada. Desconectala y volvé a conectarla para sincronizar.";
    sim.sync = { success: false, error: motivo };
    const avisar = vi.fn();
    const alSincronizar = vi.fn();
    await sincronizarMiCalendly(avisar, alSincronizar);
    expect(avisar).toHaveBeenCalledTimes(1);
    expect(avisar).toHaveBeenCalledWith({ title: "Error al sincronizar", description: motivo, variant: "default" });
    expect(alSincronizar).not.toHaveBeenCalled();
  });

  it("⭐ si la acción lanzó avisa el texto fijo", async () => {
    sim.sync = caida();
    const avisar = vi.fn();
    await sincronizarMiCalendly(avisar, vi.fn());
    expect(avisar).toHaveBeenCalledWith({
      title: "Error al sincronizar",
      description: ERROR_INESPERADO,
      variant: "default",
    });
  });

  it("desconectar con éxito marca no conectado y avisa", async () => {
    const avisar = vi.fn();
    const alDesconectar = vi.fn();
    await desconectarMiCalendly(avisar, alDesconectar);
    expect(alDesconectar).toHaveBeenCalledTimes(1);
    expect(avisar).toHaveBeenCalledWith({ title: "Calendly desconectado", variant: "success" });
  });

  it("⭐ desconectar sin sesión avisa el motivo y no marca no conectado", async () => {
    sim.desconectar = { success: false, error: "Sesión no válida" };
    const avisar = vi.fn();
    const alDesconectar = vi.fn();
    await desconectarMiCalendly(avisar, alDesconectar);
    expect(avisar).toHaveBeenCalledWith({
      title: "Error al desconectar",
      description: "Sesión no válida",
      variant: "default",
    });
    expect(alDesconectar).not.toHaveBeenCalled();
  });

  it("⭐ desconectar con la acción que lanza avisa el texto fijo", async () => {
    sim.desconectar = caida();
    const avisar = vi.fn();
    await desconectarMiCalendly(avisar, vi.fn());
    expect(avisar).toHaveBeenCalledWith({
      title: "Error al desconectar",
      description: ERROR_INESPERADO,
      variant: "default",
    });
  });
});

describe("Calendly de un closer (ranking de closers)", () => {
  it("con éxito avisa los números y recarga las métricas", async () => {
    const avisar = vi.fn();
    const alSincronizar = vi.fn();
    await sincronizarCalendlyDelCloser("closer-1", avisar, alSincronizar);
    expect(avisar).toHaveBeenCalledWith({ title: "Sync: 2 nuevas, 1 actualizadas", variant: "success" });
    expect(alSincronizar).toHaveBeenCalledTimes(1);
  });

  it("⭐ sin integración avisa el motivo", async () => {
    sim.sync = { success: false, error: "No se encontró integración Calendly para este closer" };
    const avisar = vi.fn();
    const alSincronizar = vi.fn();
    await sincronizarCalendlyDelCloser("closer-1", avisar, alSincronizar);
    expect(avisar).toHaveBeenCalledWith({
      title: "Error en sync",
      description: "No se encontró integración Calendly para este closer",
      variant: "default",
    });
    expect(alSincronizar).not.toHaveBeenCalled();
  });

  it("⭐ si la acción lanzó avisa el texto fijo", async () => {
    sim.sync = caida();
    const avisar = vi.fn();
    await sincronizarCalendlyDelCloser("closer-1", avisar, vi.fn());
    expect(avisar).toHaveBeenCalledWith({
      title: "Error en sync",
      description: ERROR_INESPERADO,
      variant: "default",
    });
  });
});

describe("Objeciones frecuentes", () => {
  it("⭐ con el motivo de la lectura del servidor lo muestra, sin volver a leer", () => {
    const html = renderToStaticMarkup(
      createElement(FrequentObjectionsSection, { initialError: "Sesión no válida" })
    );
    expect(html).toContain("No pudimos cargar las objeciones");
    expect(html).toContain("Sesión no válida");
  });

  it("⭐ si la acción del cliente lanza, el motivo es el texto fijo", async () => {
    sim.objeciones = caida();
    const { getFrequentObjectionsAction } = await import("@/app/sales/actions");
    await expect(leerConMotivo(getFrequentObjectionsAction, "[x]")).resolves.toEqual({
      ok: false,
      motivo: ERROR_INESPERADO,
    });
  });
});

describe("Ranking de closers: métricas", () => {
  it("con éxito las ordena por cierres", async () => {
    sim.metricasDeClosers = {
      success: true,
      data: [
        { closerId: "a", closedCalls: 1 },
        { closerId: "b", closedCalls: 3 },
      ],
    };
    const avisar = vi.fn();
    const r = await cargarMetricasDeClosers("2026-10-01", avisar);
    expect(r?.map((m) => m.closerId)).toEqual(["b", "a"]);
    expect(avisar).not.toHaveBeenCalled();
  });

  it("⭐ con un motivo lo avisa y no pisa lo que se ve", async () => {
    sim.metricasDeClosers = { success: false, error: "Sesión no válida" };
    const avisar = vi.fn();
    await expect(cargarMetricasDeClosers("2026-10-01", avisar)).resolves.toBeNull();
    expect(avisar).toHaveBeenCalledWith({ title: "Error al cargar métricas", description: "Sesión no válida" });
  });

  it("⭐ si la acción lanzó avisa el texto fijo", async () => {
    sim.metricasDeClosers = caida();
    const avisar = vi.fn();
    await cargarMetricasDeClosers("2026-10-01", avisar);
    expect(avisar).toHaveBeenCalledWith({ title: "Error al cargar métricas", description: ERROR_INESPERADO });
  });
});

describe("Tabla de seguimiento", () => {
  it("recargar con éxito devuelve la tabla", async () => {
    sim.tablaDeLeads = { success: true, data: { rows: [], total: 0 } };
    await expect(recargarTablaDeLeads({ scope: "all" }, vi.fn())).resolves.toEqual({ rows: [], total: 0 });
  });

  it("⭐ recargar con un motivo lo avisa y deja la tabla como estaba", async () => {
    sim.tablaDeLeads = { success: false, error: "Sesión no válida" };
    const avisar = vi.fn();
    await expect(recargarTablaDeLeads({}, avisar)).resolves.toBeNull();
    expect(avisar).toHaveBeenCalledWith({ title: "No se pudo cargar el seguimiento", description: "Sesión no válida" });
  });

  it("⭐ recargar con la acción que lanza avisa el texto fijo", async () => {
    sim.tablaDeLeads = caida();
    const avisar = vi.fn();
    await recargarTablaDeLeads({}, avisar);
    expect(avisar).toHaveBeenCalledWith({ title: "No se pudo cargar el seguimiento", description: ERROR_INESPERADO });
  });

  it("guardar un cambio con éxito no vuelve atrás ni avisa", async () => {
    const deshacer = vi.fn();
    const avisar = vi.fn();
    await guardarCambioDeFila({
      accion: async () => ({ success: true, data: undefined }),
      deshacer,
      avisar,
      titulo: "No se pudo guardar",
      etiqueta: "[x]",
    });
    expect(deshacer).not.toHaveBeenCalled();
    expect(avisar).not.toHaveBeenCalled();
  });

  it("⭐ un cambio rechazado vuelve atrás la fila y avisa el motivo", async () => {
    const deshacer = vi.fn();
    const avisar = vi.fn();
    await guardarCambioDeFila({
      accion: async () => ({ success: false, error: "El próximo paso necesita una fecha." }),
      deshacer,
      avisar,
      titulo: "No se pudo guardar",
      etiqueta: "[x]",
    });
    expect(deshacer).toHaveBeenCalledTimes(1);
    expect(avisar).toHaveBeenCalledWith({
      title: "No se pudo guardar",
      description: "El próximo paso necesita una fecha.",
      variant: "default",
    });
  });

  it("⭐ un cambio cuya acción lanza vuelve atrás la fila y avisa el texto fijo", async () => {
    const deshacer = vi.fn();
    const avisar = vi.fn();
    await guardarCambioDeFila({
      accion: () => Promise.reject(caida()),
      deshacer,
      avisar,
      titulo: "No se pudo guardar",
      etiqueta: "[x]",
    });
    expect(deshacer).toHaveBeenCalledTimes(1);
    expect(avisar).toHaveBeenCalledWith({
      title: "No se pudo guardar",
      description: ERROR_INESPERADO,
      variant: "default",
    });
  });
});

describe("Cobros (AR, MAYOR-2)", () => {
  it("⭐ lo cobrado que no se pudo leer da el motivo, y el aviso lo muestra", async () => {
    sim.cobrado = { success: false, error: ERROR_INESPERADO };
    const lectura = await cargarCobradoPorCliente();
    expect(lectura).toEqual({ ok: false, motivo: ERROR_INESPERADO });
    const html = renderToStaticMarkup(createElement(AvisoDeCobradoSinLeer, { motivo: ERROR_INESPERADO }));
    expect(html).toContain("No se pudieron cargar los pagos.");
    expect(html).toContain(ERROR_INESPERADO);
  });

  it("⭐ si la acción de lo cobrado lanza, el motivo es el texto fijo", async () => {
    sim.cobrado = caida();
    await expect(cargarCobradoPorCliente()).resolves.toEqual({ ok: false, motivo: ERROR_INESPERADO });
  });

  it("⭐ los pagos del cliente que no se pudieron leer dan el motivo (no \"aún no hay pagos\")", async () => {
    sim.pagosDelCliente = { success: false, error: "Sesión no válida" };
    await expect(cargarPagosDelCliente("c1")).resolves.toEqual({ ok: false, motivo: "Sesión no válida" });
    sim.pagosDelCliente = caida();
    await expect(cargarPagosDelCliente("c1")).resolves.toEqual({ ok: false, motivo: ERROR_INESPERADO });
  });

  it("⭐ subir un comprobante no rechaza: el motivo devuelto o el texto fijo", async () => {
    const archivo = new File(["x"], "c.pdf", { type: "application/pdf" });
    sim.prepararSubida = { success: false, error: "Cliente no encontrado" };
    await expect(uploadPaymentReceiptFile(archivo, "c1")).resolves.toEqual({
      ok: false,
      error: "Cliente no encontrado",
    });
    sim.prepararSubida = caida();
    await expect(uploadPaymentReceiptFile(archivo, "c1")).resolves.toEqual({
      ok: false,
      error: ERROR_INESPERADO,
    });
  });
});

describe("Estado del Calendly propio (AR, MENOR-4)", () => {
  it("⭐ si no se pudo leer, el motivo, y la pantalla no dice \"No conectado\"", async () => {
    sim.estadoCalendly = { success: false, error: ERROR_INESPERADO };
    await expect(cargarEstadoDeMiCalendly()).resolves.toEqual({ ok: false, motivo: ERROR_INESPERADO });
    const html = renderToStaticMarkup(createElement(EstadoDeCalendlySinLeer, { motivo: ERROR_INESPERADO }));
    expect(html).toContain("No se pudo leer el estado de tu Calendly.");
    expect(html).toContain(ERROR_INESPERADO);
    expect(html).not.toContain("No conectado");
  });

  it("con el estado, el dato", async () => {
    sim.estadoCalendly = { success: true, data: { connected: true } };
    await expect(cargarEstadoDeMiCalendly()).resolves.toEqual({ ok: true, data: { connected: true } });
  });
});

describe("Recorrido del lead", () => {
  it("⭐ con un motivo lo devuelve (antes \"Sin recorrido registrado\")", async () => {
    sim.recorrido = { success: false, error: "Sesión no válida" };
    await expect(cargarRecorridoDelLead({ conversationId: "c1" })).resolves.toEqual({
      ok: false,
      motivo: "Sesión no válida",
    });
  });

  it("⭐ si la acción de Zernio lanza, el texto fijo", async () => {
    sim.recorrido = caida();
    await expect(
      cargarRecorridoDelLead({ zernioAccountId: "a", zernioParticipantName: "Ana" })
    ).resolves.toEqual({ ok: false, motivo: ERROR_INESPERADO });
  });

  it("sin datos para buscar, recorrido vacío", async () => {
    await expect(cargarRecorridoDelLead({})).resolves.toEqual({ ok: true, data: { pasos: [], faltan: [] } });
  });

  it("⭐ con fuentes que faltan, el aviso las nombra; sin faltantes no avisa", () => {
    const html = renderToStaticMarkup(
      createElement(AvisoDeRecorridoIncompleto, { faltan: ["la llamada", "los comentarios"] })
    );
    expect(html).toContain("Faltan datos del recorrido:");
    expect(html).toContain("no se pudieron leer la llamada y los comentarios.");
    expect(renderToStaticMarkup(createElement(AvisoDeRecorridoIncompleto, { faltan: [] }))).toBe("");
  });
});
