import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-497 · MENOR-3 de la tercera pasada de la AR: crear un rol con un
 * nombre que ya existe (`UNIQUE (organization_id, name)` de `team_roles`)
 * mostraba "duplicate key value violates unique constraint …" en inglés y
 * abría un evento en Sentry. Es un rechazo esperable.
 */

const sim = vi.hoisted(() => ({
  error: null as { message: string; code?: string } | null,
  inserts: [] as unknown[],
  reportes: [] as unknown[],
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/observability/reportar-falla", () => ({
  reportarFalla: (error: unknown) => sim.reportes.push(error),
}));
vi.mock("@/lib/auth/bootstrap", () => ({
  requireOrganizationId: async () => "org-1",
  getCurrentProfile: async () => ({ id: "yo", organization_id: "org-1", role: "founder" }),
  isMissingTableError: () => false,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from(tabla: string) {
      expect(tabla).toBe("team_roles");
      const builder = {
        insert(fila: unknown) {
          sim.inserts.push(fila);
          return builder;
        },
        select: () => builder,
        single: async () =>
          sim.error
            ? { data: null, error: sim.error }
            : {
                data: {
                  id: "r-nuevo",
                  organization_id: "org-1",
                  name: "Closer senior",
                  description: null,
                  permissions: {},
                  is_default: false,
                },
                error: null,
              },
      };
      return builder;
    },
  }),
}));

import { createCustomRoleAction } from "../actions";

const ROL = { name: "Closer senior", permissions: { sales: "full" as const } };

let consola: ReturnType<typeof vi.spyOn>;
let aviso: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  sim.error = null;
  sim.inserts = [];
  sim.reportes = [];
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
  aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
  return () => {
    consola.mockRestore();
    aviso.mockRestore();
  };
});

describe("createCustomRoleAction", () => {
  it("crea el rol en la organización de la sesión", async () => {
    const r = await createCustomRoleAction(ROL);
    expect(r.success && r.data.id).toBe("r-nuevo");
    expect(sim.inserts[0]).toMatchObject({ organization_id: "org-1", name: "Closer senior" });
  });

  it("⭐ un nombre repetido vuelve con un mensaje en voseo y no se reporta como falla", async () => {
    sim.error = {
      message: 'duplicate key value violates unique constraint "team_roles_organization_id_name_key"',
      code: "23505",
    };
    await expect(createCustomRoleAction(ROL)).resolves.toEqual({
      success: false,
      error: "Ya existe un rol con ese nombre.",
    });
    expect(sim.reportes).toEqual([]);
    expect(consola).not.toHaveBeenCalled();
  });

  it("otra falla de la base se sigue reportando", async () => {
    sim.error = { message: "permission denied for table team_roles", code: "42501" };
    const r = await createCustomRoleAction(ROL);
    expect(r.success).toBe(false);
    expect(sim.reportes).toHaveLength(1);
  });
});
