/**
 * SCRUM-493: las tareas que salen de una 1-1 se calculan desde el día de la
 * llamada **en la zona de la organización**. Una 1-1 del jueves 1-oct a las
 * 22:00 de Argentina es del jueves; cortar el instante en UTC la pasaba al
 * viernes 2, y "para mañana" quedaba el 3 en vez del 2.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { conZona, restaurarZona } from "@/lib/fechas/__tests__/zona";

const sim = vi.hoisted(() => ({
  zona: "America/Argentina/Buenos_Aires" as string | null,
  pedidos: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/fathom/one-on-one-tasks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/fathom/one-on-one-tasks")>()),
  extractOneOnOneTasks: vi.fn(async (params: Record<string, unknown>) => {
    sim.pedidos.push(params);
    return { tasks: [], outcome: "ok" };
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(tabla: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        update: () => builder,
        maybeSingle: async () =>
          tabla === "organizations"
            ? { data: { timezone: sim.zona }, error: null }
            : tabla === "clients"
              ? { data: { name: "Ana" }, error: null }
              : { data: null, error: null },
        then(resolver: (r: unknown) => void) {
          resolver({ data: null, error: null });
        },
      };
      return builder;
    },
  }),
}));

import { contextoDelPrompt } from "@/lib/fathom/one-on-one-tasks";
import { maybeExtractOneOnOneTasks } from "../client-tasks";

beforeEach(() => {
  sim.zona = "America/Argentina/Buenos_Aires";
  sim.pedidos = [];
});

afterEach(restaurarZona);

describe("⭐ el día de la 1-1 que va al prompt de tareas", () => {
  it("una 1-1 del jueves 1-oct a las 22:00 de Argentina va como 2026-10-01", async () => {
    conZona("UTC");
    await maybeExtractOneOnOneTasks({
      callId: "llamada-1",
      organizationId: "org-1",
      clientId: "cliente-1",
      purpose: "delivery",
      transcript: "Para mañana mandás la propuesta.",
      callDate: "2026-10-02T01:00:00Z",
    });
    expect(sim.pedidos).toHaveLength(1);
    expect(sim.pedidos[0]?.fechaDeLaLlamada).toBe("2026-10-01");
  });

  it("organización sin zona: la de por defecto", async () => {
    conZona("UTC");
    sim.zona = null;
    await maybeExtractOneOnOneTasks({
      callId: "llamada-1",
      organizationId: "org-1",
      clientId: "cliente-1",
      purpose: "delivery",
      transcript: "Algo.",
      callDate: "2026-10-02T01:00:00Z",
    });
    expect(sim.pedidos[0]?.fechaDeLaLlamada).toBe("2026-10-01");
  });

  it("el prompt lleva ese día tal cual", () => {
    expect(contextoDelPrompt({ clientName: "Ana", fechaDeLaLlamada: "2026-10-01" })).toBe(
      "Cliente: Ana\nFecha de la llamada: 2026-10-01"
    );
    expect(contextoDelPrompt({ clientName: null, fechaDeLaLlamada: null })).toBe("");
  });
});
