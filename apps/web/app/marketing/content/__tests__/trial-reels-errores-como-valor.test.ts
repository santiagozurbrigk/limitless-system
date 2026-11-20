import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-502: las lecturas y ediciones de Trial Reels
 * (`reel-variation-actions.ts`) y la lectura de la música
 * (`reel-music-actions.ts`) devuelven sus errores esperables como valor.
 * Antes lanzaban (en producción, el párrafo de Next), renovar las vistas
 * previas ignoraba los errores de Storage y del guardado, y la ruta de la
 * música se leía como "sin música" ante una falla.
 */

// SCRUM-540: las lecturas arrancan con el permiso del módulo; acá quien llama lo tiene.
vi.mock("@/lib/auth/acceso-a-modulo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/acceso-a-modulo")>()),
  rechazoPorModulo: async () => null,
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
vi.mock("@/lib/supabase/admin", async () => {
  const { base } = await import("./supabase-falso");
  return { createAdminClient: () => base.cliente() };
});
vi.mock("@/lib/auth/bootstrap", async () => {
  const { base } = await import("./supabase-falso");
  return { getCurrentProfile: async () => (base.sesion ? base.perfil : null) };
});
// Las acciones fuera del alcance usan QStash, Google y Claude: acá no se llaman.
vi.mock("@/lib/queue/qstash-client", () => ({}));
vi.mock("@/lib/google/get-access-token", () => ({}));
vi.mock("@/lib/ai/anthropic", () => ({}));

import {
  getReelVariationJobAction,
  listReelVariationJobsForPieceAction,
  refreshVariationPreviewUrlsAction,
  setReelVariationDelayAction,
  updateReelVariationAction,
} from "../reel-variation-actions";
import { getReelMusicPathAction } from "../reel-music-actions";
import { base, ORG, OTRA_ORG, TEXTO_FIJO } from "./supabase-falso";

const JOB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PIEZA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NO_EXISTE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const FETCH_FAILED = { message: "TypeError: fetch failed" };

function variante(ruta: string, extra: Record<string, unknown> = {}) {
  return {
    type: "speed_up",
    status: "ready",
    included: true,
    description: "original",
    hashtags: ["#a"],
    storage_path: ruta,
    preview_url: "https://storage/vieja",
    ...extra,
  };
}

/** El job ajeno va primero y comparte ID y pieza con el mío. */
function job(org: string, extra: Record<string, unknown> = {}) {
  return {
    id: JOB,
    organization_id: org,
    source_piece_id: PIEZA,
    status: "preview_ready",
    delay_hours: 2,
    variations: [variante(`${org}/reels/v0.mp4`), variante(`${org}/reels/v1.mp4`)],
    ...extra,
  };
}

function jobDe(org: string) {
  return base.tablas.reel_variation_jobs.find((f) => f.organization_id === org)!;
}

let consola: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  base.reiniciar();
  base.tablas.reel_variation_jobs = [job(OTRA_ORG), job(ORG)];
  base.tablas.organizations = [
    { id: OTRA_ORG, reel_music_path: `${OTRA_ORG}/music/background.mp3` },
    { id: ORG, reel_music_path: `${ORG}/music/background.mp3` },
  ];
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => consola.mockRestore());

async function esFallaRegistrada(resultado: unknown, etiqueta: string) {
  expect(resultado).toEqual({ success: false, error: TEXTO_FIJO });
  expect(base.reportes).toHaveLength(1);
  expect(base.reportes[0].contexto).toEqual({ accion: etiqueta });
  expect(consola).toHaveBeenCalledWith(etiqueta, expect.anything());
}

describe("getReelVariationJobAction", () => {
  it("⭐ devuelve el job de la organización", async () => {
    const r = await getReelVariationJobAction(JOB);
    expect(r.success && r.data?.organization_id).toBe(ORG);
  });

  it("un job que no existe vuelve como null", async () => {
    await expect(getReelVariationJobAction(NO_EXISTE)).resolves.toEqual({ success: true, data: null });
  });

  it("un ID inválido, o sin sesión, vuelve con el motivo", async () => {
    await expect(getReelVariationJobAction("x")).resolves.toEqual({ success: false, error: "ID inválido" });
    base.sesion = false;
    await expect(getReelVariationJobAction(JOB)).resolves.toEqual({ success: false, error: "Sesión no válida" });
    expect(base.reportes).toEqual([]);
  });

  it("⭐ una falla de la base se registra", async () => {
    base.errores.reel_variation_jobs = FETCH_FAILED;
    await esFallaRegistrada(await getReelVariationJobAction(JOB), "[getReelVariationJob]");
  });
});

