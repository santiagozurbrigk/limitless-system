import { describe, expect, it } from "vitest";
import { esEmailValido, normalizarEmail, telefonoE164 } from "@/lib/webinar/identity";
import {
  LIMITE_DEL_CUERPO_BYTES,
  validarEventoDeLanding,
  type RegistroDeLanding,
  type VisitaDeLanding,
} from "@/lib/webinar/normalize/evento";
import {
  datosQueCompletan,
  diaUtc,
  filaDeLaVisita,
  filaDelEventoRegistrado,
  filaDelLead,
  filaDelRegistro,
  momentoDelEvento,
  motivoParaNoAsignar,
  MOTIVO_LANZAMIENTO_CERRADO,
  MOTIVO_LANZAMIENTO_DESCONOCIDO,
} from "@/lib/webinar/normalize/filas";
import {
  codigoSeguro,
  esErrorDefinitivo,
  MAXIMO_DE_REPROCESOS,
  mensajeDeCorteDefinitivo,
  mensajeDeFalla,
  mensajeDeReclamo,
  reprocesosHechos,
} from "@/lib/webinar/normalize/reproceso";

/** Datos de prueba inventados: ningún email ni teléfono es de una persona real. */
const REGISTRO = {
  type: "registration",
  launch_public_id: "0123456789abcdef0123456789abcdef",
  client_registration_id: "reg-1",
  name: "  Persona de Prueba ",
  email: "  Persona.Prueba@Ejemplo.TEST ",
  phone: "+54 9 11 5555-0000",
  tracking: { utm_source: "meta", utm_campaign: "lanzamiento", fbclid: "fb-1", sl: "", otro: "x" },
  ab_variant: "B",
  qualification: "alta",
  occurred_at: "2026-10-16T12:30:00.000-03:00",
};

const VISITA = {
  type: "visit",
  launch_public_id: "0123456789abcdef0123456789abcdef",
  visitor_id: "vis-1",
  occurred_at: "2026-10-16T23:30:00-03:00",
};

describe("identidad del lead", () => {
  it("⭐ el email normalizado va en minúsculas y sin ningún espacio", () => {
    expect(normalizarEmail("  Persona.Prueba@Ejemplo.TEST ")).toBe("persona.prueba@ejemplo.test");
    expect(normalizarEmail("per sona@ejemplo.test\t")).toBe("persona@ejemplo.test");
    // Dos formas del mismo email son la misma persona.
    expect(normalizarEmail(" A@B.TEST")).toBe(normalizarEmail("a@b.test  "));
  });

  it("valida la forma y el largo del email que acepta la base", () => {
    expect(esEmailValido("a@b.co")).toBe(true);
    expect(esEmailValido(" A@B.CO ")).toBe(true);
    expect(esEmailValido("sin-arroba.test")).toBe(false);
    expect(esEmailValido("a@sin-punto")).toBe(false);
    expect(esEmailValido("a@@b.test")).toBe(false);
    expect(esEmailValido(`${"a".repeat(320)}@b.test`)).toBe(false);
  });

  it("⭐ el teléfono pasa a E.164 sólo si trae código de país", () => {
    expect(telefonoE164("+54 9 11 5555-0000")).toBe("+5491155550000");
    expect(telefonoE164("+1 (555) 010.0000")).toBe("+15550100000");
    expect(telefonoE164("0054 11 5555 0000")).toBe("+541155550000");
    // Sin código de país no se adivina.
    expect(telefonoE164("11 5555 0000")).toBeNull();
    expect(telefonoE164("+0 11 5555")).toBeNull();
    expect(telefonoE164("+12345")).toBeNull();
    expect(telefonoE164("+1234567890123456")).toBeNull();
    expect(telefonoE164("+54 abc")).toBeNull();
    expect(telefonoE164("")).toBeNull();
    expect(telefonoE164(null)).toBeNull();
    expect(telefonoE164(undefined)).toBeNull();
  });
});

