import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-108 · riesgo R1 del informe de errores: una lectura de permisos que
 * falla no puede terminar en permisos abiertos. Antes, un error de PostgREST
 * en `profiles` (o en `team_roles`) se tomaba como "no hay fila" y la función
 * devolvía `hasRoleConfigured: false`: sin rol el bloqueo por módulo no corre
 * y un miembro con rol limitado entraba a todo. Ahora lanza `FallaDeLaBase`.
 *
 * Se prueba la función real con un Supabase simulado. Cuando las lecturas
 * salen bien, el resultado no cambia (también lo cubre `permisos-sin-log`).
 */

type ErrorDeTabla = { message: string; code: string } | null;
type Tabla = "profiles" | "organizations" | "team_roles";

const TIMEOUT = { message: "canceling statement due to statement timeout", code: "57014" };

const sim = vi.hoisted(() => ({
  usuario: { id: "user-1" } as { id: string } | null,
  errorDeAuth: null as { message: string; status?: number; code?: string } | null,
  filas: {} as Record<string, Record<string, unknown> | null>,
  errores: {} as Record<string, { message: string; code: string } | null>,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: sim.usuario }, error: sim.errorDeAuth }),
    },
    from(tabla: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({
          data: sim.errores[tabla] ? null : sim.filas[tabla],
          error: sim.errores[tabla] ?? null,
        }),
      };
      return builder;
    },
  }),
}));

import { getCurrentUserPermissions } from "../get-current-permissions";
import { FallaDeLaBase } from "@/lib/server/action-result";

beforeEach(() => {
  sim.usuario = { id: "user-1" };
  sim.errorDeAuth = null;
  sim.filas = {
    profiles: { role: "member", custom_role_id: "rol-1", organization_id: "org-1" },
    organizations: { enabled_add_ons: [] },
    team_roles: { permissions: { dashboard: "full", finance: "none" } },
  };
  sim.errores = {};
});

describe("⭐ una lectura de permisos que falla lanza, nunca abre el acceso", () => {
  it.each<[Tabla]>([["profiles"], ["organizations"], ["team_roles"]])(
    "error en %s → FallaDeLaBase con su código",
    async (tabla) => {
      sim.errores[tabla] = TIMEOUT as ErrorDeTabla;
      const promesa = getCurrentUserPermissions();
      await expect(promesa).rejects.toBeInstanceOf(FallaDeLaBase);
      await expect(promesa).rejects.toMatchObject({ code: "57014" });
    }
  );

  it.each([
    ["sin respuesta (status 0)", 0],
    ["un 5xx", 503],
  ])("Auth caído, %s → lanza", async (_caso, status) => {
    sim.usuario = null;
    sim.errorDeAuth = { message: "fetch failed", status };
    await expect(getCurrentUserPermissions()).rejects.toBeInstanceOf(FallaDeLaBase);
  });
});

describe("lo que no cambia cuando las lecturas salen bien", () => {
  it("un miembro con rol lee sus módulos y el rol cuenta", async () => {
    const permisos = await getCurrentUserPermissions();
    expect(permisos.hasRoleConfigured).toBe(true);
    expect(permisos.modules.finance).toBe("none");
    expect(permisos.modules.dashboard).toBe("full");
  });

  it("sin sesión (Auth responde 400/401) sigue siendo 'sin usuario', sin lanzar", async () => {
    sim.usuario = null;
    sim.errorDeAuth = { message: "Auth session missing!", status: 400 };
    await expect(getCurrentUserPermissions()).resolves.toMatchObject({
      role: "viewer",
      hasRoleConfigured: false,
    });
    sim.errorDeAuth = { message: "invalid JWT", status: 401 };
    await expect(getCurrentUserPermissions()).resolves.toMatchObject({ hasRoleConfigured: false });
  });

  it("un perfil que no existe (sin error) sigue siendo 'sin rol', como antes", async () => {
    sim.filas.profiles = null;
    await expect(getCurrentUserPermissions()).resolves.toMatchObject({
      role: "viewer",
      hasRoleConfigured: false,
    });
  });
});
