import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-519: la sincronización de contenido con Zernio devuelve sus errores
 * esperables como valor. Antes lanzaba ("Zernio no está conectado", el texto
 * crudo de la base) y, si Zernio no respondía ninguna lectura, terminaba con
 * "0 piezas" como si no hubiera nada nuevo.
 *
 * Nunca se llama a Zernio: el cliente es un doble que responde lo que arma
 * cada test.
 */

const sim = vi.hoisted(() => ({
  perfil: null as { organization_id: string } | null,
  integracion: null as unknown,
  integracionLanza: null as unknown,
  apiKey: "clave-zernio" as string | null,
  posts: [] as unknown[],
  falla: null as null | (() => Error),
  fallaSoloLaPrimeraCuenta: false,
  clientes: [] as string[],
}));

vi.mock("@/lib/observability/reportar-falla", async () => {
  const { base } = await import("./base-falsa");
  return {
    reportarFalla: (error: unknown, contexto: unknown) => base.reportes.push({ error, contexto }),
  };
});
vi.mock("@/lib/supabase/server", async () => {
  const { base } = await import("./base-falsa");
  return { createClient: async () => base.cliente() };
});
vi.mock("@/lib/auth/bootstrap", () => ({
  getCurrentProfile: async () => sim.perfil,
}));
vi.mock("@/lib/zernio/integration", () => ({
  getZernioIntegrationForOrg: async () => {
    if (sim.integracionLanza) throw sim.integracionLanza;
    return sim.integracion;
  },
  getZernioApiKeyForOrganization: async () => sim.apiKey,
}));
vi.mock("@/lib/zernio/client", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/zernio/client")>();
  const leer = async (accountId: string) => {
    if (sim.falla && (!sim.fallaSoloLaPrimeraCuenta || accountId === "cuenta-1")) throw sim.falla();
    return { posts: sim.posts };
  };
  return {
    ...real,
    createZernioClient: (apiKey: string) => {
      sim.clientes.push(apiKey);
      return {
        listInstagramStories: async () => ({ posts: [] }),
        syncExternalStories: async () => ({ posts: [] }),
        syncExternalPosts: async (accountId: string) => leer(accountId),
        listPublishedPosts: async ({ accountId }: { accountId: string }) => leer(accountId),
      };
    },
  };
});
vi.mock("@/lib/marketing/sync-content-metrics", () => ({
  syncContentMetricsForOrg: async () => undefined,
}));
vi.mock("@/lib/marketing/story-thumbnail-storage", () => ({
  persistContentThumbnail: async () => null,
  isInstagramCdnUrl: () => false,
}));

import { maybeSyncZernioContentAction, syncZernioContentAction } from "../content/sync-actions";
import { ZernioHttpError } from "@/lib/zernio/client";
import { base, ORG, OTRA_ORG, TEXTO_FIJO } from "./base-falsa";

function post(id: string) {
  return {
    platform: "instagram",
    platformPostId: id,
    postType: "reel",
    content: `Post ${id}`,
    publishedAt: "2026-10-01T00:00:00Z",
  };
}

const RECIENTE = new Date().toISOString();
const FETCH_FAILED = { message: "TypeError: fetch failed" };
const CLAVE_RECHAZADA =
  "Zernio rechazó la conexión de tu organización. Volvé a conectarlo desde Integraciones.";

let consola: ReturnType<typeof vi.spyOn>;
let info: ReturnType<typeof vi.spyOn>;
let log: ReturnType<typeof vi.spyOn>;
let aviso: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  base.reiniciar();
  sim.perfil = { organization_id: ORG };
  sim.integracion = {
    organization_id: ORG,
    connected_accounts: [
      { accountId: "cuenta-1", platform: "instagram" },
      { accountId: "cuenta-2", platform: "YouTube" },
      { accountId: "cuenta-3", platform: "whatsapp" },
    ],
  };
  sim.integracionLanza = null;
  sim.apiKey = "clave-zernio";
  sim.posts = [post("ig-nuevo"), post("ig-existente")];
  sim.falla = null;
  sim.fallaSoloLaPrimeraCuenta = false;
  sim.clientes = [];
  base.tablas.content_pieces = [
    // Una pieza de otra org con el mismo id de plataforma: sin el filtro por
    // organización, la sync la tomaría como existente y la actualizaría.
    { id: "ajena-1", organization_id: OTRA_ORG, platform_post_id: "ig-nuevo", source: "zernio", updated_at: RECIENTE },
    { id: "propia-1", organization_id: ORG, platform_post_id: "ig-existente", source: "zernio", caption: "vieja" },
  ];
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
  info = vi.spyOn(console, "info").mockImplementation(() => {});
  log = vi.spyOn(console, "log").mockImplementation(() => {});
  aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  consola.mockRestore();
  info.mockRestore();
  log.mockRestore();
  aviso.mockRestore();
});

