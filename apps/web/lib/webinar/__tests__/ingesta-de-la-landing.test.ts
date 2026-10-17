import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { crearBaseFalsa, nuevoId, type BaseFalsa, type Fila } from "./base-falsa-de-ingesta";

/**
 * SCRUM-528: `POST /api/ingest/landing` de punta a punta contra una base
 * falsa con las llaves únicas de la migración: clave, límite, cuerpo,
 * contrato, crudo primero, normalización en `after`, idempotencia, lanzamiento
 * desconocido o cerrado, falla de normalización y reproceso del cron.
 */

const sim = vi.hoisted(() => ({
  base: null as unknown as import("./base-falsa-de-ingesta").BaseFalsa,
  tareas: [] as Array<Promise<unknown> | (() => unknown)>,
  reportes: [] as Array<{ error: unknown; contexto: unknown }>,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => sim.base.cliente(),
}));
vi.mock("@/lib/observability/reportar-falla", () => ({
  reportarFalla: (error: unknown, contexto: unknown) => sim.reportes.push({ error, contexto }),
}));
vi.mock("next/server", async (importOriginal) => {
  const real = await importOriginal<typeof import("next/server")>();
  return {
    ...real,
    after: (tarea: Promise<unknown> | (() => unknown)) => {
      sim.tareas.push(tarea);
    },
  };
});

const { POST } = await import("@/app/api/ingest/landing/route");
const { POST: POST_DEL_CRON } = await import("@/app/api/cron/reprocesar-landing/route");
const { generarClaveDeIngesta } = await import("@/lib/webinar/claves-de-ingesta");
const { reprocesarEventosDeLanding } = await import("@/lib/webinar/reprocesar-landing");
const { LIMITE_DE_INGESTA_DE_LANDING } = await import("@/lib/rate-limit");
const { MOTIVO_LANZAMIENTO_CERRADO, MOTIVO_LANZAMIENTO_DESCONOCIDO, NOTA_ID_REUSADO_CON_OTRO_EMAIL } =
  await import("@/lib/webinar/normalize/filas");

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTRA_ORG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PUB_ACTIVO = "a".repeat(32);
const PUB_CERRADO = "c".repeat(32);
const PUB_BORRADOR = "d".repeat(32);
const PUB_DE_OTRA_ORG = "b".repeat(32);
const URL_DEL_ENDPOINT = "https://app.test/api/ingest/landing";

/** Datos inventados. Se buscan en logs y en Sentry: no tienen que aparecer nunca. */
const EMAIL = "Persona.Prueba@Ejemplo.TEST";
const TELEFONO = "+54 9 11 5555-0000";
const NOMBRE = "Persona de Prueba";

let base: BaseFalsa;
let clave: string;
let hashDeLaClave: string;
let lanzamientoActivo: string;
let espias: Array<ReturnType<typeof vi.spyOn>>;

function registro(extra: Record<string, unknown> = {}) {
  return {
    type: "registration",
    launch_public_id: PUB_ACTIVO,
    client_registration_id: "reg-1",
    name: NOMBRE,
    email: EMAIL,
    phone: TELEFONO,
    tracking: { utm_source: "meta", utm_campaign: "octubre", fbclid: "fb-1" },
    ab_variant: "B",
    qualification: "alta",
    occurred_at: "2026-10-16T12:30:00.000Z",
    ...extra,
  };
}

function visita(extra: Record<string, unknown> = {}) {
  return {
    type: "visit",
    launch_public_id: PUB_ACTIVO,
    visitor_id: "vis-1",
    occurred_at: "2026-10-16T12:30:00.000Z",
    ...extra,
  };
}

function pedido(cuerpo: unknown, opciones: { token?: string | null; crudo?: string; headers?: HeadersInit } = {}) {
  const token = opciones.token === undefined ? clave : opciones.token;
  const headers = new Headers(opciones.headers);
  headers.set("content-type", "application/json");
  if (token !== null) headers.set("authorization", `Bearer ${token}`);
  return new Request(URL_DEL_ENDPOINT, {
    method: "POST",
    headers,
    body: opciones.crudo ?? JSON.stringify(cuerpo),
  });
}

/** Corre lo que el endpoint dejó para después de responder (`after`). */
async function correrTareas() {
  while (sim.tareas.length > 0) {
    const tarea = sim.tareas.shift()!;
    await (typeof tarea === "function" ? tarea() : tarea);
  }
}

async function enviar(cuerpo: unknown, opciones?: Parameters<typeof pedido>[1]) {
  const respuesta = await POST(pedido(cuerpo, opciones));
  return { status: respuesta.status, json: await respuesta.json(), headers: respuesta.headers };
}

function crudos() {
  return base.filas("landing_events");
}

