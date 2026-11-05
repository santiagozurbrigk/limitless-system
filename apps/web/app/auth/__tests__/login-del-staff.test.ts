import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-552 · login único: el staff entra por `/login`.
 *
 * - `signInAction` manda al staff a `DESTINO_DEL_STAFF` (y a quien no está en
 *   la lista, aunque sea de la org de Limitless, al dashboard de siempre);
 * - `/superadmin/login` redirige a `/login`;
 * - el layout del panel rechaza a quien no es staff con un redirect a `/login`;
 * - el callback de Auth manda al staff al mismo destino, salvo que vuelva de
 *   una invitación (gana la invitación, como en `signInAction`);
 * - `signInSuperAdminAction` ya no existe.
 *
 * Acá se simula `isStaffEmail`/`isStaffUser` (el guard en sí está probado en
 * `lib/auth/__tests__/require-staff.test.ts`); `DESTINO_DEL_STAFF` viene del
 * módulo real.
 */

class Redireccion extends Error {
  constructor(readonly destino: string) {
    super(`redirect ${destino}`);
  }
}

const sim = vi.hoisted(() => ({
  usuario: { id: "u1", email: "staff@limitless.test" } as { id: string; email: string } | null,
  lista: ["staff@limitless.test"],
  bootstraps: 0,
  bootstrapsDeUsuario: 0,
  rol: "founder" as "founder" | "member",
  organizacion: { organizationId: "org-limitless", accountType: "founder" as "founder" | "holding" | null },
}));

vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Redireccion(destino);
  },
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: () => undefined }) }));
vi.mock("@/lib/auth/limite-login", () => ({
  limiteDeLogin: async () => ({ allowed: true, resetAt: 0 }),
}));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
// Con SCRUM-524 integrado, quien no es staff va a la pantalla de inicio de su
// experiencia; acá la org no es webinar ni limitless: el Panel de siempre.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/destino-despues-del-login", () => ({
  destinoPorDefectoDespuesDelLogin: async () => "/dashboard",
}));
vi.mock("@/lib/auth/require-staff", async (importOriginal) => ({
  DESTINO_DEL_STAFF: (await importOriginal<typeof import("@/lib/auth/require-staff")>()).DESTINO_DEL_STAFF,
  isStaffEmail: async (email: string) => sim.lista.includes(email.trim().toLowerCase()),
  isStaffUser: async () => Boolean(sim.usuario && sim.lista.includes(sim.usuario.email)),
}));
vi.mock("@/lib/auth/bootstrap", () => ({
  ensureCurrentUserBootstrap: async () => {
    sim.bootstraps += 1;
    return { id: sim.usuario?.id, organization_id: "org-limitless", role: sim.rol };
  },
  ensureUserBootstrap: async () => {
    sim.bootstrapsDeUsuario += 1;
    return { id: sim.usuario?.id, organization_id: "org-limitless", role: sim.rol };
  },
  loadProfileOrganizationContext: async () => ({
    organizationId: sim.organizacion.organizationId,
    accountType: sim.organizacion.accountType,
    canManageHolding: true,
    isActive: true,
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signInWithPassword: async () => ({ error: null }),
      exchangeCodeForSession: async () => ({ error: null }),
      getUser: async () => ({ data: { user: sim.usuario } }),
    },
    from: () => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({
          data: { must_change_password: false, temp_password_expires_at: null },
        }),
      };
      return builder;
    },
  }),
}));

import { paths } from "@/routes";
import { DESTINO_DEL_STAFF } from "@/lib/auth/require-staff";
import * as accionesDeAuth from "@/app/auth/actions";
import SuperAdminLoginPage from "@/app/superadmin/login/page";
import SuperAdminGuardLayout from "@/app/(super-admin)/super-admin/layout";
import { GET as callbackDeAuth } from "@/app/auth/callback/route";

async function destinoDe(fn: () => unknown): Promise<string> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof Redireccion) return e.destino;
    throw e;
  }
  throw new Error("no redirigió");
}

function entrar(email: string, next?: string): Promise<string> {
  const form = new FormData();
  form.set("email", email);
  form.set("password", "secreta123");
  if (next !== undefined) form.set("next", next);
  return destinoDe(() => accionesDeAuth.signInAction({}, form));
}

