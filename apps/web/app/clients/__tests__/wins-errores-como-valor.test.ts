import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-516: los wins devuelven sus errores esperables como valor. Antes, con
 * `runMutation`, el texto crudo de la base o de Storage llegaba al formulario;
 * borrar un win o una captura ignoraba si Storage había borrado el archivo; y
 * las lecturas hacían `catch { return [] }`: una caída se veía como "sin wins"
 * y nadie se enteraba.
 */

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
vi.mock("@/lib/supabase/admin", async () => {
  const { base } = await import("./supabase-falso");
  return { createAdminClient: () => base.cliente() };
});
vi.mock("@/lib/auth/bootstrap", async () => {
  const { base, ORG, esTablaFaltante } = await import("./supabase-falso");
  const { ErrorEsperable } = await import("@/lib/server/error-esperable");
  return {
    requireOrganizationId: async () => {
      if (!base.sesion) throw new ErrorEsperable("Sesión no válida");
      return ORG;
    },
    getCurrentProfile: async () => base.perfil,
    isMissingTableError: esTablaFaltante,
  };
});
vi.mock("server-only", () => ({}));

import {
  addWinUsageAction,
  createWinAction,
  deleteWinAction,
  deleteWinAttachmentAction,
  deleteWinUsageAction,
  finalizeWinAttachmentAction,
  listClientBaselinesAction,
  listClientNichesAction,
  listWinsAction,
  prepareWinAttachmentUploadAction,
  updateClientBaselineAction,
  updateWinAction,
} from "../win-actions";
import { base, CACHE_CAIDA, ORG, OTRA_ORG, TEXTO_FIJO } from "./supabase-falso";

const CLIENTE = "22222222-2222-4222-8222-222222222222";
const WIN = "44444444-4444-4444-8444-444444444444";
const WIN_AJENO = "55555555-5555-4555-8555-555555555555";
const DRAFT = "66666666-6666-4666-8666-666666666666";
const CAPTURA = "77777777-7777-4777-8777-777777777777";
const FETCH_FAILED = { message: "TypeError: fetch failed" };
const RUTA = `${ORG}/wins/${WIN}/foto.png`;

/** Una columna configurable de wins, como la guarda la base. */
function columna(id: string, org: string, key: string) {
  return {
    id,
    organization_id: org,
    entity: "win",
    key,
    label: "Resultado",
    description: null,
    field_type: "text",
    options: [],
    options_source: "inline",
    unit: null,
    currency: null,
    alert_days_before: null,
    is_required: false,
    section: null,
    show_in_table: true,
    sort_order: 1,
    archived_at: null,
    created_at: "2026-10-01",
    updated_at: "2026-10-01",
  };
}

function win(id: string, org: string) {
  return {
    id,
    organization_id: org,
    client_id: CLIENTE,
    win_date: "2026-10-01",
    achievement: "Primera venta",
    metric_key: null,
    metric_value: null,
    metric_unit: null,
    custom: {},
    source: "manual",
    notes: null,
    consent_status: "not_asked",
    consent_display: null,
    consent_note: null,
    usage_state: "unused",
    needs_screenshot: false,
    created_at: "2026-10-01",
  };
}

const NUEVO = { clientId: CLIENTE, winDate: "2026-10-05", achievement: "Cerró 3 ventas" };

let consola: ReturnType<typeof vi.spyOn>;
let aviso: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  base.reiniciar();
  base.tablas.client_wins = [win(WIN, ORG), win(WIN_AJENO, OTRA_ORG)];
  base.tablas.win_attachments = [
    { id: CAPTURA, organization_id: ORG, win_id: WIN, draft_id: null, file_name: "foto.png", storage_path: RUTA, mime_type: "image/png", file_size: 10, created_at: "2026-10-01" },
  ];
  base.tablas.win_usages = [
    { id: "uso-1", organization_id: ORG, win_id: WIN, channel: "landing", location_label: null, url: null, used_at: null, notes: null, created_at: "2026-10-01" },
  ];
  base.tablas.field_definitions = [columna("col-1", ORG, "resultado"), columna("col-ajena", OTRA_ORG, "ajena")];
  base.tablas.clients = [
    { id: CLIENTE, organization_id: ORG, niche: "Fitness", baseline_metric_key: "ventas", baseline_metric_value: "10", baseline_metric_unit: null, baseline_captured_at: null },
  ];
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
  aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  consola.mockRestore();
  aviso.mockRestore();
});

