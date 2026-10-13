import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-502: las acciones de Contenido (`app/marketing/content/actions.ts`)
 * devuelven sus errores esperables como valor. Antes lanzaban: en producción
 * el usuario veía el párrafo técnico de Next, una falla de la base al leer una
 * variante se mostraba como "Variante no encontrada" y la lectura de las piezas
 * padre de los borradores ignoraba su error.
 *
 * Ningún test llama a un servicio real: Zernio, Drive, Claude y la base son
 * falsos.
 */

const sim = vi.hoisted(() => ({
  descarga: null as null | { buffer: Buffer; mimeType: string; name: string } | Error,
  claude: null as unknown,
  claudeLanza: null as unknown,
  atribucion: new Map<string, unknown>() as Map<string, unknown> | Error,
  integracion: null as unknown,
  integracionLanza: null as unknown,
  cliente: null as null | Record<string, (...args: unknown[]) => Promise<unknown>>,
  pedidosAClaude: [] as unknown[],
  posts: [] as unknown[],
  /** Con qué organización se pidió cada servicio (SCRUM-502, AR pasada 1). */
  orgsPedidas: [] as Array<[string, unknown]>,
  /** Si está, el análisis usa el `transcribeAudioBuffer` real (sin red). */
  whisperReal: false,
  audio: Buffer.from("a"),
}));

vi.mock("@/lib/observability/reportar-falla", async () => {
  const { base } = await import("./supabase-falso");
  return {
    reportarFalla: (error: unknown, contexto: unknown) => base.reportes.push({ error, contexto }),
  };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", async () => {
  const { base } = await import("./supabase-falso");
  return { createClient: async () => base.cliente() };
});
vi.mock("@/lib/auth/bootstrap", async () => {
  const { base } = await import("./supabase-falso");
  return {
    getCurrentProfile: async () => {
      if (base.lanzaEnSesion) throw base.lanzaEnSesion;
      return base.sesion ? base.perfil : null;
    },
  };
});
vi.mock("@/lib/ai/anthropic", () => {
  const llamar = async (pedido: unknown) => {
    sim.pedidosAClaude.push(pedido);
    if (sim.claudeLanza) throw sim.claudeLanza;
    return sim.claude;
  };
  return { callClaudeJson: llamar, callClaudeVisionJson: llamar };
});
vi.mock("@/lib/content/transcribe-whisper", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/content/transcribe-whisper")>();
  return {
    ...real,
    transcribeAudioBuffer: async (audio: Buffer) =>
      sim.whisperReal ? real.transcribeAudioBuffer(audio) : "transcripción",
  };
});
vi.mock("@/lib/content/video-processor", () => ({
  processVideoForAnalysis: async () => ({ audioBuffer: sim.audio, frames: [] }),
}));
vi.mock("@/app/marketing/content/drive-actions", () => ({
  downloadDriveFileAction: async () => {
    if (sim.descarga instanceof Error) throw sim.descarga;
    return sim.descarga;
  },
}));
vi.mock("@/lib/marketing/content-sales-attribution", () => ({
  computeSalesAttributionForOrg: async (_supabase: unknown, org: unknown) => {
    sim.orgsPedidas.push(["atribucion", org]);
    if (sim.atribucion instanceof Error) throw sim.atribucion;
    return sim.atribucion;
  },
}));
vi.mock("@/lib/zernio/integration", () => ({
  getZernioIntegrationForOrg: async (org: unknown) => {
    sim.orgsPedidas.push(["zernio:integracion", org]);
    if (sim.integracionLanza) throw sim.integracionLanza;
    return sim.integracion;
  },
  getZernioClientForOrganization: async (org: unknown) => {
    sim.orgsPedidas.push(["zernio:cliente", org]);
    if (!sim.cliente) throw new Error("Zernio no está conectado");
    return sim.cliente;
  },
}));

import {
  analyzeContentPieceAction,
  createContentVariantsAction,
  deleteContentPieceAction,
  generateVariantCaptionAction,
  getContentDraftsAction,
  getContentPieceAction,
  getContentPiecesAction,
  getTopPerformingContentAction,
  publishVariantAsZernioDraftAction,
  updateContentPieceAction,
  updateSalesAttributionAction,
} from "../actions";
import { createZernioClient, ZernioHttpError } from "@/lib/zernio/client";
import { GoogleIntegrationPermissionError } from "@/lib/google/errors";
import { AI_KEY_REJECTED_MESSAGE } from "@/lib/ai/anthropic-auth-errors";
import { base, CACHE_CAIDA, ORG, OTRA_ORG, TEXTO_FIJO } from "./supabase-falso";

