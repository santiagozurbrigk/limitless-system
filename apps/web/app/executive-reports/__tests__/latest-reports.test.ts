/**
 * SCRUM-67: el panel muestra el último reporte de cada cadencia aunque haya
 * muchos más reportes de otra cadencia. Antes se traían los últimos 60 de
 * cualquier cadencia: el mensual guarda el día 1 del mes que reporta y, hacia
 * fin de mes, los diarios lo dejaban afuera.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

type Fila = Record<string, unknown>;
const estado = vi.hoisted(() => ({ filas: [] as Fila[], fallaEn: null as string | null }));

vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/auth/bootstrap", () => ({ requireOrganizationId: async () => "org-a" }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => {
      const filtros: Array<(f: Fila) => boolean> = [];
      let limite = Infinity;
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => {
          if (c === "period") (q as { periodo?: unknown }).periodo = v;
          filtros.push((f) => f[c] === v);
          return q;
        },
        order: () => q,
        limit: (n: number) => ((limite = n), q),
        then: (ok: (r: unknown) => unknown) =>
          (q as { periodo?: unknown }).periodo === estado.fallaEn
            ? Promise.resolve({ data: null, error: { message: "timeout" } }).then(ok)
            : Promise.resolve({
            data: estado.filas
              .filter((f) => filtros.every((fn) => fn(f)))
              .sort((a, b) => String(b.period_start).localeCompare(String(a.period_start)))
              .slice(0, limite),
            error: null,
          }).then(ok),
      };
      return q;
    },
  }),
}));

import { getLatestReportsByCadenceAction } from "../actions";

function reporte(period: string, periodStart: string): Fila {
  return {
    id: `${period}-${periodStart}`,
    organization_id: "org-a",
    period,
    period_start: periodStart,
    week_label: periodStart,
    title: `${period} ${periodStart}`,
    executive_summary: "",
    risks: [],
    bottlenecks: [],
    recommendations: [],
    departments: [],
    generated_at: `${periodStart}T13:00:00Z`,
  };
}

describe("getLatestReportsByCadenceAction", () => {
  beforeEach(() => {
    estado.filas = [];
    estado.fallaEn = null;
  });

  it("⭐ el mensual sigue apareciendo aunque haya más de 60 diarios más nuevos", async () => {
    // El mensual de septiembre se guarda con period_start 1-sep. Al 25-oct ya
    // hay 55 diarios posteriores, más los semanales.
    estado.filas.push(reporte("monthly", "2026-09-01"));
    for (let d = 1; d <= 30; d++) estado.filas.push(reporte("daily", `2026-09-${String(d).padStart(2, "0")}`));
    for (let d = 1; d <= 25; d++) estado.filas.push(reporte("daily", `2026-10-${String(d).padStart(2, "0")}`));
    for (const lunes of ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19"]) {
      estado.filas.push(reporte("weekly", lunes));
    }
    const r = await getLatestReportsByCadenceAction();
    expect(r.monthly?.id).toBe("monthly-2026-09-01");
    expect(r.daily?.id).toBe("daily-2026-10-25");
    expect(r.weekly?.id).toBe("weekly-2026-10-19");
  });

  it("una cadencia sin reportes queda en null", async () => {
    estado.filas.push(reporte("daily", "2026-10-25"));
    const r = await getLatestReportsByCadenceAction();
    expect(r.daily).not.toBeNull();
    expect(r.weekly).toBeNull();
    expect(r.monthly).toBeNull();
  });

  it("no mezcla reportes de otra organización", async () => {
    estado.filas.push({ ...reporte("monthly", "2026-09-01"), organization_id: "org-b" });
    const r = await getLatestReportsByCadenceAction();
    expect(r.monthly).toBeNull();
  });

  it("si falla la consulta de una cadencia, no muestra el panel a medias", async () => {
    estado.filas.push(reporte("weekly", "2026-10-19"), reporte("daily", "2026-10-25"));
    estado.fallaEn = "weekly";
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(getLatestReportsByCadenceAction()).rejects.toThrow(/No se pudieron cargar/);
  });
});
