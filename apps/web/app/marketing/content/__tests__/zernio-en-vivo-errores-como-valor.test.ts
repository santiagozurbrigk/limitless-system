import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-502: anuncios y comentarios de Zernio leídos en vivo
 * (`ad-actions.ts`, `comment-actions.ts`) devuelven sus errores esperables
 * como valor. Antes la lectura de anuncios devolvía el texto crudo de Zernio
 * ("Zernio listAds: HTTP 500 — ...") y las otras dos lanzaban. Zernio es
 * falso: ningún test lo llama.
 */

const sim = vi.hoisted(() => ({
  cliente: null as null | Record<string, (...args: unknown[]) => Promise<unknown>>,
  integracion: null as unknown,
  pedidos: [] as unknown[][],
  /** Con qué organización se pidió Zernio (SCRUM-502, AR pasada 1). */
  orgsPedidas: [] as Array<[string, unknown]>,
}));

vi.mock("@/lib/observability/reportar-falla", async () => {
  const { base } = await import("./supabase-falso");
  return {
    reportarFalla: (error: unknown, contexto: unknown) => base.reportes.push({ error, contexto }),
  };
});
vi.mock("@/lib/supabase/server", async () => {
  const { base } = await import("./supabase-falso");
  return { createClient: async () => base.cliente() };
});
vi.mock("@/lib/auth/bootstrap", async () => {
  const { base, ORG } = await import("./supabase-falso");
  const { ErrorEsperable } = await import("@/lib/server/error-esperable");
  return {
    requireOrganizationId: async () => {
      if (!base.sesion) throw new ErrorEsperable("Sesión no válida");
      return ORG;
    },
  };
});
vi.mock("@/lib/zernio/integration", () => ({
  getZernioIntegrationForOrg: async (org: unknown) => {
    sim.orgsPedidas.push(["zernio:integracion", org]);
    return sim.integracion;
  },
  getZernioClientForOrganization: async (org: unknown) => {
    sim.orgsPedidas.push(["zernio:cliente", org]);
    if (!sim.cliente) throw new Error("Zernio no está conectado");
    return sim.cliente;
  },
}));

import { getContentPieceAdsAction, getMarketingAdsAction } from "../ad-actions";
import { getContentPieceCommentsAction } from "../comment-actions";
import { createZernioClient, ZernioHttpError, ZernioTimeoutError } from "@/lib/zernio/client";
import { base, ORG, OTRA_ORG, TEXTO_FIJO } from "./supabase-falso";

const PIEZA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NO_EXISTE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const FETCH_FAILED = { message: "TypeError: fetch failed" };
const SIN_ACCESO = "Zernio rechazó la conexión de tu organización. Volvé a conectarlo desde Integraciones.";

const ANUNCIO = { _id: "ad-1", status: "active" };
const ANUNCIO_CON_ERROR = { _id: "ad-2", status: "rejected" };

function clienteZernio(respuesta: (metodo: string) => Promise<unknown>) {
  const metodo = (nombre: string) => async (...args: unknown[]) => {
    sim.pedidos.push([nombre, ...args]);
    return respuesta(nombre);
  };
  sim.cliente = {
    getLinkedAds: metodo("getLinkedAds"),
    listAds: metodo("listAds"),
    getPostComments: metodo("getPostComments"),
  };
}

let consola: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  base.reiniciar();
  // La pieza ajena va primero, con el mismo ID y otro post: una lectura sin el
  // filtro de la organización pediría sus anuncios y comentarios.
  base.tablas.content_pieces = [
    { id: PIEZA, organization_id: OTRA_ORG, platform_post_id: "post-ajeno", platform: "instagram" },
    { id: PIEZA, organization_id: ORG, platform_post_id: "post-mio", platform: "instagram" },
  ];
  sim.integracion = { connected_accounts: [{ platform: "instagram", accountId: "cuenta-ig" }] };
  sim.pedidos = [];
  sim.orgsPedidas = [];
  clienteZernio(async (m) =>
    m === "getPostComments"
      ? { comments: [{ id: "c1" }], pagination: { hasMore: false } }
      : { ads: [ANUNCIO, ANUNCIO_CON_ERROR], pagination: { hasMore: false } }
  );
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  consola.mockRestore();
  vi.unstubAllGlobals();
});

/** Zernio se pidió con la organización de la sesión, en este orden. */
function zernioConLaOrg(esperados: string[]) {
  expect(sim.orgsPedidas.map(([servicio]) => servicio)).toEqual(esperados);
  for (const [, org] of sim.orgsPedidas) expect(org).toBe(ORG);
}

/**
 * El cliente REAL de Zernio con un `fetch` falso que responde un 500 con un
 * cuerpo marcado: lo que se registra no puede llevar ese cuerpo.
 */
function clienteRealCon500() {
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response('{"error":"internal","detail":"CUERPO-DE-ZERNIO"}', {
        status: 500,
        headers: { "content-type": "application/json" },
      })
  );
  sim.cliente = createZernioClient("clave-falsa") as unknown as typeof sim.cliente;
}

