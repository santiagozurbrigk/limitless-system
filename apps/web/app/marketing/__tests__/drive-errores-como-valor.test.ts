import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-519: las seis acciones de Drive de Marketing devuelven sus errores
 * esperables como valor. Antes lanzaban códigos ("GOOGLE_NOT_CONNECTED") que en
 * producción llegaban como el párrafo de Next, y una falla al leer la
 * integración de Google se veía como "No hay conexión con Google Drive".
 *
 * Nunca se llama a Google: `fetch` es un doble que responde lo que arma cada
 * test, con los cuerpos de error de la guía de la API de Drive (copia en la
 * evidencia de SCRUM-519).
 */

const sim = vi.hoisted(() => ({
  perfil: { organization_id: "" } as { organization_id: string } | null,
  respuestas: [] as Array<Response | Error>,
  pedidos: [] as Array<{ url: string; auth: string | null }>,
}));

vi.mock("@/lib/observability/reportar-falla", async () => {
  const { base } = await import("./base-falsa");
  return {
    reportarFalla: (error: unknown, contexto: unknown) => base.reportes.push({ error, contexto }),
  };
});
vi.mock("@/lib/supabase/admin", async () => {
  const { base } = await import("./base-falsa");
  return { createAdminClient: () => base.cliente() };
});
vi.mock("@/lib/auth/bootstrap", () => ({
  getCurrentProfile: async () => sim.perfil,
}));
vi.mock("@/lib/google/refresh-token", () => ({
  refreshGoogleAccessToken: async () => ({ access_token: "token-renovado", expires_in: 3600 }),
}));
vi.mock("@/app/marketing/content/actions", () => ({
  updateContentPieceAction: vi.fn(),
}));

import {
  createDriveFolderAction,
  downloadDriveFileAction,
  getDriveFileAction,
  getDriveFolderPathAction,
  listDriveFilesAction,
  listDriveFilesSafeAction,
  searchDriveFilesAction,
} from "../content/drive-actions";
import { descargarArchivoDeDrive } from "@/lib/google/drive-archivos";
import {
  getGoogleAccessTokenForOrganization,
  leerTokenDeGoogle,
} from "@/lib/google/get-access-token";
import {
  MOTIVO_DRIVE_ARCHIVO_GRANDE,
  MOTIVO_DRIVE_NO_CONECTADO,
  MOTIVO_DRIVE_NO_ENCONTRADO,
  MOTIVO_DRIVE_SIN_PERMISOS,
} from "@/lib/google/motivos-de-drive";
import { GOOGLE_FORMS_DRIVE_SCOPES } from "@/lib/google/scopes";
import { ErrorEsperable } from "@/lib/server/error-esperable";
import { base, ORG, OTRA_ORG, TEXTO_FIJO } from "./base-falsa";

const TOKEN = "token-de-la-org";
const TOKEN_AJENO = "token-de-otra-org";
const FETCH_FAILED = { message: "TypeError: fetch failed" };

function integracion(org: string, token: string, extra: Record<string, unknown> = {}) {
  return {
    organization_id: org,
    status: "connected",
    access_token: token,
    refresh_token: "refresco",
    token_expires_at: "2999-01-01T00:00:00Z",
    granted_scopes: GOOGLE_FORMS_DRIVE_SCOPES.join(" "),
    ...extra,
  };
}

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Un error de Drive con el formato de la guía de la API. */
function errorDeDrive(status: number, reason: string, domain = "global"): Response {
  return json(
    { error: { errors: [{ domain, reason, message: "detalle de Google" }], code: status, message: "detalle de Google" } },
    status
  );
}

const ARCHIVO = { id: "f1", name: "Reel.mp4", mimeType: "video/mp4", modifiedTime: "2026-10-01" };

let consola: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  base.reiniciar();
  sim.perfil = { organization_id: ORG };
  sim.respuestas = [];
  sim.pedidos = [];
  // La fila ajena va primero: sin el filtro por organización, la consulta la
  // tomaría a ella y el pedido a Google saldría con el token ajeno.
  base.tablas.google_forms_integrations = [integracion(OTRA_ORG, TOKEN_AJENO), integracion(ORG, TOKEN)];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      sim.pedidos.push({ url: String(url), auth: headers.get("Authorization") });
      const siguiente = sim.respuestas.shift();
      if (!siguiente) throw new Error("el test no preparó una respuesta de Drive");
      if (siguiente instanceof Error) throw siguiente;
      return siguiente;
    })
  );
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  consola.mockRestore();
});

function esperarFallaRegistrada(etiqueta: string) {
  expect(base.reportes).toHaveLength(1);
  expect(base.reportes[0].contexto).toEqual({ accion: etiqueta });
  expect(consola).toHaveBeenCalledWith(etiqueta, expect.anything());
}