const PIEZA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VARIANTE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const VARIANTE_AJENA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const NO_EXISTE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ID_DE_PLATAFORMA = "17896293831516409";
const FETCH_FAILED = { message: "TypeError: fetch failed" };
const PIEZA_NO_ENCONTRADA = "Pieza no encontrada (se buscó por UUID interno y por ID de plataforma)";

const BRIEF = {
  formato: { name: "Talking head", description: "a cámara" },
  dolor: { name: "Sin ventas", description: "no vende" },
  angulo: { name: "Error común", description: "lo que nadie dice" },
  structure: [{ part: "Hook", description: "gancho", example_script: "¿Sabías…?" }],
};
const ANALISIS = {
  formato: { name: "Talking head", description: "" },
  dolor: { name: "Sin ventas", description: "" },
  angulo: { name: "Error común", description: "" },
  why_it_worked: "porque sí",
  video_structure: [],
  format_type: "talking_head",
  hook_type: "question",
  cta_type: "dm",
};

function pieza(id: string, org: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    organization_id: org,
    type: "reel",
    source: "zernio",
    platform: "instagram",
    platform_post_id: ID_DE_PLATAFORMA,
    title: org === ORG ? "Mía" : "Ajena",
    caption: org === ORG ? "caption mío" : "caption ajeno",
    variants_of: null,
    drive_file_id: "drive-1",
    metrics: { views: org === ORG ? 10 : 99 },
    sales_attributed: null,
    analysis: null,
    status: "published",
    ...extra,
  };
}

/**
 * La fila ajena va primero y comparte el ID y el ID de plataforma de la mía:
 * una lectura sin el filtro de la organización la devuelve a ella.
 */
function cargarPiezas() {
  base.tablas.content_pieces = [
    pieza(PIEZA, OTRA_ORG),
    pieza(VARIANTE, OTRA_ORG, { variants_of: PIEZA, brief: BRIEF, source: "ai_generated" }),
    pieza(PIEZA, ORG),
    pieza(VARIANTE, ORG, { variants_of: PIEZA, brief: BRIEF, source: "ai_generated", platform_post_id: null }),
    pieza(VARIANTE_AJENA, OTRA_ORG, { variants_of: PIEZA, brief: BRIEF, source: "ai_generated" }),
  ];
}

function filaDe(id: string, org: string) {
  return base.tablas.content_pieces.find((f) => f.id === id && f.organization_id === org);
}

/** Cada operación sobre `tabla` lleva el filtro de la organización de la sesión. */
function cadaConsultaFiltraPorOrg(tabla = "content_pieces") {
  const ops = base.operaciones.filter((o) => o.tabla === tabla && o.op !== "insert");
  expect(ops.length).toBeGreaterThan(0);
  for (const op of ops) expect(op.filtros).toContainEqual(["organization_id", ORG]);
}

let consola: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  base.reiniciar();
  cargarPiezas();
  sim.descarga = { buffer: Buffer.from("png"), mimeType: "image/png", name: "a.png" };
  sim.claude = null;
  sim.claudeLanza = null;
  sim.atribucion = new Map();
  sim.integracion = {
    zernio_profile_id: "perfil-1",
    connected_accounts: [{ platform: "instagram", accountId: "cuenta-ig" }],
  };
  sim.integracionLanza = null;
  sim.cliente = null;
  sim.pedidosAClaude = [];
  sim.posts = [];
  sim.orgsPedidas = [];
  sim.whisperReal = false;
  sim.audio = Buffer.from("a");
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  consola.mockRestore();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** Cada servicio externo se pidió con la organización de la sesión. */
function serviciosConLaOrg(esperados: string[]) {
  expect(sim.orgsPedidas.map(([servicio]) => servicio)).toEqual(esperados);
  for (const [, org] of sim.orgsPedidas) expect(org).toBe(ORG);
}

/** Claude se pidió con la clave (la organización) de la sesión. */
function claudeConLaOrg() {
  expect(sim.pedidosAClaude.length).toBeGreaterThan(0);
  for (const pedido of sim.pedidosAClaude) {
    expect((pedido as { organizationId: unknown }).organizationId).toBe(ORG);
  }
}

/** Una falla inesperada vuelve con el texto fijo y queda registrada con su etiqueta. */
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

