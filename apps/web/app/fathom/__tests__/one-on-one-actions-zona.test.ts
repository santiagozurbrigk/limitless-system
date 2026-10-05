/**
 * SCRUM-493: la lista de 1-1 de la ficha (`getClientOneOnOnesAction`) muestra
 * cada llamada con el día de la zona de la organización, el mismo que usa el
 * resumen ("última ayer"). Una 1-1 del jueves 1-oct a las 22:00 de Argentina es
 * del 1, aunque en UTC ya sea el 2. La zona se lee una sola vez por pedido.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { conZona, restaurarZona } from "@/lib/fechas/__tests__/zona";

const sim = vi.hoisted(() => ({
  zona: "America/Argentina/Buenos_Aires" as string | null,
  llamadas: [] as Record<string, unknown>[],
  lecturasDeZona: 0,
}));

vi.mock("@/lib/auth/bootstrap", () => ({ requireOrganizationId: vi.fn(async () => "org-1") }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

function cliente(tablaDeLaLlamada: (tabla: string) => unknown) {
  return {
    from(tabla: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        not: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => {
          if (tabla === "organizations") {
            sim.lecturasDeZona += 1;
            return { data: { timezone: sim.zona }, error: null };
          }
          return { data: { id: "cliente-1" }, error: null };
        },
        then(resolver: (r: unknown) => void) {
          resolver(tablaDeLaLlamada(tabla));
        },
      };
      return builder;
    },
  };
}

const respuesta = (tabla: string) =>
  tabla === "fathom_calls" ? { data: sim.llamadas, error: null } : { data: [], error: null };

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => cliente(respuesta) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => cliente(respuesta) }));

import { getClientOneOnOnesAction } from "../one-on-one-actions";

beforeEach(() => {
  sim.zona = "America/Argentina/Buenos_Aires";
  sim.lecturasDeZona = 0;
  sim.llamadas = [
    {
      id: "llamada-1",
      title: "1-1",
      // Jueves 1-oct 22:00 ART = viernes 2-oct 01:00 UTC.
      call_date: "2026-10-02T01:00:00Z",
      duration_seconds: 1800,
      fathom_url: null,
      ai_situation_summary: null,
      ai_next_steps: null,
      ingest_source: null,
      transcript: null,
    },
  ];
  vi.useFakeTimers();
  // Viernes 2-oct 15:00 ART.
  vi.setSystemTime(new Date("2026-10-02T18:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  restaurarZona();
});

describe("⭐ lista de 1-1 de la ficha en la zona de la organización", () => {
  it("la 1-1 del jueves a las 22:00 figura el jueves, y el resumen dice que fue ayer", async () => {
    conZona("UTC");
    const resultado = await getClientOneOnOnesAction("cliente-1");
    expect(resultado.calls[0]?.date).toBe("2026-10-01");
    expect(resultado.stats.lastDate).toBe("2026-10-01");
    expect(resultado.stats.daysSinceLast).toBe(1);
    // Una sola lectura de la zona para la lista y el contador.
    expect(sim.lecturasDeZona).toBe(1);
  });
});
