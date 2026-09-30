import { describe, expect, it } from "vitest";
import { clavesDeLogin, combinarLimites, ipDesdeHeaders } from "@/lib/auth/limite-login";

function headersDe(valores: Record<string, string>) {
  return { get: (n: string) => valores[n.toLowerCase()] ?? null };
}

describe("ipDesdeHeaders", () => {
  it("toma la primera IP de x-forwarded-for", () => {
    expect(ipDesdeHeaders(headersDe({ "x-forwarded-for": "1.1.1.1, 10.0.0.1" }))).toBe("1.1.1.1");
  });

  it("usa x-real-ip si no hay x-forwarded-for, y si no, unknown", () => {
    expect(ipDesdeHeaders(headersDe({ "x-real-ip": "2.2.2.2" }))).toBe("2.2.2.2");
    expect(ipDesdeHeaders(headersDe({}))).toBe("unknown");
  });
});

describe("clavesDeLogin", () => {
  it("⭐ la víctima que entra desde otra IP no comparte el contador de su email con el atacante", () => {
    const atacante = clavesDeLogin("signin", "6.6.6.6", "ana@x.com");
    const victima = clavesDeLogin("signin", "1.1.1.1", "ana@x.com");
    expect(atacante.porIpYEmail).not.toBe(victima.porIpYEmail);
  });

  it("⭐ los intentos contra emails distintos desde una IP comparten el contador por IP", () => {
    const a = clavesDeLogin("signin", "6.6.6.6", "ana@x.com");
    const b = clavesDeLogin("signin", "6.6.6.6", "beto@x.com");
    const c = clavesDeLogin("signin-superadmin", "6.6.6.6", "carla@x.com");
    expect(a.porIp).toBe(b.porIp);
    expect(a.porIp).toBe(c.porIp);
  });

  it("el email se normaliza (mayúsculas y espacios)", () => {
    expect(clavesDeLogin("signin", "1.1.1.1", " Ana@X.com ").porIpYEmail).toBe(
      clavesDeLogin("signin", "1.1.1.1", "ana@x.com").porIpYEmail
    );
  });

  it("los dos logins tienen contadores por IP + email separados", () => {
    expect(clavesDeLogin("signin", "1.1.1.1", "ana@x.com").porIpYEmail).not.toBe(
      clavesDeLogin("signin-superadmin", "1.1.1.1", "ana@x.com").porIpYEmail
    );
  });
});

describe("combinarLimites", () => {
  const ok = (resetAt: number) => ({ allowed: true, remaining: 1, resetAt });
  const no = (resetAt: number) => ({ allowed: false, remaining: 0, resetAt });

  it("pasa sólo si pasan los dos", () => {
    expect(combinarLimites(ok(10), ok(20)).allowed).toBe(true);
    expect(combinarLimites(no(10), ok(20)).allowed).toBe(false);
    expect(combinarLimites(ok(10), no(20)).allowed).toBe(false);
  });

  it("bloqueado, informa el que se libera más tarde entre los que bloquean", () => {
    expect(combinarLimites(no(10), ok(99))).toEqual({ allowed: false, resetAt: 10 });
    expect(combinarLimites(no(10), no(30))).toEqual({ allowed: false, resetAt: 30 });
  });
});