function esperarFallaRegistrada(etiqueta: string) {
  expect(base.reportes).toHaveLength(1);
  expect(base.reportes[0].contexto).toEqual({ accion: etiqueta });
  expect(consola).toHaveBeenCalledWith(etiqueta, expect.anything());
}

describe("syncZernioContentAction", () => {
  it("inserta las piezas nuevas y actualiza las existentes de la organización", async () => {
    await expect(syncZernioContentAction()).resolves.toEqual({ success: true, data: { synced: 2 } });
    expect(sim.clientes).toEqual(["clave-zernio"]);
    const insertadas = base.tablas.content_pieces.filter((f) => String(f.id).startsWith("nuevo-"));
    expect(insertadas).toMatchObject([{ organization_id: ORG, platform_post_id: "ig-nuevo" }]);
    expect(base.tablas.content_pieces[1].caption).toBe("Post ig-existente");
    expect(base.tablas.content_pieces[0]).not.toHaveProperty("caption");
    expect(base.filtrosDe("content_pieces", "select")).toEqual([
      ["organization_id", ORG],
      ["in:platform_post_id", ["ig-nuevo", "ig-existente"]],
    ]);
  });

  it("⭐ la actualización de una pieza filtra por organización", async () => {
    // Una gemela de otra org con el id de la pieza propia.
    base.tablas.content_pieces.push({ id: "propia-1", organization_id: OTRA_ORG, caption: "ajena" });
    await syncZernioContentAction();
    expect(base.tablas.content_pieces[2].caption).toBe("ajena");
    expect(base.filtrosDe("content_pieces", "update")).toEqual([
      ["id", "propia-1"],
      ["organization_id", ORG],
    ]);
  });

  it.each([
    ["sin integración", null, "Zernio no está conectado"],
    ["sin cuentas", { connected_accounts: [] }, "Zernio no está conectado"],
    [
      "sin cuentas de contenido",
      { connected_accounts: [{ accountId: "w", platform: "whatsapp" }] },
      "No hay cuentas de Instagram o YouTube conectadas en Zernio",
    ],
  ])("%s devuelve el motivo, sin registrar", async (_caso, integracion, motivo) => {
    sim.integracion = integracion;
    await expect(syncZernioContentAction()).resolves.toEqual({ success: false, error: motivo });
    expect(base.reportes).toEqual([]);
  });

  it("sin la clave de Zernio, no conectado", async () => {
    sim.apiKey = null;
    await expect(syncZernioContentAction()).resolves.toEqual({
      success: false,
      error: "Zernio no está conectado",
    });
  });

  it("sin perfil (sin sesión), el motivo", async () => {
    sim.perfil = null;
    await expect(syncZernioContentAction()).resolves.toEqual({
      success: false,
      error: "Sesión no válida",
    });
  });

  it("si falla la lectura de la integración, texto fijo y se registra", async () => {
    sim.integracionLanza = new Error("TypeError: fetch failed");
    await expect(syncZernioContentAction()).resolves.toEqual({ success: false, error: TEXTO_FIJO });
    esperarFallaRegistrada("[syncZernioContent]");
  });

  it("⭐ con la clave rechazada por Zernio (401) en todas las lecturas, el motivo para reconectar", async () => {
    sim.falla = () => new ZernioHttpError("Zernio syncExternalPosts: HTTP 401 — invalid key", 401);
    await expect(syncZernioContentAction()).resolves.toEqual({
      success: false,
      error: CLAVE_RECHAZADA,
    });
    expect(base.reportes).toEqual([]);
    expect(base.escrituras()).toEqual([]);
  });

  it("⭐ si Zernio no responde ninguna lectura, ya no es «0 piezas»: texto fijo, sin el cuerpo", async () => {
    sim.falla = () => new ZernioHttpError("Zernio listPublishedPosts: HTTP 502 — <html>cuerpo</html>", 502);
    await expect(syncZernioContentAction()).resolves.toEqual({ success: false, error: TEXTO_FIJO });
    esperarFallaRegistrada("[syncZernioContent]");
    expect((base.reportes[0].error as Error).message).toBe(
      "Zernio no respondió ninguna lectura de posts (HTTP 502)"
    );
  });

  it("si falla sólo una cuenta, sincroniza lo que llegó (como antes)", async () => {
    sim.falla = () => new TypeError("fetch failed");
    sim.fallaSoloLaPrimeraCuenta = true;
    await expect(syncZernioContentAction()).resolves.toEqual({ success: true, data: { synced: 2 } });
    expect(base.reportes).toEqual([]);
  });

  it.each([
    ["la lectura de las existentes", "content_pieces:select"],
    ["el alta", "content_pieces:insert"],
    ["la actualización", "content_pieces:update"],
  ])("⭐ si falla %s, texto fijo (antes, el texto crudo de la base)", async (_caso, clave) => {
    base.errores[clave] = FETCH_FAILED;
    await expect(syncZernioContentAction()).resolves.toEqual({ success: false, error: TEXTO_FIJO });
    esperarFallaRegistrada("[syncZernioContent]");
  });
});

