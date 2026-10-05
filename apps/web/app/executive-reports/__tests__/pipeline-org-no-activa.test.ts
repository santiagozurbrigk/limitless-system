import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-210 · el botón "Generar reporte ahora" (`triggerWeeklyPipelineAction`)
 * no gasta IA para una org pausada o dada de baja: no llama a ninguno de sus
 * tres reportes (Operaciones, ejecutivo semanal e inteligencia) y avisa.
 */

const sim = vi.hoisted(() => ({
  status: "active" as string,
  errorAlChequear: null as { message: string } | null,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-auth", () => ({
  requireAuthContext: async () => ({ orgId: "org-1", role: "founder" }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(tabla: string) {
      expect(tabla).toBe("organizations");
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () =>
          sim.errorAlChequear
            ? { data: null, error: sim.errorAlChequear }
            : { data: { status: sim.status }, error: null },
      };
      return builder;
    },
  }),
}));

const reportes = vi.hoisted(() => ({
  operaciones: vi.fn(
    async (): Promise<
      | { success: true; data: undefined }
      | { success: false; error: string; motivo: "org-no-activa" | "sin-inputs" | "falla" }
    > => ({ success: true, data: undefined })
  ),
  ejecutivo: vi.fn(async () => "generated" as const),
  inteligencia: vi.fn(async () => "generated" as const),
}));
vi.mock("@/app/operations/actions", () => ({ generateWeeklyReportAction: reportes.operaciones }));
vi.mock("@/lib/executive-reports/generate-weekly", () => ({
  generateAndSaveWeeklyExecutiveReport: reportes.ejecutivo,
}));
vi.mock("@/lib/intelligence/generate-snapshot", () => ({
  generateAndSaveIntelligenceSnapshot: reportes.inteligencia,
}));

import { triggerWeeklyPipelineAction } from "../report-generation-actions";
import { AVISO_ORG_NO_ACTIVA } from "@/lib/intelligence/organizaciones-activas";

beforeEach(() => {
  sim.status = "active";
  sim.errorAlChequear = null;
  reportes.operaciones.mockClear();
  reportes.operaciones.mockImplementation(async () => ({ success: true, data: undefined }));
  reportes.ejecutivo.mockClear();
  reportes.inteligencia.mockClear();
});

describe("triggerWeeklyPipelineAction", () => {
  it.each(["paused", "churned"])(
    "⭐ con la org %s no llama a ningún reporte del botón y avisa",
    async (status) => {
      sim.status = status;
      await expect(triggerWeeklyPipelineAction()).resolves.toEqual({
        operationsReport: "skipped",
        executiveReport: "skipped",
        intelligence: "skipped",
        errors: [AVISO_ORG_NO_ACTIVA],
      });
      expect(reportes.operaciones).not.toHaveBeenCalled();
      expect(reportes.ejecutivo).not.toHaveBeenCalled();
      expect(reportes.inteligencia).not.toHaveBeenCalled();
    }
  );

  it("con la org activa genera los tres, sin aviso", async () => {
    const r = await triggerWeeklyPipelineAction();
    expect(r.errors).toEqual([]);
    expect(reportes.operaciones).toHaveBeenCalledTimes(1);
    expect(reportes.ejecutivo).toHaveBeenCalledWith("org-1");
    expect(reportes.inteligencia).toHaveBeenCalledWith("org-1");
  });

  it("si la base falla al comprobar, sigue: cada generador vuelve a comprobar por su cuenta", async () => {
    sim.errorAlChequear = { message: "fallo de red" };
    const r = await triggerWeeklyPipelineAction();
    expect(r.errors).not.toContain(AVISO_ORG_NO_ACTIVA);
    expect(reportes.ejecutivo).toHaveBeenCalled();
  });
});

describe("cómo cuenta el paso de Operaciones (igual que antes)", () => {
  it("⭐ sin inputs queda omitido, con el mensaje en errors", async () => {
    reportes.operaciones.mockImplementation(async () => ({
      success: false,
      error: "No hay inputs para esta semana todavía.",
      motivo: "sin-inputs",
    }));
    const r = await triggerWeeklyPipelineAction();
    expect(r.operationsReport).toBe("skipped");
    expect(r.errors).toContain("No hay inputs para esta semana todavía.");
  });

  it("⭐ otra falla queda fallida, con su mensaje", async () => {
    reportes.operaciones.mockImplementation(async () => ({
      success: false,
      error: "La IA no devolvió un reporte válido.",
      motivo: "falla",
    }));
    const r = await triggerWeeklyPipelineAction();
    expect(r.operationsReport).toBe("failed");
    expect(r.errors).toContain("La IA no devolvió un reporte válido.");
  });

  it("un error inesperado (lanzado) también queda fallido y el resto sigue", async () => {
    reportes.operaciones.mockImplementation(async () => {
      throw new Error("Unauthorized");
    });
    const r = await triggerWeeklyPipelineAction();
    expect(r.operationsReport).toBe("failed");
    expect(r.errors).toContain("Unauthorized");
    expect(reportes.ejecutivo).toHaveBeenCalled();
  });

  it("generado cuando la acción devuelve éxito", async () => {
    const r = await triggerWeeklyPipelineAction();
    expect(r.operationsReport).toBe("generated");
  });
});
