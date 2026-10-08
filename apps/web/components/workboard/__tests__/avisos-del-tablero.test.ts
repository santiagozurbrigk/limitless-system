/**
 * SCRUM-503: los componentes del Tablero que llaman acciones sin pasar por el
 * provider. Crear un sprint avisa el motivo del rechazo; el reporte de tiempo
 * muestra el motivo en su estado de error. Si la acción lanza, el texto fijo.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sim = vi.hoisted(() => ({
  createSprint: null as null | ((datos: unknown) => Promise<unknown>),
  timeByMember: null as null | (() => Promise<unknown>),
  vinculos: {} as Record<string, (...args: unknown[]) => Promise<unknown>>,
}));

vi.mock("@/app/workboard/actions", () => ({
  createSprintAction: (datos: unknown) => sim.createSprint!(datos),
  getTimeByMemberAction: () => sim.timeByMember!(),
}));

vi.mock("@/app/workboard/task-link-actions", () =>
  Object.fromEntries(
    [
      "deleteTaskAttachmentAction",
      "finalizeTaskAttachmentAction",
      "getTaskAttachmentUrlAction",
      "getWorkboardTaskByIdAction",
      "linkTaskDocumentAction",
      "listWorkboardLinkOptionsAction",
      "prepareTaskAttachmentUploadAction",
      "setTaskLinkedSopAction",
      "unlinkTaskDocumentAction",
    ].map((n) => [n, (...args: unknown[]) => sim.vinculos[n](...args)])
  )
);

import { crearSprint } from "../create-sprint-modal";
import {
  applyDraftTaskResources,
  uploadTaskAttachmentFile,
} from "../workboard-task-resources";
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

describe("recursos de una tarea (adjuntos, SOP y documentos)", () => {
  const ARCHIVO = { name: "plan.pdf", size: 10, type: "application/pdf" } as File;
  const BORRADOR = { pendingFiles: [ARCHIVO], sopId: "s1", documentIds: ["d1"] };
  const ok = async () => ({ success: true, data: {} });
  let fetchOriginal: typeof fetch;

  beforeEach(() => {
    fetchOriginal = globalThis.fetch;
    globalThis.fetch = (async () => ({ ok: true })) as unknown as typeof fetch;
    sim.vinculos = {
      setTaskLinkedSopAction: ok,
      linkTaskDocumentAction: ok,
      prepareTaskAttachmentUploadAction: async () => ({
        success: true,
        data: { storagePath: "org/t/x", signedUrl: "https://subir", contentType: "application/pdf" },
      }),
      finalizeTaskAttachmentAction: ok,
    };
  });
  afterEach(() => {
    globalThis.fetch = fetchOriginal;
  });

  it("con todo bien, no hay motivo", async () => {
    await expect(applyDraftTaskResources("t1", BORRADOR)).resolves.toBeNull();
  });

  it("⭐ un rechazo esperable vuelve con su motivo", async () => {
    sim.vinculos.linkTaskDocumentAction = async () => ({ success: false, error: "Documento no encontrado" });
    await expect(applyDraftTaskResources("t1", BORRADOR)).resolves.toBe("Documento no encontrado");
  });

  it("⭐ si una acción lanza: el texto fijo y la consola, sin rechazar", async () => {
    sim.vinculos.setTaskLinkedSopAction = async () => {
      throw new TypeError("fetch failed");
    };
    await expect(applyDraftTaskResources("t1", BORRADOR)).resolves.toBe(TEXTO_FIJO);
    expect(consola).toHaveBeenCalledWith("[Workboard] recursos de la tarea nueva", expect.any(TypeError));
  });

  it("⭐ si la subida a Storage lanza: el texto fijo, sin rechazar", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    await expect(uploadTaskAttachmentFile("t1", ARCHIVO)).resolves.toEqual({ ok: false, error: TEXTO_FIJO });
    expect(consola).toHaveBeenCalledWith("[Workboard] subir adjunto", expect.any(TypeError));
  });

  it("un formato rechazado al preparar la subida vuelve con su motivo", async () => {
    sim.vinculos.prepareTaskAttachmentUploadAction = async () => ({
      success: false,
      error: "Formato no permitido para adjuntos de tarea.",
    });
    await expect(uploadTaskAttachmentFile("t1", ARCHIVO)).resolves.toEqual({
      ok: false,
      error: "Formato no permitido para adjuntos de tarea.",
    });
  });
});