describe("el token de Google", () => {
  it("sale de la integración conectada de la organización del perfil", async () => {
    sim.respuestas = [json({ files: [ARCHIVO] })];
    await listDriveFilesAction();
    expect(sim.pedidos[0].auth).toBe(`Bearer ${TOKEN}`);
    expect(base.filtrosDe("google_forms_integrations", "select")).toEqual([
      ["organization_id", ORG],
      ["status", "connected"],
    ]);
  });

  it("⭐ una integración desconectada no da token (filtro por estado)", async () => {
    base.tablas.google_forms_integrations = [integracion(ORG, TOKEN, { status: "disconnected" })];
    await expect(listDriveFilesAction()).resolves.toEqual({
      success: false,
      error: MOTIVO_DRIVE_NO_CONECTADO,
    });
    expect(sim.pedidos).toEqual([]);
  });

  it("⭐ un token por vencer se renueva y se guarda sólo en la integración de la organización", async () => {
    base.tablas.google_forms_integrations = [
      integracion(OTRA_ORG, TOKEN_AJENO),
      integracion(ORG, TOKEN, { token_expires_at: "2000-01-01T00:00:00Z" }),
    ];
    sim.respuestas = [json({ files: [] })];
    await listDriveFilesAction();
    expect(sim.pedidos[0].auth).toBe("Bearer token-renovado");
    expect(base.tablas.google_forms_integrations[1].access_token).toBe("token-renovado");
    expect(base.tablas.google_forms_integrations[0].access_token).toBe(TOKEN_AJENO);
  });

  it("sin los permisos de Drive, no conectado", async () => {
    base.tablas.google_forms_integrations = [integracion(ORG, TOKEN, { granted_scopes: "openid" })];
    await expect(listDriveFilesAction()).resolves.toEqual({
      success: false,
      error: MOTIVO_DRIVE_NO_CONECTADO,
    });
  });

  it("⭐ si la lectura de la integración falla, el texto fijo y no «no conectado»", async () => {
    base.errores.google_forms_integrations = FETCH_FAILED;
    await expect(listDriveFilesAction()).resolves.toEqual({ success: false, error: TEXTO_FIJO });
    esperarFallaRegistrada("[listDriveFiles]");
    expect(sim.pedidos).toEqual([]);
  });

  it("sin perfil (sin sesión), el motivo", async () => {
    sim.perfil = null;
    await expect(listDriveFilesAction()).resolves.toEqual({
      success: false,
      error: "Sesión no válida",
    });
  });

  it("getGoogleAccessTokenForOrganization no cambia para Contexto del negocio: falla = null", async () => {
    base.errores.google_forms_integrations = FETCH_FAILED;
    await expect(getGoogleAccessTokenForOrganization(ORG)).resolves.toBeNull();
    await expect(leerTokenDeGoogle(ORG)).rejects.toMatchObject({ name: "FallaDeLaBase" });
  });
});

