/**
 * SCRUM-493: las fechas que el agente lee de la base son las del día de la
 * organización. Un cliente dado de alta a las 22:00 de Argentina es de ese
 * día, aunque en UTC ya sea el siguiente.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { conZona, restaurarZona } from "@/lib/fechas/__tests__/zona";

vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));

import { handleGetClientsData } from "../data-reader-handlers";

afterEach(restaurarZona);

function supabaseFalso(): SupabaseClient {
  return {
    from(tabla: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => ({
          data: tabla === "organizations" ? { timezone: "America/Argentina/Buenos_Aires" } : null,
          error: null,
        }),
        then(resolver: (r: unknown) => void) {
          resolver({
            data: [
              {
                id: "c1",
                name: "Ana",
                status: "active",
                total_amount: 100,
                // 1-oct 22:00 ART = 2-oct 01:00 UTC.
                created_at: "2026-10-02T01:00:00.000Z",
                notes: null,
              },
            ],
            error: null,
          });
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

describe("⭐ fechas del agente en la zona de la organización", () => {
  it("el alta de un cliente de las 22:00 de Argentina figura con ese día", async () => {
    conZona("UTC");
    const salida = await handleGetClientsData(
      { organizationId: "org-1", supabase: supabaseFalso() },
      {}
    );
    expect(salida).toContain('"fecha":"2026-10-01"');
    expect(salida).not.toContain("2026-10-02");
  });
});
