import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-4 · [CLOSING-LIST-1000]: Closing trae todos los turnos de la org activa,
 * aunque pasen el corte de 1.000 filas de PostgREST, y nunca los de otra org.
 */

const sim = vi.hoisted(() => ({
  filas: [] as Array<{ id: string; organization_id: string; scheduled_at: string }>,
  filtrosOrg: [] as unknown[],
}));

vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/auth/bootstrap", () => ({
  tryRequireOrganizationId: async () => "org-1",
  requireOrganizationId: async () => "org-1",
  isMissingTableError: () => false,
}));
vi.mock("@/lib/conversations/repair-links", () => ({
  repairClosingConversationLinks: async () => undefined,
}));
vi.mock("@/lib/ghl/integration", () => ({ getGHLIntegrationForOrg: async () => null }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/closing/mapper", () => ({
  rowToClosingCall: (row: { id: string; scheduled_at: string }) => ({
    id: row.id,
    scheduledAt: row.scheduled_at,
  }),
  patchToClosingUpdateRow: () => ({}),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from() {
      let org: unknown = null;
      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          if (col === "organization_id") {
            org = val;
            sim.filtrosOrg.push(val);
          }
          return builder;
        },
        or: () => builder,
        order: () => builder,
        range: async (from: number, to: number) => {
          // PostgREST: nunca devuelve más de 1.000 filas por pedido.
          const visibles = sim.filas.filter((f) => !org || f.organization_id === org);
          return { data: visibles.slice(from, Math.min(to + 1, from + 1000)), error: null };
        },
      };
      return builder;
    },
  }),
}));

import { listClosingCallsAction } from "@/app/closing/actions";

beforeEach(() => {
  sim.filtrosOrg = [];
  sim.filas = [];
  const inicio = Date.UTC(2025, 0, 1);
  for (let i = 0; i < 1455; i++) {
    sim.filas.push({
      id: `org1-${i}`,
      organization_id: "org-1",
      scheduled_at: new Date(inicio + i * 3_600_000).toISOString(),
    });
  }
  sim.filas.push({ id: "otra-org", organization_id: "org-2", scheduled_at: "2026-10-03T12:00:00Z" });
});

describe("listClosingCallsAction", () => {
  it("trae los 1.455 turnos, incluidos los más nuevos que antes quedaban afuera", async () => {
    const calls = await listClosingCallsAction();
    expect(calls).toHaveLength(1455);
    expect(calls.at(-1)?.id).toBe("org1-1454");
  });

  it("filtra por la organización activa: un turno de otra org no aparece", async () => {
    const calls = await listClosingCallsAction();
    expect(calls.map((c) => c.id)).not.toContain("otra-org");
    expect(new Set(sim.filtrosOrg)).toEqual(new Set(["org-1"]));
  });
});
