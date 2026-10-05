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
  diaLocal,
  esFechaCalendario,
  diasEntre,
  fechaAInstanteEnZona,
  inicioDelDiaEnZona,
  fechaDeHoyEnZona,
  fechaDeInstanteEnZona,
  fechaDeValorGuardado,
  fechaEnZona,
  fechaVencida,
  formatearFechaGuardada,
  resolverZonaHoraria,
  sumarDias,
} from "../calendario";
import { conZona, restaurarZona } from "./zona";

/** 1-oct-2026, 22:00 en Buenos Aires (UTC-3): ya es 2-oct en UTC. */
const LAS_22_EN_ARGENTINA = new Date("2026-10-02T01:00:00Z");

afterEach(restaurarZona);

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
    expect(
      sumarDias(fechaDeHoyEnZona("America/Santiago", new Date("2026-09-06T03:30:00Z")), 2)
    ).toBe("2026-09-07");
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

  it("⭐ no corta un instante para quedarse con su día de UTC: sólo acepta YYYY-MM-DD", () => {
    // 30-sep 22:00 en Argentina = 1-oct 01:00 UTC. Cortar el texto daría el 1
    // (no vencida) cuando la fecha local es el 30. Un instante se convierte
    // antes con `fechaDeValorGuardado` o `fechaDeInstanteEnZona`; sin convertir, no vence.
    expect(fechaVencida("2026-10-01T01:00:00Z", hoy)).toBe(false);
    expect(fechaVencida("2026-09-30T23:00:00Z", hoy)).toBe(false);
    expect(fechaVencida("2026-02-31", hoy)).toBe(false);
    conZona("America/Argentina/Buenos_Aires");
    expect(fechaVencida(fechaDeInstanteEnZona("2026-10-01T01:00:00Z", "America/Argentina/Buenos_Aires"), hoy)).toBe(true);
  });
});

describe("fechaDeValorGuardado (lectura de una fecha elegida)", () => {
  it("una fecha sin hora (columna date) pasa tal cual, en cualquier zona", () => {
    for (const zona of ["UTC", "America/Argentina/Buenos_Aires", "Asia/Tokyo"]) {
      conZona(zona);
      expect(fechaDeValorGuardado("2026-10-05", "America/Argentina/Buenos_Aires")).toBe("2026-10-05");
    }
  });

  it("⭐ un instante elegido a las 22:00 de Argentina se muestra con ese día", () => {
    conZona("America/Argentina/Buenos_Aires");
    // 5-oct 22:00 en Buenos Aires = 6-oct 01:00 UTC.
    expect(fechaDeValorGuardado("2026-10-06T01:00:00.000Z", "America/Argentina/Buenos_Aires")).toBe("2026-10-05");
    expect(fechaDeValorGuardado("2026-10-06T01:00:00+00:00", "America/Argentina/Buenos_Aires")).toBe("2026-10-05");
  });

  it("⭐ lo guardado al mediodía de la zona de quien mira vuelve igual, en cualquier zona", () => {
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
        expect(fechaDeValorGuardado(fechaAInstanteEnZona(fecha, zona), zona), `${fecha} en ${zona}`).toBe(fecha);
      }
    }
  });

  it("una fecha guardada en timestamptz a medianoche UTC se lee con su día", () => {
    // Así guarda Postgres un 'YYYY-MM-DD' en una columna timestamptz, y así
    // guardaba el seguimiento del lead la fecha del próximo paso.
    conZona("America/Argentina/Buenos_Aires");
    expect(fechaDeValorGuardado("2026-10-05T00:00:00+00:00", "America/Argentina/Buenos_Aires")).toBe("2026-10-05");
    expect(fechaDeValorGuardado("2026-10-05T00:00:00.000Z", "America/Argentina/Buenos_Aires")).toBe("2026-10-05");
  });

  it("sin valor o con un valor que no se entiende, vacío", () => {
    expect(fechaDeValorGuardado(null, null)).toBe("");
    expect(fechaDeValorGuardado(undefined, null)).toBe("");
    expect(fechaDeValorGuardado("", null)).toBe("");
    expect(fechaDeValorGuardado("mañana", null)).toBe("");
    expect(fechaDeValorGuardado("2026-02-31", null)).toBe("");
  });
});

