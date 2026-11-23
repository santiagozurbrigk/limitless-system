import { describe, expect, it } from "vitest";
import { esEmailValido, normalizarEmail, telefonoE164 } from "@/lib/webinar/identity";
import {
  esJsonGuardable,
  esTextoGuardable,
  estaEnLaVentana,
  LIMITE_DEL_CUERPO_BYTES,
  PROFUNDIDAD_MAXIMA,
  validarEventoDeLanding as validarConReferencia,
  VENTANA_HACIA_ADELANTE_MS,
  VENTANA_HACIA_ATRAS_MS,
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
import { codigoSeguro, MAXIMO_DE_REPROCESOS, mensajeDeFalla } from "@/lib/webinar/normalize/reproceso";

/** La hora de llegada de los ejemplos: los `occurred_at` de abajo caen en su ventana. */
const LLEGADA = new Date("2026-10-17T03:00:00.000Z");
const validarEventoDeLanding = (json: unknown) => validarConReferencia(json, { referencia: LLEGADA });

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

  it("⭐ el texto de la falla es fijo: paso y código, sin cuenta (la cuenta es una columna)", () => {
    expect(mensajeDeFalla("lead", "08006")).toBe("Falló la normalización en lead (código 08006).");
    expect(mensajeDeFalla("registro", null)).toBe("Falló la normalización en registro.");
    expect(mensajeDeFalla("evento", "Key (email)=(x@y.test)")).toBe("Falló la normalización en evento.");
    expect(MAXIMO_DE_REPROCESOS).toBe(5);
  });
});

describe("⭐ lo que pasa la validación se puede guardar (AR pasada 1, MAYOR-1)", () => {
  const base = () => ({ ...REGISTRO });

  it("esTextoGuardable coincide con String.prototype.isWellFormed y rechaza NUL", () => {
    const casos = ["normal", "emoji \u{1F600}", "a\uD800", "\uDC00b", "a\uDBFF\uDFFFb", "", "ñandú"];
    for (const texto of casos) {
      const bienFormado = (texto as string & { isWellFormed(): boolean }).isWellFormed();
      expect(esTextoGuardable(texto), JSON.stringify(texto)).toBe(bienFormado);
    }
    expect(esTextoGuardable("Persona\u0000Prueba")).toBe(false);
  });

  it.each([
    ["NUL en un campo del contrato", { ...base(), name: "Persona\u0000Prueba" }],
    ["NUL en un campo de más", { ...base(), extra: "x\u0000" }],
    ["NUL en una clave de más", { ...base(), ["cla\u0000ve"]: "x" }],
    ["NUL en el visitor_id", { ...VISITA, visitor_id: "v\u0000" }],
    ["NUL dentro de tracking", { ...base(), tracking: { utm_source: "a\u0000" } }],
    ["surrogate alto suelto", { ...base(), name: "Persona \uD800" }],
    ["surrogate bajo suelto en un campo de más", { ...base(), extra: ["\uDC00"] }],
    ["surrogate suelto en una clave", { ...base(), ["\uD83D"]: 1 }],
  ])("⭐ rechaza: %s", (_caso, json) => {
    expect(validarEventoDeLanding(json)).toBeNull();
  });

  it("un emoji bien formado pasa", () => {
    expect(validarEventoDeLanding({ ...base(), name: "Persona \u{1F600}" })).not.toBeNull();
  });

  it("⭐ profundidad: hasta PROFUNDIDAD_MAXIMA niveles sí, uno más no, y 6000 tampoco", () => {
    const anidado = (n: number): unknown => (n === 0 ? "x" : [anidado(n - 1)]);
    expect(PROFUNDIDAD_MAXIMA).toBe(10);
    // El objeto raíz es el nivel 0: `extra` con 9 arrays llega al nivel 10 con su texto.
    expect(esJsonGuardable({ extra: anidado(PROFUNDIDAD_MAXIMA - 1) })).toBe(true);
    expect(esJsonGuardable({ extra: anidado(PROFUNDIDAD_MAXIMA) })).toBe(false);
    expect(validarEventoDeLanding({ ...base(), extra: anidado(PROFUNDIDAD_MAXIMA) })).toBeNull();
    const profundo = JSON.parse(`{"x":${"[".repeat(6000)}${"]".repeat(6000)}}`);
    expect(esJsonGuardable(profundo)).toBe(false);
  });
});