describe("contrato del evento de la landing", () => {
  it("el límite del cuerpo es 16 KB", () => {
    expect(LIMITE_DEL_CUERPO_BYTES).toBe(16384);
  });

  it("⭐ acepta un registro completo y limpia los textos", () => {
    const evento = validarEventoDeLanding(REGISTRO) as RegistroDeLanding;
    expect(evento).not.toBeNull();
    expect(evento.type).toBe("registration");
    expect(evento.name).toBe("Persona de Prueba");
    expect(evento.email).toBe("Persona.Prueba@Ejemplo.TEST");
    // Un texto vacío vale lo mismo que no mandarlo; las claves de más se ignoran.
    expect(evento.tracking).toEqual({
      utm_source: "meta",
      utm_medium: null,
      utm_campaign: "lanzamiento",
      utm_content: null,
      utm_term: null,
      fbclid: "fb-1",
      sl: null,
    });
  });

  it("acepta un registro mínimo y una visita mínima", () => {
    expect(
      validarEventoDeLanding({
        type: "registration",
        launch_public_id: "x",
        client_registration_id: "r",
        email: "a@b.co",
      }),
    ).toMatchObject({ name: null, phone: null, tracking: null, occurred_at: null });
    expect(validarEventoDeLanding({ type: "visit", launch_public_id: "x", visitor_id: "v" })).toMatchObject({
      occurred_at: null,
    });
  });

  it.each([
    ["sin type", { ...REGISTRO, type: undefined }],
    ["type desconocido", { ...REGISTRO, type: "purchase" }],
    ["registro sin email", { ...REGISTRO, email: undefined }],
    ["registro con email inválido", { ...REGISTRO, email: "no-es-email" }],
    ["registro sin client_registration_id", { ...REGISTRO, client_registration_id: undefined }],
    ["registro con client_registration_id vacío", { ...REGISTRO, client_registration_id: "   " }],
    ["registro con client_registration_id largo", { ...REGISTRO, client_registration_id: "r".repeat(201) }],
    ["sin launch_public_id", { ...REGISTRO, launch_public_id: undefined }],
    ["visita sin visitor_id", { ...VISITA, visitor_id: undefined }],
    ["occurred_at sin zona", { ...VISITA, occurred_at: "2026-10-16T12:00:00" }],
    ["occurred_at que no es fecha", { ...VISITA, occurred_at: "ayer" }],
    ["nombre de más de 200", { ...REGISTRO, name: "n".repeat(201) }],
    ["tracking que no es objeto", { ...REGISTRO, tracking: "utm" }],
    ["número en lugar de texto", { ...REGISTRO, email: 5 }],
    ["un array", [REGISTRO]],
    ["null", null],
  ])("⭐ rechaza: %s", (_caso, json) => {
    expect(validarEventoDeLanding(json)).toBeNull();
  });
});