/** Hora fija (sólo `Date`): los `occurred_at` de los ejemplos caen en su ventana de 30 días. */
const AHORA = new Date("2026-10-17T06:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AHORA);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("CRON_SECRET", "secreto-del-cron-de-prueba");
  sim.tareas = [];
  sim.reportes = [];
  const nueva = generarClaveDeIngesta();
  clave = nueva.clave;
  hashDeLaClave = nueva.hash;
  lanzamientoActivo = nuevoId();
  base = crearBaseFalsa({
    ingest_keys: [
      // Un id nuevo por test: el límite por clave no arrastra cuentas de otro test.
      { id: nuevoId(), organization_id: ORG, key_hash: nueva.hash, revoked_at: null, last_used_at: null },
    ],
    webinar_launches: [
      { id: lanzamientoActivo, organization_id: ORG, public_id: PUB_ACTIVO, status: "active" },
      { id: nuevoId(), organization_id: ORG, public_id: PUB_CERRADO, status: "closed" },
      { id: nuevoId(), organization_id: ORG, public_id: PUB_BORRADOR, status: "draft" },
      { id: nuevoId(), organization_id: OTRA_ORG, public_id: PUB_DE_OTRA_ORG, status: "active" },
    ],
  });
  sim.base = base;
  espias = [
    vi.spyOn(console, "error").mockImplementation(() => {}),
    vi.spyOn(console, "warn").mockImplementation(() => {}),
    vi.spyOn(console, "log").mockImplementation(() => {}),
  ];
});

afterEach(() => {
  // ⭐ Ningún log ni reporte lleva datos personales, la clave ni su hash.
  const prohibidos = [EMAIL, EMAIL.toLowerCase(), "5555", NOMBRE, clave, hashDeLaClave];
  const escrito = JSON.stringify([
    ...espias.flatMap((espia) => espia.mock.calls),
    sim.reportes.map((r) => ({
      mensaje: r.error instanceof Error ? r.error.message : r.error,
      contexto: r.contexto,
    })),
  ]);
  for (const prohibido of prohibidos) expect(escrito).not.toContain(prohibido);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("POST /api/ingest/landing: clave", () => {
  it("⭐ clave válida: 200 enseguida, con el crudo en pending y la normalización para después", async () => {
    const r = await enviar(registro());
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true });

    // Al responder, el crudo ya está y todavía no se normalizó.
    expect(crudos()).toHaveLength(1);
    expect(crudos()[0]).toMatchObject({ organization_id: ORG, kind: "registration", status: "pending" });
    expect(crudos()[0].payload).toEqual(registro());
    expect(base.filas("launch_registrations")).toHaveLength(0);

    await correrTareas();
    expect(crudos()[0]).toMatchObject({ status: "processed", error_message: null });
    expect(crudos()[0].processed_at).toEqual(expect.any(String));
    expect(base.filas("leads")).toEqual([
      expect.objectContaining({
        organization_id: ORG,
        email: EMAIL,
        email_normalized: "persona.prueba@ejemplo.test",
        name: NOMBRE,
        phone_e164: "+5491155550000",
        first_seen_at: "2026-10-16T12:30:00.000Z",
      }),
    ]);
    const lead = base.filas("leads")[0];
    expect(base.filas("launch_registrations")).toEqual([
      expect.objectContaining({
        organization_id: ORG,
        launch_id: lanzamientoActivo,
        lead_id: lead.id,
        client_registration_id: "reg-1",
        registered_at: "2026-10-16T12:30:00.000Z",
        utm_source: "meta",
        utm_campaign: "octubre",
        fbclid: "fb-1",
        ab_variant: "B",
        qualification: "alta",
        raw_event_id: crudos()[0].id,
      }),
    ]);
    expect(base.filas("lead_events")).toEqual([
      expect.objectContaining({
        organization_id: ORG,
        lead_id: lead.id,
        launch_id: lanzamientoActivo,
        kind: "registered",
        source: "landing",
        source_ref: "reg-1",
        occurred_at: "2026-10-16T12:30:00.000Z",
      }),
    ]);
    // La verificación anotó el último uso, también en segundo plano.
    expect(base.filas("ingest_keys")[0].last_used_at).toEqual(expect.any(String));
  });

  it.each([
    ["sin header", null],
    ["con forma de clave pero inexistente", generarClaveDeIngesta().clave],
    ["con otra forma", "cualquier-cosa"],
  ])("⭐ clave inválida (%s): 401 sin detalle y no guarda nada", async (_caso, token) => {
    const r = await enviar(registro(), { token });
    expect(r.status).toBe(401);
    expect(r.json).toEqual({ ok: false, error: "No autorizado." });
    expect(crudos()).toHaveLength(0);
    expect(sim.tareas).toHaveLength(0);
  });

  it("acepta `bearer` en minúsculas y espacios de más", async () => {
    const r = await POST(
      new Request(URL_DEL_ENDPOINT, {
        method: "POST",
        headers: { authorization: `bearer   ${clave} ` },
        body: JSON.stringify(visita()),
      }),
    );
    expect(r.status).toBe(200);
  });

  it("⭐ clave revocada: 401 igual que una inválida", async () => {
    base.filas("ingest_keys")[0].revoked_at = "2026-10-15T00:00:00.000Z";
    const r = await enviar(registro());
    expect(r.status).toBe(401);
    expect(r.json).toEqual({ ok: false, error: "No autorizado." });
    expect(crudos()).toHaveLength(0);
  });

  it("⭐ la base falla al verificar la clave: 500 (no 401) y se registra sin la clave", async () => {
    base.errores["ingest_keys:select"] = { message: "connection refused", code: "08006" };
    const r = await enviar(registro());
    expect(r.status).toBe(500);
    expect(r.json).toEqual({ ok: false, error: "Error interno. Reintentá más tarde." });
    expect(crudos()).toHaveLength(0);
    expect(sim.reportes).toHaveLength(1);
    expect(sim.reportes[0].contexto).toEqual({ provider: "landing" });
  });

  it("la red se cae al verificar la clave: 500", async () => {
    base.lanza["ingest_keys:select"] = new TypeError("fetch failed");
    const r = await enviar(registro());
    expect(r.status).toBe(500);
    expect(crudos()).toHaveLength(0);
  });
});