describe("⭐ ventana de occurred_at (AR pasadas 1 y 2: fuera de ella se ignora, no se rechaza)", () => {
  const llegada = LLEGADA.getTime();
  const iso = (ms: number) => new Date(ms).toISOString();

  it("30 días hacia atrás y 5 minutos hacia adelante", () => {
    expect(VENTANA_HACIA_ATRAS_MS).toBe(30 * 24 * 3600 * 1000);
    expect(VENTANA_HACIA_ADELANTE_MS).toBe(5 * 60 * 1000);
    expect(estaEnLaVentana(iso(llegada - VENTANA_HACIA_ATRAS_MS), LLEGADA)).toBe(true);
    expect(estaEnLaVentana(iso(llegada - VENTANA_HACIA_ATRAS_MS - 1), LLEGADA)).toBe(false);
    expect(estaEnLaVentana(iso(llegada + VENTANA_HACIA_ADELANTE_MS), LLEGADA)).toBe(true);
    expect(estaEnLaVentana(iso(llegada + VENTANA_HACIA_ADELANTE_MS + 1), LLEGADA)).toBe(false);
    expect(estaEnLaVentana("no es fecha", LLEGADA)).toBe(false);
  });

  it.each([
    ["año 0", "0000-01-01T00:00:00Z"],
    ["año 10000 en UTC", "9999-12-31T23:59:59-01:00"],
    ["1900", "1900-01-01T00:00:00Z"],
    ["2999", "2999-01-01T00:00:00Z"],
    ["31 días antes", "2026-09-16T02:59:59Z"],
    ["6 minutos después", "2026-10-17T03:06:00Z"],
    ["60 minutos después", "2026-10-17T04:00:00Z"],
  ])("⭐ acepta un registro y una visita con occurred_at %s, pero sin la fecha (vale la llegada)", (_caso, occurred_at) => {
    const registro = validarEventoDeLanding({ ...REGISTRO, occurred_at }) as RegistroDeLanding;
    const visita = validarEventoDeLanding({ ...VISITA, occurred_at }) as VisitaDeLanding;
    expect(registro).not.toBeNull();
    expect(visita).not.toBeNull();
    expect(registro.occurred_at).toBeNull();
    expect(visita.occurred_at).toBeNull();
    expect(momentoDelEvento(registro, LLEGADA.toISOString())).toBe(LLEGADA.toISOString());
    expect(filaDeLaVisita(visita, { organizationId: "o", launchId: "l", recibidoEn: LLEGADA.toISOString() }).day).toBe(
      "2026-10-17",
    );
  });

  it.each([
    ["que no es fecha", "ayer"],
    ["sin zona", "2026-10-17T03:00:00"],
  ])("un occurred_at %s sigue siendo un payload fuera de contrato (400)", (_caso, occurred_at) => {
    expect(validarEventoDeLanding({ ...VISITA, occurred_at })).toBeNull();
  });

  it("acepta uno de ayer, con otra zona, y lo conserva; y uno sin occurred_at", () => {
    expect(validarEventoDeLanding({ ...REGISTRO, occurred_at: "2026-10-16T00:00:00-03:00" })?.occurred_at).toBe(
      "2026-10-16T00:00:00-03:00",
    );
    expect(validarEventoDeLanding({ ...VISITA, occurred_at: null })).not.toBeNull();
  });
});

describe("⭐ email normalizado con Unicode (AR pasada 1, MENOR-2)", () => {
  it("NFC y NFD son el mismo email", () => {
    const nfc = "jos\u00e9@ejemplo.test";
    const nfd = "jose\u0301@ejemplo.test";
    expect(nfc).not.toBe(nfd);
    expect(normalizarEmail(nfd)).toBe(normalizarEmail(nfc));
    expect(normalizarEmail("JOSE\u0301@Ejemplo.TEST")).toBe("jos\u00e9@ejemplo.test");
  });

  it.each(["\u200B", "\u200C", "\u200D", "\u2060", "\uFEFF", "\u180E", "\u00A0"])(
    "saca el invisible %j",
    (invisible) => {
      expect(normalizarEmail(`zw${invisible}@ejemplo.test`)).toBe("zw@ejemplo.test");
    },
  );
});