describe("filas que salen del evento", () => {
  const registro = validarEventoDeLanding(REGISTRO) as RegistroDeLanding;
  const visita = validarEventoDeLanding(VISITA) as VisitaDeLanding;
  const RECIBIDO = "2026-10-16T16:00:00.000Z";

  it("el momento es el de la landing, o la hora en que llegó", () => {
    expect(momentoDelEvento(registro, RECIBIDO)).toBe("2026-10-16T15:30:00.000Z");
    expect(momentoDelEvento({ occurred_at: null }, RECIBIDO)).toBe(RECIBIDO);
  });

  it("⭐ el día de la visita es en UTC, sin importar la zona del servidor", () => {
    // 23:30 en Buenos Aires ya es el día siguiente en UTC.
    expect(diaUtc(momentoDelEvento(visita, RECIBIDO))).toBe("2026-10-17");
    expect(filaDeLaVisita(visita, { organizationId: "org", launchId: "l", recibidoEn: RECIBIDO })).toEqual({
      organization_id: "org",
      launch_id: "l",
      visitor_id: "vis-1",
      day: "2026-10-17",
    });
  });

  it("lead: email normalizado, teléfono E.164 y primera vez visto", () => {
    expect(filaDelLead(registro, "org", RECIBIDO)).toEqual({
      organization_id: "org",
      email: "Persona.Prueba@Ejemplo.TEST",
      email_normalized: "persona.prueba@ejemplo.test",
      name: "Persona de Prueba",
      phone_e164: "+5491155550000",
      first_seen_at: "2026-10-16T15:30:00.000Z",
    });
  });

  it("un lead existente sólo completa lo que le faltaba", () => {
    const nuevo = { name: "Otro Nombre", phone_e164: "+5491100000000" };
    expect(datosQueCompletan({ name: null, phone_e164: null }, nuevo)).toEqual(nuevo);
    expect(datosQueCompletan({ name: "Primero", phone_e164: null }, nuevo)).toEqual({
      phone_e164: "+5491100000000",
    });
    expect(datosQueCompletan({ name: "Primero", phone_e164: "+5491111111111" }, nuevo)).toEqual({});
    expect(datosQueCompletan({ name: null, phone_e164: null }, { name: null, phone_e164: null })).toEqual({});
  });

  it("registro con el tracking y el evento crudo", () => {
    expect(
      filaDelRegistro(registro, {
        organizationId: "org",
        launchId: "l",
        leadId: "lead",
        eventoCrudoId: "crudo",
        recibidoEn: RECIBIDO,
      }),
    ).toEqual({
      organization_id: "org",
      launch_id: "l",
      lead_id: "lead",
      client_registration_id: "reg-1",
      registered_at: "2026-10-16T15:30:00.000Z",
      utm_source: "meta",
      utm_medium: null,
      utm_campaign: "lanzamiento",
      utm_content: null,
      utm_term: null,
      fbclid: "fb-1",
      sl: null,
      ab_variant: "B",
      qualification: "alta",
      raw_event_id: "crudo",
    });
  });

  it("⭐ el evento registered sale del registro guardado (el primero)", () => {
    expect(
      filaDelEventoRegistrado({
        organization_id: "org",
        launch_id: "l",
        lead_id: "lead",
        client_registration_id: "reg-primero",
        registered_at: "2026-10-15T00:00:00.000Z",
      }),
    ).toEqual({
      organization_id: "org",
      lead_id: "lead",
      launch_id: "l",
      kind: "registered",
      occurred_at: "2026-10-15T00:00:00.000Z",
      source: "landing",
      source_ref: "reg-primero",
    });
  });

  it("⭐ lanzamiento desconocido o cerrado no se asigna; borrador y activo sí", () => {
    expect(motivoParaNoAsignar(null)).toBe(MOTIVO_LANZAMIENTO_DESCONOCIDO);
    expect(motivoParaNoAsignar({ id: "l", status: "closed" })).toBe(MOTIVO_LANZAMIENTO_CERRADO);
    expect(motivoParaNoAsignar({ id: "l", status: "active" })).toBeNull();
    expect(motivoParaNoAsignar({ id: "l", status: "draft" })).toBeNull();
  });
});

describe("textos del error y cuenta de reprocesos", () => {
  it("el código sólo entra si es un SQLSTATE o de PostgREST", () => {
    expect(codigoSeguro("08006")).toBe("08006");
    expect(codigoSeguro("PGRST301")).toBe("PGRST301");
    expect(codigoSeguro("persona@ejemplo.test")).toBeNull();
    expect(codigoSeguro("")).toBeNull();
    expect(codigoSeguro(undefined)).toBeNull();
  });

  it("⭐ cuenta los reprocesos desde el texto guardado", () => {
    expect(mensajeDeFalla("lead", "08006")).toBe("Falló la normalización en lead (código 08006).");
    expect(reprocesosHechos(mensajeDeFalla("lead", "08006"))).toBe(0);
    expect(reprocesosHechos(null)).toBe(0);
    expect(reprocesosHechos(mensajeDeReclamo(3))).toBe(3);
    expect(mensajeDeFalla("registro", null, 2)).toBe("Falló la normalización en registro. Reproceso 2 de 5.");
    expect(reprocesosHechos(mensajeDeFalla("registro", null, 2))).toBe(2);
    expect(esErrorDefinitivo(mensajeDeFalla("registro", null, 2))).toBe(false);
  });

  it("⭐ el último reproceso fallido es definitivo", () => {
    expect(MAXIMO_DE_REPROCESOS).toBe(5);
    const definitivo = mensajeDeFalla("evento", "57014", 5);
    expect(definitivo).toBe(
      "Falló la normalización en evento (código 57014). Reproceso 5 de 5: no se reintenta más.",
    );
    expect(esErrorDefinitivo(definitivo)).toBe(true);
    expect(esErrorDefinitivo(mensajeDeCorteDefinitivo())).toBe(true);
    expect(esErrorDefinitivo(null)).toBe(false);
  });
});
