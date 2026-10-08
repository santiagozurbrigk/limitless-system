/**
 * SCRUM-503: los componentes del Tablero que llaman acciones sin pasar por el
 * provider. Crear un sprint avisa el motivo del rechazo; el reporte de tiempo
 * muestra el motivo en su estado de error. Si la acción lanza, el texto fijo.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sim = vi.hoisted(() => ({
  createSprint: null as null | ((datos: unknown) => Promise<unknown>),
  timeByMember: null as null | (() => Promise<unknown>),
}));

vi.mock("@/app/workboard/actions", () => ({
  createSprintAction: (datos: unknown) => sim.createSprint!(datos),
  getTimeByMemberAction: () => sim.timeByMember!(),
}));

import { crearSprint } from "../create-sprint-modal";
import { leerReporteDeTiempo } from "../workboard-time-report";

const TEXTO_FIJO = "Ocurrió un error inesperado. Intentá de nuevo.";
const DATOS = {
  name: "Sprint 4",
  areaFocus: "general" as const,
  startDate: "2026-10-08",
  endDate: "2026-10-22",
};

let consola: ReturnType<typeof vi.spyOn>;
afterEach(() => consola.mockRestore());
beforeEach(() => {
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("crearSprint", () => {
  it("⭐ un rechazo esperable se avisa con su motivo y no cierra el modal", async () => {
    sim.createSprint = async () => ({ success: false, error: "Fecha inválida" });
    const avisos: unknown[] = [];
    const alCrear = vi.fn();
    await crearSprint(DATOS, { avisar: (a) => avisos.push(a), alCrear });
    expect(avisos).toEqual([
      { title: "No se pudo crear el sprint", description: "Fecha inválida", variant: "default" },
    ]);
    expect(alCrear).not.toHaveBeenCalled();
  });

  it("con éxito llama a alCrear con el sprint, sin avisos", async () => {
    const SPRINT = { id: "s1", name: "Sprint 4" };
    sim.createSprint = async (datos) => {
      expect(datos).toEqual(DATOS);
      return { success: true, data: SPRINT };
    };
    const avisos: unknown[] = [];
    const alCrear = vi.fn();
    await crearSprint(DATOS, { avisar: (a) => avisos.push(a), alCrear });
    expect(alCrear).toHaveBeenCalledWith(SPRINT);
    expect(avisos).toEqual([]);
  });

  it("⭐ si la acción lanza: texto fijo y consola", async () => {
    sim.createSprint = async () => {
      throw new TypeError("fetch failed");
    };
    const avisos: unknown[] = [];
    await crearSprint(DATOS, { avisar: (a) => avisos.push(a), alCrear: vi.fn() });
    expect(avisos).toEqual([
      { title: "No se pudo crear el sprint", description: TEXTO_FIJO, variant: "default" },
    ]);
    expect(consola).toHaveBeenCalledWith("[CreateSprintModal] crear sprint", expect.any(TypeError));
  });
});

describe("leerReporteDeTiempo", () => {
  it("⭐ un rechazo esperable vuelve con su motivo para la pantalla", async () => {
    sim.timeByMember = async () => ({ success: false, error: "Sesión no válida" });
    await expect(leerReporteDeTiempo()).resolves.toEqual({ ok: false, error: "Sesión no válida" });
  });

  it("con éxito devuelve el reporte; sin datos, una lista vacía", async () => {
    sim.timeByMember = async () => ({ success: true, data: [{ memberId: "m1" }] });
    await expect(leerReporteDeTiempo()).resolves.toEqual({ ok: true, reports: [{ memberId: "m1" }] });
    sim.timeByMember = async () => ({ success: true, data: null });
    await expect(leerReporteDeTiempo()).resolves.toEqual({ ok: true, reports: [] });
  });

  it("⭐ si la acción lanza: el texto fijo y la consola", async () => {
    sim.timeByMember = async () => {
      throw new TypeError("fetch failed");
    };
    await expect(leerReporteDeTiempo()).resolves.toEqual({ ok: false, error: TEXTO_FIJO });
    expect(consola).toHaveBeenCalledWith("[WorkboardTimeReport]", expect.any(TypeError));
  });
});