describe("listDriveFilesAction y listDriveFilesSafeAction", () => {
  it("lista la carpeta pedida", async () => {
    sim.respuestas = [json({ files: [ARCHIVO] })];
    await expect(listDriveFilesAction({ folderId: "carpeta-1" })).resolves.toEqual({
      success: true,
      data: [ARCHIVO],
    });
    expect(new URL(sim.pedidos[0].url).searchParams.get("q")).toContain("'carpeta-1' in parents");
  });

  it("⭐ un 401 (token vencido o revocado) es el motivo para reconectar", async () => {
    sim.respuestas = [errorDeDrive(401, "authError")];
    await expect(listDriveFilesAction()).resolves.toEqual({
      success: false,
      error: MOTIVO_DRIVE_SIN_PERMISOS,
    });
    expect(base.reportes).toEqual([]);
  });

  it("un 403 de permisos (insufficientFilePermissions) es el motivo para reconectar", async () => {
    sim.respuestas = [errorDeDrive(403, "insufficientFilePermissions")];
    await expect(listDriveFilesAction()).resolves.toEqual({
      success: false,
      error: MOTIVO_DRIVE_SIN_PERMISOS,
    });
  });

  it.each(["userRateLimitExceeded", "dailyLimitExceeded"])(
    "⭐ un 403 por límite de uso (%s) es una falla, no un problema de permisos",
    async (reason) => {
      sim.respuestas = [errorDeDrive(403, reason, "usageLimits")];
      await expect(listDriveFilesAction()).resolves.toEqual({ success: false, error: TEXTO_FIJO });
      esperarFallaRegistrada("[listDriveFiles]");
    }
  );

  it("un 403 sin cuerpo legible es una falla", async () => {
    sim.respuestas = [new Response("<html>", { status: 403 })];
    await expect(listDriveFilesAction()).resolves.toEqual({ success: false, error: TEXTO_FIJO });
  });

  it("un 404 dice que no encontramos la carpeta", async () => {
    sim.respuestas = [errorDeDrive(404, "notFound")];
    await expect(listDriveFilesAction({ folderId: "x" })).resolves.toEqual({
      success: false,
      error: MOTIVO_DRIVE_NO_ENCONTRADO,
    });
  });

  it("⭐ un 500 es una falla: texto fijo, sin el token ni la búsqueda en lo que se registra", async () => {
    sim.respuestas = [json({ error: { message: "Backend Error" } }, 500)];
    await expect(listDriveFilesAction({ query: "plan secreto" })).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
    esperarFallaRegistrada("[listDriveFiles]");
    const registrado = String((base.reportes[0].error as Error).message);
    expect(registrado).toBe("Google Drive listar archivos: HTTP 500");
    expect(registrado).not.toContain(TOKEN);
    expect(registrado).not.toContain("plan secreto");
  });

  it("si la red falla, texto fijo y se registra", async () => {
    sim.respuestas = [new TypeError("fetch failed")];
    await expect(listDriveFilesAction()).resolves.toEqual({ success: false, error: TEXTO_FIJO });
    esperarFallaRegistrada("[listDriveFiles]");
  });

  it("la versión con código: conectar, reconectar u otro", async () => {
    base.tablas.google_forms_integrations = [];
    await expect(listDriveFilesSafeAction()).resolves.toEqual({
      ok: false,
      errorCode: "GOOGLE_NOT_CONNECTED",
      message: MOTIVO_DRIVE_NO_CONECTADO,
    });

    base.tablas.google_forms_integrations = [integracion(ORG, TOKEN)];
    sim.respuestas = [errorDeDrive(401, "authError")];
    await expect(listDriveFilesSafeAction()).resolves.toEqual({
      ok: false,
      errorCode: "GOOGLE_INSUFFICIENT_PERMISSIONS",
      message: MOTIVO_DRIVE_SIN_PERMISOS,
    });

    sim.respuestas = [json({}, 503)];
    await expect(listDriveFilesSafeAction()).resolves.toEqual({
      ok: false,
      errorCode: "OTHER",
      message: TEXTO_FIJO,
    });

    sim.respuestas = [json({ files: [ARCHIVO] })];
    await expect(listDriveFilesSafeAction()).resolves.toEqual({ ok: true, files: [ARCHIVO] });
  });
});

describe("getDriveFileAction", () => {
  it("devuelve los metadatos del archivo", async () => {
    sim.respuestas = [json(ARCHIVO)];
    await expect(getDriveFileAction("f1")).resolves.toEqual({ success: true, data: ARCHIVO });
  });

  it("un 404 es el motivo", async () => {
    sim.respuestas = [errorDeDrive(404, "notFound")];
    await expect(getDriveFileAction("f1")).resolves.toEqual({
      success: false,
      error: MOTIVO_DRIVE_NO_ENCONTRADO,
    });
  });

  it("un 500 es una falla", async () => {
    sim.respuestas = [json({}, 500)];
    await expect(getDriveFileAction("f1")).resolves.toEqual({ success: false, error: TEXTO_FIJO });
    esperarFallaRegistrada("[getDriveFile]");
  });
});

describe("getDriveFolderPathAction", () => {
  it("arma la ruta de carpetas hasta la raíz", async () => {
    sim.respuestas = [
      json({ id: "c2", name: "Reels", parents: ["c1"] }),
      json({ id: "c1", name: "Marketing", parents: [] }),
    ];
    await expect(getDriveFolderPathAction("c2")).resolves.toEqual({
      success: true,
      data: [
        { id: "c1", name: "Marketing" },
        { id: "c2", name: "Reels" },
      ],
    });
  });

  it("una carpeta de arriba que Drive no deja ver (404) corta la ruta, como antes", async () => {
    sim.respuestas = [json({ id: "c2", name: "Reels", parents: ["c1"] }), errorDeDrive(404, "notFound")];
    await expect(getDriveFolderPathAction("c2")).resolves.toEqual({
      success: true,
      data: [{ id: "c2", name: "Reels" }],
    });
  });

  it("⭐ un 500 ya no corta la ruta sin avisar: texto fijo", async () => {
    sim.respuestas = [json({ id: "c2", name: "Reels", parents: ["c1"] }), json({}, 500)];
    await expect(getDriveFolderPathAction("c2")).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
    esperarFallaRegistrada("[getDriveFolderPath]");
  });

  it("un 401 es el motivo para reconectar", async () => {
    sim.respuestas = [errorDeDrive(401, "authError")];
    await expect(getDriveFolderPathAction("c2")).resolves.toEqual({
      success: false,
      error: MOTIVO_DRIVE_SIN_PERMISOS,
    });
  });
});

