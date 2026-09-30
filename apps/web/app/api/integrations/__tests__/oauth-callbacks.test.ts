import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * SCRUM-10 · [OAUTH-ESTADO-SIN-FIRMA]: los callbacks OAuth no escriben en la
 * organización (ni a nombre del usuario) que diga la cookie.
 *
 * Stripe representa a los 8 callbacks de organización (mismo patrón en
 * Mercado Pago, Instagram, Discord, Calendly, Typeform, YouTube y Google
 * Forms); el closer de Calendly es el caso por usuario. Sesión, cookie, base y
 * proveedor están simulados: el test falla si un callback vuelve a leer la org
 * de la cookie, o si llama al proveedor o escribe sin sesión.
 */

const sim = vi.hoisted(() => ({
  cookies: {} as Record<string, string>,
  org: null as string | null,
  user: null as string | null,
  upserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
  perfiles: {} as Record<string, { id: string; organization_id: string; is_active: boolean }>,
  fetch: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => (name in sim.cookies ? { value: sim.cookies[name] } : undefined),
  })),
}));

vi.mock("@/lib/integrations/oauth-sesion", () => ({
  orgDeLaSesionOAuth: vi.fn(async () => sim.org),
  usuarioDeLaSesionOAuth: vi.fn(async () => sim.user),
}));

vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));

vi.mock("@/lib/stripe/config", () => ({
  STRIPE_TOKEN_URL: "https://stripe.test/token",
  assertStripeOAuthConfig: () => ({ secretKey: "sk_test", redirectUri: "https://app.test/cb" }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(table: string) {
      const filtros: Record<string, unknown> = {};
      const builder = {
        upsert: async (row: Record<string, unknown>) => {
          sim.upserts.push({ table, row });
          return { error: null };
        },
        select: () => builder,
        eq: (col: string, val: unknown) => {
          filtros[col] = val;
          return builder;
        },
        maybeSingle: async () => ({
          data: table === "profiles" ? sim.perfiles[String(filtros.id)] ?? null : null,
          error: null,
        }),
      };
      return builder;
    },
  }),
}));

const ORG_PROPIA = "org-de-la-sesion";
const ORG_AJENA = "org-de-otro";

beforeEach(() => {
  sim.cookies = {};
  sim.org = null;
  sim.user = null;
  sim.upserts = [];
  sim.perfiles = {};
  sim.fetch.mockReset();
  sim.fetch.mockResolvedValue(
    new Response(JSON.stringify({ access_token: "tok", stripe_user_id: "acct_1", livemode: false }), {
      status: 200,
    })
  );
  vi.stubGlobal("fetch", sim.fetch);
  process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
});

async function stripeCallback(state = "s1") {
  const { GET } = await import("@/app/api/integrations/stripe/callback/route");
  return GET(new NextRequest(`https://app.test/api/integrations/stripe/callback?code=c&state=${state}`));
}

describe("callback de Stripe (organización)", () => {
  it("⭐ sin sesión no llama al proveedor ni escribe", async () => {
    sim.cookies.stripe_oauth = JSON.stringify({ organizationId: ORG_AJENA, state: "s1" });
    const res = await stripeCallback();
    expect(res.headers.get("location")).toContain("error=stripe_failed");
    expect(sim.fetch).not.toHaveBeenCalled();
    expect(sim.upserts).toHaveLength(0);
  });

  it("⭐ una cookie armada con otra organización se rechaza", async () => {
    sim.org = ORG_PROPIA;
    sim.cookies.stripe_oauth = JSON.stringify({ organizationId: ORG_AJENA, state: "s1" });
    const res = await stripeCallback();
    expect(res.headers.get("location")).toContain("error=stripe_failed");
    expect(sim.fetch).not.toHaveBeenCalled();
    expect(sim.upserts).toHaveLength(0);
  });

  it("un state distinto se rechaza", async () => {
    sim.org = ORG_PROPIA;
    sim.cookies.stripe_oauth = JSON.stringify({ organizationId: ORG_PROPIA, state: "s1" });
    await stripeCallback("otro");
    expect(sim.upserts).toHaveLength(0);
  });

  it("el flujo legítimo conecta en la organización de la sesión", async () => {
    sim.org = ORG_PROPIA;
    sim.cookies.stripe_oauth = JSON.stringify({ organizationId: ORG_PROPIA, state: "s1" });
    const res = await stripeCallback();
    expect(res.headers.get("location")).toContain("success=stripe");
    expect(sim.upserts).toEqual([
      expect.objectContaining({
        table: "stripe_integrations",
        row: expect.objectContaining({ organization_id: ORG_PROPIA }),
      }),
    ]);
  });
});

describe("callback de Calendly del closer (usuario)", () => {
  async function closerCallback() {
    process.env.CALENDLY_CLIENT_ID = "id";
    process.env.CALENDLY_CLIENT_SECRET = "secret";
    process.env.CALENDLY_REDIRECT_URI = "https://app.test/cb";
    const { GET } = await import("@/app/api/integrations/calendly/closer/callback/route");
    return GET(new NextRequest("https://app.test/api/integrations/calendly/closer/callback?code=c&state=s1"));
  }

  it("⭐ otro usuario que el que empezó recibe 401 y no se escribe nada", async () => {
    sim.user = "atacante";
    sim.cookies.calendly_closer_oauth = JSON.stringify({
      profileId: "closer-1",
      organizationId: ORG_AJENA,
      state: "s1",
      codeVerifier: "v",
    });
    const res = await closerCallback();
    expect(res.status).toBe(401);
    expect(sim.fetch).not.toHaveBeenCalled();
    expect(sim.upserts).toHaveLength(0);
  });

  it("⭐ sin sesión recibe 401", async () => {
    sim.cookies.calendly_closer_oauth = JSON.stringify({
      profileId: "closer-1",
      organizationId: ORG_AJENA,
      state: "s1",
      codeVerifier: "v",
    });
    const res = await closerCallback();
    expect(res.status).toBe(401);
    expect(sim.upserts).toHaveLength(0);
  });
});