describe("getContentPiecesAction", () => {
  it("devuelve las piezas raíz de la organización", async () => {
    const r = await getContentPiecesAction({ limit: 50 });
    expect(r.success && r.data.map((p) => [p.id, p.organization_id])).toEqual([[PIEZA, ORG]]);
    expect(base.filtrosDe("content_pieces", "select")).toEqual([
      ["organization_id", ORG],
      ["is:variants_of", null],
    ]);
  });

  it("sin sesión devuelve el motivo, sin registrarlo", async () => {
    base.sesion = false;
    await expect(getContentPiecesAction()).resolves.toEqual({ success: false, error: "Sesión no válida" });
    sinRegistro();
  });

  it("⭐ una falla de la base (supabase-js) vuelve con el texto fijo y se registra", async () => {
    base.errores.content_pieces = FETCH_FAILED;
    await esFallaRegistrada(await getContentPiecesAction(), "[getContentPieces]");
  });

  it("⭐ un TypeError de la red vuelve con el texto fijo y se registra", async () => {
    base.lanza = new TypeError("fetch failed");
    await esFallaRegistrada(await getContentPiecesAction(), "[getContentPieces]");
  });

  it("un PGRST002 (caché de esquema caída) es una falla, no una lista vacía", async () => {
    base.errores.content_pieces = CACHE_CAIDA;
    await esFallaRegistrada(await getContentPiecesAction(), "[getContentPieces]");
  });

  it("un error interno de Next (redirect) se relanza", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
    base.lanzaEnSesion = redirect;
    await expect(getContentPiecesAction()).rejects.toBe(redirect);
    sinRegistro();
  });
});

describe("getContentPieceAction", () => {
  it("devuelve la pieza de la organización con sus variantes", async () => {
    const r = await getContentPieceAction(PIEZA);
    expect(r.success && r.data && [r.data.organization_id, r.data.caption]).toEqual([ORG, "caption mío"]);
    expect(r.success && r.data?.variants?.map((v) => [v.id, v.organization_id])).toEqual([[VARIANTE, ORG]]);
    cadaConsultaFiltraPorOrg();
  });

  it("⭐ busca por ID de plataforma sólo en la organización", async () => {
    const r = await getContentPieceAction(ID_DE_PLATAFORMA);
    expect(r.success && r.data && [r.data.id, r.data.organization_id]).toEqual([PIEZA, ORG]);
    cadaConsultaFiltraPorOrg();
  });

  it("⭐ una pieza que no existe en la organización vuelve como null (la pantalla responde 404)", async () => {
    await expect(getContentPieceAction(NO_EXISTE)).resolves.toEqual({ success: true, data: null });
    sinRegistro();
  });

  it("un ID que no es texto vuelve con el motivo", async () => {
    await expect(getContentPieceAction(42 as unknown as string)).resolves.toEqual({
      success: false,
      error: "ID inválido",
    });
  });

  it("⭐ una falla al leer la pieza ya no es un 404: texto fijo y se registra", async () => {
    base.errores.content_pieces = FETCH_FAILED;
    await esFallaRegistrada(await getContentPieceAction(PIEZA), "[getContentPiece]");
  });

  it("una falla al buscar por ID de plataforma también se registra", async () => {
    base.erroresDesdeLaLlamada["content_pieces:select"] = { desde: 2, error: FETCH_FAILED };
    await esFallaRegistrada(await getContentPieceAction(NO_EXISTE), "[getContentPiece]");
  });

  it("una falla al leer las variantes se registra", async () => {
    base.erroresDesdeLaLlamada["content_pieces:select"] = { desde: 2, error: FETCH_FAILED };
    await esFallaRegistrada(await getContentPieceAction(PIEZA), "[getContentPiece]");
  });
});

describe("updateContentPieceAction y deleteContentPieceAction", () => {
  it("⭐ actualiza sólo la pieza de la organización", async () => {
    const r = await updateContentPieceAction(PIEZA, { drive_file_id: "drive-2" });
    expect(r).toEqual({ success: true, data: undefined });
    expect(filaDe(PIEZA, ORG)?.drive_file_id).toBe("drive-2");
    expect(filaDe(PIEZA, OTRA_ORG)?.drive_file_id).toBe("drive-1");
  });

  it("⭐ borra sólo la pieza de la organización", async () => {
    await expect(deleteContentPieceAction(PIEZA)).resolves.toEqual({ success: true, data: undefined });
    expect(filaDe(PIEZA, ORG)).toBeUndefined();
    expect(filaDe(PIEZA, OTRA_ORG)).toBeDefined();
  });

  it("un ID inválido vuelve con el motivo, sin escribir", async () => {
    await expect(updateContentPieceAction("no-es-un-id", {})).resolves.toEqual({ success: false, error: "ID inválido" });
    await expect(deleteContentPieceAction("no-es-un-id")).resolves.toEqual({ success: false, error: "ID inválido" });
    expect(base.escrituras()).toEqual([]);
  });

  it("sin sesión devuelven el motivo", async () => {
    base.sesion = false;
    await expect(updateContentPieceAction(PIEZA, {})).resolves.toEqual({ success: false, error: "Sesión no válida" });
    await expect(deleteContentPieceAction(PIEZA)).resolves.toEqual({ success: false, error: "Sesión no válida" });
  });

  it("⭐ una falla de la base vuelve con el texto fijo y se registra", async () => {
    base.errores["content_pieces:update"] = FETCH_FAILED;
    await esFallaRegistrada(await updateContentPieceAction(PIEZA, { title: "x" }), "[updateContentPiece]");
  });

  it("⭐ una falla al borrar vuelve con el texto fijo y se registra", async () => {
    base.lanza = new TypeError("fetch failed");
    await esFallaRegistrada(await deleteContentPieceAction(PIEZA), "[deleteContentPiece]");
  });
});