describe("fechaDeValorGuardado (lectura en la zona de la organización)", () => {
  it("⭐ un instante se lee con el día de la zona pedida, no con el de UTC ni el del proceso", () => {
    for (const zonaDelProceso of ["UTC", "Asia/Tokyo"]) {
      conZona(zonaDelProceso);
      // 5-oct 22:00 en Buenos Aires = 6-oct 01:00 UTC.
      expect(fechaDeValorGuardado("2026-10-06T01:00:00Z", "America/Argentina/Buenos_Aires")).toBe(
        "2026-10-05"
      );
      expect(fechaDeValorGuardado("2026-10-06T01:00:00Z", "Europe/Madrid")).toBe("2026-10-06");
    }
  });

  it("aplica las reglas de una fecha elegida en la zona de la org", () => {
    conZona("UTC");
    const argentina = "America/Argentina/Buenos_Aires";
    expect(fechaDeValorGuardado("2026-10-05", argentina)).toBe("2026-10-05");
    // Medianoche UTC exacta: una fecha sin hora guardada en timestamptz.
    expect(fechaDeValorGuardado("2026-10-05T00:00:00+00:00", argentina)).toBe("2026-10-05");
    expect(fechaDeValorGuardado(null, argentina)).toBe("");
    expect(fechaDeValorGuardado("mañana", argentina)).toBe("");
    // Zona nula: la de por defecto (Argentina).
    expect(fechaDeValorGuardado("2026-10-06T01:00:00Z", null)).toBe("2026-10-05");
  });

  it("lo guardado al mediodía de la org se lee igual en la zona de la org", () => {
    conZona("Asia/Tokyo");
    const guardado = fechaAInstanteEnZona("2026-10-05", "America/Argentina/Buenos_Aires");
    conZona("UTC");
    expect(fechaDeValorGuardado(guardado, "America/Argentina/Buenos_Aires")).toBe("2026-10-05");
  });
});

describe("formatearFechaGuardada", () => {
  it("⭐ muestra sólo la fecha, con el mismo día que el campo de fecha", () => {
    conZona("America/Argentina/Buenos_Aires");
    const opciones = { day: "2-digit", month: "2-digit", year: "numeric" } as const;
    // 5-oct 22:00 en Argentina: con toLocaleString de un instante salía la hora.
    expect(formatearFechaGuardada("2026-10-06T01:00:00Z", { opciones, zona: "America/Argentina/Buenos_Aires" })).toBe("05/10/2026");
    // Fila vieja del seguimiento del lead, a medianoche UTC.
    expect(formatearFechaGuardada("2026-10-05T00:00:00+00:00", { opciones, zona: "America/Argentina/Buenos_Aires" })).toBe("05/10/2026");
    expect(formatearFechaGuardada("2026-10-05", { opciones, zona: "America/Argentina/Buenos_Aires" })).toBe("05/10/2026");
    expect(formatearFechaGuardada(null, { opciones, zona: "America/Argentina/Buenos_Aires" })).toBeNull();
    expect(formatearFechaGuardada("mañana", { opciones, zona: "America/Argentina/Buenos_Aires" })).toBeNull();
  });

  it("⭐ con la zona de la organización, el día es el mismo en cualquier navegador", () => {
    const opciones = { day: "2-digit", month: "2-digit", year: "numeric" } as const;
    const zona = "America/Argentina/Buenos_Aires";
    for (const zonaDelNavegador of ["Europe/Madrid", "Asia/Tokyo", zona]) {
      conZona(zonaDelNavegador);
      // 5-oct 22:00 ART: en Madrid y en Tokio ya es el 6.
      expect(formatearFechaGuardada("2026-10-06T01:00:00Z", { opciones, zona })).toBe("05/10/2026");
    }
  });
});