describe("downloadDriveFileAction y descargarArchivoDeDrive", () => {
  it("descarga el archivo", async () => {
    sim.respuestas = [json({ id: "f1", name: "Reel.mp4", mimeType: "video/mp4", size: "4" }), new Response("abcd")];
    const r = await downloadDriveFileAction("f1");
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.name).toBe("Reel.mp4");
    expect(r.data.mimeType).toBe("video/mp4");
    expect(r.data.buffer.toString()).toBe("abcd");
    expect(sim.pedidos[1].url).toContain("alt=media");
  });

  it("un Google Doc se exporta a PDF", async () => {
    sim.respuestas = [
      json({ id: "d1", name: "Guion", mimeType: "application/vnd.google-apps.document" }),
      new Response("pdf"),
    ];
    const r = await downloadDriveFileAction("d1");
    expect(r).toMatchObject({ success: true, data: { mimeType: "application/pdf" } });
    expect(sim.pedidos[1].url).toContain("/export?mimeType=application%2Fpdf");
  });

  it("más de 500 MB es el motivo, sin descargar", async () => {
    sim.respuestas = [json({ id: "f1", name: "Largo", mimeType: "video/mp4", size: String(600 * 1024 * 1024) })];
    await expect(downloadDriveFileAction("f1")).resolves.toEqual({
      success: false,
      error: MOTIVO_DRIVE_ARCHIVO_GRANDE,
    });
    expect(sim.pedidos).toHaveLength(1);
  });

  it("un 403 de permisos en la descarga es el motivo para reconectar", async () => {
    sim.respuestas = [
      json({ id: "f1", name: "Reel.mp4", mimeType: "video/mp4" }),
      errorDeDrive(403, "appNotAuthorizedToFile"),
    ];
    await expect(downloadDriveFileAction("f1")).resolves.toEqual({
      success: false,
      error: MOTIVO_DRIVE_SIN_PERMISOS,
    });
  });

  it("un 500 en la descarga es una falla", async () => {
    sim.respuestas = [json({ id: "f1", name: "Reel.mp4", mimeType: "video/mp4" }), json({}, 500)];
    await expect(downloadDriveFileAction("f1")).resolves.toEqual({ success: false, error: TEXTO_FIJO });
    esperarFallaRegistrada("[downloadDriveFile]");
  });

  it("para el análisis de una pieza, sin conexión lanza un ErrorEsperable con el motivo", async () => {
    base.tablas.google_forms_integrations = [];
    const error = await descargarArchivoDeDrive("f1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorEsperable);
    expect((error as Error).message).toBe(MOTIVO_DRIVE_NO_CONECTADO);
  });
});

describe("createDriveFolderAction", () => {
  it("devuelve como valor que la creación no está disponible", async () => {
    await expect(createDriveFolderAction({ name: "Nueva" })).resolves.toEqual({
      success: false,
      error:
        "La creación de carpetas no está disponible temporalmente. Seleccioná una carpeta existente de tu Drive.",
    });
    expect(base.reportes).toEqual([]);
  });
});

describe("searchDriveFilesAction", () => {
  it("busca por nombre", async () => {
    sim.respuestas = [json({ files: [ARCHIVO] })];
    await expect(searchDriveFilesAction(" reel ")).resolves.toEqual({ success: true, data: [ARCHIVO] });
    expect(new URL(sim.pedidos[0].url).searchParams.get("q")).toContain("name contains 'reel'");
  });

  it("una búsqueda vacía no llama a Google", async () => {
    await expect(searchDriveFilesAction("  ")).resolves.toEqual({ success: true, data: [] });
    expect(sim.pedidos).toEqual([]);
  });

  it("un 429 es una falla", async () => {
    sim.respuestas = [errorDeDrive(429, "rateLimitExceeded", "usageLimits")];
    await expect(searchDriveFilesAction("reel")).resolves.toEqual({ success: false, error: TEXTO_FIJO });
    esperarFallaRegistrada("[searchDriveFiles]");
  });

  it("sin conexión, el motivo", async () => {
    base.tablas.google_forms_integrations = [];
    await expect(searchDriveFilesAction("reel")).resolves.toEqual({
      success: false,
      error: MOTIVO_DRIVE_NO_CONECTADO,
    });
  });
});