describe("analyzeContentPieceAction", () => {
  it("analiza la imagen y guarda el análisis sólo en la pieza de la organización", async () => {
    sim.claude = ANALISIS;
    const r = await analyzeContentPieceAction(PIEZA);
    expect(r).toEqual({ success: true, data: ANALISIS });
    expect(filaDe(PIEZA, ORG)).toMatchObject({ analysis: ANALISIS, format_type: "talking_head" });
    expect(filaDe(PIEZA, OTRA_ORG)?.analysis).toBeNull();
    cadaConsultaFiltraPorOrg();
    claudeConLaOrg();
  });

  it("⭐ un audio de más de 25 MB vuelve con el motivo, sin pedir la transcripción (Whisper real)", async () => {
    sim.whisperReal = true;
    vi.stubEnv("OPENAI_API_KEY", "sk-falsa");
    const pedidos: string[] = [];
    vi.stubGlobal("fetch", async (url: unknown) => {
      pedidos.push(String(url));
      return new Response("{}", { status: 500 });
    });
    sim.descarga = { buffer: Buffer.from("v"), mimeType: "video/mp4", name: "v.mp4" };
    sim.audio = Buffer.alloc(25 * 1024 * 1024 + 1);
    await expect(analyzeContentPieceAction(PIEZA)).resolves.toEqual({
      success: false,
      error: "El audio del video supera los 25 MB que acepta la transcripción. Probá con un video más corto.",
    });
    expect(pedidos).toEqual([]);
    expect(sim.pedidosAClaude).toEqual([]);
    sinRegistro();
  });

  it("un audio de 25 MB justos se transcribe (Whisper real con fetch falso)", async () => {
    sim.whisperReal = true;
    vi.stubEnv("OPENAI_API_KEY", "sk-falsa");
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ text: "hola" }), { status: 200 }));
    sim.descarga = { buffer: Buffer.from("v"), mimeType: "video/mp4", name: "v.mp4" };
    sim.audio = Buffer.alloc(25 * 1024 * 1024);
    sim.claude = ANALISIS;
    await expect(analyzeContentPieceAction(PIEZA)).resolves.toEqual({ success: true, data: ANALISIS });
    expect(filaDe(PIEZA, ORG)?.transcript).toBe("hola");
  });

  it("⭐ sin OPENAI_API_KEY la transcripción es una falla (configuración), no un motivo", async () => {
    sim.whisperReal = true;
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubGlobal("fetch", async () => {
      throw new Error("no debería pedir nada");
    });
    sim.descarga = { buffer: Buffer.from("v"), mimeType: "video/mp4", name: "v.mp4" };
    await esFallaRegistrada(await analyzeContentPieceAction(PIEZA), "[analyzeContentPiece]");
  });

  it("⭐ una pieza que no existe vuelve con el motivo", async () => {
    await expect(analyzeContentPieceAction(NO_EXISTE)).resolves.toEqual({ success: false, error: PIEZA_NO_ENCONTRADA });
    sinRegistro();
  });

  it("⭐ una pieza sin Drive vuelve con el motivo", async () => {
    filaDe(PIEZA, ORG)!.drive_file_id = null;
    const r = await analyzeContentPieceAction(PIEZA);
    expect(r).toEqual({
      success: false,
      error:
        "Esta pieza no tiene un video de Drive vinculado. Para analizarla, primero vinculá el archivo de Drive desde el panel de la pieza y luego volvé a intentarlo.",
    });
  });

  it.each([
    ["GOOGLE_NOT_CONNECTED", new Error("GOOGLE_NOT_CONNECTED"), "Conectá Google Drive en Integraciones para usar esta función."],
    ["GOOGLE_INSUFFICIENT_PERMISSIONS", new Error("GOOGLE_INSUFFICIENT_PERMISSIONS"), "Reconectá tu cuenta de Google para actualizar los permisos"],
    ["permiso al descargar", new GoogleIntegrationPermissionError(403), "Reconectá tu cuenta de Google para actualizar los permisos"],
    ["archivo grande", new Error("El archivo supera el límite de 500 MB"), "El archivo supera el límite de 500 MB"],
  ])("⭐ Drive rechaza (%s): vuelve con el motivo, sin registrarlo", async (_caso, error, motivo) => {
    sim.descarga = error;
    await expect(analyzeContentPieceAction(PIEZA)).resolves.toEqual({ success: false, error: motivo });
    sinRegistro();
  });

  it("⭐ una caída de Drive es una falla: texto fijo y se registra", async () => {
    sim.descarga = new Error("Error de Google Drive (500)");
    await esFallaRegistrada(await analyzeContentPieceAction(PIEZA), "[analyzeContentPiece]");
  });

  it("un archivo que no es imagen ni video vuelve con el motivo", async () => {
    sim.descarga = { buffer: Buffer.from("x"), mimeType: "application/pdf", name: "a.pdf" };
    await expect(analyzeContentPieceAction(PIEZA)).resolves.toEqual({
      success: false,
      error: "Tipo de archivo no soportado para análisis: application/pdf",
    });
  });

  it("⭐ Claude rechaza la clave: vuelve con su motivo", async () => {
    sim.claudeLanza = new Error(AI_KEY_REJECTED_MESSAGE);
    await expect(analyzeContentPieceAction(PIEZA)).resolves.toEqual({ success: false, error: AI_KEY_REJECTED_MESSAGE });
    sinRegistro();
  });

  it("sin respuesta de Claude vuelve con el motivo", async () => {
    sim.claude = null;
    await expect(analyzeContentPieceAction(PIEZA)).resolves.toEqual({
      success: false,
      error: "El análisis IA no devolvió resultado",
    });
  });

  it("⭐ otra falla de Claude se registra", async () => {
    sim.claudeLanza = new TypeError("fetch failed");
    await esFallaRegistrada(await analyzeContentPieceAction(PIEZA), "[analyzeContentPiece]");
  });

  it("⭐ una falla al guardar el análisis se registra", async () => {
    sim.claude = ANALISIS;
    base.errores["content_pieces:update"] = FETCH_FAILED;
    await esFallaRegistrada(await analyzeContentPieceAction(PIEZA), "[analyzeContentPiece]");
  });

  it("sin sesión vuelve con el motivo", async () => {
    base.sesion = false;
    await expect(analyzeContentPieceAction(PIEZA)).resolves.toEqual({ success: false, error: "Sesión no válida" });
  });
});