describe("listReelVariationJobsForPieceAction", () => {
  it("⭐ lista sólo los jobs de la organización", async () => {
    const r = await listReelVariationJobsForPieceAction(PIEZA);
    expect(r.success && r.data.map((j) => j.organization_id)).toEqual([ORG]);
  });

  it("un ID inválido vuelve con el motivo", async () => {
    await expect(listReelVariationJobsForPieceAction("17896293831516409")).resolves.toEqual({
      success: false,
      error: "ID inválido",
    });
  });

  it("⭐ una falla de la base ya no es «sin jobs»: texto fijo y se registra", async () => {
    base.lanza = new TypeError("fetch failed");
    await esFallaRegistrada(await listReelVariationJobsForPieceAction(PIEZA), "[listReelVariationJobsForPiece]");
  });
});

describe("updateReelVariationAction", () => {
  it("⭐ edita la variante del job de la organización (sólo los campos editables)", async () => {
    const r = await updateReelVariationAction(JOB, 1, {
      description: "nueva",
      storage_path: `${OTRA_ORG}/robado.mp4`,
    } as never);
    expect(r).toEqual({ success: true, data: undefined });
    const mio = jobDe(ORG).variations as Array<Record<string, unknown>>;
    expect(mio[1]).toMatchObject({ description: "nueva", storage_path: `${ORG}/reels/v1.mp4` });
    expect((jobDe(OTRA_ORG).variations as Array<Record<string, unknown>>)[1].description).toBe("original");
    expect(base.filtrosDe("reel_variation_jobs", "select")).toContainEqual(["organization_id", ORG]);
    expect(base.filtrosDe("reel_variation_jobs", "update")).toContainEqual(["organization_id", ORG]);
  });

  it("⭐ lee las variantes del job de la organización, no del ajeno", async () => {
    (jobDe(OTRA_ORG).variations as unknown[]).push(variante("x"), variante("y"));
    await expect(updateReelVariationAction(JOB, 3, { included: false })).resolves.toEqual({
      success: false,
      error: "Índice de variante inválido",
    });
  });

  it.each([[-1], [2], [1.5], ["1" as unknown as number]])(
    "un índice inválido (%s) vuelve con el motivo, sin escribir",
    async (indice) => {
      await expect(updateReelVariationAction(JOB, indice, { included: false })).resolves.toEqual({
        success: false,
        error: "Índice de variante inválido",
      });
      expect(base.escrituras()).toEqual([]);
    }
  );

  it("un job que no existe vuelve con el motivo", async () => {
    await expect(updateReelVariationAction(NO_EXISTE, 0, {})).resolves.toEqual({
      success: false,
      error: "Job no encontrado",
    });
  });

  it("un ID inválido vuelve con el motivo", async () => {
    await expect(updateReelVariationAction("x", 0, {})).resolves.toEqual({ success: false, error: "ID inválido" });
  });

  it("⭐ una falla al leer se registra", async () => {
    base.errores["reel_variation_jobs:select"] = FETCH_FAILED;
    await esFallaRegistrada(await updateReelVariationAction(JOB, 0, {}), "[updateReelVariation]");
  });

  it("⭐ una falla al guardar se registra", async () => {
    base.errores["reel_variation_jobs:update"] = FETCH_FAILED;
    await esFallaRegistrada(await updateReelVariationAction(JOB, 0, { included: false }), "[updateReelVariation]");
  });
});