/**
 * Ni el reporte a Sentry ni la línea de consola del registro de la acción
 * llevan el cuerpo. (El `console.error` propio de `zernioFetchJson` sí lo
 * muestra en los logs del servidor; la consola no llega a Sentry: SCRUM-501.)
 */
function nadaDelCuerpoRegistrado(etiqueta: string) {
  expect(JSON.stringify(base.reportes.map((r) => (r.error as Error).message))).not.toContain("CUERPO-DE-ZERNIO");
  const registro = consola.mock.calls.filter((llamada) => llamada[0] === etiqueta);
  expect(registro).toHaveLength(1);
  expect(String(registro[0][1])).not.toContain("CUERPO-DE-ZERNIO");
}

async function esFallaRegistrada(resultado: unknown, etiqueta: string) {
  expect(resultado).toEqual({ success: false, error: TEXTO_FIJO });
  expect(base.reportes).toHaveLength(1);
  expect(base.reportes[0].contexto).toEqual({ accion: etiqueta });
  expect(consola).toHaveBeenCalledWith(etiqueta, expect.anything());
}

function sinRegistro() {
  expect(base.reportes).toEqual([]);
  expect(consola).not.toHaveBeenCalled();
}

describe("getContentPieceAdsAction", () => {
  it("⭐ pide los anuncios del post de la pieza de la organización", async () => {
    const r = await getContentPieceAdsAction(PIEZA);
    expect(r).toEqual({ success: true, data: { ads: [ANUNCIO, ANUNCIO_CON_ERROR] } });
    expect(sim.pedidos).toEqual([["getLinkedAds", "post-mio"]]);
    zernioConLaOrg(["zernio:cliente"]);
  });

  it("⭐ un 500 de Zernio (cliente real) se registra con el status y sin el cuerpo", async () => {
    clienteRealCon500();
    await esFallaRegistrada(await getContentPieceAdsAction(PIEZA), "[getContentPieceAds]");
    expect((base.reportes[0].error as ZernioHttpError).message).toBe("Zernio getLinkedAds: HTTP 500");
    expect((base.reportes[0].error as ZernioHttpError).status).toBe(500);
    nadaDelCuerpoRegistrado("[getContentPieceAds]");
  });

  it("una pieza sin post (o de otra organización) no tiene anuncios", async () => {
    await expect(getContentPieceAdsAction(NO_EXISTE)).resolves.toEqual({ success: true, data: { ads: [] } });
    expect(sim.pedidos).toEqual([]);
  });

  it("un ID inválido, o sin sesión, vuelve con el motivo", async () => {
    await expect(getContentPieceAdsAction("x")).resolves.toEqual({ success: false, error: "ID inválido" });
    base.sesion = false;
    await expect(getContentPieceAdsAction(PIEZA)).resolves.toEqual({ success: false, error: "Sesión no válida" });
    sinRegistro();
  });

  it("⭐ Zernio sin conectar vuelve con el motivo", async () => {
    sim.cliente = null;
    await expect(getContentPieceAdsAction(PIEZA)).resolves.toEqual({ success: false, error: "Zernio no está conectado" });
    sinRegistro();
  });

  it("⭐ Zernio rechaza la clave (403): vuelve con el motivo", async () => {
    clienteZernio(async () => {
      throw new ZernioHttpError("Zernio getLinkedAds: HTTP 403 — forbidden", 403);
    });
    await expect(getContentPieceAdsAction(PIEZA)).resolves.toEqual({ success: false, error: SIN_ACCESO });
    sinRegistro();
  });

  it("⭐ un 500 de Zernio es una falla: texto fijo y se registra", async () => {
    clienteZernio(async () => {
      throw new ZernioHttpError("Zernio getLinkedAds: HTTP 500 — boom", 500);
    });
    await esFallaRegistrada(await getContentPieceAdsAction(PIEZA), "[getContentPieceAds]");
  });

  it("⭐ una falla de la base se registra", async () => {
    base.errores.content_pieces = FETCH_FAILED;
    await esFallaRegistrada(await getContentPieceAdsAction(PIEZA), "[getContentPieceAds]");
  });
});

