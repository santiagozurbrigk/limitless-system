import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-552 · el middleware manda al staff con sesión que abre `/login` a
 * `DESTINO_DEL_STAFF`, y a quien no está en la lista (aunque sea de la org de
 * Limitless) al dashboard de siempre.
 *
 * Se corre `updateSession` real con un `NextRequest` real. Se simula la capa de
 * Supabase (`@supabase/ssr`, `admin`, `env`), no el guard.
 */

const sim = vi.hoisted(() => ({
  usuario: null as { id: string; email: string } | null,
  lista: [] as string[],
  perfil: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/supabase/env", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseUrl: () => "https://supabase.test",
  getSupabaseAnonKey: () => "anon",
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: sim.usuario }, error: null }),
      signOut: async () => ({ error: null }),
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(tabla: string) {
      let email = "";
      const builder = {
        select: () => builder,
        eq: (_c: string, v: string) => {
          email = v;
          return builder;
        },
        maybeSingle: async () => {
          if (tabla === "super_admin_users") {
            return { data: sim.lista.includes(email) ? { id: "sa-1" } : null, error: null };
          }
          if (tabla === "profiles") return { data: sim.perfil, error: null };
          return { data: null, error: null };
        },
      };
      return builder;
    },
  }),
}));

import { paths } from "@/routes";
import { DESTINO_DEL_STAFF } from "@/lib/auth/require-staff";
import { updateSession } from "../middleware";

const ORG_LIMITLESS = "11111111-1111-4111-8111-11111111c0de";

function abrirLogin() {
  return updateSession(new NextRequest("https://app.test/login"));
}

beforeEach(() => {
  sim.usuario = null;
  sim.lista = ["staff@limitless.test"];
  sim.perfil = {
    must_change_password: false,
    temp_password_expires_at: null,
    role: "founder",
    organization_id: ORG_LIMITLESS,
    is_active: true,
    organizations: { account_type: "founder", skip_onboarding: false },
  };
});

describe("middleware: /login con sesión", () => {
  it("⭐ el staff va a su destino", async () => {
    sim.usuario = { id: "u1", email: "Staff@Limitless.test" };
    const res = await abrirLogin();
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe(DESTINO_DEL_STAFF);
  });

  it("⭐ un founder de la org de Limitless fuera de la lista va al dashboard", async () => {
    sim.usuario = { id: "u2", email: "founder@limitless.test" };
    const res = await abrirLogin();
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe(paths.platform.dashboard);
  });

  it("un miembro de la org de Limitless fuera de la lista va al dashboard", async () => {
    sim.usuario = { id: "u3", email: "miembro@limitless.test" };
    sim.perfil = { ...sim.perfil, role: "member" };
    const res = await abrirLogin();
    expect(new URL(res.headers.get("location")!).pathname).toBe(paths.platform.dashboard);
  });
});
