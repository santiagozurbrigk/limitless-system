import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { limpiarEventoDeSentry, nombreSinQuery, sinQuery } from "../limpiar-evento-sentry";

/**
 * SCRUM-501 (incidente): los eventos de Sentry
 * llevaban el cuerpo del request (`request.data`), que en una server action
 * son sus argumentos: la contraseña nueva de `completePasswordChangeAction`,
 * API keys, datos de clientes.
 */

function eventoSucio() {
  return {
    message: "falla",
    request: {
      url: "https://app.limitless.com/invite?token=secreto-de-invitacion",
      method: "POST",
      data: '["ClaveSuperSecreta-PRUEBA501"]',
      cookies: { "sb-access-token": "jwt" },
      query_string: "token=secreto-de-invitacion",
      headers: {
        "user-agent": "Mozilla",
        "content-type": "text/plain;charset=UTF-8",
        "next-action": "40abc",
        Authorization: "Bearer sk-ant-123",
        cookie: "sb-access-token=jwt",
        apikey: "anon",
        "x-api-key": "clave",
        "upstash-signature": "firma",
        "x-hub-signature-256": "firma",
        "x-forwarded-for": "1.2.3.4",
        referer: "https://app.limitless.com/settings?tab=ia&key=sk-ant-123",
      },
    },
    extra: { jobId: "job-1", body: { password: "x" }, apiKey: "sk-ant-123", piezas: 3 },
    contexts: {
      trace: {
        trace_id: "t",
        data: {
          "http.target": "/invite?token=secreto-de-invitacion",
          "http.request.header.user_agent": "curl",
          "http.request.header.x_api_key": "sk-ant-123",
          "http.request.header.cookie.sb_127_auth_token": "jwt",
          "http.method": "POST",
        },
      },
      payload: { email: "a@b.c" },
    },
    breadcrumbs: [
      { category: "console", message: "guardando clave sk-ant-123" },
      {
        category: "fetch",
        data: {
          url: "https://api.hyros.com/v1/leads?api_key=sk-hyros",
          method: "POST",
          body: '{"key":"sk-hyros"}',
          request_body: "x",
          response_body: "y",
          headers: { authorization: "Bearer z" },
          status_code: 500,
        },
      },
      { category: "navigation", data: { from: "/invite?token=t1", to: "/team?x=1" } },
    ],
    spans: [
      {
        data: {
          "http.url": "https://x.com/a?token=1",
          "http.query": "token=1",
          "http.method": "GET",
          "http.request.header.authorization": "Bearer sk-ant-123",
        },
      },
    ],
  };
}

describe("limpiarEventoDeSentry", () => {
  it("⭐ saca el cuerpo del request (los argumentos de la server action)", () => {
    const limpio = limpiarEventoDeSentry(eventoSucio());
    expect(limpio.request).not.toHaveProperty("data");
    expect(JSON.stringify(limpio)).not.toContain("ClaveSuperSecreta-PRUEBA501");
  });

  it("⭐ ningún secreto del evento de prueba sobrevive", () => {
    const texto = JSON.stringify(limpiarEventoDeSentry(eventoSucio()));
    for (const secreto of [
      "ClaveSuperSecreta",
      "secreto-de-invitacion",
      "sk-ant-123",
      "sk-hyros",
      "jwt",
      "firma",
      "Bearer",
      "1.2.3.4",
      "a@b.c",
      "token=",
    ]) {
      expect(texto, secreto).not.toContain(secreto);
    }
  });

  it("saca cookies y query string, y la query de la URL", () => {
    const { request } = limpiarEventoDeSentry(eventoSucio());
    expect(request).not.toHaveProperty("cookies");
    expect(request).not.toHaveProperty("query_string");
    expect(request?.url).toBe("https://app.limitless.com/invite");
    expect(request?.method).toBe("POST");
  });

  it("deja sólo los headers de la lista blanca y el referer sin query", () => {
    const { request } = limpiarEventoDeSentry(eventoSucio());
    expect(request?.headers).toEqual({
      "user-agent": "Mozilla",
      "content-type": "text/plain;charset=UTF-8",
      "next-action": "40abc",
      referer: "https://app.limitless.com/settings",
    });
  });

  it("en extra y contexts saca las claves de cuerpo o de secreto y deja el resto", () => {
    const limpio = limpiarEventoDeSentry(eventoSucio());
    expect(limpio.extra).toEqual({ jobId: "job-1", piezas: 3 });
    expect(limpio.contexts).toEqual({
      trace: {
        trace_id: "t",
        data: {
          "http.target": "/invite",
          "http.request.header.user_agent": "curl",
          "http.method": "POST",
        },
      },
    });
  });

  it("saca los breadcrumbs de consola y limpia los demás", () => {
    const { breadcrumbs } = limpiarEventoDeSentry(eventoSucio());
    expect(breadcrumbs).toEqual([
      {
        category: "fetch",
        data: { url: "https://api.hyros.com/v1/leads", method: "POST", status_code: 500 },
      },
      { category: "navigation", data: { from: "/invite", to: "/team" } },
    ]);
  });

  it("limpia los datos de los spans de una transacción", () => {
    const { spans } = limpiarEventoDeSentry(eventoSucio());
    expect(spans).toEqual([{ data: { "http.url": "https://x.com/a", "http.method": "GET" } }]);
  });

  it("un evento sin request ni breadcrumbs pasa igual", () => {
    const evento: { message: string; extra?: Record<string, unknown> } = { message: "x" };
    expect(limpiarEventoDeSentry(evento)).toEqual({ message: "x" });
  });

  it("sinQuery corta en ? y en #", () => {
    expect(sinQuery("/a?b=1#c")).toBe("/a");
    expect(sinQuery("/a#c")).toBe("/a");
    expect(sinQuery("/a")).toBe("/a");
  });
});

