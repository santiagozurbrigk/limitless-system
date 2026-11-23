import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/middleware", () => ({ updateSession: vi.fn() }));

const { config } = await import("@/middleware");

/**
 * El matcher de `middleware.ts` (SCRUM-528). Next lo convierte en una
 * expresión regular sobre el pathname; acá se aproxima con `^matcher$`, que
 * alcanza para el lookahead negativo. La verificación contra el
 * `middleware-manifest.json` que genera `next build` está en la evidencia de
 * SCRUM-528.
 */
const matcher = new RegExp(`^${config.matcher[0]}$`);

describe("matcher del middleware de sesión", () => {
  it("⭐ la ingesta de la landing no pasa por el middleware de sesión", () => {
    expect(matcher.test("/api/ingest/landing")).toBe(false);
  });

  it.each([
    "/dashboard",
    "/api/agent/send",
    "/api/webhooks/whop",
    "/api/ingest/landing/otra",
    "/api/ingest/landingx",
    "/api/ingest",
  ])("sigue corriendo en %s", (pathname) => {
    expect(matcher.test(pathname)).toBe(true);
  });

  it("los assets estáticos siguen afuera", () => {
    expect(matcher.test("/_next/static/chunk.js")).toBe(false);
    expect(matcher.test("/logo.svg")).toBe(false);
  });
});
