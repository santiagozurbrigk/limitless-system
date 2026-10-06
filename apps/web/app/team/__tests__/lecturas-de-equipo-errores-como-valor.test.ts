import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-497: las lecturas de Equipo devuelven sus errores como valor
 * (`MutationResult`). `/team` es un server component sin error boundary: una
 * lectura que lanzaba terminaba en la pantalla de error de Next, con un
 * párrafo técnico en inglés en producción, en vez de decir qué pasó.
 */

const FALLO_AL_LEER =
  "Hubo un problema al leer los datos del equipo. Recargá la página para intentar de nuevo.";

type Fila = Record<string, unknown> & { organization_id: string };
type Error_ = { message: string } | null;

const sim = vi.hoisted(() => ({
  reportes: [] as Array<{ error: unknown; contexto: unknown }>,
  configurado: true,
  sesion: true,
  rol: "founder" as string,
  tablas: {} as Record<string, Fila[]>,
  errores: {} as Record<string, Error_>,
  errorRpc: null as Error_,
  rpcs: [] as unknown[],
  filtrosOrg: {} as Record<string, unknown[]>,
}));

vi.mock("@/lib/observability/reportar-falla", () => ({
  reportarFalla: (error: unknown, contexto: unknown) => sim.reportes.push({ error, contexto }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => sim.configurado }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
// Como el real: la sesión que falta es un rechazo esperable.
vi.mock("@/lib/auth/bootstrap", async () => {
  const { ErrorEsperable } = await import("@/lib/server/error-esperable");
  return {
    requireOrganizationId: async () => {
      if (!sim.sesion) throw new ErrorEsperable("Sesión no válida");
      return "org-1";
    },
    getCurrentProfile: async () =>
      sim.sesion ? { id: "yo", organization_id: "org-1", role: sim.rol } : null,
    isMissingTableError: (msg: string) => msg.includes("does not exist"),
  };
});
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (nombre: string, args: { org_id: string }) => {
      sim.rpcs.push({ nombre, args });
      if (!sim.errorRpc) {
        sim.tablas.team_roles.push({
          id: "rol-default",
          organization_id: args.org_id,
          name: "Closer",
          description: null,
          permissions: {},
          is_default: true,
        });
      }
      return { error: sim.errorRpc };
    },
    from(tabla: string) {
      // Aplica los `.eq` pedidos: si una lectura deja de filtrar por
      // organización, trae filas de otra org y el test lo ve.
      const filtros: Array<[string, unknown]> = [];
      const builder = {
        select: () => builder,
        order: () => builder,
        gt: () => builder,
        eq(columna: string, valor: unknown) {
          filtros.push([columna, valor]);
          if (columna === "organization_id") {
            (sim.filtrosOrg[tabla] ??= []).push(valor);
          }
          return builder;
        },
        then(resolver: (r: unknown) => void) {
          const error = sim.errores[tabla] ?? null;
          const data = error
            ? null
            : (sim.tablas[tabla] ?? []).filter((f) => filtros.every(([c, v]) => f[c] === v));
          resolver({ data, error });
        },
      };
      return builder;
    },
  }),
}));

import {
  getPendingInvitationsAction,
  getTeamMembersAction,
  getTeamPageContextAction,
  getTeamRolesAction,
} from "../actions";

function miembro(id: string, organizationId: string): Fila {
  return {
    id,
    organization_id: organizationId,
    full_name: `Persona ${id}`,
    email: `${id}@ejemplo.com`,
    role: "member",
    is_active: true,
    team_roles: null,
  };
}

function rol(id: string, organizationId: string): Fila {
  return {
    id,
    organization_id: organizationId,
    name: `Rol ${id}`,
    description: null,
    permissions: {},
    is_default: false,
  };
}

function invitacion(id: string, organizationId: string): Fila {
  return {
    id,
    organization_id: organizationId,
    email: `${id}@ejemplo.com`,
    role: "member",
    status: "pending",
    expires_at: "2099-01-01T00:00:00Z",
    created_at: "2026-10-01T00:00:00Z",
    custom_role_id: null,
    invited_by: "yo",
    profiles: null,
    team_roles: null,
  };
}

let consola: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  sim.reportes = [];
  sim.configurado = true;
  sim.sesion = true;
  sim.rol = "founder";
  sim.tablas = {
    profiles: [miembro("m1", "org-1"), miembro("m-ajeno", "org-2")],
    team_roles: [rol("r1", "org-1"), rol("r-ajeno", "org-2")],
    team_invitations: [invitacion("i1", "org-1"), invitacion("i-ajena", "org-2")],
  };
  sim.errores = {};
  sim.errorRpc = null;
  sim.rpcs = [];
  sim.filtrosOrg = {};
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
  return () => consola.mockRestore();
});

const ids = (r: { success: boolean; data?: unknown }) =>
  r.success ? (r.data as Array<{ id: string }>).map((x) => x.id) : null;