describe("POST /api/ingest/landing: cuerpo y contrato", () => {
  it("⭐ cuerpo de más de 16 KB: 413 sin parsearlo ni guardarlo", async () => {
    const grande = JSON.stringify(registro({ qualification: "x".repeat(17_000) }));
    const r = await enviar(null, { crudo: grande });
    expect(r.status).toBe(413);
    expect(r.json).toEqual({ ok: false, error: "El cuerpo supera los 16 KB." });
    expect(crudos()).toHaveLength(0);
  });

  it("⭐ cuenta los bytes aunque no venga Content-Length (stream)", async () => {
    const trozo = new TextEncoder().encode("x".repeat(4096));
    let enviados = 0;
    const cuerpo = new ReadableStream<Uint8Array>({
      pull(control) {
        // Cinco trozos de 4 KB: el corte tiene que ser en el quinto.
        if (enviados++ < 5) control.enqueue(trozo);
        else control.close();
      },
    });
    const r = await POST(
      new Request(URL_DEL_ENDPOINT, {
        method: "POST",
        headers: { authorization: `Bearer ${clave}` },
        body: cuerpo,
        duplex: "half",
      } as RequestInit),
    );
    expect(r.status).toBe(413);
    expect(crudos()).toHaveLength(0);
  });

  it("un Content-Length declarado de más se rechaza sin leer", async () => {
    const r = await enviar(visita(), { headers: { "content-length": "999999" } });
    expect(r.status).toBe(413);
  });

  it("exactamente 16 KB pasa el límite (y lo decide el contrato)", async () => {
    const sinRelleno = JSON.stringify(visita({ relleno: "" }));
    const exacto = JSON.stringify(visita({ relleno: "x".repeat(16384 - sinRelleno.length) }));
    expect(new TextEncoder().encode(exacto).byteLength).toBe(16384);
    const r = await enviar(null, { crudo: exacto });
    expect(r.status).toBe(200);
  });

  it.each([
    ["JSON roto", '{"type":"visit",'],
    ["vacío", ""],
  ])("⭐ %s: 400 con motivo genérico", async (_caso, crudo) => {
    const r = await enviar(null, { crudo });
    expect(r.status).toBe(400);
    expect(r.json).toEqual({ ok: false, error: "Payload inválido." });
    expect(crudos()).toHaveLength(0);
  });

  it("bytes que no son UTF-8: 400", async () => {
    const r = await POST(
      new Request(URL_DEL_ENDPOINT, {
        method: "POST",
        headers: { authorization: `Bearer ${clave}` },
        body: new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]),
      }),
    );
    expect(r.status).toBe(400);
  });

  it.each([
    ["sin email", registro({ email: undefined })],
    ["email inválido", registro({ email: "no-es-un-email" })],
    ["tipo desconocido", registro({ type: "purchase" })],
    ["visita sin visitor_id", visita({ visitor_id: undefined })],
    ["occurred_at ilegible", visita({ occurred_at: "ayer" })],
  ])("⭐ payload fuera de contrato (%s): 400 sin repetir los datos", async (_caso, cuerpo) => {
    const r = await enviar(cuerpo);
    expect(r.status).toBe(400);
    expect(r.json).toEqual({ ok: false, error: "Payload inválido." });
    expect(crudos()).toHaveLength(0);
  });

  /** Arma el cuerpo a mano: `JSON.stringify` escaparía distinto un surrogate suelto. */
  const conCampo = (cuerpo: object, campo: string) => JSON.stringify(cuerpo).replace(/}$/, `,${campo}}`);

  it.each([
    ["NUL en el nombre", JSON.stringify(registro({ name: "Persona\u0000Prueba" }))],
    ["NUL en un campo de más", JSON.stringify(registro({ extra: "x\u0000" }))],
    ["NUL en una clave de más", conCampo(registro(), '"cla\\u0000ve":1')],
    ["NUL en el visitor_id", JSON.stringify(visita({ visitor_id: "v\u0000" }))],
    ["surrogate suelto en el nombre", conCampo(registro({ name: undefined }), '"name":"Persona \\ud800"')],
    ["surrogate suelto en un campo de más", conCampo(registro(), '"x":"\\udc00"')],
    ["anidamiento de 6000 niveles en un campo de más", conCampo(registro(), `"x":${"[".repeat(6000)}${"]".repeat(6000)}`)],
    ["11 niveles en tracking", JSON.stringify(registro({ tracking: { utm_source: "a", x: [[[[[[[[[[1]]]]]]]]]] } }))],
  ])("⭐ AR p1 MAYOR-1, %s: 400, sin crudo y sin Sentry", async (_caso, crudo) => {
    expect(Buffer.byteLength(crudo)).toBeLessThanOrEqual(16384);
    const r = await enviar(null, { crudo });
    expect(r.status).toBe(400);
    expect(r.json).toEqual({ ok: false, error: "Payload inválido." });
    expect(crudos()).toHaveLength(0);
    expect(sim.reportes).toHaveLength(0);
  });

  it.each([
    ["año 0", "0000-01-01T00:00:00Z"],
    ["año 10000 en UTC", "9999-12-31T23:59:59-01:00"],
    ["1900", "1900-01-01T00:00:00Z"],
    ["2999", "2999-01-01T00:00:00Z"],
    ["31 días antes", "2026-09-16T05:59:59Z"],
    ["6 minutos después", "2026-10-17T06:06:00Z"],
  ])("⭐ AR p1 MAYOR-2, occurred_at %s: 400 en registro y en visita, sin crudo", async (_caso, occurred_at) => {
    expect((await enviar(registro({ occurred_at }))).status).toBe(400);
    expect((await enviar(visita({ occurred_at }))).status).toBe(400);
    expect(crudos()).toHaveLength(0);
    expect(sim.reportes).toHaveLength(0);
  });

  it("occurred_at dentro de la ventana (hace 29 días, dentro de 4 minutos) pasa y queda con esa fecha", async () => {
    expect((await enviar(registro({ occurred_at: "2026-09-18T06:00:00Z" }))).status).toBe(200);
    expect((await enviar(visita({ occurred_at: "2026-10-17T06:04:00Z" }))).status).toBe(200);
    await correrTareas();
    expect(crudos().map((c) => c.status)).toEqual(["processed", "processed"]);
    expect(base.filas("launch_registrations")[0].registered_at).toBe("2026-09-18T06:00:00.000Z");
    expect(base.filas("landing_visits")[0].day).toBe("2026-10-17");
  });
});

