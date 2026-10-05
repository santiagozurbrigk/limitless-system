/**
 * SCRUM-493: la utilidad común de fechas calendario.
 *
 * Los casos que prueban el bug arman el instante **explícito en UTC** (las
 * 22:00 de Argentina son la 01:00 UTC del día siguiente) y fijan la zona del
 * proceso con `process.env.TZ`. Así fallan con el código viejo
 * (`toISOString().slice(0, 10)`) en cualquier máquina o CI, sin importar su
 * zona. `conZona` comprueba que la zona cambió de verdad: si alguien pasa
 * vitest al pool `threads` (donde cambiar `TZ` no hace efecto), el test falla en
 * vez de pasar sin probar nada.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  ZONA_HORARIA_POR_DEFECTO,
  aFechaDeInput,
  diaLocal,
  esFechaCalendario,
  fechaAInstanteLocal,
  fechaDeHoyEnZona,
  fechaDeHoyLocal,
  fechaEnZona,
  fechaLocal,
  fechaVencida,
  resolverZonaHoraria,
  sumarDias,
} from "../calendario";
import { conZona, restaurarZona } from "./zona";

/** 1-oct-2026, 22:00 en Buenos Aires (UTC-3): ya es 2-oct en UTC. */
const LAS_22_EN_ARGENTINA = new Date("2026-10-02T01:00:00Z");

afterEach(restaurarZona);

describe("fechaDeHoyLocal", () => {
  it("⭐ en Argentina, a las 22:00 sigue siendo el mismo día", () => {
    conZona("America/Argentina/Buenos_Aires");
    expect(fechaDeHoyLocal(LAS_22_EN_ARGENTINA)).toBe("2026-10-01");
  });

  it("a las 23:59 locales también", () => {
    conZona("America/Argentina/Buenos_Aires");
    expect(fechaDeHoyLocal(new Date("2026-10-02T02:59:00Z"))).toBe("2026-10-01");
  });

  it("completa con ceros el mes y el día", () => {
    conZona("UTC");
    expect(fechaDeHoyLocal(new Date("2026-01-05T12:00:00Z"))).toBe("2026-01-05");
  });

  it("es la fecha local de quien mira, en cualquier zona", () => {
    conZona("Asia/Tokyo");
    // 2-oct 01:00 UTC = 2-oct 10:00 en Tokio.
    expect(fechaLocal(LAS_22_EN_ARGENTINA)).toBe("2026-10-02");
  });
});

