import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRedirectError } from "next/dist/client/components/redirect";
import { RedirectType } from "next/dist/client/components/redirect-error";

/**
 * SCRUM-210 · el reporte semanal de Operaciones (`generateWeeklyReportAction`,
 * lo piden el botón de Inputs semanales y el de "Generar reporte ahora") no
 * llama a la IA para una org pausada o dada de baja, ni deja el reporte
 * marcado como "generating".
 */

const sim = vi.hoisted(() => ({
  status: "active" as string,
  tablas: [] as string[],
  inputs: [] as Array<Record<string, unknown>>,
  errorInputs: null as { message: string } | null,
  updates: [] as Array<Record<string, unknown>>,
  upserts: [] as Array<Record<string, unknown>>,
  errorAlMarcarGenerating: null as { message: string } | null,
  configurado: true,
  fallaAuth: null as unknown,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => sim.configurado }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from() {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data: { status: sim.status }, error: null }),
      };
      return builder;
    },
  }),
}));
vi.mock("@/lib/auth/require-auth", () => ({
  requireAuthContext: async () => {
    if (sim.fallaAuth) throw sim.fallaAuth;
    return {
    orgId: "org-1",
    supabase: {
      from(tabla: string) {
        sim.tablas.push(tabla);
        const builder = {
          select: () => builder,
          eq: () => builder,
          gte: () => builder,
          lt: () => builder,
          upsert: async (fila: Record<string, unknown>) => {
            sim.upserts.push(fila);
            if (fila.status === "generating" && sim.errorAlMarcarGenerating) {
              return { error: sim.errorAlMarcarGenerating };
            }
            return { error: null };
          },
          update(cambios: Record<string, unknown>) {
            sim.updates.push(cambios);
            return builder;
          },
          then(resolver: (r: unknown) => void) {
            if (tabla === "weekly_inputs") {
              resolver({ data: sim.errorInputs ? null : sim.inputs, error: sim.errorInputs });
            } else {
              resolver({ data: [], error: null });
            }
          },
        };
        return builder;
      },
    },
    };
  },
}));
const ia = vi.hoisted(() => ({ callClaudeJson: vi.fn(async () => null as unknown) }));
vi.mock("@/lib/ai/anthropic", () => ({ callClaudeJson: ia.callClaudeJson }));
vi.mock("@/lib/ai/org-context", () => ({
  getOrgContext: async () => ({}),
  buildOrgContextText: () => "",
}));

import { generateWeeklyReportAction } from "../actions";
import { AVISO_ORG_NO_ACTIVA } from "@/lib/intelligence/organizaciones-activas";

beforeEach(() => {
  sim.status = "active";
  sim.tablas = [];
  sim.inputs = [];
  sim.errorInputs = null;
  sim.updates = [];
  sim.upserts = [];
  sim.errorAlMarcarGenerating = null;
  sim.configurado = true;
  sim.fallaAuth = null;
  ia.callClaudeJson.mockReset();
  ia.callClaudeJson.mockImplementation(async () => null);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("generateWeeklyReportAction", () => {
  it.each(["paused", "churned"])(
    "⭐ con la org %s devuelve el aviso como valor, sin tocar la IA ni los reportes",
    async (status) => {
      sim.status = status;
      await expect(generateWeeklyReportAction()).resolves.toEqual({
        success: false,
        error: AVISO_ORG_NO_ACTIVA,
        motivo: "org-no-activa",
      });
      expect(ia.callClaudeJson).not.toHaveBeenCalled();
      expect(sim.tablas).toEqual([]);
    }
  );

  it("⭐ sin inputs de la semana devuelve el mensaje como valor (no lanza)", async () => {
    await expect(generateWeeklyReportAction()).resolves.toEqual({
      success: false,
      error: "No hay inputs para esta semana todavía.",
      motivo: "sin-inputs",
    });
    expect(sim.tablas).toContain("weekly_inputs");
    expect(ia.callClaudeJson).not.toHaveBeenCalled();
  });

  it("un error de la base al leer los inputs vuelve como falla, con el mensaje de mapWeeklyError", async () => {
    sim.errorInputs = { message: 'relation "weekly_inputs" does not exist' };
    const r = await generateWeeklyReportAction();
    expect(r).toMatchObject({ success: false, motivo: "falla" });
    expect(r.success === false && r.error).toContain("Faltan tablas weekly_inputs");
  });

  it("si la IA no devuelve un reporte válido, vuelve como falla y el reporte queda en error", async () => {
    sim.inputs = [{ department: "sales", rating: 4, content: "bien" }];
    await expect(generateWeeklyReportAction()).resolves.toEqual({
      success: false,
      error: "La IA no devolvió un reporte válido.",
      motivo: "falla",
    });
    expect(ia.callClaudeJson).toHaveBeenCalledTimes(1);
    expect(sim.updates).toContainEqual({ status: "error" });
  });

  it("⭐ con un JSON válido de la IA devuelve éxito y guarda el reporte como ready", async () => {
    sim.inputs = [{ department: "sales", rating: 4, content: "bien" }];
    ia.callClaudeJson.mockImplementation(async () => ({
      executive_summary: "Semana estable.",
      risks: [],
      bottlenecks: [],
      recommendations: [],
    }));
    await expect(generateWeeklyReportAction()).resolves.toEqual({ success: true, data: undefined });
    expect(sim.upserts.map((u) => u.status)).toEqual(["generating", "ready"]);
    expect(sim.upserts[1]).toMatchObject({ executive_summary: "Semana estable.", organization_id: "org-1" });
    expect(sim.updates).toEqual([]);
  });

  it("⭐ si falla marcar el reporte como generating, vuelve como falla (no sin-inputs) sin llamar a la IA", async () => {
    sim.inputs = [{ department: "sales", rating: 4, content: "bien" }];
    sim.errorAlMarcarGenerating = { message: "timeout" };
    await expect(generateWeeklyReportAction()).resolves.toEqual({
      success: false,
      error: "timeout",
      motivo: "falla",
    });
    expect(ia.callClaudeJson).not.toHaveBeenCalled();
  });

  it("sin Supabase configurado devuelve el motivo como valor, sin tocar nada", async () => {
    sim.configurado = false;
    await expect(generateWeeklyReportAction()).resolves.toEqual({
      success: false,
      error: "Supabase no configurado.",
      motivo: "falla",
    });
    expect(sim.tablas).toEqual([]);
  });

  it("⭐ si requireAuthContext lanza un error, lo relanza (no lo devuelve como valor)", async () => {
    sim.fallaAuth = new Error("Unauthorized");
    await expect(generateWeeklyReportAction()).rejects.toThrow("Unauthorized");
    expect(sim.tablas).toEqual([]);
  });

  it("⭐ si requireAuthContext redirige, deja pasar el redirect de Next", async () => {
    sim.fallaAuth = getRedirectError("/auth/force-password-change", RedirectType.replace);
    await expect(generateWeeklyReportAction()).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT/),
    });
  });
});
