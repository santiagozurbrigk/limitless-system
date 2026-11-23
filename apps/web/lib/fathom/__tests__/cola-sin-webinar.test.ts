/**
 * SCRUM-525 · La cola de Fathom no analiza con IA las llamadas de una cuenta
 * webinar: las deja afuera en la consulta, con un join a `organizations` por
 * su experiencia (revisión de #153: un test de comportamiento, no de texto).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const sim = vi.hoisted(() => ({
  llamadas: [] as Array<[string, unknown[]]>,
  error: null as { message: string } | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(tabla: string) {
      sim.llamadas.push(["from", [tabla]]);
      const builder: Record<string, unknown> = {};
      for (const metodo of ["select", "eq", "lte", "not", "order"]) {
        builder[metodo] = (...args: unknown[]) => {
          sim.llamadas.push([metodo, args]);
          return builder;
        };
      }
      builder.limit = (...args: unknown[]) => {
        sim.llamadas.push(["limit", args]);
        return Promise.resolve({ data: sim.error ? null : [], error: sim.error });
      };
      return builder;
    },
  }),
}));

import { FILTRO_SIN_PROCESOS_DE_FONDO, processPendingFathomCalls } from "../process-call";

beforeEach(() => {
  sim.llamadas = [];
  sim.error = null;
});

describe("⭐ processPendingFathomCalls deja afuera las cuentas webinar", () => {
  it("une con organizations (inner) y excluye su experiencia en la consulta", async () => {
    await expect(processPendingFathomCalls(50)).resolves.toBe(0);
    expect(sim.llamadas).toContainEqual(["from", ["fathom_calls"]]);
    const select = sim.llamadas.find(([m]) => m === "select")?.[1][0];
    expect(select).toMatch(/organizations!inner\(experience\)/);
    expect(sim.llamadas).toContainEqual(["not", ["organizations.experience", "in", "(webinar)"]]);
    expect(FILTRO_SIN_PROCESOS_DE_FONDO).toBe("(webinar)");
  });

  it("si la consulta falla, lanza: el cron no dice `ok` con 0 procesadas", async () => {
    sim.error = { message: "URI too long" };
    await expect(processPendingFathomCalls(50)).rejects.toThrow("URI too long");
  });
});