describe("POST /api/ingest/landing: idempotencia", () => {
  it("⭐ AR p1 MENOR-1: el mismo client_registration_id con otro email no deja un lead suelto", async () => {
    await enviar(registro({ email: "typo@ejemplo.tst" }));
    await correrTareas();
    await enviar(registro({ email: "corregido@ejemplo.test" }));
    await correrTareas();
    expect(base.filas("leads").map((l) => l.email_normalized)).toEqual(["typo@ejemplo.tst"]);
    expect(base.filas("launch_registrations")).toHaveLength(1);
    expect(base.filas("lead_events")).toHaveLength(1);
    expect(crudos().map((c) => [c.status, c.error_message])).toEqual([
      ["processed", null],
      ["processed", NOTA_ID_REUSADO_CON_OTRO_EMAIL],
    ]);
  });

  it("⭐ un reenvío (mismo client_registration_id) no duplica", async () => {
    expect((await enviar(registro())).status).toBe(200);
    expect((await enviar(registro({ name: "Otro Nombre" }))).status).toBe(200);
    await correrTareas();

    // Los dos crudos quedan (crudo primero) y los dos se cierran como procesados.
    expect(crudos().map((c) => c.status)).toEqual(["processed", "processed"]);
    expect(base.filas("leads")).toHaveLength(1);
    expect(base.filas("leads")[0].name).toBe(NOMBRE);
    expect(base.filas("launch_registrations")).toHaveLength(1);
    expect(base.filas("launch_registrations")[0].raw_event_id).toBe(crudos()[0].id);
    expect(base.filas("lead_events")).toHaveLength(1);
  });

  it("⭐ el mismo email (escrito distinto) con otro client_registration_id: se queda el primer registro", async () => {
    await enviar(registro({ phone: null }));
    await enviar(
      // Otro caso, espacios a los costados y uno en el medio (un autocompletado).
      registro({ client_registration_id: "reg-2", email: " PERSONA.prueba @Ejemplo.test ", phone: TELEFONO }),
    );
    await correrTareas();

    expect(base.filas("leads")).toHaveLength(1);
    // El segundo completa el teléfono que faltaba, sin pisar nada.
    expect(base.filas("leads")[0]).toMatchObject({ email: EMAIL, phone_e164: "+5491155550000" });
    expect(base.filas("launch_registrations").map((r) => r.client_registration_id)).toEqual(["reg-1"]);
    expect(base.filas("lead_events").map((e) => e.source_ref)).toEqual(["reg-1"]);
    expect(crudos().map((c) => c.status)).toEqual(["processed", "processed"]);
  });

  it("el mismo lead en otro lanzamiento es otro registro", async () => {
    await enviar(registro());
    await enviar(registro({ client_registration_id: "reg-2", launch_public_id: PUB_BORRADOR }));
    await correrTareas();
    expect(base.filas("leads")).toHaveLength(1);
    expect(base.filas("launch_registrations")).toHaveLength(2);
    expect(base.filas("lead_events")).toHaveLength(2);
  });

  it("⭐ visitas idempotentes por (lanzamiento, visitante, día UTC)", async () => {
    await enviar(visita());
    await enviar(visita({ occurred_at: "2026-10-16T20:00:00.000Z" }));
    await enviar(visita({ occurred_at: "2026-10-17T00:00:01.000Z" }));
    await enviar(visita({ visitor_id: "vis-2" }));
    await correrTareas();
    expect(crudos().map((c) => c.status)).toEqual(["processed", "processed", "processed", "processed"]);
    expect(base.filas("landing_visits").map((v) => [v.visitor_id, v.day])).toEqual([
      ["vis-1", "2026-10-16"],
      ["vis-1", "2026-10-17"],
      ["vis-2", "2026-10-16"],
    ]);
    expect(base.filas("landing_visits").every((v) => v.organization_id === ORG)).toBe(true);
  });
});

