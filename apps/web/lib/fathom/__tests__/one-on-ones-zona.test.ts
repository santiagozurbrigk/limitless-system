/**
 * SCRUM-493: el contador de 1-1 de la ficha (`loadClientOneOnOneStats`) cuenta
 * en la zona de la organización: el día de cada llamada y el de hoy. El
 * servidor corre en UTC, así que el proceso se fija en UTC y la base se simula
 * con un cliente encadenable.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { conZona, restaurarZona } from "@/lib/fechas/__tests__/zona";

const sim = vi.hoisted(() => ({
  zona: "America/Argentina/Buenos_Aires" as string | null,
  llamadas: [] as { call_date: string }[],
  filtrosDeLaZona: [] as [string, unknown][],
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(tabla: string) {
      const builder = {
        select: () => builder,
        eq: (columna: string, valor: unknown) => {
          if (tabla === "organizations") sim.filtrosDeLaZona.push([columna, valor]);
          return builder;
        },
        not: () => builder,
        order: () => builder,
        maybeSingle: async () => ({ data: { timezone: sim.zona }, error: null }),
        then(resolver: (r: unknown) => void) {
          resolver({ data: sim.llamadas, error: null });
        },
      };
      return builder;
    },
  }),
}));

import { loadClientOneOnOneStats, loadLastOneOnOneByClient } from "../one-on-ones";

beforeEach(() => {
  sim.zona = "America/Argentina/Buenos_Aires";
  sim.llamadas = [];
  sim.filtrosDeLaZona = [];
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  restaurarZona();
});

describe("⭐ loadClientOneOnOneStats en la zona de la organización", () => {
  it("una 1-1 a las 22:00 de Argentina del 1, mirada el 2 a la tarde, es de hace 1 día", async () => {
    conZona("UTC");
    // 2-oct 15:00 ART = 18:00 UTC.
    vi.setSystemTime(new Date("2026-10-02T18:00:00Z"));
    sim.llamadas = [{ call_date: "2026-10-02T01:00:00Z" }];
    const stats = await loadClientOneOnOneStats("org-1", "cliente-1");
    expect(stats.lastDate).toBe("2026-10-01");
    expect(stats.daysSinceLast).toBe(1);
    expect(sim.filtrosDeLaZona).toEqual([["id", "org-1"]]);
  });

  it("mirada a las 22:00 del mismo día, es de hace 0 días", async () => {
    conZona("UTC");
    // 1-oct 23:00 ART = 2-oct 02:00 UTC.
    vi.setSystemTime(new Date("2026-10-02T02:00:00Z"));
    sim.llamadas = [{ call_date: "2026-10-02T01:00:00Z" }];
    expect((await loadClientOneOnOneStats("org-1", "cliente-1")).daysSinceLast).toBe(0);
  });
});

describe("loadLastOneOnOneByClient en la zona de la organización", () => {
  it("la fecha de la última 1-1 es la del día de la org", async () => {
    conZona("UTC");
    sim.llamadas = [
      {
        client_id: "cliente-1",
        call_date: "2026-10-02T01:00:00Z",
        resolution_method: "email",
        title: "1-1",
        fathom_url: null,
      } as unknown as { call_date: string },
    ];
    const ultimas = await loadLastOneOnOneByClient("org-1");
    expect(ultimas["cliente-1"]?.date).toBe("2026-10-01");
    expect(sim.filtrosDeLaZona).toEqual([["id", "org-1"]]);
  });
});