describe("sumarDias", () => {
  it("cruza fin de mes", () => {
    expect(sumarDias("2026-01-31", 1)).toBe("2026-02-01");
    expect(sumarDias("2026-09-30", 2)).toBe("2026-10-02");
  });

  it("cruza fin de año, para adelante y para atrás", () => {
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(sumarDias("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("respeta los bisiestos", () => {
    expect(sumarDias("2028-02-28", 1)).toBe("2028-02-29");
    expect(sumarDias("2027-02-28", 1)).toBe("2027-03-01");
  });

  it("⭐ un cambio de horario de verano no corre el resultado", () => {
    // Nueva York adelanta el reloj el 8-mar-2026 (ese día dura 23 horas) y lo
    // atrasa el 1-nov-2026 (25 horas). Contar milisegundos desde la medianoche
    // local cae en otro día; contar sobre el calendario, no.
    conZona("America/New_York");
    expect(sumarDias("2026-03-07", 1)).toBe("2026-03-08");
    expect(sumarDias("2026-03-08", 1)).toBe("2026-03-09");
    expect(sumarDias("2026-10-31", 1)).toBe("2026-11-01");
    expect(sumarDias("2026-11-01", 1)).toBe("2026-11-02");
    // Santiago de Chile adelanta a las 00:00 del 6-sep-2026: esa medianoche no
    // existe en el reloj local.
    conZona("America/Santiago");
    expect(sumarDias("2026-09-05", 1)).toBe("2026-09-06");
    expect(sumarDias("2026-09-05", 2)).toBe("2026-09-07");
    // A las 23:30 del 5-sep en Santiago (02:30 UTC del 6), hoy + 2 sigue siendo el 7.
    expect(sumarDias(fechaDeHoyLocal(new Date("2026-09-06T03:30:00Z")), 2)).toBe("2026-09-07");
  });

  it("no acepta una fecha que no existe ni días con decimales", () => {
    expect(() => sumarDias("2026-02-31", 1)).toThrow(RangeError);
    expect(() => sumarDias("hoy", 1)).toThrow(RangeError);
    expect(() => sumarDias("2026-10-01", 1.5)).toThrow(RangeError);
  });
});

describe("fechaDeHoyEnZona (el hoy del servidor)", () => {
  it("⭐ a las 22:00 de Argentina, la organización de Argentina sigue en el mismo día", () => {
    // El servidor corre en UTC: su reloj local ya dice 2-oct.
    conZona("UTC");
    expect(fechaDeHoyEnZona("America/Argentina/Buenos_Aires", LAS_22_EN_ARGENTINA)).toBe(
      "2026-10-01"
    );
  });

  it("no depende de la zona del proceso", () => {
    for (const zonaDelProceso of ["UTC", "Asia/Tokyo", "America/Los_Angeles"]) {
      conZona(zonaDelProceso);
      expect(fechaDeHoyEnZona("America/Argentina/Buenos_Aires", LAS_22_EN_ARGENTINA)).toBe(
        "2026-10-01"
      );
      expect(fechaDeHoyEnZona("Europe/Madrid", LAS_22_EN_ARGENTINA)).toBe("2026-10-02");
    }
  });

  it("⭐ con zona nula, vacía o inválida usa la de por defecto", () => {
    conZona("UTC");
    expect(ZONA_HORARIA_POR_DEFECTO).toBe("America/Argentina/Buenos_Aires");
    expect(fechaDeHoyEnZona(null, LAS_22_EN_ARGENTINA)).toBe("2026-10-01");
    expect(fechaDeHoyEnZona(undefined, LAS_22_EN_ARGENTINA)).toBe("2026-10-01");
    expect(fechaDeHoyEnZona("", LAS_22_EN_ARGENTINA)).toBe("2026-10-01");
    expect(fechaDeHoyEnZona("Marte/Olimpo", LAS_22_EN_ARGENTINA)).toBe("2026-10-01");
  });

  it("resolverZonaHoraria deja pasar las zonas que existen", () => {
    expect(resolverZonaHoraria("Europe/Madrid")).toBe("Europe/Madrid");
    expect(resolverZonaHoraria(" America/Mexico_City ")).toBe("America/Mexico_City");
    expect(resolverZonaHoraria("Marte/Olimpo")).toBe(ZONA_HORARIA_POR_DEFECTO);
    expect(resolverZonaHoraria(null)).toBe(ZONA_HORARIA_POR_DEFECTO);
  });

  it("fechaEnZona convierte cualquier instante", () => {
    expect(fechaEnZona(new Date("2026-12-31T23:30:00Z"), "Asia/Tokyo")).toBe("2027-01-01");
    expect(fechaEnZona(new Date("2027-01-01T02:00:00Z"), "America/Argentina/Buenos_Aires")).toBe(
      "2026-12-31"
    );
  });
});

describe("fechaVencida", () => {
  const hoy = "2026-10-01";

  it("lo que vence hoy no venció; lo de ayer sí", () => {
    expect(fechaVencida("2026-10-01", hoy)).toBe(false);
    expect(fechaVencida("2026-09-30", hoy)).toBe(true);
    expect(fechaVencida("2026-10-02", hoy)).toBe(false);
  });

  it("sin fecha no vence", () => {
    expect(fechaVencida(null, hoy)).toBe(false);
    expect(fechaVencida(undefined, hoy)).toBe(false);
    expect(fechaVencida("", hoy)).toBe(false);
  });

  it("de una fecha con hora toma el día que trae escrito", () => {
    expect(fechaVencida("2026-09-30T23:00:00Z", hoy)).toBe(true);
    expect(fechaVencida("2026-10-01T00:00:00Z", hoy)).toBe(false);
  });
});

describe("aFechaDeInput y fechaAInstanteLocal (ida y vuelta)", () => {
  it("una fecha sin hora (columna date) pasa tal cual, en cualquier zona", () => {
    for (const zona of ["UTC", "America/Argentina/Buenos_Aires", "Asia/Tokyo"]) {
      conZona(zona);
      expect(aFechaDeInput("2026-10-05")).toBe("2026-10-05");
    }
  });

  it("⭐ un instante elegido a las 22:00 de Argentina se muestra con ese día", () => {
    conZona("America/Argentina/Buenos_Aires");
    // 5-oct 22:00 en Buenos Aires = 6-oct 01:00 UTC.
    expect(aFechaDeInput("2026-10-06T01:00:00.000Z")).toBe("2026-10-05");
    expect(aFechaDeInput("2026-10-06T01:00:00+00:00")).toBe("2026-10-05");
  });

  it("⭐ la fecha guardada vuelve igual, en cualquier zona", () => {
    for (const zona of [
      "UTC",
      "America/Argentina/Buenos_Aires",
      "America/Los_Angeles",
      "Asia/Tokyo",
      "Pacific/Auckland",
      "Pacific/Kiritimati",
    ]) {
      conZona(zona);
      for (const fecha of ["2026-10-05", "2026-12-31", "2027-01-01", "2026-03-08", "2026-11-01"]) {
        expect(aFechaDeInput(fechaAInstanteLocal(fecha)), `${fecha} en ${zona}`).toBe(fecha);
      }
    }
  });

  it("una fecha guardada en timestamptz a medianoche UTC se lee con su día", () => {
    // Así guarda Postgres un 'YYYY-MM-DD' en una columna timestamptz, y así
    // guardaba el seguimiento del lead la fecha del próximo paso.
    conZona("America/Argentina/Buenos_Aires");
    expect(aFechaDeInput("2026-10-05T00:00:00+00:00")).toBe("2026-10-05");
    expect(aFechaDeInput("2026-10-05T00:00:00.000Z")).toBe("2026-10-05");
  });

  it("sin valor o con un valor que no se entiende, vacío", () => {
    expect(aFechaDeInput(null)).toBe("");
    expect(aFechaDeInput(undefined)).toBe("");
    expect(aFechaDeInput("")).toBe("");
    expect(aFechaDeInput("mañana")).toBe("");
    expect(aFechaDeInput("2026-02-31")).toBe("");
  });

  it("fechaAInstanteLocal guarda el mediodía local", () => {
    conZona("America/Argentina/Buenos_Aires");
    expect(fechaAInstanteLocal("2026-10-05")).toBe("2026-10-05T15:00:00.000Z");
  });
});

describe("diaLocal", () => {
  it("⭐ muestra el día de la fecha, no el anterior", () => {
    conZona("America/Argentina/Buenos_Aires");
    // `new Date("2026-10-04")` es medianoche UTC: en Argentina, el 3 a las 21.
    expect(new Date("2026-10-04").getDate()).toBe(3);
    expect(diaLocal("2026-10-04").getDate()).toBe(4);
    expect(diaLocal("2026-10-04T00:00:00Z").getDate()).toBe(4);
  });

  it("no acepta una fecha que no existe", () => {
    expect(() => diaLocal("2026-02-31")).toThrow(RangeError);
  });
});

describe("esFechaCalendario", () => {
  it("sólo fechas YYYY-MM-DD que existen", () => {
    expect(esFechaCalendario("2026-10-05")).toBe(true);
    expect(esFechaCalendario("2028-02-29")).toBe(true);
    expect(esFechaCalendario("2027-02-29")).toBe(false);
    expect(esFechaCalendario("2026-10-05T00:00:00Z")).toBe(false);
    expect(esFechaCalendario("5/10/2026")).toBe(false);
  });
});