describe("POST /api/ingest/landing: lanzamiento", () => {
  it.each([
    ["desconocido", "f".repeat(32), MOTIVO_LANZAMIENTO_DESCONOCIDO],
    ["de otra organización", PUB_DE_OTRA_ORG, MOTIVO_LANZAMIENTO_DESCONOCIDO],
    ["cerrado", PUB_CERRADO, MOTIVO_LANZAMIENTO_CERRADO],
  ])("⭐ lanzamiento %s: 200, el crudo queda unmapped con motivo y no se escribe nada", async (_caso, pub, motivo) => {
    const r = await enviar(registro({ launch_public_id: pub }));
    expect(r.status).toBe(200);
    await enviar(visita({ launch_public_id: pub }));
    await correrTareas();
    expect(crudos().map((c) => [c.status, c.error_message])).toEqual([
      ["unmapped", motivo],
      ["unmapped", motivo],
    ]);
    expect(crudos()[0].processed_at).toEqual(expect.any(String));
    expect(base.filas("leads")).toHaveLength(0);
    expect(base.filas("launch_registrations")).toHaveLength(0);
    expect(base.filas("landing_visits")).toHaveLength(0);
  });

  it("un borrador recibe (es como se prueba la landing)", async () => {
    await enviar(registro({ launch_public_id: PUB_BORRADOR }));
    await correrTareas();
    expect(crudos()[0].status).toBe("processed");
  });
});

describe("POST /api/ingest/landing: fallas", () => {
  it("⭐ si no se puede guardar el crudo: 500 (la landing reintenta) y no se normaliza nada", async () => {
    base.errores["landing_events:insert"] = { message: "read-only transaction", code: "25006" };
    const r = await enviar(registro());
    expect(r.status).toBe(500);
    expect(r.json).toEqual({ ok: false, error: "Error interno. Reintentá más tarde." });
    // Sólo queda la tarea de last_used_at de la clave, no la normalización.
    await correrTareas();
    expect(base.filas("leads")).toHaveLength(0);
    expect(sim.reportes).toHaveLength(1);
    expect(sim.reportes[0].contexto).toEqual({ organizationId: ORG, provider: "landing" });
  });

  it("⭐ una falla de normalización deja el crudo en error (200 igual) y el cron lo reprocesa", async () => {
    base.errores["launch_registrations:insert"] = {
      message: 'duplicate key value violates unique constraint "x" Key (email)=(persona.prueba@ejemplo.test)',
      code: "08006",
      veces: 1,
    };
    const r = await enviar(registro());
    expect(r.status).toBe(200);
    await correrTareas();

    const crudo = crudos()[0];
    expect(crudo.status).toBe("error");
    // Texto fijo: el paso y el SQLSTATE, nunca el texto de la base.
    expect(crudo.error_message).toBe("Falló la normalización en registro (código 08006).");
    expect(crudo.payload).toEqual(registro());
    expect(base.filas("launch_registrations")).toHaveLength(0);

    const resumen = await reprocesarEventosDeLanding(base.cliente() as SupabaseClient);
    expect(resumen).toEqual({
      encontrados: 1,
      procesados: 1,
      sinAsignar: 0,
      conError: 0,
      definitivos: 0,
      omitidos: 0,
    });
    expect(crudo).toMatchObject({ status: "processed", error_message: null });
    expect(base.filas("launch_registrations")).toHaveLength(1);
    expect(base.filas("lead_events")).toHaveLength(1);
    expect(sim.reportes).toHaveLength(0);
  });

  it("⭐ si la normalización ya escribió el registro y falló en el evento, el reproceso no duplica", async () => {
    base.errores["lead_events:insert"] = { message: "timeout", code: "57014", veces: 1 };
    await enviar(registro());
    await correrTareas();
    expect(crudos()[0].status).toBe("error");
    expect(base.filas("launch_registrations")).toHaveLength(1);
    expect(base.filas("lead_events")).toHaveLength(0);

    await reprocesarEventosDeLanding(base.cliente() as SupabaseClient);
    expect(crudos()[0].status).toBe("processed");
    expect(base.filas("leads")).toHaveLength(1);
    expect(base.filas("launch_registrations")).toHaveLength(1);
    expect(base.filas("lead_events")).toHaveLength(1);
  });

  it("una excepción en la normalización (la red) también deja el crudo en error", async () => {
    base.lanza["webinar_launches:select"] = new TypeError("fetch failed");
    expect((await enviar(registro())).status).toBe(200);
    await correrTareas();
    expect(crudos()[0]).toMatchObject({
      status: "error",
      error_message: "Falló la normalización en desconocido.",
    });
  });

  it("si tampoco se puede cerrar el crudo, queda en pending para el cron", async () => {
    base.errores["webinar_launches:select"] = { message: "down", code: "08006" };
    base.errores["landing_events:update"] = { message: "down", code: "08006" };
    await enviar(registro());
    await correrTareas();
    expect(crudos()[0].status).toBe("pending");
  });
});