describe("setReelVariationDelayAction", () => {
  it("⭐ cambia la demora sólo del job de la organización y sólo si está para revisar", async () => {
    await expect(setReelVariationDelayAction(JOB, 8)).resolves.toEqual({ success: true, data: undefined });
    expect(jobDe(ORG).delay_hours).toBe(8);
    expect(jobDe(OTRA_ORG).delay_hours).toBe(2);
    expect(base.filtrosDe("reel_variation_jobs", "update")).toEqual([
      ["id", JOB],
      ["organization_id", ORG],
      ["status", "preview_ready"],
    ]);
  });

  it.each([[-1], [73], [1.5], [Number.NaN]])(
    "una demora fuera del rango de la base (%s) vuelve con el motivo, sin escribir",
    async (horas) => {
      await expect(setReelVariationDelayAction(JOB, horas)).resolves.toEqual({
        success: false,
        error: "La demora tiene que ser un número entero de horas entre 0 y 72.",
      });
      expect(base.escrituras()).toEqual([]);
    }
  );

  it("los extremos del rango (0 y 72) se aceptan", async () => {
    await expect(setReelVariationDelayAction(JOB, 0)).resolves.toMatchObject({ success: true });
    await expect(setReelVariationDelayAction(JOB, 72)).resolves.toMatchObject({ success: true });
  });

  it("⭐ una falla de la base se registra", async () => {
    base.errores["reel_variation_jobs:update"] = FETCH_FAILED;
    await esFallaRegistrada(await setReelVariationDelayAction(JOB, 4), "[setReelVariationDelay]");
  });
});

describe("refreshVariationPreviewUrlsAction", () => {
  it("⭐ firma sólo las rutas de la organización del job de la organización y guarda las URLs", async () => {
    (jobDe(ORG).variations as Array<Record<string, unknown>>).push(variante(`${OTRA_ORG}/reels/robado.mp4`));
    const r = await refreshVariationPreviewUrlsAction(JOB);
    expect(r.success && r.data?.organization_id).toBe(ORG);
    const urls = r.success ? r.data?.variations.map((v) => v.preview_url) : null;
    expect(urls).toEqual([
      `https://storage/ver/${ORG}/reels/v0.mp4`,
      `https://storage/ver/${ORG}/reels/v1.mp4`,
      "https://storage/vieja",
    ]);
    expect(base.filtrosDe("reel_variation_jobs", "select")).toContainEqual(["organization_id", ORG]);
    expect((jobDe(ORG).variations as Array<Record<string, unknown>>)[0].preview_url).toBe(
      `https://storage/ver/${ORG}/reels/v0.mp4`
    );
  });

  it("un job que no existe vuelve como null", async () => {
    await expect(refreshVariationPreviewUrlsAction(NO_EXISTE)).resolves.toEqual({ success: true, data: null });
  });

  it("⭐ un error de Storage al firmar ya no se ignora: texto fijo y se registra", async () => {
    base.storage.error = { message: "Object not found" };
    await esFallaRegistrada(await refreshVariationPreviewUrlsAction(JOB), "[refreshVariationPreviewUrls]");
  });

  it("⭐ una falla al guardar las URLs ya no se ignora", async () => {
    base.errores["reel_variation_jobs:update"] = FETCH_FAILED;
    await esFallaRegistrada(await refreshVariationPreviewUrlsAction(JOB), "[refreshVariationPreviewUrls]");
  });

  it("⭐ una falla al leer el job se registra", async () => {
    base.errores.reel_variation_jobs = FETCH_FAILED;
    await esFallaRegistrada(await refreshVariationPreviewUrlsAction(JOB), "[refreshVariationPreviewUrls]");
  });

  it("sin sesión vuelve con el motivo", async () => {
    base.sesion = false;
    await expect(refreshVariationPreviewUrlsAction(JOB)).resolves.toEqual({ success: false, error: "Sesión no válida" });
  });
});

describe("getReelMusicPathAction", () => {
  it("⭐ devuelve la música de la organización", async () => {
    await expect(getReelMusicPathAction()).resolves.toEqual({
      success: true,
      data: `${ORG}/music/background.mp3`,
    });
    expect(base.filtrosDe("organizations", "select")).toEqual([["id", ORG]]);
  });

  it("sin música devuelve null", async () => {
    base.tablas.organizations = [{ id: ORG, reel_music_path: null }];
    await expect(getReelMusicPathAction()).resolves.toEqual({ success: true, data: null });
  });

  it("⭐ una falla de la base ya no es «sin música»: texto fijo y se registra", async () => {
    base.errores.organizations = FETCH_FAILED;
    await esFallaRegistrada(await getReelMusicPathAction(), "[getReelMusicPath]");
  });

  it("sin sesión vuelve con el motivo", async () => {
    base.sesion = false;
    await expect(getReelMusicPathAction()).resolves.toEqual({ success: false, error: "Sesión no válida" });
  });
});