describe("createContentVariantsAction", () => {
  const variantes = { variants: [BRIEF, BRIEF] };

  it("⭐ crea las variantes en la organización de la sesión, a partir de la pieza propia", async () => {
    sim.claude = variantes;
    const r = await createContentVariantsAction({ sourceContentId: PIEZA, count: 2 });
    expect(r).toEqual({ success: true, data: ["nuevo-1", "nuevo-2"] });
    const alta = base.escrituras()[0];
    expect(alta.op).toBe("insert");
    expect(alta.valores).toEqual([
      expect.objectContaining({ organization_id: ORG, variants_of: PIEZA, status: "draft" }),
      expect.objectContaining({ organization_id: ORG, variants_of: PIEZA, status: "draft" }),
    ]);
    expect(JSON.stringify(sim.pedidosAClaude)).toContain("caption mío");
    expect(JSON.stringify(sim.pedidosAClaude)).not.toContain("caption ajeno");
    cadaConsultaFiltraPorOrg();
    claudeConLaOrg();
  });

  it("⭐ una pieza fuente que no existe vuelve con el motivo, sin llamar a Claude", async () => {
    await expect(createContentVariantsAction({ sourceContentId: NO_EXISTE, count: 1 })).resolves.toEqual({
      success: false,
      error: "Pieza fuente no encontrada (se buscó por UUID interno y por ID de plataforma)",
    });
    expect(sim.pedidosAClaude).toEqual([]);
  });

  it("una respuesta vacía de Claude vuelve con el motivo", async () => {
    sim.claude = { variants: [] };
    await expect(createContentVariantsAction({ sourceContentId: PIEZA, count: 1 })).resolves.toEqual({
      success: false,
      error: "Respuesta inválida de la IA",
    });
  });

  it("Claude sin créditos vuelve con el motivo", async () => {
    const { claudeNoCreditsUserMessage } = await import("@/lib/ai/anthropic-errors");
    sim.claudeLanza = new Error(claudeNoCreditsUserMessage());
    await expect(createContentVariantsAction({ sourceContentId: PIEZA, count: 1 })).resolves.toEqual({
      success: false,
      error: claudeNoCreditsUserMessage(),
    });
    sinRegistro();
  });

  it("⭐ una falla al guardar se registra", async () => {
    sim.claude = variantes;
    base.errores["content_pieces:insert"] = FETCH_FAILED;
    await esFallaRegistrada(
      await createContentVariantsAction({ sourceContentId: PIEZA, count: 2 }),
      "[createContentVariants]"
    );
  });
});