describe("POST /api/ingest/landing: límite por clave", () => {
  it("⭐ 50 por segundo con ráfagas: 600 en 10 s pasan, el siguiente es 429 con Retry-After", async () => {
    expect(LIMITE_DE_INGESTA_DE_LANDING).toEqual({ windowMs: 10_000, maxRequests: 600 });
    for (let i = 0; i < 600; i++) {
      const r = await POST(pedido(visita({ visitor_id: `vis-${i}` })));
      expect(r.status).toBe(200);
    }
    const r = await enviar(visita({ visitor_id: "vis-601" }));
    expect(r.status).toBe(429);
    // AR p1 MENOR-3: la misma forma que el resto y el texto con los segundos de Retry-After.
    const segundos = Number(r.headers.get("retry-after"));
    expect(segundos).toBe(10);
    expect(r.json).toEqual({ ok: false, error: "Demasiadas solicitudes. Reintentá en 10 segundos." });
    expect(crudos()).toHaveLength(600);
  }, 30_000);

  it("el límite es por clave: otra clave de la misma organización no se ve afectada", async () => {
    let llamadas = 0;
    const { atenderIngestaDeLanding } = await import("@/lib/webinar/endpoint-de-ingesta");
    const otra = generarClaveDeIngesta();
    const otraId = nuevoId();
    base.filas("ingest_keys").push({
      id: otraId,
      organization_id: ORG,
      key_hash: otra.hash,
      revoked_at: null,
      last_used_at: null,
    });
    const identificadores: string[] = [];
    const limite = async (id: string) => {
      identificadores.push(id);
      llamadas++;
      return { allowed: id.endsWith(otraId), remaining: 0, resetAt: Date.now() + 5_000 };
    };
    const conClave = (token: string) =>
      atenderIngestaDeLanding(pedido(visita(), { token }), {
        enSegundoPlano: (t) => sim.tareas.push(t),
        limite,
      });
    expect((await conClave(clave)).status).toBe(429);
    expect((await conClave(otra.clave)).status).toBe(200);
    expect(llamadas).toBe(2);
    expect(identificadores[0]).not.toBe(identificadores[1]);
    expect(identificadores.every((id) => id.startsWith("ingest-landing:"))).toBe(true);
  });
});