describe("listWinsAction (la componen la pantalla de Wins y la revisión semanal)", () => {
  it("devuelve los wins de la organización con capturas firmadas y usos", async () => {
    const wins = await listWinsAction();
    expect(wins.map((w) => w.id)).toEqual([WIN]);
    expect(wins[0].attachments[0].signedUrl).toBe(`https://storage/ver/${RUTA}`);
    expect(wins[0].usages).toHaveLength(1);
  });

  it("⭐ una falla sigue devolviendo vacío, pero ahora queda registrada", async () => {
    base.errores.client_wins = FETCH_FAILED;
    await expect(listWinsAction()).resolves.toEqual([]);
    expect(base.reportes).toEqual([
      {
        error: expect.objectContaining({ name: "FallaDeLaBase", message: "TypeError: fetch failed" }),
        contexto: { lectura: "clientes:wins" },
      },
    ]);
  });

  it("⭐ si fallan las capturas, los wins se ven igual sin ellas y la falla queda registrada", async () => {
    base.errores.win_attachments = FETCH_FAILED;
    const wins = await listWinsAction();
    expect(wins.map((w) => w.id)).toEqual([WIN]);
    expect(wins[0].attachments).toEqual([]);
    expect(base.reportes).toEqual([
      { error: expect.objectContaining({ name: "FallaDeLaBase" }), contexto: { lectura: "clientes:wins-capturas" } },
    ]);
  });

  it("⭐ si fallan los usos, los wins se ven igual sin ellos y la falla queda registrada", async () => {
    base.errores.win_usages = FETCH_FAILED;
    const wins = await listWinsAction();
    expect(wins.map((w) => w.id)).toEqual([WIN]);
    expect(wins[0].usages).toEqual([]);
    expect(wins[0].attachments).toHaveLength(1);
    expect(base.reportes).toEqual([
      { error: expect.objectContaining({ name: "FallaDeLaBase" }), contexto: { lectura: "clientes:wins-usos" } },
    ]);
  });

  it("si Storage no firma, las capturas quedan sin link y se registra", async () => {
    base.storage.error = { message: "Bucket not found" };
    const wins = await listWinsAction();
    expect(wins[0].attachments[0].signedUrl).toBeNull();
    expect(base.reportes[0].contexto).toEqual({ lectura: "clientes:wins-links-de-capturas" });
  });

  it("sin la tabla o sin sesión, vacío y sin reporte (no es una falla)", async () => {
    base.errores.client_wins = { code: "42P01", message: 'relation "client_wins" does not exist' };
    await expect(listWinsAction()).resolves.toEqual([]);
    base.errores = {};
    base.sesion = false;
    await expect(listWinsAction()).resolves.toEqual([]);
    expect(base.reportes).toEqual([]);
  });

  it("una excepción de la red: vacío y registrada", async () => {
    base.lanza = new TypeError("fetch failed");
    await expect(listWinsAction()).resolves.toEqual([]);
    expect(base.reportes).toEqual([{ error: base.lanza, contexto: { lectura: "clientes:wins" } }]);
  });
});

describe("listClientBaselinesAction y listClientNichesAction", () => {
  it("devuelven el baseline y el nicho de la organización", async () => {
    await expect(listClientBaselinesAction()).resolves.toEqual({
      [CLIENTE]: { metricKey: "ventas", metricValue: 10, metricUnit: null, capturedAt: null },
    });
    await expect(listClientNichesAction()).resolves.toEqual({ [CLIENTE]: "Fitness" });
    expect(base.operaciones.every((o) => o.filtros[0][0] === "organization_id" && o.filtros[0][1] === ORG)).toBe(true);
  });

  it.each([
    ["listClientBaselinesAction", () => listClientBaselinesAction(), "clientes:wins-baselines"],
    ["listClientNichesAction", () => listClientNichesAction(), "clientes:wins-nichos"],
  ] as const)("⭐ %s: una falla sigue vacía, pero queda registrada", async (_n, correr, lectura) => {
    base.errores.clients = FETCH_FAILED;
    await expect(correr()).resolves.toEqual({});
    expect(base.reportes).toEqual([
      { error: expect.objectContaining({ message: "TypeError: fetch failed" }), contexto: { lectura } },
    ]);
  });
});