describe("nombres de transacciones y spans", () => {
  function transaccion() {
    return {
      type: "transaction",
      transaction: "GET /team?token=PRUEBA501PAGE",
      contexts: {
        trace: {
          trace_id: "t",
          description: "GET /invite?token=PRUEBA501DESC",
          data: {
            "next.span_name": "GET /team?token=PRUEBA501PAGE",
            "sentry.transaction": "GET /team?token=PRUEBA501PAGE",
            "next.span_type": "BaseServer.handleRequest",
            "http.target": "/team?token=PRUEBA501PAGE",
          },
        },
      },
      spans: [
        {
          description: "GET http://127.0.0.1:54499/rest/v1/profiles?select=id&apikey=PRUEBA501SPAN",
          data: { "next.span_name": "render route (app) /invite?token=PRUEBA501RUTA" },
        },
        { description: "select * from clients where id = ? and org = ?", data: {} },
        { description: "Page Server Component (/(platform)/team)" },
      ],
    };
  }

  it("⭐ la query sale del nombre de la transacción, de la traza y de los spans", () => {
    const limpio = limpiarEventoDeSentry(transaccion());
    expect(limpio.transaction).toBe("GET /team");
    expect(limpio.contexts.trace).toEqual({
      trace_id: "t",
      description: "GET /invite",
      data: {
        "next.span_name": "GET /team",
        "sentry.transaction": "GET /team",
        "next.span_type": "BaseServer.handleRequest",
        "http.target": "/team",
      },
    });
    expect(limpio.spans[0].description).toBe("GET http://127.0.0.1:54499/rest/v1/profiles");
    expect(JSON.stringify(limpio)).not.toMatch(/PRUEBA501/);
  });

  it("no toca nombres que no son un pedido HTTP (SQL con ?, componentes)", () => {
    const limpio = limpiarEventoDeSentry(transaccion());
    expect(limpio.spans[1].description).toBe("select * from clients where id = ? and org = ?");
    expect(limpio.spans[2].description).toBe("Page Server Component (/(platform)/team)");
  });

  it("nombreSinQuery", () => {
    expect(nombreSinQuery("GET /team?token=x")).toBe("GET /team");
    expect(nombreSinQuery("/invite?token=x")).toBe("/invite");
    expect(nombreSinQuery("POST https://api.x.com/v1?key=y")).toBe("POST https://api.x.com/v1");
    expect(nombreSinQuery("render route (app) /x?y")).toBe("render route (app) /x");
    expect(nombreSinQuery("where id = ? and x = ?")).toBe("where id = ? and x = ?");
    expect(nombreSinQuery("Page Server Component (/(platform)/team)")).toBe(
      "Page Server Component (/(platform)/team)"
    );
  });
});

