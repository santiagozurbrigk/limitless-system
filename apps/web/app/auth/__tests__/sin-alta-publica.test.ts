import { describe, expect, it, vi } from "vitest";

/**
 * SCRUM-23 · [SIGNUP-PUBLICO]: el alta pública de cuentas founder está cerrada.
 * Las cuentas se crean por invitación; no queda ninguna action que llame a
 * `auth.signUp`.
 */

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: {} }) }));

describe("sin alta pública de cuentas", () => {
  it("las actions de auth no exponen un signUpAction", async () => {
    const actions = await import("@/app/auth/actions");
    expect("signUpAction" in actions).toBe(false);
    expect(Object.keys(actions)).toContain("signInAction");
  });
});