describe("createWinAction", () => {
  it("crea el win en la organización de la sesión y engancha las capturas del borrador", async () => {
    base.tablas.win_attachments.push({ id: "c2", organization_id: ORG, win_id: null, draft_id: DRAFT, storage_path: `${ORG}/drafts/${DRAFT}/a.png` });
    const r = await createWinAction({ ...NUEVO, draftId: DRAFT });
    expect(r).toMatchObject({ success: true, data: { achievement: "Cerró 3 ventas" } });
    expect(base.escrituras()[0].valores).toMatchObject({ organization_id: ORG, client_id: CLIENTE });
    expect(base.escrituras()[1]).toMatchObject({
      tabla: "win_attachments",
      op: "update",
      filtros: [
        ["draft_id", DRAFT],
        ["organization_id", ORG],
      ],
    });
  });

  it("⭐ un permiso a medias vuelve con el motivo, sin escribir", async () => {
    await expect(createWinAction({ ...NUEVO, consentStatus: "granted" })).resolves.toEqual({
      success: false,
      error: "Si el cliente autorizó, elegí cómo quiere aparecer.",
    });
    expect(base.escrituras()).toEqual([]);
  });

  it.each([
    [{ achievement: "x".repeat(501) }, "El logro puede tener hasta 500 caracteres."],
    [{ notes: "x".repeat(2001) }, "Las notas pueden tener hasta 2000 caracteres."],
    [{ metric: { key: "ventas", value: "diez" as unknown as number } }, "El número de la medida no se entiende."],
    [{ consentStatus: "quizas" as never }, "Elegí el estado del permiso."],
  ])("⭐ un dato fuera de rango vuelve con el motivo en castellano, sin escribir", async (cambio, motivo) => {
    await expect(createWinAction({ ...NUEVO, ...cambio })).resolves.toEqual({ success: false, error: motivo });
    expect(base.escrituras()).toEqual([]);
  });

  it("un dato inválido vuelve con el mensaje de validación", async () => {
    await expect(createWinAction({ ...NUEVO, achievement: "" })).resolves.toEqual({
      success: false,
      error: "Escribí qué logró.",
    });
  });

  it("⭐ un cliente que ya no existe (23503) vuelve con el motivo", async () => {
    base.errores["client_wins:insert"] = { code: "23503", message: "violates foreign key constraint" };
    await expect(createWinAction(NUEVO)).resolves.toEqual({
      success: false,
      error: "El cliente que elegiste ya no existe. Recargá la página.",
    });
    expect(base.reportes).toEqual([]);
  });

  it("si enganchar las capturas falla, el win queda creado y la falla registrada", async () => {
    base.errores["win_attachments:update"] = FETCH_FAILED;
    const r = await createWinAction({ ...NUEVO, draftId: DRAFT });
    expect(r.success).toBe(true);
    expect(base.reportes).toEqual([
      { error: expect.objectContaining({ name: "FallaDeLaBase" }), contexto: { accion: "[createWin] capturas" } },
    ]);
  });
});

describe("updateWinAction", () => {
  it("actualiza filtrando por id y organización", async () => {
    const r = await updateWinAction(WIN, { achievement: "Otra" });
    expect(r).toMatchObject({ success: true, data: { achievement: "Otra" } });
    expect(base.escrituras()[0].filtros).toEqual([
      ["id", WIN],
      ["organization_id", ORG],
    ]);
  });

  it("⭐ un win de otra organización vuelve como no encontrado, sin tocarlo", async () => {
    await expect(updateWinAction(WIN_AJENO, { achievement: "x" })).resolves.toEqual({
      success: false,
      error: "No se encontró el win. Puede que lo hayan borrado.",
    });
    expect(base.tablas.client_wins.find((w) => w.id === WIN_AJENO)?.achievement).toBe("Primera venta");
  });
});