describe("reproceso de la landing (cron)", () => {
  const MAS_TARDE = () => new Date(Date.now() + 6 * 60_000);
  const FALLA = "Falló la normalización en registro (código 08006).";

  function crudo(extra: Fila): Fila {
    const fila = {
      id: nuevoId(),
      organization_id: ORG,
      kind: "registration",
      payload: registro(),
      received_at: new Date().toISOString(),
      status: "error",
      error_message: FALLA,
      processed_at: null,
      reprocess_attempts: 0,
      ...extra,
    };
    base.filas("landing_events").push(fila);
    return fila;
  }

  it("⭐ reintenta hasta 5 veces (columna reprocess_attempts) y después failed con aviso a Sentry", async () => {
    const fila = crudo({});
    base.errores["launch_registrations:insert"] = { message: "down", code: "08006" };

    for (let reproceso = 1; reproceso <= 4; reproceso++) {
      const resumen = await reprocesarEventosDeLanding(base.cliente() as SupabaseClient);
      expect(resumen).toMatchObject({ encontrados: 1, conError: 1, definitivos: 0 });
      expect(fila).toMatchObject({ status: "error", reprocess_attempts: reproceso, error_message: FALLA });
      expect(sim.reportes).toHaveLength(0);
    }

    const quinto = await reprocesarEventosDeLanding(base.cliente() as SupabaseClient);
    expect(quinto).toMatchObject({ encontrados: 1, conError: 0, definitivos: 1 });
    expect(fila).toMatchObject({ status: "failed", reprocess_attempts: 5, error_message: FALLA });
    expect(sim.reportes).toHaveLength(1);
    expect(sim.reportes[0].contexto).toEqual({
      cron: "/api/cron/reprocesar-landing",
      organizationId: ORG,
      provider: "landing",
      extra: { landing_event_id: fila.id, paso: "registro", codigo: "08006" },
    });

    // Ya no se lee más, aunque la base se recupere: el cron filtra por status.
    delete base.errores["launch_registrations:insert"];
    expect((await reprocesarEventosDeLanding(base.cliente() as SupabaseClient)).encontrados).toBe(0);
    expect(fila.status).toBe("failed");
    expect(sim.reportes).toHaveLength(1);
  });

  it("⭐ el cron filtra por columnas: ninguna consulta mira error_message", async () => {
    crudo({});
    await reprocesarEventosDeLanding(base.cliente() as SupabaseClient);
    const deLanding = base.consultas.filter((c) => c.tabla === "landing_events");
    expect(deLanding.length).toBeGreaterThan(0);
    for (const c of deLanding) {
      expect(c.filtros.some(([col]) => col === "error_message"), JSON.stringify(c.filtros)).toBe(false);
    }
  });

  it("⭐ revivir un failed (runbook de alertas.md): status error y reprocess_attempts 0", async () => {
    const fila = crudo({ status: "failed", reprocess_attempts: 5 });
    expect((await reprocesarEventosDeLanding(base.cliente() as SupabaseClient)).encontrados).toBe(0);
    Object.assign(fila, { status: "error", reprocess_attempts: 0 });
    const resumen = await reprocesarEventosDeLanding(base.cliente() as SupabaseClient);
    expect(resumen).toMatchObject({ encontrados: 1, procesados: 1 });
    expect(fila).toMatchObject({ status: "processed", reprocess_attempts: 1, error_message: null });
  });

  it("⭐ toma un pending trabado (el after se cortó) y lo procesa", async () => {
    const fila = crudo({ status: "pending", error_message: null });
    // Recién llegado: no está trabado.
    expect((await reprocesarEventosDeLanding(base.cliente() as SupabaseClient)).encontrados).toBe(0);

    const resumen = await reprocesarEventosDeLanding(base.cliente() as SupabaseClient, { ahora: MAS_TARDE() });
    expect(resumen).toMatchObject({ encontrados: 1, procesados: 1 });
    expect(fila).toMatchObject({ status: "processed", reprocess_attempts: 1 });
    expect(base.filas("launch_registrations")).toHaveLength(1);
  });

  it("no toma un pending que otro proceso reclamó hace poco", async () => {
    const ahora = MAS_TARDE();
    const fila = crudo({
      status: "pending",
      reprocess_attempts: 2,
      received_at: new Date(Date.now() - 60 * 60_000).toISOString(),
      processed_at: new Date(ahora.getTime() - 60_000).toISOString(),
    });
    const resumen = await reprocesarEventosDeLanding(base.cliente() as SupabaseClient, { ahora });
    expect(resumen).toMatchObject({ encontrados: 1, omitidos: 1, procesados: 0 });
    expect(fila).toMatchObject({ status: "pending", reprocess_attempts: 2 });
  });

  it("⭐ un pending que se cortó en su reproceso 5 pasa a failed sin procesarlo", async () => {
    const ahora = MAS_TARDE();
    const fila = crudo({
      status: "pending",
      reprocess_attempts: 5,
      processed_at: new Date(Date.now() - 60 * 60_000).toISOString(),
      received_at: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
    });
    const resumen = await reprocesarEventosDeLanding(base.cliente() as SupabaseClient, { ahora });
    expect(resumen).toMatchObject({ definitivos: 1, procesados: 0 });
    expect(fila).toMatchObject({
      status: "failed",
      reprocess_attempts: 5,
      error_message: "El último reproceso no terminó y no quedan reprocesos.",
    });
    expect(base.filas("launch_registrations")).toHaveLength(0);
    expect(sim.reportes).toHaveLength(1);
  });

  it("⭐ un pending trabado a medio reproceso sigue contando desde su número", async () => {
    const fila = crudo({
      status: "pending",
      reprocess_attempts: 3,
      processed_at: new Date(Date.now() - 60 * 60_000).toISOString(),
    });
    base.errores["launch_registrations:insert"] = { message: "down", code: "08006", veces: 1 };
    await reprocesarEventosDeLanding(base.cliente() as SupabaseClient, { ahora: MAS_TARDE() });
    expect(fila).toMatchObject({ status: "error", reprocess_attempts: 4, error_message: FALLA });
  });

  it("⭐ dos corridas a la vez no procesan dos veces el mismo evento", async () => {
    const fila = crudo({});
    const [a, b] = await Promise.all([
      reprocesarEventosDeLanding(base.cliente() as SupabaseClient),
      reprocesarEventosDeLanding(base.cliente() as SupabaseClient),
    ]);
    expect(a.procesados + b.procesados).toBe(1);
    expect(a.omitidos + b.omitidos).toBe(1);
    expect(base.filas("launch_registrations")).toHaveLength(1);
    // La segunda corrida ni siquiera lo normaliza: el reclamo condicionado se
    // lo impide. Sin él, la idempotencia y el cierre condicionado esconderían
    // el doble proceso, pero la cuenta de reprocesos quedaría mal.
    expect(base.consultas.filter((c) => c.tabla === "webinar_launches")).toHaveLength(1);
    expect(fila.reprocess_attempts).toBe(1);
  });

  it("no toca unmapped ni processed", async () => {
    crudo({ status: "unmapped", error_message: MOTIVO_LANZAMIENTO_CERRADO });
    crudo({ status: "processed", error_message: null });
    expect((await reprocesarEventosDeLanding(base.cliente() as SupabaseClient)).encontrados).toBe(0);
  });

  it("si no puede leer los candidatos, lanza con texto fijo (el cron responde 500)", async () => {
    base.errores["landing_events:select"] = { message: "down", code: "08006" };
    await expect(reprocesarEventosDeLanding(base.cliente() as SupabaseClient)).rejects.toThrow(
      "No se pudieron leer los eventos de la landing para reprocesar (código 08006).",
    );
  });

  it("⭐ la ruta del cron exige CRON_SECRET y devuelve sólo conteos", async () => {
    crudo({});
    const sinClave = await POST_DEL_CRON(new Request("https://app.test/api/cron/reprocesar-landing"));
    expect(sinClave.status).toBe(401);
    expect(crudos()[0].status).toBe("error");

    const conClave = await POST_DEL_CRON(
      new Request("https://app.test/api/cron/reprocesar-landing", {
        headers: { authorization: "Bearer secreto-del-cron-de-prueba" },
      }),
    );
    expect(conClave.status).toBe(200);
    expect(await conClave.json()).toEqual({
      ok: true,
      encontrados: 1,
      procesados: 1,
      sinAsignar: 0,
      conError: 0,
      definitivos: 0,
      omitidos: 0,
    });
  });

  it("la ruta del cron responde 500 con texto fijo si falla la lectura", async () => {
    base.errores["landing_events:select"] = { message: "down", code: "08006" };
    const r = await POST_DEL_CRON(
      new Request("https://app.test/api/cron/reprocesar-landing", {
        headers: { authorization: "Bearer secreto-del-cron-de-prueba" },
      }),
    );
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ ok: false, error: "No se pudo reprocesar." });
    expect(sim.reportes).toHaveLength(1);
  });
});