describe("getContentDraftsAction", () => {
  it("⭐ devuelve los borradores de la organización con su pieza padre de la organización", async () => {
    const r = await getContentDraftsAction();
    expect(r.success && r.data.map((v) => [v.id, v.organization_id, v.parent_piece?.title])).toEqual([
      [VARIANTE, ORG, "Mía"],
    ]);
    expect(base.filtrosDe("content_pieces", "select", 0)).toContainEqual(["organization_id", ORG]);
    expect(base.filtrosDe("content_pieces", "select", 1)).toContainEqual(["organization_id", ORG]);
  });

  it("sin borradores devuelve la lista vacía sin leer padres", async () => {
    base.tablas.content_pieces = [pieza(PIEZA, ORG)];
    await expect(getContentDraftsAction()).resolves.toEqual({ success: true, data: [] });
    expect(base.operaciones).toHaveLength(1);
  });

  it("⭐ una falla al leer las piezas padre ya no se ignora: texto fijo y se registra", async () => {
    base.erroresDesdeLaLlamada["content_pieces:select"] = { desde: 2, error: FETCH_FAILED };
    await esFallaRegistrada(await getContentDraftsAction(), "[getContentDrafts]");
  });

  it("una falla al leer los borradores se registra", async () => {
    base.errores.content_pieces = FETCH_FAILED;
    await esFallaRegistrada(await getContentDraftsAction(), "[getContentDrafts]");
  });
});

describe("updateSalesAttributionAction", () => {
  const venta = { total_sales: 1, total_amount: 100 };

  it("⭐ guarda la atribución sólo en las piezas de la organización", async () => {
    sim.atribucion = new Map([[PIEZA, venta]]);
    await expect(updateSalesAttributionAction()).resolves.toEqual({ success: true, data: undefined });
    expect(filaDe(PIEZA, ORG)?.sales_attributed).toEqual(venta);
    expect(filaDe(PIEZA, OTRA_ORG)?.sales_attributed).toBeNull();
    serviciosConLaOrg(["atribucion"]);
  });

  it("filtra por los IDs pedidos", async () => {
    sim.atribucion = new Map([[PIEZA, venta]]);
    await updateSalesAttributionAction([VARIANTE]);
    expect(base.escrituras()).toEqual([]);
  });

  it("IDs inválidos vuelven con el motivo", async () => {
    await expect(updateSalesAttributionAction(["no-es-un-id"])).resolves.toEqual({ success: false, error: "ID inválido" });
  });

  it("⭐ una falla al calcular la atribución se registra", async () => {
    sim.atribucion = new Error("boom en content_pieces");
    await esFallaRegistrada(await updateSalesAttributionAction(), "[updateSalesAttribution]");
  });

  it("⭐ una falla al guardar se registra", async () => {
    sim.atribucion = new Map([[PIEZA, venta]]);
    base.errores["content_pieces:update"] = FETCH_FAILED;
    await esFallaRegistrada(await updateSalesAttributionAction(), "[updateSalesAttribution]");
  });
});

describe("getTopPerformingContentAction", () => {
  it("⭐ rankea sólo piezas de la organización", async () => {
    const r = await getTopPerformingContentAction({ metric: "views" });
    expect(r.success && r.data.piezas.map((p) => [p.id, p.title, p.score])).toEqual([[PIEZA, "Mía", 10]]);
    cadaConsultaFiltraPorOrg();
  });

  it("⭐ con la métrica de ventas actualiza la atribución antes (y sólo en la organización)", async () => {
    sim.atribucion = new Map([[PIEZA, { total_sales: 2, total_amount: 50 }]]);
    const r = await getTopPerformingContentAction({ metric: "sales" });
    expect(r.success).toBe(true);
    expect(filaDe(PIEZA, ORG)?.sales_attributed).toEqual({ total_sales: 2, total_amount: 50 });
    expect(filaDe(PIEZA, OTRA_ORG)?.sales_attributed).toBeNull();
  });

  it("⭐ una falla de la atribución de ventas se registra con la etiqueta del ranking", async () => {
    sim.atribucion = new Error("boom");
    await esFallaRegistrada(await getTopPerformingContentAction({ metric: "sales" }), "[getTopPerformingContent]");
  });

  it("⭐ una falla al leer el ranking se registra", async () => {
    base.errores.content_pieces = FETCH_FAILED;
    await esFallaRegistrada(await getTopPerformingContentAction({ metric: "views" }), "[getTopPerformingContent]");
  });

  it("una falla al leer el detalle de las ganadoras se registra", async () => {
    base.erroresDesdeLaLlamada["content_pieces:select"] = { desde: 2, error: FETCH_FAILED };
    await esFallaRegistrada(await getTopPerformingContentAction({ metric: "views" }), "[getTopPerformingContent]");
  });

  it("sin sesión vuelve con el motivo", async () => {
    base.sesion = false;
    await expect(getTopPerformingContentAction({ metric: "views" })).resolves.toEqual({
      success: false,
      error: "Sesión no válida",
    });
  });
});