describe("maybeSyncZernioContentAction", () => {
  it("sin piezas de Zernio en la organización, sincroniza", async () => {
    // La pieza reciente de la otra org no cuenta: sin el filtro por
    // organización, el conteo y la última pieza la tomarían y se saltearía.
    base.tablas.content_pieces = [
      { id: "ajena-1", organization_id: OTRA_ORG, platform_post_id: "x", source: "zernio", updated_at: RECIENTE },
    ];
    await expect(maybeSyncZernioContentAction()).resolves.toEqual({
      success: true,
      data: { sincronizo: true },
    });
    // El conteo y la última pieza (las dos lecturas con `source`).
    const lecturasDelIntervalo = base.operaciones.filter(
      (o) => o.tabla === "content_pieces" && o.filtros.some(([columna]) => columna === "source")
    );
    expect(lecturasDelIntervalo.map((o) => [o.head ?? false, o.filtros])).toEqual([
      [true, [["organization_id", ORG], ["source", "zernio"]]],
      [false, [["organization_id", ORG], ["source", "zernio"]]],
    ]);
  });

  it("con una pieza de hace menos de 30 minutos, se saltea", async () => {
    base.tablas.content_pieces = [
      { id: "p", organization_id: ORG, platform_post_id: "x", source: "zernio", updated_at: RECIENTE },
    ];
    await expect(maybeSyncZernioContentAction()).resolves.toEqual({
      success: true,
      data: { sincronizo: false },
    });
    expect(sim.clientes).toEqual([]);
  });

  it("⭐ el motivo de la sincronización vuelve como valor (antes, la pantalla lo tragaba)", async () => {
    sim.integracion = null;
    await expect(maybeSyncZernioContentAction()).resolves.toEqual({
      success: false,
      error: "Zernio no está conectado",
    });
  });

  it("⭐ si falla el conteo, texto fijo y se registra", async () => {
    base.errores["content_pieces:select:head"] = { message: "" };
    await expect(maybeSyncZernioContentAction()).resolves.toEqual({ success: false, error: TEXTO_FIJO });
    esperarFallaRegistrada("[maybeSyncZernioContent]");
  });

  it("si falla la lectura de la última pieza, texto fijo", async () => {
    base.errores["content_pieces:select:filas"] = FETCH_FAILED;
    await expect(maybeSyncZernioContentAction()).resolves.toEqual({ success: false, error: TEXTO_FIJO });
  });

  it("sin perfil (sin sesión), el motivo", async () => {
    sim.perfil = null;
    await expect(maybeSyncZernioContentAction()).resolves.toEqual({
      success: false,
      error: "Sesión no válida",
    });
  });
});
