import { describe, expect, it } from "vitest";
import {
  clavesDeRecuperacion,
  MENSAJE_RECUPERACION_ENVIADA,
  urlDeVueltaDeRecuperacion,
} from "@/lib/auth/recuperar-contrasena";

describe("recuperar contraseña (SCRUM-16)", () => {
  it("el link del mail vuelve al callback marcado como recuperación", () => {
    expect(urlDeVueltaDeRecuperacion("https://www.optimizatucontrol.com/")).toBe(
      "https://www.optimizatucontrol.com/auth/callback?type=recovery"
    );
  });

  it("limita por email normalizado y por IP", () => {
    expect(clavesDeRecuperacion("1.2.3.4", "  Ana@Mail.com ")).toEqual({
      porEmail: "recuperar:ana@mail.com",
      porIp: "recuperar-ip:1.2.3.4",
    });
  });

  it("el mensaje no dice si la cuenta existe", () => {
    expect(MENSAJE_RECUPERACION_ENVIADA).toMatch(/^Si ese email tiene una cuenta/);
  });
});
