/**
 * SCRUM-493: la fecha de alta de un contacto de GHL se lee en el día de la
 * organización. `dateAdded` es un instante: su fecha de UTC caía en el día
 * siguiente para un contacto creado de noche en Argentina.
 */
import { afterEach, describe, expect, it } from "vitest";
import { conZona, restaurarZona } from "@/lib/fechas/__tests__/zona";
import type { GHLContact } from "../client";
import { resolveJoinDate } from "../sync-contacts";

afterEach(restaurarZona);

function contacto(dateAdded: string | null): GHLContact {
  return {
    id: "c1",
    locationId: "loc-1",
    firstName: "Ana",
    lastName: "Pérez",
    email: null,
    phone: null,
    dateAdded,
    tags: null,
  };
}

describe("resolveJoinDate", () => {
  const argentina = "America/Argentina/Buenos_Aires";

  it("⭐ un contacto creado a las 22:00 de Argentina queda con ese día", () => {
    conZona("UTC");
    // 1-oct 22:00 en Buenos Aires = 2-oct 01:00 UTC.
    expect(resolveJoinDate(contacto("2026-10-02T01:00:00.000Z"), argentina)).toBe("2026-10-01");
  });

  it("una fecha sin hora se usa tal cual", () => {
    conZona("UTC");
    expect(resolveJoinDate(contacto("2026-10-01"), argentina)).toBe("2026-10-01");
  });

  it("⭐ sin fecha, el hoy de la organización (no el de UTC)", () => {
    conZona("UTC");
    const lasVeintidos = new Date("2026-10-02T01:00:00Z");
    expect(resolveJoinDate(contacto(null), argentina, lasVeintidos)).toBe("2026-10-01");
    expect(resolveJoinDate(contacto("no es una fecha"), argentina, lasVeintidos)).toBe(
      "2026-10-01"
    );
    // Organización sin zona: la de por defecto.
    expect(resolveJoinDate(contacto(null), null, lasVeintidos)).toBe("2026-10-01");
  });
});
