/**
 * SCRUM-18 · [PERMISOS-FOUNDER-AREA]: el resumen de Inteligencia que muestran
 * `/founder` y `/intelligence` es una Server Action exportada. Invocarla a mano
 * sin acceso a Operaciones no lee nada, aunque no se abra ninguna pantalla.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyPermissions } from "@/constants/permission-modules";
import type { UserPermissions } from "@/lib/auth/get-current-permissions";

const sim = vi.hoisted(() => ({
  permisos: null as unknown as UserPermissions,
  consultas: [] as string[],
}));

vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/auth/get-current-permissions", () => ({
  getCurrentUserPermissions: async () => sim.permisos,
}));
vi.mock("@/lib/auth/bootstrap", () => ({
  requireOrganizationId: async () => "org-1",
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from(tabla: string) {
      sim.consultas.push(tabla);
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => ({
          data: {
            insights: [{ id: "i-1" }],
            recommendations: [],
            bottlenecks: [],
            opportunities: [],
            memory_chunks: [],
            generated_at: "2026-10-01T12:00:00Z",
          },
          error: null,
        }),
      };
      return builder;
    },
  }),
}));

import { getIntelligenceSnapshotAction } from "../actions";

function member(
  modulos: Partial<UserPermissions["modules"]>,
  hasRoleConfigured = true
): UserPermissions {
  return {
    role: "member",
    isFounder: false,
    modules: { ...emptyPermissions(), ...modulos },
    hasRoleConfigured,
    enabledAddOns: [],
  };
}

beforeEach(() => {
  sim.consultas = [];
});

describe("getIntelligenceSnapshotAction", () => {
  it("⭐ llamada a mano por un member sin Operaciones: error de permiso y no lee el resumen", async () => {
    sim.permisos = member({ dashboard: "full", finance: "full" });
    await expect(getIntelligenceSnapshotAction()).rejects.toThrow(
      "No tenés acceso a Operaciones."
    );
    expect(sim.consultas).toEqual([]);
  });

  it("el founder, un member con Operaciones y alguien sin rol reciben el resumen", async () => {
    const casos: UserPermissions[] = [
      {
        role: "founder",
        isFounder: true,
        modules: emptyPermissions(),
        hasRoleConfigured: true,
        enabledAddOns: [],
      },
      member({ operations: "view" }),
      member({}, false),
    ];
    for (const permisos of casos) {
      sim.permisos = permisos;
      sim.consultas = [];
      const snapshot = await getIntelligenceSnapshotAction();
      expect(snapshot.insights).toHaveLength(1);
      expect(sim.consultas).toEqual(["intelligence_snapshots"]);
    }
  });
});