describe("getMarketingAdsAction", () => {
  it("devuelve los anuncios con los filtros", async () => {
    const r = await getMarketingAdsAction({ fromDate: "2026-09-01", toDate: "2026-10-01" });
    expect(r).toEqual({
      success: true,
      data: { ads: [ANUNCIO, ANUNCIO_CON_ERROR], pagination: { hasMore: false } },
    });
    expect(sim.pedidos[0][1]).toMatchObject({ fromDate: "2026-09-01", toDate: "2026-10-01", limit: 100 });
    zernioConLaOrg(["zernio:cliente"]);
  });

  it("⭐ un 500 de Zernio (cliente real) se registra con el status y sin el cuerpo", async () => {
    clienteRealCon500();
    await esFallaRegistrada(await getMarketingAdsAction(), "[getMarketingAds]");
    expect((base.reportes[0].error as Error).message).toBe("Zernio listAds: HTTP 500");
    nadaDelCuerpoRegistrado("[getMarketingAds]");
  });

  it("el filtro «error» trae los rechazados y con error", async () => {
    const r = await getMarketingAdsAction({ status: "error" });
    expect(r.success && r.data.ads).toEqual([ANUNCIO_CON_ERROR]);
    expect(sim.pedidos[0][1]).toMatchObject({ status: undefined });
  });

  it("⭐ Zernio sin conectar vuelve con el motivo", async () => {
    sim.cliente = null;
    await expect(getMarketingAdsAction()).resolves.toEqual({ success: false, error: "Zernio no está conectado" });
    sinRegistro();
  });

  it("⭐ un error de Zernio ya no llega crudo: texto fijo y se registra", async () => {
    clienteZernio(async () => {
      throw new ZernioHttpError("Zernio listAds: HTTP 500 — <html>boom</html>", 500);
    });
    await esFallaRegistrada(await getMarketingAdsAction(), "[getMarketingAds]");
  });

  it("⭐ un tiempo agotado de Zernio es una falla", async () => {
    clienteZernio(async () => {
      throw new ZernioTimeoutError("listAds", 30_000);
    });
    await esFallaRegistrada(await getMarketingAdsAction(), "[getMarketingAds]");
  });

  it("⭐ Zernio rechaza la clave (401): vuelve con el motivo", async () => {
    clienteZernio(async () => {
      throw new ZernioHttpError("Zernio listAds: HTTP 401 — unauthorized", 401);
    });
    await expect(getMarketingAdsAction()).resolves.toEqual({ success: false, error: SIN_ACCESO });
  });

  it("sin sesión vuelve con el motivo", async () => {
    base.sesion = false;
    await expect(getMarketingAdsAction()).resolves.toEqual({ success: false, error: "Sesión no válida" });
  });
});

describe("getContentPieceCommentsAction", () => {
  it("⭐ pide los comentarios del post de la pieza de la organización", async () => {
    const r = await getContentPieceCommentsAction(PIEZA, "cursor-1");
    expect(r).toEqual({ success: true, data: { comments: [{ id: "c1" }], pagination: { hasMore: false } } });
    expect(sim.pedidos).toEqual([["getPostComments", "post-mio", "cuenta-ig", 25, "cursor-1"]]);
    expect(base.filtrosDe("content_pieces", "select")).toEqual([
      ["id", PIEZA],
      ["organization_id", ORG],
    ]);
    zernioConLaOrg(["zernio:integracion", "zernio:cliente"]);
  });

  it("⭐ un 500 de Zernio (cliente real) se registra con el status y sin el cuerpo", async () => {
    clienteRealCon500();
    await esFallaRegistrada(await getContentPieceCommentsAction(PIEZA), "[getContentPieceComments]");
    expect((base.reportes[0].error as Error).message).toBe("Zernio getPostComments: HTTP 500");
    nadaDelCuerpoRegistrado("[getContentPieceComments]");
  });

  it("⭐ una pieza sin post (o de otra organización) vuelve con el motivo", async () => {
    await expect(getContentPieceCommentsAction(NO_EXISTE)).resolves.toEqual({
      success: false,
      error: "Esta pieza no tiene un post de plataforma asociado",
    });
    sinRegistro();
  });

  it("⭐ sin integración de Zernio vuelve con el motivo", async () => {
    sim.integracion = null;
    await expect(getContentPieceCommentsAction(PIEZA)).resolves.toEqual({
      success: false,
      error: "Zernio no está conectado",
    });
  });

  it("sin una cuenta de la plataforma vuelve con el motivo", async () => {
    sim.integracion = { connected_accounts: [{ platform: "tiktok", accountId: "t" }] };
    await expect(getContentPieceCommentsAction(PIEZA)).resolves.toEqual({
      success: false,
      error: "No hay una cuenta de Instagram conectada en Zernio",
    });
  });

  it("un ID inválido vuelve con el motivo", async () => {
    await expect(getContentPieceCommentsAction("x")).resolves.toEqual({ success: false, error: "ID inválido" });
  });

  it("⭐ un error de Zernio se registra y vuelve con el texto fijo", async () => {
    clienteZernio(async () => {
      throw new ZernioHttpError("Zernio getPostComments: HTTP 502 — Bad Gateway", 502);
    });
    await esFallaRegistrada(await getContentPieceCommentsAction(PIEZA), "[getContentPieceComments]");
  });

  it("⭐ Zernio rechaza la clave (401): vuelve con el motivo", async () => {
    clienteZernio(async () => {
      throw new ZernioHttpError("Zernio getPostComments: HTTP 401 — unauthorized", 401);
    });
    await expect(getContentPieceCommentsAction(PIEZA)).resolves.toEqual({ success: false, error: SIN_ACCESO });
  });

  it("⭐ Zernio sin clave (cliente) vuelve con el motivo", async () => {
    sim.cliente = null;
    await expect(getContentPieceCommentsAction(PIEZA)).resolves.toEqual({
      success: false,
      error: "Zernio no está conectado",
    });
    sinRegistro();
  });

  it("⭐ una falla de la base se registra", async () => {
    base.lanza = new TypeError("fetch failed");
    await esFallaRegistrada(await getContentPieceCommentsAction(PIEZA), "[getContentPieceComments]");
  });
});