describe("columnas de un win con la lectura de columnas caída (MAYOR-1 de la AR de SCRUM-516)", () => {
  // Antes se validaba con `listFieldDefinitionsAction`, que ante una falla
  // devuelve `[]`: el win se guardaba sin sus columnas y editar uno borraba
  // las que tenía, con "guardado" en la pantalla.
  const CAIDA = { message: "TypeError: fetch failed" };

  beforeEach(() => {
    const propio = base.tablas.client_wins.find((w) => w.id === WIN)!;
    propio.custom = { resultado: "10 ventas" };
  });

  it("con la lectura sana, valida contra las columnas de la org y guarda el valor", async () => {
    const r = await updateWinAction(WIN, { custom: { resultado: "12 ventas" } });
    expect(r).toMatchObject({ success: true });
    expect(base.tablas.client_wins.find((w) => w.id === WIN)?.custom).toEqual({ resultado: "12 ventas" });
    const lectura = base.operaciones.find((o) => o.tabla === "field_definitions");
    expect(lectura?.filtros).toEqual([
      ["organization_id", ORG],
      ["entity", "win"],
    ]);
  });

  it("⭐ editar: texto fijo, la fila queda como estaba, sin escribir y la falla registrada", async () => {
    base.errores.field_definitions = CAIDA;
    const r = await updateWinAction(WIN, { custom: { resultado: "12 ventas" } });
    expect(r).toEqual({ success: false, error: TEXTO_FIJO });
    expect(base.tablas.client_wins.find((w) => w.id === WIN)?.custom).toEqual({ resultado: "10 ventas" });
    expect(base.escrituras()).toEqual([]);
    expect(consola).toHaveBeenCalledWith("[updateWin]", expect.objectContaining({ name: "FallaDeLaBase" }));
    expect(base.reportes).toEqual([
      {
        error: expect.objectContaining({ name: "FallaDeLaBase", message: "TypeError: fetch failed" }),
        contexto: { accion: "[updateWin]" },
      },
    ]);
    // Lo que escribió el usuario no viaja a Sentry (SCRUM-501).
    expect(JSON.stringify(base.reportes)).not.toContain("12 ventas");
  });

  it("⭐ crear: texto fijo, sin crear el win y la falla registrada", async () => {
    base.errores.field_definitions = CAIDA;
    const r = await createWinAction({ ...NUEVO, custom: { resultado: "3 ventas" } });
    expect(r).toEqual({ success: false, error: TEXTO_FIJO });
    expect(base.tablas.client_wins.map((w) => w.id)).toEqual([WIN, WIN_AJENO]);
    expect(base.escrituras()).toEqual([]);
    expect(base.reportes).toEqual([
      { error: expect.objectContaining({ name: "FallaDeLaBase" }), contexto: { accion: "[createWin]" } },
    ]);
    expect(JSON.stringify(base.reportes)).not.toContain("3 ventas");
  });

  it("sin la tabla de columnas (antes de su migración) sigue contando como sin columnas", async () => {
    base.errores.field_definitions = { code: "42P01", message: 'relation "field_definitions" does not exist' };
    const r = await createWinAction(NUEVO);
    expect(r).toMatchObject({ success: true, data: { custom: {} } });
    expect(base.reportes).toEqual([]);
  });
});

