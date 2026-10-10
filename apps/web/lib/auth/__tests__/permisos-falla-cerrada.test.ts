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
  errorDeAuth: null as { message: string; name?: string; status?: number; code?: string } | null,
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
    ["sin respuesta (status 0)", { name: "AuthRetryableFetchError", status: 0 }],
    ["un 5xx", { name: "AuthApiError", status: 503 }],
    ["⭐ un límite de pedidos (429)", { name: "AuthApiError", status: 429, code: "over_request_rate_limit" }],
    ["un 4xx que no es de sesión", { name: "AuthApiError", status: 422, code: "validation_failed" }],
    ["un 404 sin código", { name: "AuthApiError", status: 404 }],
  ])("Auth con %s → lanza", async (_caso, error) => {
    sim.usuario = null;
    sim.errorDeAuth = { message: "falla de Auth", ...error };
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

  it.each([
    ["sin sesión", { name: "AuthSessionMissingError", status: 400 }],
    ["token inválido (401)", { name: "AuthApiError", status: 401 }],
    ["JWT mal formado", { name: "AuthInvalidJwtError", status: 400, code: "invalid_jwt" }],
    ["JWT rechazado", { name: "AuthApiError", status: 403, code: "bad_jwt" }],
    ["sesión cerrada", { name: "AuthApiError", status: 403, code: "session_not_found" }],
    ["usuario borrado", { name: "AuthApiError", status: 403, code: "user_not_found" }],
    ["refresh token vencido", { name: "AuthApiError", status: 400, code: "refresh_token_not_found" }],
  ])("Auth responde %s → sigue siendo 'sin usuario', sin lanzar", async (_caso, error) => {
    sim.usuario = null;
    sim.errorDeAuth = { message: "sesión", ...error };
    await expect(getCurrentUserPermissions()).resolves.toMatchObject({
      role: "viewer",
      hasRoleConfigured: false,
    });
  });

  it("un perfil que no existe (sin error) sigue siendo 'sin rol', como antes", async () => {
    sim.filas.profiles = null;
    await expect(getCurrentUserPermissions()).resolves.toMatchObject({
      role: "viewer",
      hasRoleConfigured: false,
    });
  });
});