describe("fechaAInstanteEnZona", () => {
  it("⭐ guarda el mediodía de la zona pedida, sin importar la del proceso", () => {
    for (const zonaDelProceso of ["UTC", "Europe/Madrid", "Asia/Tokyo"]) {
      conZona(zonaDelProceso);
      expect(fechaAInstanteEnZona("2026-10-05", "America/Argentina/Buenos_Aires")).toBe(
        "2026-10-05T15:00:00.000Z"
      );
      expect(fechaAInstanteEnZona("2026-10-05", "Asia/Tokyo")).toBe("2026-10-05T03:00:00.000Z");
    }
  });

  it("respeta el horario de verano de la zona", () => {
    conZona("UTC");
    // Madrid: verano UTC+2 (julio), invierno UTC+1 (enero). Nueva York: el día del cambio.
    expect(fechaAInstanteEnZona("2026-07-15", "Europe/Madrid")).toBe("2026-07-15T10:00:00.000Z");
    expect(fechaAInstanteEnZona("2026-01-15", "Europe/Madrid")).toBe("2026-01-15T11:00:00.000Z");
    expect(fechaAInstanteEnZona("2026-03-08", "America/New_York")).toBe("2026-03-08T16:00:00.000Z");
    expect(fechaAInstanteEnZona("2026-11-01", "America/New_York")).toBe("2026-11-01T17:00:00.000Z");
  });

  it("ida y vuelta con fechaDeValorGuardado en la misma zona, en zonas de -11 a +14", () => {
    conZona("Europe/Madrid");
    for (const zona of ["Pacific/Pago_Pago", "America/Mexico_City", "Pacific/Auckland", "Pacific/Kiritimati"]) {
      for (const fecha of ["2026-01-01", "2026-07-16", "2026-12-31"]) {
        expect(fechaDeValorGuardado(fechaAInstanteEnZona(fecha, zona), zona), `${fecha} ${zona}`).toBe(fecha);
      }
    }
  });

  it("zona nula o inválida: la de por defecto; fecha inválida: error", () => {
    expect(fechaAInstanteEnZona("2026-10-05", null)).toBe("2026-10-05T15:00:00.000Z");
    expect(fechaAInstanteEnZona("2026-10-05", "Marte/Olimpo")).toBe("2026-10-05T15:00:00.000Z");
    expect(() => fechaAInstanteEnZona("2026-02-31", null)).toThrow(RangeError);
  });
});

describe("inicioDelDiaEnZona y diasEntre", () => {
  it("⭐ el primer instante del día de la org, sin importar la zona del proceso", () => {
    for (const zonaDelProceso of ["UTC", "Europe/Madrid"]) {
      conZona(zonaDelProceso);
      expect(inicioDelDiaEnZona("2026-10-05", "America/Argentina/Buenos_Aires")).toBe(
        "2026-10-05T03:00:00.000Z"
      );
    }
  });

  it("si la medianoche no existe (Santiago adelanta a las 00:00), es la 01:00", () => {
    // 6-sep-2026 en Santiago: de 23:59:59 (-04) se pasa a 01:00 (-03).
    expect(inicioDelDiaEnZona("2026-09-06", "America/Santiago")).toBe("2026-09-06T04:00:00.000Z");
  });

  it("diasEntre cuenta días calendario, también cruzando año y horario de verano", () => {
    expect(diasEntre("2026-10-01", "2026-10-02")).toBe(1);
    expect(diasEntre("2026-12-31", "2027-01-01")).toBe(1);
    expect(diasEntre("2026-10-05", "2026-10-01")).toBe(-4);
    expect(diasEntre("2026-03-07", "2026-03-09")).toBe(2);
    expect(() => diasEntre("hoy", "2026-10-01")).toThrow(RangeError);
  });
});

describe("fechaDeInstanteEnZona (instantes reales)", () => {
  it("una llamada a las 00:00:00 UTC en punto es de las 21:00 en Argentina: el día anterior", () => {
    expect(fechaDeInstanteEnZona("2026-10-02T00:00:00Z", "America/Argentina/Buenos_Aires")).toBe(
      "2026-10-01"
    );
    // En cambio, como fecha elegida (fechaDeValorGuardado) es el 2.
    expect(fechaDeValorGuardado("2026-10-02T00:00:00Z", "America/Argentina/Buenos_Aires")).toBe(
      "2026-10-02"
    );
    expect(fechaDeInstanteEnZona("2026-10-02", "America/Argentina/Buenos_Aires")).toBe("2026-10-02");
    expect(fechaDeInstanteEnZona("ayer", null)).toBe("");
  });
});

describe("diaLocal", () => {
  it("⭐ muestra el día de la fecha, no el anterior", () => {
    conZona("America/Argentina/Buenos_Aires");
    // `new Date("2026-10-04")` es medianoche UTC: en Argentina, el 3 a las 21.
    expect(new Date("2026-10-04").getDate()).toBe(3);
    expect(diaLocal("2026-10-04").getDate()).toBe(4);
  });

  it("no acepta una fecha que no existe ni un instante", () => {
    expect(() => diaLocal("2026-02-31")).toThrow(RangeError);
    // Un instante se convierte antes (`fechaDeValorGuardado`): cortarlo es quedarse
    // con su día de UTC.
    expect(() => diaLocal("2026-10-06T01:00:00Z")).toThrow(RangeError);
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
