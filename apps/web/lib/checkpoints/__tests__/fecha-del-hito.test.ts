/**
 * SCRUM-493: una sola convención para la fecha de un hito (`reached_at`).
 * El diálogo guardaba el día elegido a las 12:00 UTC y la revisión semanal lo
 * lee en la zona de la organización: en UTC+12 (Nueva Zelanda) eso ya es el
 * día siguiente. Los instantes se arman en UTC y la zona del proceso se fija.
 */
import { afterEach, describe, expect, it } from "vitest";
import { conZona, restaurarZona } from "@/lib/fechas/__tests__/zona";
import {
  fechaDelHitoEnZona,
  fechaDelHitoLocal,
  instanteDelHito,
  ultimoHitoPorCliente,
} from "../fecha-del-hito";

afterEach(restaurarZona);

const AUCKLAND = "Pacific/Auckland";
const ARGENTINA = "America/Argentina/Buenos_Aires";

describe("⭐ un hito cargado a mano se lee con el día elegido en cualquier zona", () => {
  it("en Auckland: lo guardado desde el diálogo vuelve con el mismo día", () => {
    conZona(AUCKLAND);
    // Elegido el 5-oct, el 8-oct a la tarde.
    const guardado = instanteDelHito("2026-10-05", new Date("2026-10-08T03:00:00Z"));
    conZona("UTC");
    expect(fechaDelHitoEnZona(guardado, AUCKLAND)).toBe("2026-10-05");
    conZona(AUCKLAND);
    expect(fechaDelHitoLocal(guardado)).toBe("2026-10-05");
  });

  it("en Auckland: una fila del diálogo viejo (12:00 UTC exactas) se lee con su día", () => {
    conZona("UTC");
    expect(fechaDelHitoEnZona("2026-10-05T12:00:00.000Z", AUCKLAND)).toBe("2026-10-05");
    expect(fechaDelHitoEnZona("2026-10-05T12:00:00+00:00", ARGENTINA)).toBe("2026-10-05");
    conZona(AUCKLAND);
    expect(fechaDelHitoLocal("2026-10-05T12:00:00.000Z")).toBe("2026-10-05");
  });

  it("un instante real (hito sin fecha o propuesta aceptada) se lee en la zona", () => {
    conZona("UTC");
    // 5-oct 22:00 en Buenos Aires = 6-oct 01:00 UTC.
    expect(fechaDelHitoEnZona("2026-10-06T01:00:00.000Z", ARGENTINA)).toBe("2026-10-05");
    // Organización sin zona: la de por defecto.
    expect(fechaDelHitoEnZona("2026-10-06T01:00:00.000Z", null)).toBe("2026-10-05");
    expect(fechaDelHitoEnZona(null, ARGENTINA)).toBe("");
    expect(fechaDelHitoEnZona("ayer", ARGENTINA)).toBe("");
  });
});

describe("instanteDelHito", () => {
  it("otro día: el mediodía local", () => {
    conZona(ARGENTINA);
    expect(instanteDelHito("2026-10-05", new Date("2026-10-08T15:00:00Z"))).toBe(
      "2026-10-05T15:00:00.000Z"
    );
  });

  it("⭐ hoy a la mañana no queda en el futuro (la action lo rechazaría) y sigue siendo hoy", () => {
    conZona(ARGENTINA);
    // 5-oct 08:00 ART = 11:00 UTC: el mediodía todavía no llegó.
    const ahora = new Date("2026-10-05T11:00:00Z");
    const guardado = instanteDelHito("2026-10-05", ahora);
    expect(new Date(guardado).getTime()).toBeLessThan(ahora.getTime());
    expect(fechaDelHitoLocal(guardado)).toBe("2026-10-05");
  });

  it("hoy apenas pasada la medianoche no cae en el día anterior", () => {
    conZona(ARGENTINA);
    // 5-oct 00:02 ART = 03:02 UTC.
    const guardado = instanteDelHito("2026-10-05", new Date("2026-10-05T03:02:00Z"));
    expect(fechaDelHitoLocal(guardado)).toBe("2026-10-05");
  });

  it("hoy a la tarde: el mediodía local", () => {
    conZona(ARGENTINA);
    expect(instanteDelHito("2026-10-05", new Date("2026-10-05T20:00:00Z"))).toBe(
      "2026-10-05T15:00:00.000Z"
    );
  });
});

describe("ultimoHitoPorCliente (revisión semanal)", () => {
  it("se queda con el más reciente de cada cliente, en el día de la organización", () => {
    conZona("UTC");
    const ultimo = ultimoHitoPorCliente(
      [
        { client_id: "a", reached_at: "2026-10-01T12:00:00.000Z" },
        { client_id: "a", reached_at: "2026-10-05T12:00:00.000Z" },
        { client_id: "b", reached_at: "2026-10-06T01:00:00.000Z" },
        { client_id: "c", reached_at: null },
      ],
      AUCKLAND
    );
    // a: filas del diálogo viejo, con su día. b: 6-oct 01:00 UTC = 6-oct 14:00 en Auckland.
    expect(ultimo).toEqual({ a: "2026-10-05", b: "2026-10-06" });
  });
});
