import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-520: `listAutomationFlowsAction` devuelve sus errores como valor. Antes
 * `fetchManyChatFlows` devolvía `[]` ante cualquier error de ManyChat y la
 * pantalla decía "No hay flujos configurados en ManyChat"; una falla al leer la
 * integración llegaba al cliente como el digest de Next.
 *
 * ManyChat nunca se llama: `fetch` es un doble que responde lo que pide cada
 * test y anota cada pedido.
 */

const sim = vi.hoisted(() => ({
  configurado: true,
  respuesta: null as null | (() => Promise<Response>),
  pedidos: [] as Array<{ url: string; autorizacion: string | null }>,
}));

vi.mock("@/lib/observability/reportar-falla", async () => {
  const { base } = await import("./base-falsa");
  return {
    reportarFalla: (error: unknown, contexto: unknown) => base.reportes.push({ error, contexto }),
  };
});
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => sim.configurado }));
vi.mock("@/lib/supabase/admin", async () => {
  const { base } = await import("./base-falsa");
  return { createAdminClient: () => base.cliente() };
});
vi.mock("@/lib/auth/bootstrap", async () => {
  const { base, ORG } = await import("./base-falsa");
  const { ErrorEsperable } = await import("@/lib/server/error-esperable");
  return {
    requireOrganizationId: async () => {
      if (base.lanzaEnSesion) throw base.lanzaEnSesion;
      if (!base.sesion) throw new ErrorEsperable("Sesión no válida");
      return ORG;
    },
  };
});

import { listAutomationFlowsAction } from "../automations-actions";
import { fetchManyChatFlows, ManyChatHttpError } from "@/lib/manychat/client";
import { base, ORG, OTRA_ORG, TEXTO_FIJO } from "./base-falsa";

const SIN_ACCESO =
  "ManyChat rechazó la API key de tu organización. Volvé a conectarlo desde Integraciones.";

function json(status: number, cuerpo: unknown) {
  return async () =>
    new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });
}

let consola: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  base.reiniciar();
  sim.configurado = true;
  sim.pedidos = [];
  sim.respuesta = json(200, {
    status: "success",
    data: [
      { ns: "f1", name: "Bienvenida", status: "enabled" },
      { ns: "f2", name: "Viejo", status: "disabled" },
    ],
  });
  base.tablas.manychat_integrations = [
    { organization_id: OTRA_ORG, api_token: "token-ajeno" },
    { organization_id: ORG, api_token: "token-propio" },
  ];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    sim.pedidos.push({ url: String(url), autorizacion: headers.get("Authorization") });
    if (!sim.respuesta) throw new Error("el test no configuró una respuesta");
    return sim.respuesta();
  });
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  consola.mockRestore();
});

function esperarFallaRegistrada() {
  expect(base.reportes).toHaveLength(1);
  expect(base.reportes[0].contexto).toEqual({ accion: "[listAutomationFlows]" });
  expect(consola).toHaveBeenCalledWith("[listAutomationFlows]", expect.anything());
}

describe("listAutomationFlowsAction", () => {
  it("devuelve los flujos de ManyChat con el token de la organización de la sesión", async () => {
    await expect(listAutomationFlowsAction()).resolves.toEqual({
      success: true,
      data: {
        manychatConnected: true,
        flows: [
          { id: "f1", name: "Bienvenida", status: "active", source: "manychat" },
          { id: "f2", name: "Viejo", status: "paused", source: "manychat" },
        ],
      },
    });
    expect(base.filtrosDe("manychat_integrations", "select")).toEqual([["organization_id", ORG]]);
    expect(sim.pedidos).toEqual([
      { url: "https://api.manychat.com/fb/page/getFlows", autorizacion: "Bearer token-propio" },
    ]);
  });

  it("sin integración, lista vacía y no conectado, sin llamar a ManyChat (como antes)", async () => {
    base.tablas.manychat_integrations = [{ organization_id: OTRA_ORG, api_token: "token-ajeno" }];
    await expect(listAutomationFlowsAction()).resolves.toEqual({
      success: true,
      data: { flows: [], manychatConnected: false },
    });
    expect(sim.pedidos).toEqual([]);
  });

  it("sin Supabase configurado, no conectado (como antes)", async () => {
    sim.configurado = false;
    await expect(listAutomationFlowsAction()).resolves.toEqual({
      success: true,
      data: { flows: [], manychatConnected: false },
    });
    expect(base.operaciones).toEqual([]);
  });

  it.each([401, 403])(
    "⭐ un %i de ManyChat (la API key ya no sirve) vuelve con el motivo, sin registrar",
    async (status) => {
      sim.respuesta = json(status, { status: "error", message: "Wrong token" });
      await expect(listAutomationFlowsAction()).resolves.toEqual({ success: false, error: SIN_ACCESO });
      expect(base.reportes).toEqual([]);
    }
  );

  it.each([
    ["un 500", json(500, { status: "error", message: "Internal error" })],
    ["un 429", json(429, { status: "error", message: "Too many requests" })],
    ["un 200 con status error", json(200, { status: "error", message: "Page not found" })],
    [
      "la red",
      async () => {
        throw new TypeError("fetch failed");
      },
    ],
  ])("⭐ %s de ManyChat ya no es una lista vacía: texto fijo y se registra", async (_caso, respuesta) => {
    sim.respuesta = respuesta;
    await expect(listAutomationFlowsAction()).resolves.toEqual({ success: false, error: TEXTO_FIJO });
    esperarFallaRegistrada();
  });

  it("⭐ una falla al leer la integración: texto fijo y se registra, sin llamar a ManyChat", async () => {
    base.errores.manychat_integrations = { message: "TypeError: fetch failed" };
    await expect(listAutomationFlowsAction()).resolves.toEqual({ success: false, error: TEXTO_FIJO });
    esperarFallaRegistrada();
    expect(sim.pedidos).toEqual([]);
  });

  it("si la consulta lanza, texto fijo y se registra", async () => {
    base.lanza = new TypeError("fetch failed");
    await expect(listAutomationFlowsAction()).resolves.toEqual({ success: false, error: TEXTO_FIJO });
    esperarFallaRegistrada();
  });

  it("sin sesión devuelve el motivo, sin registrar", async () => {
    base.sesion = false;
    await expect(listAutomationFlowsAction()).resolves.toEqual({
      success: false,
      error: "Sesión no válida",
    });
    expect(base.reportes).toEqual([]);
  });
});

describe("fetchManyChatFlows", () => {
  it("⭐ un rechazo de ManyChat lanza con su status (antes devolvía [])", async () => {
    sim.respuesta = json(401, { status: "error", message: "Wrong token" });
    const error = await fetchManyChatFlows("t").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ManyChatHttpError);
    expect(error).toMatchObject({ status: 401, message: "Wrong token" });
  });

  it("una respuesta que no es lista devuelve []", async () => {
    sim.respuesta = json(200, { status: "success", data: { nada: true } });
    await expect(fetchManyChatFlows("t")).resolves.toEqual([]);
  });
});