describe("deleteWinAction", () => {
  it("borra el win y sus archivos", async () => {
    await expect(deleteWinAction(WIN)).resolves.toEqual({ success: true, data: undefined });
    expect(base.storage.borrados).toEqual([RUTA]);
    expect(base.tablas.client_wins.map((w) => w.id)).toEqual([WIN_AJENO]);
  });

  it("⭐ si Storage no borra los archivos, no borra el win: texto fijo y se reporta", async () => {
    base.storage.error = { message: "Storage caído" };
    await expect(deleteWinAction(WIN)).resolves.toEqual({ success: false, error: TEXTO_FIJO });
    expect(base.tablas.client_wins.map((w) => w.id)).toContain(WIN);
    expect(base.reportes).toHaveLength(1);
  });

  it("⭐ si no se pueden leer las capturas, no borra nada", async () => {
    base.errores.win_attachments = FETCH_FAILED;
    await expect(deleteWinAction(WIN)).resolves.toEqual({ success: false, error: TEXTO_FIJO });
    expect(base.tablas.client_wins.map((w) => w.id)).toContain(WIN);
  });

  it("⭐ un win de otra organización no se borra", async () => {
    await deleteWinAction(WIN_AJENO);
    expect(base.tablas.client_wins.map((w) => w.id)).toContain(WIN_AJENO);
  });
});

describe("prepareWinAttachmentUploadAction", () => {
  const ARCHIVO = { fileName: "foto.png", fileSize: 100, mimeType: "image/png" };

  it("devuelve el link firmado en la carpeta de la organización", async () => {
    const r = await prepareWinAttachmentUploadAction({ winId: WIN, ...ARCHIVO });
    expect(r.success && r.data.storagePath.startsWith(`${ORG}/wins/${WIN}/`)).toBe(true);
  });

  it.each([
    [{ winId: WIN, ...ARCHIVO, fileName: "a.pdf", mimeType: "application/pdf" }, "La captura tiene que ser una imagen PNG, JPG o WEBP."],
    [{ ...ARCHIVO }, "Falta indicar a qué win va la captura."],
  ])("⭐ un archivo o destino inválido vuelve con su motivo", async (input, motivo) => {
    await expect(prepareWinAttachmentUploadAction(input)).resolves.toEqual({ success: false, error: motivo });
    expect(base.reportes).toEqual([]);
  });

  it("⭐ un error de Storage no llega crudo: texto fijo y se reporta", async () => {
    base.storage.error = { message: "Bucket not found" };
    const r = await prepareWinAttachmentUploadAction({ draftId: DRAFT, ...ARCHIVO });
    expect(r).toEqual({ success: false, error: TEXTO_FIJO });
    expect(base.reportes).toHaveLength(1);
  });
});

describe("finalizeWinAttachmentAction", () => {
  const SUBIDA = { winId: WIN, storagePath: RUTA, fileName: "foto.png", mimeType: "image/png", fileSize: 10 };

  it("registra la captura en la organización de la sesión", async () => {
    const r = await finalizeWinAttachmentAction(SUBIDA);
    expect(r).toMatchObject({ success: true, data: { signedUrl: `https://storage/ver/${RUTA}` } });
    expect(base.escrituras()[0].valores).toMatchObject({ organization_id: ORG, win_id: WIN });
  });

  it("sin destino vuelve con el motivo", async () => {
    await expect(finalizeWinAttachmentAction({ ...SUBIDA, winId: undefined })).resolves.toEqual({
      success: false,
      error: "Falta indicar a qué win va la captura.",
    });
  });

  it("⭐ una ruta de otra organización es inesperada: no escribe, texto fijo y se reporta", async () => {
    const r = await finalizeWinAttachmentAction({ ...SUBIDA, storagePath: `${OTRA_ORG}/wins/x/foto.png` });
    expect(r).toEqual({ success: false, error: TEXTO_FIJO });
    expect(base.escrituras()).toEqual([]);
    expect(base.reportes).toHaveLength(1);
  });

  it("un win que ya no existe (23503) vuelve con el motivo", async () => {
    base.errores["win_attachments:insert"] = { code: "23503", message: "violates foreign key constraint" };
    await expect(finalizeWinAttachmentAction(SUBIDA)).resolves.toEqual({
      success: false,
      error: "El win ya no existe. Recargá la página.",
    });
  });
});

