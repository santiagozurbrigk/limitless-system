import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-495 · [AUTH-ALTA-EMAIL-AJENO] parte A: aceptar una invitación de equipo
 * no crea cuentas.
 *
 * Antes, `acceptInvitationAction` llamaba a `auth.admin.createUser` con el
 * email de la invitación y la contraseña que eligiera quien tuviera el link:
 * cuenta confirmada sin que el dueño del email confirmara nada. Ahora
 * `aceptarInvitacionAction` sólo acepta con la sesión, y la aceptación la hace
 * la base con el id del usuario de la sesión (`aceptar_invitacion_de_equipo`).
 *
 * El cliente de service role simulado registra TODO lo que se le pide (Auth
 * admin, tablas, RPC): si la acción vuelve a crear una cuenta o a escribir un
 * perfil por su cuenta, el test lo ve.
 */

const sim = vi.hoisted(() => ({
  usuario: null as { id: string; email: string } | null,
  respuestaRpc: { data: "aceptada" as unknown, error: null as { message: string } | null },
  llamadasAdmin: [] as Array<{ que: string; args: unknown[] }>,
  revalidaciones: 0,
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {
    sim.revalidaciones += 1;
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: sim.usuario }, error: null }) },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    const registrar =
      (que: string, devuelve: unknown = { data: null, error: null }) =>
      (...args: unknown[]) => {
        sim.llamadasAdmin.push({ que, args });
        return devuelve;
      };
    return {
      auth: {
        admin: {
          createUser: registrar("auth.admin.createUser"),
          inviteUserByEmail: registrar("auth.admin.inviteUserByEmail"),
          updateUserById: registrar("auth.admin.updateUserById"),
          deleteUser: registrar("auth.admin.deleteUser"),
        },
      },
      from: registrar("from", {
        select: () => {
          throw new Error("la acción no lee tablas: lo hace la base");
        },
        insert: () => {
          throw new Error("la acción no escribe tablas: lo hace la base");
        },
        update: () => {
          throw new Error("la acción no escribe tablas: lo hace la base");
        },
      }),
      rpc: (...args: unknown[]) => {
        sim.llamadasAdmin.push({ que: "rpc", args });
        return Promise.resolve(sim.respuestaRpc);
      },
    };
  },
}));

import { aceptarInvitacionAction } from "@/app/team/actions";
import { MENSAJE_INVITACION } from "@/lib/team/invitacion";

const ANA = { id: "11111111-1111-4111-8111-111111111111", email: "ana@test.com" };

function llamadas(que: string) {
  return sim.llamadasAdmin.filter((l) => l.que === que);
}

beforeEach(() => {
  sim.usuario = null;
  sim.respuestaRpc = { data: "aceptada", error: null };
  sim.llamadasAdmin = [];
  sim.revalidaciones = 0;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("aceptarInvitacionAction", () => {
  it("sin sesión no crea ninguna cuenta ni toca la base", async () => {
    const r = await aceptarInvitacionAction("tok-1");

    expect(r).toEqual({ success: false, motivo: "sin_sesion", error: MENSAJE_INVITACION.sin_sesion });
    // Ni alta en Auth, ni perfil, ni la invitación.
    expect(sim.llamadasAdmin).toEqual([]);
  });

  it("con un token vacío o enorme rechaza sin consultar", async () => {
    sim.usuario = ANA;
    expect(await aceptarInvitacionAction("   ")).toMatchObject({ success: false, motivo: "no_existe" });
    expect(await aceptarInvitacionAction("x".repeat(501))).toMatchObject({ success: false, motivo: "no_existe" });
    expect(sim.llamadasAdmin).toEqual([]);
  });

  it("con sesión acepta en la base con el id de la sesión, nunca con un alta", async () => {
    sim.usuario = ANA;

    const r = await aceptarInvitacionAction(" tok-1 ");

    expect(r).toEqual({ success: true, data: { yaEraMiembro: false } });
    expect(llamadas("rpc")).toEqual([
      { que: "rpc", args: ["aceptar_invitacion_de_equipo", { p_token: "tok-1", p_user_id: ANA.id }] },
    ]);
    expect(llamadas("auth.admin.createUser")).toEqual([]);
    expect(llamadas("auth.admin.inviteUserByEmail")).toEqual([]);
    expect(llamadas("from")).toEqual([]);
    expect(sim.revalidaciones).toBe(1);
  });

  it("quien ya era de la org la acepta sin error", async () => {
    sim.usuario = ANA;
    sim.respuestaRpc = { data: "ya_era_miembro", error: null };
    expect(await aceptarInvitacionAction("tok-1")).toEqual({ success: true, data: { yaEraMiembro: true } });
  });

  it.each([
    "no_existe",
    "usada",
    "vencida",
    "sin_cuenta",
    "email_sin_confirmar",
    "otro_email",
    "otra_org",
    "rol_de_otra_org",
  ] as const)("el rechazo %s vuelve como valor con su mensaje", async (motivo) => {
    sim.usuario = ANA;
    sim.respuestaRpc = { data: motivo, error: null };

    const r = await aceptarInvitacionAction("tok-1");

    expect(r).toEqual({ success: false, motivo, error: MENSAJE_INVITACION[motivo] });
    expect(llamadas("auth.admin.createUser")).toEqual([]);
    expect(sim.revalidaciones).toBe(0);
  });

  it("un error de la base no llega a la pantalla", async () => {
    sim.usuario = ANA;
    sim.respuestaRpc = { data: null, error: { message: 'relation "x" does not exist' } };

    const r = await aceptarInvitacionAction("tok-1");

    expect(r).toEqual({ success: false, motivo: "error", error: MENSAJE_INVITACION.error });
  });

  it("una respuesta desconocida de la base no se toma como aceptada", async () => {
    sim.usuario = ANA;
    sim.respuestaRpc = { data: "ok", error: null };

    expect(await aceptarInvitacionAction("tok-1")).toMatchObject({ success: false, motivo: "error" });
    expect(sim.revalidaciones).toBe(0);
  });
});
