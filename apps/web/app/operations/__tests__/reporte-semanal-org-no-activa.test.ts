import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-210 · el reporte semanal de Operaciones (`generateWeeklyReportAction`,
 * lo piden el botón de Inputs semanales y el de "Generar reporte ahora") no
 * llama a la IA para una org pausada o dada de baja, ni deja el reporte
 * marcado como "generating".
 */

const sim = vi.hoisted(() => ({ status: "active" as string, tablas: [] as string[] }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
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
  requireAuthContext: async () => ({
    orgId: "org-1",
    supabase: {
      from(tabla: string) {
        sim.tablas.push(tabla);
        const builder = {
          select: () => builder,
          eq: () => builder,
          upsert: async () => ({ error: null }),
          then(resolver: (r: unknown) => void) {
            // Sin inputs: la action corta antes de la IA con su propio mensaje.
            resolver({ data: [], error: null });
          },
        };
        return builder;
      },
    },
  }),
}));
const ia = vi.hoisted(() => ({ callClaudeJson: vi.fn() }));
vi.mock("@/lib/ai/anthropic", () => ({ callClaudeJson: ia.callClaudeJson }));

import { generateWeeklyReportAction } from "../actions";
import { AVISO_ORG_NO_ACTIVA } from "@/lib/intelligence/organizaciones-activas";

beforeEach(() => {
  sim.status = "active";
  sim.tablas = [];
  ia.callClaudeJson.mockClear();
});

describe("generateWeeklyReportAction", () => {
  it.each(["paused", "churned"])(
    "⭐ con la org %s corta con el aviso, sin tocar la IA ni los reportes",
    async (status) => {
      sim.status = status;
      await expect(generateWeeklyReportAction()).rejects.toThrow(AVISO_ORG_NO_ACTIVA);
      expect(ia.callClaudeJson).not.toHaveBeenCalled();
      expect(sim.tablas).toEqual([]);
    }
  );

  it("con la org activa sigue su camino normal (aquí, sin inputs de la semana)", async () => {
    await expect(generateWeeklyReportAction()).rejects.toThrow("No hay inputs");
    expect(sim.tablas).toContain("weekly_inputs");
  });
});
