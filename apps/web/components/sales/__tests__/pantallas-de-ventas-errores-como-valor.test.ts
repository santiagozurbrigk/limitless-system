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
  getMyCalendlyIntegrationAction: async () => ({ connected: true }),
  getCloserMetricsAction: async () => [],
}));

import { leerConMotivo } from "@/lib/sales/lectura-con-motivo";
import { RendimientoDelEquipo } from "../sales-team-performance-section";
import { cargarMetricasDeRendimiento } from "../sales-performance-metrics-section";
import { AvisoDeLecturaFallida } from "../sales-metrics-redesign";
import {
  cargarEvolucionDelCloser,
  EvolucionDelCloser,
} from "@/components/clients/client-linked-calls";
import {
  desconectarMiCalendly,
  sincronizarMiCalendly,
} from "@/components/settings/closer-calendly-settings";
import { sincronizarCalendlyDelCloser } from "@/components/closing/closers-ranking";

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

describe("leerConMotivo", () => {
  it("con éxito devuelve el dato", async () => {
    await expect(leerConMotivo(async () => ({ success: true, data: 1 }), "[x]")).resolves.toEqual({
      ok: true,
      data: 1,
    });
  });

  it("⭐ con un error devuelto como valor da ese motivo, sin registrar nada", async () => {
    await expect(
      leerConMotivo(async () => ({ success: false, error: "Sesión no válida" }), "[x]")
    ).resolves.toEqual({ ok: false, motivo: "Sesión no válida" });
    expect(consola).not.toHaveBeenCalled();
  });

  it("⭐ si la acción lanza, el motivo es el texto fijo y queda en la consola", async () => {
    const error = caida();
    await expect(leerConMotivo(() => Promise.reject(error), "[x]")).resolves.toEqual({
      ok: false,
      motivo: ERROR_INESPERADO,
    });
    expect(consola).toHaveBeenCalledWith("[x]", error);
  });

  it("un redirect de Next se relanza para que Next navegue", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/login;307;",
    });
    await expect(leerConMotivo(() => Promise.reject(redirect), "[x]")).rejects.toBe(redirect);
    expect(consola).not.toHaveBeenCalled();
  });
});

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