describe("deleteWinAttachmentAction", () => {
  it("borra el archivo y la fila", async () => {
    await expect(deleteWinAttachmentAction(CAPTURA)).resolves.toEqual({ success: true, data: undefined });
    expect(base.storage.borrados).toEqual([RUTA]);
    expect(base.tablas.win_attachments).toEqual([]);
  });

  it("⭐ si Storage no borra, la fila queda: texto fijo y se reporta", async () => {
    base.storage.error = { message: "Storage caído" };
    await expect(deleteWinAttachmentAction(CAPTURA)).resolves.toEqual({ success: false, error: TEXTO_FIJO });
    expect(base.tablas.win_attachments).toHaveLength(1);
  });
});

describe("addWinUsageAction y deleteWinUsageAction", () => {
  it("agrega el uso en la organización de la sesión", async () => {
    const r = await addWinUsageAction({ winId: WIN, channel: "landing" });
    expect(r.success).toBe(true);
    expect(base.escrituras()[0].valores).toMatchObject({ organization_id: ORG, win_id: WIN });
  });

  it("⭐ un link inválido vuelve con el motivo", async () => {
    await expect(
      addWinUsageAction({ winId: WIN, channel: "landing", url: "no es un link" })
    ).resolves.toEqual({ success: false, error: "El link no es válido." });
  });

  it("un win que ya no existe (23503) vuelve con el motivo", async () => {
    base.errores["win_usages:insert"] = { code: "23503", message: "violates foreign key constraint" };
    await expect(addWinUsageAction({ winId: WIN, channel: "landing" })).resolves.toEqual({
      success: false,
      error: "El win ya no existe. Recargá la página.",
    });
  });

  it("borra el uso filtrando por organización", async () => {
    await expect(deleteWinUsageAction("uso-1")).resolves.toEqual({ success: true, data: undefined });
    expect(base.escrituras()[0].filtros).toEqual([
      ["id", "uso-1"],
      ["organization_id", ORG],
    ]);
  });
});

describe("updateClientBaselineAction", () => {
  it("guarda el baseline filtrando por cliente y organización", async () => {
    await expect(
      updateClientBaselineAction(CLIENTE, { baselineMetricKey: "ventas", baselineMetricValue: 20 })
    ).resolves.toEqual({ success: true, data: undefined });
    expect(base.escrituras()[0].filtros).toEqual([
      ["id", CLIENTE],
      ["organization_id", ORG],
    ]);
  });

  it("⭐ un dato inválido vuelve con el motivo, sin escribir", async () => {
    const r = await updateClientBaselineAction(CLIENTE, { baselineCapturedAt: "ayer" });
    expect(r.success).toBe(false);
    expect(base.escrituras()).toEqual([]);
    expect(base.reportes).toEqual([]);
  });
});