beforeEach(() => {
  sim.usuario = { id: "u1", email: "staff@limitless.test" };
  sim.lista = ["staff@limitless.test"];
  sim.bootstraps = 0;
  sim.bootstrapsDeUsuario = 0;
  sim.rol = "founder";
  sim.organizacion = { organizationId: "org-limitless", accountType: "founder" };
});

describe("login del staff por /login", () => {
  it("el destino del staff es Organizaciones de la consola (SCRUM-553)", () => {
    expect(DESTINO_DEL_STAFF).toBe(paths.platform.consola.organizaciones);
  });

  it("⭐ el staff entra por /login y va a su destino, con el bootstrap una vez", async () => {
    expect(await entrar("staff@limitless.test")).toBe(DESTINO_DEL_STAFF);
    expect(sim.bootstraps).toBe(1);
  });

  it("⭐ un miembro de la org de Limitless fuera de la lista va al dashboard de siempre", async () => {
    sim.usuario = { id: "u2", email: "miembro@limitless.test" };
    sim.rol = "member";
    expect(await entrar("miembro@limitless.test")).toBe(paths.platform.dashboard);
    expect(sim.bootstraps).toBe(1);
  });

  it("un founder de la org de Limitless fuera de la lista tampoco va al panel", async () => {
    sim.usuario = { id: "u3", email: "founder@limitless.test" };
    sim.rol = "founder";
    expect(await entrar("founder@limitless.test")).toBe(paths.platform.dashboard);
    expect(sim.bootstraps).toBe(1);
  });

  it("el staff que viene de una invitación vuelve a la invitación", async () => {
    expect(await entrar("staff@limitless.test", "/invite?token=tok-1")).toBe("/invite?token=tok-1");
    expect(sim.bootstraps).toBe(0);
  });

  it("signInSuperAdminAction ya no existe", () => {
    expect("signInSuperAdminAction" in accionesDeAuth).toBe(false);
  });
});

describe("login viejo y panel", () => {
  it("/superadmin/login redirige a /login", async () => {
    expect(await destinoDe(() => SuperAdminLoginPage())).toBe("/login");
  });

  it("el layout del panel manda a /login a quien no es staff", async () => {
    sim.usuario = { id: "u2", email: "miembro@limitless.test" };
    expect(await destinoDe(() => SuperAdminGuardLayout({ children: "panel" }))).toBe("/login");
  });

  it("el layout del panel deja pasar al staff", async () => {
    await expect(SuperAdminGuardLayout({ children: "panel" })).resolves.toBe("panel");
  });
});

describe("callback de Auth", () => {
  it("manda al staff a su destino", async () => {
    const res = await callbackDeAuth(new Request("https://app.test/auth/callback?code=c-1"));
    expect(res.headers.get("location")).toBe(`https://app.test${DESTINO_DEL_STAFF}`);
    expect(sim.bootstrapsDeUsuario).toBe(1);
  });

  it("a quien no es staff lo manda al next de siempre", async () => {
    sim.usuario = { id: "u2", email: "miembro@limitless.test" };
    const res = await callbackDeAuth(new Request("https://app.test/auth/callback?code=c-1"));
    expect(res.headers.get("location")).toBe(`https://app.test${paths.platform.dashboard}`);
  });

  it("⭐ el staff que vuelve de una invitación va a la invitación, como en signInAction", async () => {
    const next = encodeURIComponent("/invite?token=tok-1");
    const res = await callbackDeAuth(new Request(`https://app.test/auth/callback?code=c-1&next=${next}`));
    expect(res.headers.get("location")).toBe("https://app.test/invite?token=tok-1");
    expect(sim.bootstrapsDeUsuario).toBe(0);
    // El mismo destino que da el login con contraseña.
    expect(await entrar("staff@limitless.test", "/invite?token=tok-1")).toBe("/invite?token=tok-1");
  });

  it("de la invitación sólo pasa el token, como en signInAction", async () => {
    const next = encodeURIComponent("/invite?token=tok-1&next=https://evil.test");
    const res = await callbackDeAuth(new Request(`https://app.test/auth/callback?code=c-1&next=${next}`));
    expect(res.headers.get("location")).toBe("https://app.test/invite?token=tok-1");
  });

  it("un next que no es una invitación no le gana al destino del staff", async () => {
    const next = encodeURIComponent("/invitaciones-viejas");
    const res = await callbackDeAuth(new Request(`https://app.test/auth/callback?code=c-1&next=${next}`));
    expect(res.headers.get("location")).toBe(`https://app.test${DESTINO_DEL_STAFF}`);
  });
});
