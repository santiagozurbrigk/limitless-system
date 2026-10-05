/**
 * SCRUM-493: una sola convención para la fecha de un hito (`reached_at`), en la
 * zona de la organización. El diálogo guarda el mediodía del día elegido en esa
 * zona, todos lo leen en esa zona y "no futura" se valida por día. Los instantes
 * se arman en UTC y la zona del proceso se fija con `conZona`.
 */
import { afterEach, describe, expect, it } from "vitest";
import { conZona, restaurarZona } from "@/lib/fechas/__tests__/zona";
import {
  fechaDelHitoEnZona,
  hitoEsFuturo,
  instanteDelHito,
  ultimoHitoPorCliente,
} from "../fecha-del-hito";

afterEach(restaurarZona);

const AUCKLAND = "Pacific/Auckland";
const ARGENTINA = "America/Argentina/Buenos_Aires";
const MEXICO = "America/Mexico_City";

describe("⭐ un hito cargado a mano se lee con el día elegido", () => {
  it("lo guardado vuelve con el mismo día, mire quien lo mire", () => {
    for (const zonaOrg of [ARGENTINA, AUCKLAND, MEXICO, "Asia/Tokyo", "UTC"]) {
      for (const zonaDelNavegador of ["UTC", "Europe/Madrid", AUCKLAND]) {
        conZona(zonaDelNavegador);
        const guardado = instanteDelHito("2026-10-05", zonaOrg);
        expect(fechaDelHitoEnZona(guardado, zonaOrg), `${zonaOrg} desde ${zonaDelNavegador}`).toBe(
          "2026-10-05"
        );
      }
    }
  });

  it("el diálogo guarda el mediodía de la zona de la organización", () => {
    expect(instanteDelHito("2026-10-05", ARGENTINA)).toBe("2026-10-05T15:00:00.000Z");
    // Auckland en invierno (UTC+12) y en verano (UTC+13).
    expect(instanteDelHito("2026-07-16", AUCKLAND)).toBe("2026-07-16T00:00:00.000Z");
    expect(instanteDelHito("2026-10-05", AUCKLAND)).toBe("2026-10-04T23:00:00.000Z");
  });

  it("en Auckland: una fila del diálogo viejo (12:00 UTC exactas) se lee con su día", () => {
    conZona("UTC");
    expect(fechaDelHitoEnZona("2026-10-05T12:00:00.000Z", AUCKLAND)).toBe("2026-10-05");
    expect(fechaDelHitoEnZona("2026-10-05T12:00:00+00:00", ARGENTINA)).toBe("2026-10-05");
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

describe("⭐ registrar un hito de hoy, a cualquier hora (validación por día)", () => {
  it("Auckland, entre las 00:00 y las 00:05 de hoy: se guarda hoy y no es futuro", () => {
    conZona(AUCKLAND);
    // 16-jul 00:00 y 00:02 NZST (UTC+12) = 15-jul 12:00 y 12:02 UTC.
    for (const ahora of ["2026-07-15T12:00:00Z", "2026-07-15T12:02:00Z"]) {
      const guardado = instanteDelHito("2026-07-16", AUCKLAND);
      expect(fechaDelHitoEnZona(guardado, AUCKLAND), ahora).toBe("2026-07-16");
      expect(hitoEsFuturo(guardado, AUCKLAND, new Date(ahora)), ahora).toBe(false);
    }
  });

  it("Argentina a las 00:30 y a las 08:00: hoy no es futuro, y Ciudad de México lo lee con el mismo día", () => {
    // 5-oct 00:30 ART = 03:30 UTC; 08:00 ART = 11:00 UTC (el mediodía todavía no llegó).
    const guardado = instanteDelHito("2026-10-05", ARGENTINA);
    for (const ahora of ["2026-10-05T03:30:00Z", "2026-10-05T11:00:00Z"]) {
      expect(hitoEsFuturo(guardado, ARGENTINA, new Date(ahora)), ahora).toBe(false);
    }
    expect(fechaDelHitoEnZona(guardado, MEXICO)).toBe("2026-10-05");
  });

  it("con el reloj del navegador adelantado, el hito de hoy se acepta igual", () => {
    // El navegador cree que son las 11:55 ART y el servidor está en las 11:45 ART:
    // el mediodía de hoy queda en el futuro como instante, pero es hoy.
    const guardado = instanteDelHito("2026-10-05", ARGENTINA);
    expect(hitoEsFuturo(guardado, ARGENTINA, new Date("2026-10-05T14:45:00Z"))).toBe(false);
  });

  it("mañana sí es futuro", () => {
    const manana = instanteDelHito("2026-10-06", ARGENTINA);
    // 5-oct 23:30 ART = 6-oct 02:30 UTC: en UTC ya es el 6, en la org todavía no.
    expect(hitoEsFuturo(manana, ARGENTINA, new Date("2026-10-06T02:30:00Z"))).toBe(true);
    expect(hitoEsFuturo(manana, ARGENTINA, new Date("2026-10-06T03:30:00Z"))).toBe(false);
  });

  it("un instante real de ahora nunca es futuro", () => {
    const ahora = new Date("2026-10-06T01:00:00Z");
    expect(hitoEsFuturo(ahora.toISOString(), ARGENTINA, ahora)).toBe(false);
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