describe("lo inesperado (SCRUM-516)", () => {
  const casos = [
    ["createWinAction", () => createWinAction(NUEVO), "[createWin]", "client_wins"],
    ["updateWinAction", () => updateWinAction(WIN, { achievement: "x" }), "[updateWin]", "client_wins"],
    ["deleteWinAction", () => deleteWinAction(WIN), "[deleteWin]", "client_wins"],
    ["finalizeWinAttachmentAction", () => finalizeWinAttachmentAction({ winId: WIN, storagePath: RUTA, fileName: "f.png", mimeType: "image/png", fileSize: 1 }), "[finalizeWinAttachment]", "win_attachments"],
    ["deleteWinAttachmentAction", () => deleteWinAttachmentAction(CAPTURA), "[deleteWinAttachment]", "win_attachments"],
    ["addWinUsageAction", () => addWinUsageAction({ winId: WIN, channel: "landing" }), "[addWinUsage]", "win_usages"],
    ["deleteWinUsageAction", () => deleteWinUsageAction("uso-1"), "[deleteWinUsage]", "win_usages"],
    ["updateClientBaselineAction", () => updateClientBaselineAction(CLIENTE, {}), "[updateClientBaseline]", "clients"],
  ] as const;

  it.each(casos)(
    "⭐ %s: una excepción de la red devuelve el texto fijo y se registra y reporta",
    async (_n, correr, etiqueta) => {
      const falla = new TypeError("fetch failed: connect ECONNREFUSED 10.0.0.5:5432");
      base.lanza = falla;
      const r = await correr();
      expect(r).toEqual({ success: false, error: TEXTO_FIJO });
      expect(consola).toHaveBeenCalledWith(etiqueta, falla);
      expect(base.reportes).toEqual([{ error: falla, contexto: { accion: etiqueta } }]);
    }
  );

  it.each(casos)(
    "⭐ %s: el error de supabase-js devuelve el texto fijo y se reporta",
    async (_n, correr, etiqueta, tabla) => {
      base.errores[tabla] = FETCH_FAILED;
      const r = await correr();
      expect(r).toEqual({ success: false, error: TEXTO_FIJO });
      expect(JSON.stringify(r)).not.toContain("fetch failed");
      expect(base.reportes).toEqual([
        { error: expect.objectContaining({ message: "TypeError: fetch failed" }), contexto: { accion: etiqueta } },
      ]);
    }
  );

  it("⭐ prepareWinAttachmentUploadAction: una excepción devuelve el texto fijo y se reporta", async () => {
    const falla = new TypeError("fetch failed");
    vi.spyOn(crypto, "randomUUID").mockImplementationOnce(() => {
      throw falla;
    });
    const r = await prepareWinAttachmentUploadAction({ winId: WIN, fileName: "a.png", fileSize: 1, mimeType: "image/png" });
    expect(r).toEqual({ success: false, error: TEXTO_FIJO });
    expect(base.reportes).toEqual([{ error: falla, contexto: { accion: "[prepareWinAttachmentUpload]" } }]);
  });
});

describe("un PGRST002 no es una tabla ausente (SCRUM-516, AR pasada 2)", () => {
  // Su texto dice "schema cache": el chequeo por texto lo tomaba como tabla
  // ausente, `validateCustom` armaba `custom: {}` y editar un win le borraba las
  // columnas, con éxito y sin registro.
  beforeEach(() => {
    base.tablas.client_wins.find((w) => w.id === WIN)!.custom = { resultado: "10 ventas" };
  });

  it("⭐ editar un win con la lectura de columnas en PGRST002: texto fijo, la fila intacta y la falla registrada", async () => {
    base.errores.field_definitions = CACHE_CAIDA;
    const r = await updateWinAction(WIN, { achievement: "Editado", custom: { resultado: "12 ventas" } });
    expect(r).toEqual({ success: false, error: TEXTO_FIJO });
    expect(base.tablas.client_wins.find((w) => w.id === WIN)).toMatchObject({
      achievement: "Primera venta",
      custom: { resultado: "10 ventas" },
    });
    expect(base.escrituras()).toEqual([]);
    expect(base.reportes).toEqual([
      { error: expect.objectContaining({ name: "FallaDeLaBase" }), contexto: { accion: "[updateWin]" } },
    ]);
  });

  it("⭐ crear un win con la lectura de columnas en PGRST002: texto fijo y sin crear", async () => {
    base.errores.field_definitions = CACHE_CAIDA;
    await expect(createWinAction({ ...NUEVO, custom: { resultado: "3 ventas" } })).resolves.toEqual({
      success: false,
      error: TEXTO_FIJO,
    });
    expect(base.escrituras()).toEqual([]);
    expect(base.reportes).toHaveLength(1);
  });

  it("⭐ listWinsAction: vacío, pero la falla queda registrada", async () => {
    base.errores.client_wins = CACHE_CAIDA;
    await expect(listWinsAction()).resolves.toEqual([]);
    expect(base.reportes).toEqual([
      { error: expect.objectContaining({ name: "FallaDeLaBase" }), contexto: { lectura: "clientes:wins" } },
    ]);
  });

  it("la tabla de columnas ausente con el código de PostgREST (PGRST205) sigue contando como sin columnas", async () => {
    base.errores.field_definitions = {
      code: "PGRST205",
      message: "Could not find the table 'public.field_definitions' in the schema cache",
    };
    await expect(createWinAction(NUEVO)).resolves.toMatchObject({ success: true, data: { custom: {} } });
    expect(base.reportes).toEqual([]);
  });
});
