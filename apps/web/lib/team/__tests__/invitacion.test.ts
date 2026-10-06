import { describe, expect, it } from "vitest";
import {
  destinoDeInvitacion,
  estadoDeInvitacion,
  leerMotivoDeLaBase,
  loginParaInvitacion,
  MENSAJE_INVITACION,
  mismoEmail,
  rutaDeInvitacion,
  vistaDeInvitacionPendiente,
} from "@/lib/team/invitacion";

/**
 * SCRUM-495 · [AUTH-ALTA-EMAIL-AJENO] parte A: las piezas puras de `/invite`.
 * La aceptación en sí (una sola vez, con el rol de la org, sin tocar nada si se
 * rechaza) la prueba `supabase/ci/tests/80_aceptar_invitacion.sql` contra la
 * base.
 */

const AHORA = new Date("2026-10-05T12:00:00Z");

describe("estadoDeInvitacion", () => {
  it("inexistente, usada, anulada, vencida y pendiente", () => {
    expect(estadoDeInvitacion(null, AHORA)).toBe("no_existe");
    expect(estadoDeInvitacion({ status: "accepted", expires_at: "2026-10-10T00:00:00Z" }, AHORA)).toBe("usada");
    expect(estadoDeInvitacion({ status: "expired", expires_at: "2026-10-10T00:00:00Z" }, AHORA)).toBe("vencida");
    expect(estadoDeInvitacion({ status: "pending", expires_at: "2026-10-05T11:59:59Z" }, AHORA)).toBe("vencida");
    expect(estadoDeInvitacion({ status: "pending", expires_at: "2026-10-05T12:00:00Z" }, AHORA)).toBe("vencida");
    expect(estadoDeInvitacion({ status: "pending", expires_at: "2026-10-05T12:00:01Z" }, AHORA)).toBe("pendiente");
  });
});

describe("mismoEmail y la vista de una invitación pendiente", () => {
  it("compara sin mayúsculas ni espacios de los bordes", () => {
    expect(mismoEmail(" Ana@Test.com ", "ana@test.com")).toBe(true);
    expect(mismoEmail("ana@test.com", "ana@test.co")).toBe(false);
    expect(mismoEmail("ana@test.com", "")).toBe(false);
    expect(mismoEmail(null, null)).toBe(false);
  });

  it("sin sesión pide iniciarla; con el mismo email, aceptar; con otro, no", () => {
    expect(vistaDeInvitacionPendiente("ana@test.com", null)).toBe("iniciar_sesion");
    expect(vistaDeInvitacionPendiente("ana@test.com", "ANA@test.com")).toBe("aceptar");
    expect(vistaDeInvitacionPendiente("ana@test.com", "otra@test.com")).toBe("otro_email");
    // Una sesión sin email (p. ej. por teléfono) no es la cuenta invitada.
    expect(vistaDeInvitacionPendiente("ana@test.com", "")).toBe("otro_email");
  });
});

describe("rutas de la invitación", () => {
  it("el login vuelve a la invitación con el token codificado", () => {
    expect(rutaDeInvitacion("a b&c")).toBe("/invite?token=a%20b%26c");
    expect(loginParaInvitacion("tok-1")).toBe("/login?next=%2Finvite%3Ftoken%3Dtok-1");
    const next = new URL(loginParaInvitacion("a b&c"), "https://app.test").searchParams.get("next");
    expect(destinoDeInvitacion(next)).toBe("/invite?token=a%20b%26c");
  });

  it("acepta sólo /invite con token y lo rearma", () => {
    expect(destinoDeInvitacion("/invite?token=abc")).toBe("/invite?token=abc");
    // Lo que no es el token no pasa a la redirección.
    expect(destinoDeInvitacion("/invite?token=abc&next=https://evil.com#x")).toBe("/invite?token=abc");
  });

  it("no abre un open redirect ni manda a otra ruta", () => {
    for (const next of [
      null,
      undefined,
      "",
      42,
      "https://evil.com/invite?token=abc",
      "//evil.com/invite?token=abc",
      "/\\evil.com/invite?token=abc",
      "/..//evil.com/invite?token=abc",
      "invite?token=abc",
      "/invite",
      "/invite?token=",
      "/invitex?token=abc",
      "/invite/otra?token=abc",
      "/dashboard?token=abc",
      "/dashboard?next=/invite?token=abc",
      "javascript:alert(1)//invite?token=abc",
    ]) {
      expect(destinoDeInvitacion(next), String(next)).toBeNull();
    }
  });
});

describe("leerMotivoDeLaBase", () => {
  it("sólo motivos conocidos", () => {
    expect(leerMotivoDeLaBase("aceptada")).toBe("aceptada");
    expect(leerMotivoDeLaBase("otra_org")).toBe("otra_org");
    expect(leerMotivoDeLaBase("cualquier cosa")).toBeNull();
    expect(leerMotivoDeLaBase(null)).toBeNull();
    expect(leerMotivoDeLaBase({ motivo: "aceptada" })).toBeNull();
  });

  it("todo rechazo tiene un mensaje en voseo", () => {
    for (const mensaje of Object.values(MENSAJE_INVITACION)) {
      expect(mensaje.length).toBeGreaterThan(10);
      expect(mensaje).not.toMatch(/\b(puedes|tienes|inicia sesión|revisa|pide)\b/i);
    }
  });
});
