import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-524 · ⭐ Después del login, cada organización va a su pantalla de
 * inicio: el Panel para `full`, la primera entrada lista del menú webinar para
 * `webinar` (hoy, Equipo). Vale para el login con contraseña
 * (`signInAction`) y para `/auth/callback`. Se respetan `destinoSeguro` y el
 * `next` de las invitaciones. Las pantallas del cliente que mandan a
 * `/dashboard` (recuperar contraseña, cambio obligatorio, aceptar invitación)
 * llegan a la pantalla de inicio por el layout de `/dashboard`: lo prueba
 * `app/__tests__/bloqueo-por-experiencia.test.ts`.
 */

class Redireccion extends Error {
  constructor(readonly destino: string) {
    super(`redirect ${destino}`);
  }
}

const sim = vi.hoisted(() => ({
  experiencia: "full" as "full" | "webinar",
  accountType: "founder" as "founder" | "holding",
  superAdmin: false,
  bootstraps: 0,
}));

vi.mock("server-only", () => ({}));
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
vi.mock("@/lib/auth/require-super-admin", () => ({ isSuperAdminEmail: async () => sim.superAdmin }));
vi.mock("@/lib/organization/experience", () => ({
  getOrganizationExperience: async () => sim.experiencia,
}));
vi.mock("@/lib/auth/bootstrap", () => ({
  ensureCurrentUserBootstrap: async () => {
    sim.bootstraps += 1;
    return { id: "u1", organization_id: "org-1", role: "founder" };
  },
  ensureUserBootstrap: async () => {
    sim.bootstraps += 1;
    return { id: "u1", organization_id: "org-1", role: "founder" };
  },
  loadProfileOrganizationContext: async () => ({
    organizationId: "org-1",
    accountType: sim.accountType,
    canManageHolding: true,
    isActive: true,
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signInWithPassword: async () => ({ error: null }),
      exchangeCodeForSession: async () => ({ error: null }),
      verifyOtp: async () => ({ error: null }),
      getUser: async () => ({ data: { user: { id: "u1", email: "persona@test.com" } } }),
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

import { signInAction } from "@/app/auth/actions";
import { GET as callback } from "@/app/auth/callback/route";

async function login(next?: string): Promise<string> {
  const form = new FormData();
  form.set("email", "persona@test.com");
  form.set("password", "secreta123");
  if (next !== undefined) form.set("next", next);
  try {
    await signInAction({}, form);
  } catch (e) {
    if (e instanceof Redireccion) return e.destino;
    throw e;
  }
  throw new Error("signInAction no redirigió");
}

const ORIGEN = "https://app.test";

async function volverDelMail(next?: string): Promise<string> {
  const url = new URL("/auth/callback", ORIGEN);
  url.searchParams.set("code", "codigo");
  if (next !== undefined) url.searchParams.set("next", next);
  const respuesta = await callback(new Request(url));
  return respuesta.headers.get("location")!.replace(ORIGEN, "");
}

beforeEach(() => {
  sim.experiencia = "full";
  sim.accountType = "founder";
  sim.superAdmin = false;
  sim.bootstraps = 0;
});

describe("⭐ login con contraseña", () => {
  it("full: al Panel, como siempre", async () => {
    expect(await login()).toBe("/dashboard");
  });

  it("webinar: a su pantalla de inicio (hoy, Equipo)", async () => {
    sim.experiencia = "webinar";
    expect(await login()).toBe("/team");
  });

  it("webinar con una invitación en el next: vuelve a la invitación", async () => {
    sim.experiencia = "webinar";
    expect(await login("/invite?token=tok-1")).toBe("/invite?token=tok-1");
  });

  it("webinar con un next que no es invitación: se ignora, como siempre, y va a su inicio", async () => {
    sim.experiencia = "webinar";
    expect(await login("https://evil.com")).toBe("/team");
  });

  it("una cuenta holding sigue yendo a su holding, sea cual sea la experiencia", async () => {
    sim.accountType = "holding";
    sim.experiencia = "webinar";
    expect(await login()).toBe("/holding");
  });

  it("el super admin sigue yendo a su panel", async () => {
    sim.superAdmin = true;
    sim.experiencia = "webinar";
    expect(await login()).toBe("/super-admin/organizations");
  });
});

describe("⭐ /auth/callback", () => {
  it("sin next: full al Panel, webinar a Equipo", async () => {
    expect(await volverDelMail()).toBe("/dashboard");
    sim.experiencia = "webinar";
    expect(await volverDelMail()).toBe("/team");
  });

  it("un next interno se respeta (el bloqueo lo decide el layout del destino)", async () => {
    sim.experiencia = "webinar";
    expect(await volverDelMail("/team/roles")).toBe("/team/roles");
  });

  it("un next que no pasa destinoSeguro cae en la pantalla de inicio de la experiencia", async () => {
    sim.experiencia = "webinar";
    expect(await volverDelMail("//evil.com")).toBe("/team");
    expect(await volverDelMail("https://evil.com/x")).toBe("/team");
  });

  it("la invitación en el next: vuelve a ella sin crear organización", async () => {
    sim.experiencia = "webinar";
    expect(await volverDelMail("/invite?token=tok-1")).toBe("/invite?token=tok-1");
    expect(sim.bootstraps).toBe(0);
  });

  it("el super admin sigue yendo a su panel", async () => {
    sim.superAdmin = true;
    expect(await volverDelMail()).toBe("/super-admin/organizations");
  });
});
