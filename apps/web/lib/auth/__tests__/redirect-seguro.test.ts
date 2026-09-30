import { describe, expect, it } from "vitest";
import { destinoSeguro } from "@/lib/auth/redirect-seguro";

const ORIGIN = "https://www.optimizatucontrol.com";
const DEFECTO = "/dashboard";

describe("destinoSeguro", () => {
  it("acepta paths internos, con query y hash", () => {
    expect(destinoSeguro("/clients", ORIGIN, DEFECTO)).toBe("/clients");
    expect(destinoSeguro("/invite?token=abc#x", ORIGIN, DEFECTO)).toBe("/invite?token=abc#x");
  });

  it("⭐ rechaza los que terminan en otro host", () => {
    for (const malo of [
      ".evil.com",
      "@evil.com",
      "//evil.com",
      "/\\evil.com",
      "https://evil.com",
      "evil.com",
      "/\t/evil.com",
      "javascript:alert(1)",
    ]) {
      expect(destinoSeguro(malo, ORIGIN, DEFECTO)).toBe(DEFECTO);
    }
  });

  it("⭐ el resultado pegado al origen sigue en el mismo host", () => {
    for (const next of ["/clients", ".evil.com", "@evil.com", "//evil.com", "/\\evil.com"]) {
      const final = new URL(`${ORIGIN}${destinoSeguro(next, ORIGIN, DEFECTO)}`);
      expect(final.host).toBe("www.optimizatucontrol.com");
    }
  });

  it("sin next usa el destino por defecto", () => {
    expect(destinoSeguro(null, ORIGIN, DEFECTO)).toBe(DEFECTO);
    expect(destinoSeguro("", ORIGIN, DEFECTO)).toBe(DEFECTO);
  });
});