describe("generateVariantCaptionAction", () => {
  it("⭐ genera el caption con la variante y la pieza fuente de la organización", async () => {
    sim.claude = { caption: "  caption nuevo  " };
    await expect(generateVariantCaptionAction(VARIANTE)).resolves.toEqual({ success: true, data: "caption nuevo" });
    const pedido = JSON.stringify(sim.pedidosAClaude);
    expect(pedido).toContain("caption mío");
    expect(pedido).not.toContain("caption ajeno");
    cadaConsultaFiltraPorOrg();
    claudeConLaOrg();
  });

  it("⭐ una variante de otra organización vuelve como no encontrada", async () => {
    await expect(generateVariantCaptionAction(VARIANTE_AJENA)).resolves.toEqual({
      success: false,
      error: "Variante no encontrada",
    });
    expect(sim.pedidosAClaude).toEqual([]);
  });

  it("⭐ una falla de la base ya no se muestra como «Variante no encontrada»", async () => {
    base.errores.content_pieces = FETCH_FAILED;
    await esFallaRegistrada(await generateVariantCaptionAction(VARIANTE), "[generateVariantCaption]");
  });

  it("⭐ una falla al leer la pieza fuente ya no se ignora", async () => {
    base.erroresDesdeLaLlamada["content_pieces:select"] = { desde: 2, error: FETCH_FAILED };
    await esFallaRegistrada(await generateVariantCaptionAction(VARIANTE), "[generateVariantCaption]");
  });

  it("una variante sin brief vuelve con el motivo", async () => {
    filaDe(VARIANTE, ORG)!.brief = null;
    await expect(generateVariantCaptionAction(VARIANTE)).resolves.toEqual({
      success: false,
      error: "La variante no tiene brief",
    });
  });

  it("sin caption de Claude vuelve con el motivo", async () => {
    sim.claude = { caption: " " };
    await expect(generateVariantCaptionAction(VARIANTE)).resolves.toEqual({
      success: false,
      error: "No se pudo generar el caption",
    });
  });

  it("un ID inválido vuelve con el motivo", async () => {
    await expect(generateVariantCaptionAction("x")).resolves.toEqual({ success: false, error: "ID inválido" });
  });
});