describe("getTeamMembersAction", () => {
  it("devuelve los miembros de la organización de la sesión, y no los de otra", async () => {
    const r = await getTeamMembersAction();
    expect(ids(r)).toEqual(["m1"]);
    expect(sim.filtrosOrg.profiles).toEqual(["org-1"]);
  });

  it("⭐ una falla de la base vuelve con un texto propio; el detalle va a la consola y a Sentry", async () => {
    sim.errores.profiles = { message: "permission denied for table profiles" };
    await expect(getTeamMembersAction()).resolves.toEqual({ success: false, error: FALLO_AL_LEER });
    const detalle = expect.objectContaining({
      name: "FallaDeLaBase",
      message: "permission denied for table profiles",
    });
    expect(consola).toHaveBeenCalledWith("[getTeamMembers]", detalle);
    expect(sim.reportes).toEqual([{ error: detalle, contexto: { accion: "[getTeamMembers]" } }]);
  });

  it("⭐ una falla de la red que supabase-js devuelve como valor no llega cruda", async () => {
    sim.errores.profiles = { message: "TypeError: fetch failed" };
    const r = await getTeamMembersAction();
    expect(r).toEqual({ success: false, error: FALLO_AL_LEER });
    expect(JSON.stringify(r)).not.toContain("fetch failed");
    expect(sim.reportes).toHaveLength(1);
  });

  it("sin sesión es un rechazo esperable: no se reporta", async () => {
    sim.sesion = false;
    await getTeamMembersAction();
    expect(sim.reportes).toEqual([]);
    expect(consola).not.toHaveBeenCalled();
  });

  it("sin sesión devuelve el motivo", async () => {
    sim.sesion = false;
    await expect(getTeamMembersAction()).resolves.toEqual({
      success: false,
      error: "Sesión no válida",
    });
  });

  it("si falta la tabla devuelve la lista vacía, como antes", async () => {
    sim.errores.profiles = { message: 'relation "profiles" does not exist' };
    await expect(getTeamMembersAction()).resolves.toEqual({ success: true, data: [] });
  });

  it("sin Supabase configurado devuelve la lista vacía", async () => {
    sim.configurado = false;
    await expect(getTeamMembersAction()).resolves.toEqual({ success: true, data: [] });
  });
});

describe("getTeamRolesAction", () => {
  it("devuelve los roles de la organización de la sesión, y no los de otra", async () => {
    const r = await getTeamRolesAction();
    expect(ids(r)).toEqual(["r1"]);
    expect(sim.filtrosOrg.team_roles).toEqual(["org-1"]);
  });

  it("sin roles crea los de fábrica para la organización y los devuelve", async () => {
    sim.tablas.team_roles = [rol("r-ajeno", "org-2")];
    const r = await getTeamRolesAction();
    expect(ids(r)).toEqual(["rol-default"]);
    expect(sim.rpcs).toEqual([{ nombre: "create_default_roles", args: { org_id: "org-1" } }]);
  });

  it("⭐ una falla de la base vuelve con un texto propio", async () => {
    sim.errores.team_roles = { message: "permission denied for table team_roles" };
    await expect(getTeamRolesAction()).resolves.toEqual({ success: false, error: FALLO_AL_LEER });
  });

  it("si falla la creación de los roles de fábrica vuelve con un texto propio", async () => {
    sim.tablas.team_roles = [];
    sim.errorRpc = { message: "function create_default_roles failed" };
    await expect(getTeamRolesAction()).resolves.toEqual({ success: false, error: FALLO_AL_LEER });
  });

  it("sin sesión devuelve el motivo", async () => {
    sim.sesion = false;
    await expect(getTeamRolesAction()).resolves.toEqual({
      success: false,
      error: "Sesión no válida",
    });
  });
});

describe("getPendingInvitationsAction", () => {
  it("devuelve las invitaciones pendientes de la organización, y no las de otra", async () => {
    const r = await getPendingInvitationsAction();
    expect(ids(r)).toEqual(["i1"]);
    expect(sim.filtrosOrg.team_invitations).toEqual(["org-1"]);
  });

  it("⭐ una falla de la base vuelve con un texto propio", async () => {
    sim.errores.team_invitations = { message: "permission denied for table team_invitations" };
    await expect(getPendingInvitationsAction()).resolves.toEqual({
      success: false,
      error: FALLO_AL_LEER,
    });
  });

  it("sin sesión devuelve el motivo", async () => {
    sim.sesion = false;
    await expect(getPendingInvitationsAction()).resolves.toEqual({
      success: false,
      error: "Sesión no válida",
    });
  });
});

describe("getTeamPageContextAction", () => {
  it("junta las tres lecturas y si quien entra puede administrar el equipo", async () => {
    const r = await getTeamPageContextAction();
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.members.map((m) => m.id)).toEqual(["m1"]);
    expect(r.data.roles.map((x) => x.id)).toEqual(["r1"]);
    expect(r.data.invitations.map((i) => i.id)).toEqual(["i1"]);
    expect(r.data.canManage).toBe(true);
    expect(r.data.canEditRates).toBe(true);
  });

  it("un miembro que no es founder no administra", async () => {
    sim.rol = "member";
    const r = await getTeamPageContextAction();
    expect(r.success && r.data.canManage).toBe(false);
  });

  it("⭐ si una lectura falla, devuelve ese error en vez de lanzar", async () => {
    sim.errores.team_invitations = { message: "permission denied for table team_invitations" };
    await expect(getTeamPageContextAction()).resolves.toEqual({
      success: false,
      error: FALLO_AL_LEER,
    });
  });

  it("sin sesión devuelve el motivo", async () => {
    sim.sesion = false;
    await expect(getTeamPageContextAction()).resolves.toEqual({
      success: false,
      error: "Sesión no válida",
    });
  });
});