describe("⭐ barrido de filtros por organización", () => {
  /** Tablas con organization_id que toca la ingesta. */
  const TABLAS_DE_LA_ORG = [
    "landing_events",
    "webinar_launches",
    "leads",
    "launch_registrations",
    "landing_visits",
    "lead_events",
  ];

  it("toda consulta de la cadena completa filtra o escribe la organización de la clave", async () => {
    // Datos de otra organización con las mismas llaves naturales: no se tienen que ver.
    const leadAjeno = nuevoId();
    base.filas("leads").push({
      id: leadAjeno,
      organization_id: OTRA_ORG,
      email: EMAIL,
      email_normalized: EMAIL.toLowerCase(),
      name: null,
      phone_e164: null,
    });
    base.filas("launch_registrations").push({
      id: nuevoId(),
      organization_id: OTRA_ORG,
      launch_id: "lanzamiento-ajeno",
      lead_id: leadAjeno,
      client_registration_id: "reg-2",
      registered_at: "2026-10-01T00:00:00.000Z",
    });

    base.errores["lead_events:insert"] = { message: "down", code: "08006", veces: 1 };
    await enviar(registro());
    await enviar(registro({ client_registration_id: "reg-2", email: "otra.persona@ejemplo.test" }));
    await enviar(visita());
    await correrTareas();
    base.consultas.length = 0;
    await reprocesarEventosDeLanding(base.cliente() as SupabaseClient);
    const delReproceso = [...base.consultas];
    base.consultas.length = 0;
    await enviar(registro());
    await correrTareas();

    const todas = [...delReproceso, ...base.consultas].filter((c) => TABLAS_DE_LA_ORG.includes(c.tabla));
    // Las dos lecturas de candidatos del cron son de todas las organizaciones a propósito.
    const lecturasDelCron = delReproceso.filter(
      (c) => c.tabla === "landing_events" && c.op === "select",
    );
    expect(lecturasDelCron).toHaveLength(2);
    const resto = todas.filter((c) => !lecturasDelCron.includes(c));
    expect(resto.length).toBeGreaterThan(10);
    for (const c of resto) {
      if (c.op === "insert" || c.op === "upsert") {
        expect(c.valores?.organization_id, `${c.tabla}:${c.op}`).toBe(ORG);
      } else {
        expect(
          c.filtros.some(([col, op, valor]) => col === "organization_id" && op === "eq" && valor === ORG),
          `${c.tabla}:${c.op} sin filtro de organización`,
        ).toBe(true);
      }
    }

    // Lo de la otra organización quedó igual, y la nuestra tiene lo suyo.
    expect(base.filas("leads").filter((l) => l.organization_id === ORG)).toHaveLength(2);
    expect(base.filas("launch_registrations").filter((r) => r.organization_id === ORG)).toHaveLength(2);
    expect(base.filas("lead_events").filter((e) => e.organization_id === ORG)).toHaveLength(2);
    expect(base.filas("leads").find((l) => l.id === leadAjeno)).toMatchObject({ name: null, phone_e164: null });
  });
});