describe("las copias del reel-worker y del bot", () => {
  const canonico = readFileSync(
    path.join(process.cwd(), "lib/observability/limpiar-evento-sentry.ts"),
    "utf8"
  );

  it.each([
    ["reel-worker", "../reel-worker/src/limpiar-evento-sentry.ts", "../reel-worker/src/sentry.ts"],
    ["discord-bot", "../discord-bot/src/utils/limpiar-evento-sentry.ts", "../discord-bot/src/utils/sentry.ts"],
  ])("⭐ %s usa una copia idéntica y la aplica sin capturar el cuerpo", (_app, copia, config) => {
    expect(readFileSync(path.join(process.cwd(), copia), "utf8")).toBe(canonico);
    const codigo = readFileSync(path.join(process.cwd(), config), "utf8");
    expect(codigo).toContain('maxIncomingRequestBodySize: "none"');
    expect(codigo).toContain("include: { data: false, cookies: false, query_string: false }");
    expect(codigo).toContain("beforeSend: (event) => limpiarEventoDeSentry(event)");
    expect(codigo).toContain("beforeSendTransaction: (event) => limpiarEventoDeSentry(event)");
  });
});

/** Lo que cada config le pasa a `Sentry.init`, con el SDK simulado. */
const sim = vi.hoisted(() => ({ opciones: [] as Array<Record<string, unknown>> }));
vi.mock("@sentry/nextjs", () => ({
  init: (opciones: Record<string, unknown>) => sim.opciones.push(opciones),
  httpIntegration: (opciones: unknown) => ({ name: "Http", opciones }),
  requestDataIntegration: (opciones: unknown) => ({ name: "RequestData", opciones }),
  breadcrumbsIntegration: (opciones: unknown) => ({ name: "Breadcrumbs", opciones }),
}));

type Opciones = {
  integrations: Array<{ name: string; opciones: unknown }>;
  beforeSend: (evento: ReturnType<typeof eventoSucio>) => unknown;
  beforeSendTransaction?: (evento: ReturnType<typeof eventoSucio>) => unknown;
};

describe("configs de Sentry de la app", () => {
  beforeEach(() => {
    sim.opciones = [];
    vi.resetModules();
  });

  async function opcionesDe(config: string): Promise<Opciones> {
    await import(`../../../${config}`);
    expect(sim.opciones).toHaveLength(1);
    return sim.opciones[0] as unknown as Opciones;
  }

  it("⭐ servidor: no captura el cuerpo en origen y beforeSend/beforeSendTransaction limpian", async () => {
    const o = await opcionesDe("sentry.server.config.ts");
    expect(o.integrations).toContainEqual({
      name: "Http",
      opciones: { disableIncomingRequestSpans: true, maxIncomingRequestBodySize: "none" },
    });
    expect(o.integrations).toContainEqual({
      name: "RequestData",
      opciones: { include: { data: false, cookies: false, query_string: false } },
    });
    for (const gancho of [o.beforeSend, o.beforeSendTransaction!]) {
      const salida = JSON.stringify(gancho(eventoSucio()));
      expect(salida).not.toContain("ClaveSuperSecreta");
      expect(salida).not.toContain("sk-ant-123");
    }
  });

  it("servidor: sigue descartando el rate limit conocido", async () => {
    const o = await opcionesDe("sentry.server.config.ts");
    const evento = { ...eventoSucio(), exception: { values: [{ value: "Rate limit exceeded" }] } };
    expect(o.beforeSend(evento)).toBeNull();
  });

  it("⭐ edge: no adjunta el cuerpo y limpia", async () => {
    const o = await opcionesDe("sentry.edge.config.ts");
    expect(o.integrations).toContainEqual({
      name: "RequestData",
      opciones: { include: { data: false, cookies: false, query_string: false } },
    });
    expect(JSON.stringify(o.beforeSend(eventoSucio()))).not.toContain("ClaveSuperSecreta");
    expect(JSON.stringify(o.beforeSendTransaction!(eventoSucio()))).not.toContain("token=");
  });

  it("⭐ navegador: limpia la query de la URL (el token de /invite) y lo demás", async () => {
    const o = await opcionesDe("sentry.client.config.ts");
    const salida = JSON.stringify(o.beforeSend(eventoSucio()));
    expect(salida).not.toContain("secreto-de-invitacion");
    expect(salida).not.toContain("sb-access-token");
    expect(JSON.stringify(o.beforeSendTransaction!(eventoSucio()))).not.toContain("token=");
  });
});