describe("publishVariantAsZernioDraftAction", () => {
  function clienteZernio(createPost: (params: unknown) => Promise<unknown>) {
    sim.cliente = {
      createPost: async (params: unknown) => {
        sim.posts.push(params);
        return createPost(params);
      },
    };
  }

  it("⭐ crea el borrador en Zernio y lo guarda sólo en la variante de la organización", async () => {
    clienteZernio(async () => ({ post: { id: "post-1" } }));
    const r = await publishVariantAsZernioDraftAction(VARIANTE, " mi caption ");
    expect(r).toEqual({
      success: true,
      data: { postId: "post-1", caption: "mi caption", platformPostUrl: "https://zernio.com/posts/post-1" },
    });
    expect(sim.posts).toEqual([expect.objectContaining({ content: "mi caption", accountId: "cuenta-ig", status: "draft" })]);
    expect(filaDe(VARIANTE, ORG)).toMatchObject({ platform_post_id: "post-1", caption: "mi caption" });
    expect(filaDe(VARIANTE, OTRA_ORG)?.caption).toBe("caption ajeno");
    cadaConsultaFiltraPorOrg();
    serviciosConLaOrg(["zernio:integracion", "zernio:cliente"]);
  });

  it("⭐ la pieza fuente se lee en la organización (su tipo decide el del post)", async () => {
    filaDe(PIEZA, OTRA_ORG)!.type = "carousel";
    clienteZernio(async () => ({ id: "post-1" }));
    await publishVariantAsZernioDraftAction(VARIANTE, "c");
    expect(sim.posts).toEqual([expect.objectContaining({ postType: "reel" })]);
  });

  it("un caption vacío vuelve con el motivo, sin leer nada", async () => {
    await expect(publishVariantAsZernioDraftAction(VARIANTE, "  ")).resolves.toEqual({
      success: false,
      error: "El caption no puede estar vacío",
    });
    expect(base.operaciones).toEqual([]);
  });

  it("⭐ una variante de otra organización vuelve como no encontrada, sin publicar", async () => {
    clienteZernio(async () => ({ id: "post-1" }));
    await expect(publishVariantAsZernioDraftAction(VARIANTE_AJENA, "c")).resolves.toEqual({
      success: false,
      error: "Variante no encontrada",
    });
    expect(sim.posts).toEqual([]);
  });

  it("una pieza que no es variante vuelve con el motivo", async () => {
    filaDe(VARIANTE, ORG)!.variants_of = null;
    await expect(publishVariantAsZernioDraftAction(VARIANTE, "c")).resolves.toEqual({
      success: false,
      error: "Esta pieza no es una variante",
    });
  });

  it("una variante cuya pieza fuente no está vuelve con el motivo", async () => {
    filaDe(PIEZA, ORG)!.organization_id = "otra";
    await expect(publishVariantAsZernioDraftAction(VARIANTE, "c")).resolves.toEqual({
      success: false,
      error: "Pieza fuente no encontrada",
    });
  });

  it("⭐ Zernio sin cuentas conectadas vuelve con el motivo", async () => {
    sim.integracion = null;
    await expect(publishVariantAsZernioDraftAction(VARIANTE, "c")).resolves.toEqual({
      success: false,
      error: "Zernio no está conectado",
    });
    sinRegistro();
  });

  it("⭐ Zernio sin clave (cliente) vuelve con el motivo", async () => {
    sim.cliente = null;
    await expect(publishVariantAsZernioDraftAction(VARIANTE, "c")).resolves.toEqual({
      success: false,
      error: "Zernio no está conectado",
    });
    sinRegistro();
  });

  /** El cliente REAL de Zernio (`createZernioClient`) con un `fetch` falso. */
  function clienteRealQueResponde(status: number, cuerpo: string) {
    const pedidos: string[] = [];
    vi.stubGlobal("fetch", async (url: unknown) => {
      pedidos.push(String(url));
      return new Response(cuerpo, { status, headers: { "content-type": "application/json" } });
    });
    sim.cliente = createZernioClient("clave-falsa") as unknown as typeof sim.cliente;
    return pedidos;
  }

  it.each([[401], [403]])(
    "⭐ Zernio rechaza la clave (%s, cliente real): vuelve con el motivo",
    async (status) => {
      const pedidos = clienteRealQueResponde(status, '{"error":"Unauthorized"}');
      await expect(publishVariantAsZernioDraftAction(VARIANTE, "mi caption")).resolves.toEqual({
        success: false,
        error: "Zernio rechazó la conexión de tu organización. Volvé a conectarlo desde Integraciones.",
      });
      expect(pedidos).toEqual([expect.stringContaining("/posts")]);
      sinRegistro();
    }
  );

  it("⭐ una falla de createPost (500, cliente real) se registra con el status y sin el cuerpo, que repite el caption", async () => {
    clienteRealQueResponde(500, '{"error":"bad content: mi caption privado"}');
    await esFallaRegistrada(
      await publishVariantAsZernioDraftAction(VARIANTE, "mi caption privado"),
      "[publishVariantAsZernioDraft]"
    );
    const registrado = base.reportes[0].error as ZernioHttpError;
    expect(registrado).toBeInstanceOf(ZernioHttpError);
    expect(registrado.message).toBe("Zernio createPost: HTTP 500");
    expect(registrado.status).toBe(500);
    expect(JSON.stringify(consola.mock.calls)).not.toContain("mi caption privado");
  });

  it("una respuesta de Zernio sin ID es una falla", async () => {
    clienteZernio(async () => ({ post: {} }));
    await esFallaRegistrada(await publishVariantAsZernioDraftAction(VARIANTE, "c"), "[publishVariantAsZernioDraft]");
  });

  it("⭐ una falla de la base al leer la variante ya no se muestra como «no encontrada»", async () => {
    base.errores.content_pieces = FETCH_FAILED;
    await esFallaRegistrada(await publishVariantAsZernioDraftAction(VARIANTE, "c"), "[publishVariantAsZernioDraft]");
  });

  it("una falla al leer la pieza fuente se registra", async () => {
    base.erroresDesdeLaLlamada["content_pieces:select"] = { desde: 2, error: FETCH_FAILED };
    await esFallaRegistrada(await publishVariantAsZernioDraftAction(VARIANTE, "c"), "[publishVariantAsZernioDraft]");
  });

  it("una falla al leer la integración se registra", async () => {
    sim.integracionLanza = new Error("permission denied for table zernio_integrations");
    await esFallaRegistrada(await publishVariantAsZernioDraftAction(VARIANTE, "c"), "[publishVariantAsZernioDraft]");
  });

  it("una falla al guardar el borrador se registra", async () => {
    clienteZernio(async () => ({ id: "post-1" }));
    base.errores["content_pieces:update"] = FETCH_FAILED;
    await esFallaRegistrada(await publishVariantAsZernioDraftAction(VARIANTE, "c"), "[publishVariantAsZernioDraft]");
  });
});
