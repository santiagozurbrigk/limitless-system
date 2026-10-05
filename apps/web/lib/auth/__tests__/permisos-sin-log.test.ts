import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-121 · [PERMISOS-LOG]: leer los permisos de un miembro no escribe en
 * los registros del servidor su usuario, su rol ni sus módulos. Esto corre en
 * cada pantalla de la plataforma, así que un log ahí deja esos datos de todos
 * los miembros en los registros.
 */

const filas = vi.hoisted(() => ({
  profiles: { role: "member", custom_role_id: "rol-1", organization_id: "org-1" } as Record<string, unknown>,
  organizations: { enabled_add_ons: ["growth_partners"] } as Record<string, unknown>,
  team_roles: { permissions: { clients: "view", settings: "none" } } as Record<string, unknown>,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from(tabla: keyof typeof filas) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data: filas[tabla], error: null }),
      };
      return builder;
    },
  }),
}));

import { getCurrentUserPermissions } from "../get-current-permissions";

const consola = ["log", "info", "debug", "warn", "error"] as const;
let espias: Array<ReturnType<typeof vi.spyOn>> = [];

beforeEach(() => {
  espias = consola.map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
});
afterEach(() => {
  espias.forEach((e) => e.mockRestore());
});

describe("getCurrentUserPermissions", () => {
  it("⭐ los permisos de un miembro se leen sin escribir nada en los registros", async () => {
    const permisos = await getCurrentUserPermissions();

    expect(permisos.role).toBe("member");
    expect(permisos.modules.clients).toBe("view");
    expect(permisos.hasRoleConfigured).toBe(true);
    for (const espia of espias) expect(espia).not.toHaveBeenCalled();
  });
});
