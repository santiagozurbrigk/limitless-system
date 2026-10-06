/**
 * SCRUM-495 · [AUTH-ALTA-EMAIL-AJENO] parte A: lo que muestra `/invite`.
 *
 * Se renderiza la página real (Server Component) con `renderToStaticMarkup`,
 * con la lectura real de la invitación (`cargarInvitacion`) sobre una base
 * simulada. El botón de aceptar y el de cerrar sesión (componentes de cliente)
 * se reemplazan por marcas: lo que se prueba es qué estado elige la página.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fila = {
  token: string;
  email: string;
  status: string;
  expires_at: string;
  organizations: { name: string } | null;
  team_roles: { name: string } | null;
  profiles: { full_name: string } | null;
};

const sim = vi.hoisted(() => ({
  filas: [] as Fila[],
  errorLectura: null as { message: string } | null,
  usuario: null as { id: string; email?: string } | null,
  configurado: true,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => sim.configurado }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: sim.usuario }, error: null }) },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(tabla: string) {
      if (tabla !== "team_invitations") throw new Error(`tabla inesperada: ${tabla}`);
      const filtros: Array<[string, unknown]> = [];
      const builder = {
        select: () => builder,
        eq(columna: string, valor: unknown) {
          filtros.push([columna, valor]);
          return builder;
        },
        maybeSingle: async () => ({
          data: sim.errorLectura
            ? null
            : (sim.filas.find((f) =>
                filtros.every(([c, v]) => (f as Record<string, unknown>)[c] === v)
              ) ?? null),
          error: sim.errorLectura,
        }),
      };
      return builder;
    },
  }),
}));
vi.mock("../aceptar-invitacion", () => ({
  AceptarInvitacion: ({ token, email }: { token: string; email: string }) =>
    createElement("button", { "data-aceptar": token }, `Aceptar como ${email}`),
}));
vi.mock("@/components/settings/sign-out-button", () => ({
  SignOutButton: () => createElement("button", { "data-cerrar-sesion": "" }, "Cerrar sesión"),
}));

import InvitePage from "../page";
import {
  MENSAJE_INVITACION,
  MENSAJE_INVITACION_NO_CARGADA,
  MENSAJE_SIN_CUENTA,
} from "@/lib/team/invitacion";

const EN_UNA_SEMANA = new Date(Date.now() + 7 * 86_400_000).toISOString();
const AYER = new Date(Date.now() - 86_400_000).toISOString();

function fila(parcial: Partial<Fila> & { token: string }): Fila {
  return {
    email: "ana@test.com",
    status: "pending",
    expires_at: EN_UNA_SEMANA,
    organizations: { name: "Acme" },
    team_roles: { name: "Ventas" },
    profiles: { full_name: "Fer" },
    ...parcial,
  };
}

async function render(token?: string | string[]): Promise<string> {
  const arbol = await InvitePage({ searchParams: Promise.resolve(token === undefined ? {} : { token }) });
  return renderToStaticMarkup(arbol);
}

/** Nada de la página vieja: ni contraseña ni formulario de alta. */
function sinAlta(html: string) {
  expect(html).not.toMatch(/type="password"/);
  expect(html).not.toMatch(/Contraseña/i);
  expect(html).not.toMatch(/Creando cuenta/i);
}

beforeEach(() => {
  sim.filas = [
    fila({ token: "tok-ok" }),
    fila({ token: "tok-usada", status: "accepted" }),
    fila({ token: "tok-anulada", status: "expired" }),
    fila({ token: "tok-vencida", expires_at: AYER }),
    fila({ token: "tok-sin-rol", team_roles: null, profiles: null }),
  ];
  sim.errorLectura = null;
  sim.usuario = null;
  sim.configurado = true;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("/invite", () => {
  it("sin sesión: muestra la invitación y pide iniciar sesión, sin crear nada", async () => {
    const html = await render("tok-ok");

    expect(html).toContain("Fer te invitó a <strong");
    expect(html).toContain("Acme");
    expect(html).toContain("con el rol <strong");
    expect(html).toContain("Ventas");
    expect(html).toContain("ana@test.com");
    expect(html).toContain('href="/login?next=%2Finvite%3Ftoken%3Dtok-ok"');
    expect(html).toContain(MENSAJE_SIN_CUENTA);
    expect(html).not.toContain("data-aceptar");
    sinAlta(html);
  });

  it("sin rol custom ni quien invitó, no los inventa", async () => {
    const html = await render("tok-sin-rol");
    expect(html).toContain("Te invitaron a <strong");
    expect(html).not.toContain("con el rol");
  });

  it("con la sesión del email invitado (otra caja), ofrece aceptar", async () => {
    sim.usuario = { id: "u1", email: "ANA@test.com" };
    const html = await render("tok-ok");
    expect(html).toContain('data-aceptar="tok-ok"');
    expect(html).not.toContain("/login?next=");
    sinAlta(html);
  });

  it("con la sesión de otro email, no ofrece aceptar y pide cerrarla", async () => {
    sim.usuario = { id: "u2", email: "otra@test.com" };
    const html = await render("tok-ok");
    expect(html).not.toContain("data-aceptar");
    expect(html).toContain("data-cerrar-sesion");
    expect(html).toContain("Iniciaste sesión como <strong>otra@test.com</strong>");
    sinAlta(html);
  });

  it.each([
    ["tok-no-existe", "no_existe"],
    ["tok-usada", "usada"],
    ["tok-anulada", "vencida"],
    ["tok-vencida", "vencida"],
  ] as const)("%s: muestra el motivo y nada para aceptar", async (token, motivo) => {
    sim.usuario = { id: "u1", email: "ana@test.com" };
    const html = await render(token);
    expect(html).toContain(MENSAJE_INVITACION[motivo]);
    expect(html).not.toContain("data-aceptar");
    expect(html).not.toContain("/login?next=");
    sinAlta(html);
  });

  it("sin token, o con un token repetido en la URL, es inexistente", async () => {
    expect(await render()).toContain(MENSAJE_INVITACION.no_existe);
    expect(await render(["tok-ok", "tok-ok"])).toContain(MENSAJE_INVITACION.no_existe);
  });

  it("un error de la base no se muestra", async () => {
    sim.errorLectura = { message: 'permission denied for table "team_invitations"' };
    const html = await render("tok-ok");
    expect(html).toContain(MENSAJE_INVITACION_NO_CARGADA);
    expect(html).not.toContain("permission denied");
    expect(html).not.toContain("data-aceptar");
  });

  it("sin Supabase configurado no intenta leer nada", async () => {
    sim.configurado = false;
    expect(await render("tok-ok")).toContain(MENSAJE_INVITACION_NO_CARGADA);
  });
});
