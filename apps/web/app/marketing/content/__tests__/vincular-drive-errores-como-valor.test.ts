import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-502 (`[MKT-VINCULAR-DRIVE-IGNORA-RESULTADO]`): vincular y desvincular
 * un archivo de Drive (`drive-actions.ts`, SCRUM-519) devuelven el resultado de
 * `updateContentPieceAction`. Antes el `await` lo descartaba: con la base
 * caída la pantalla decía "Archivo vinculado" sin haber guardado nada. Se usa
 * la acción real contra la base falsa; ningún pedido sale a la red.
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
  const { base } = await import("./supabase-falso");
  return { getCurrentProfile: async () => (base.sesion ? base.perfil : null) };
});

import { linkDriveFileToContentAction, unlinkDriveFileAction } from "../drive-actions";
import { base, ORG, OTRA_ORG, TEXTO_FIJO } from "./supabase-falso";

const PIEZA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ARCHIVO = { id: "drive-nuevo", name: "video.mp4", url: "https://drive.google.com/file/d/drive-nuevo/view" };

function pieza(org: string) {
  return {
    id: PIEZA,
    organization_id: org,
    drive_file_id: "drive-viejo",
    drive_file_name: "viejo.mp4",
    drive_file_url: "https://drive/viejo",
  };
}
const filaDe = (org: string) => base.tablas.content_pieces.find((f) => f.organization_id === org)!;

let consola: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  base.reiniciar();
  base.tablas.content_pieces = [pieza(OTRA_ORG), pieza(ORG)];
  consola = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", async (url: unknown) => {
    throw new Error(`pedido a la red no esperado: ${String(url)}`);
  });
});
afterEach(() => {
  consola.mockRestore();
  vi.unstubAllGlobals();
});

describe("linkDriveFileToContentAction", () => {
  it("⭐ vincula el archivo sólo a la pieza de la organización y devuelve éxito", async () => {
    await expect(linkDriveFileToContentAction(PIEZA, ARCHIVO)).resolves.toEqual({ success: true, data: undefined });
    expect(filaDe(ORG)).toMatchObject({ drive_file_id: "drive-nuevo", drive_file_name: "video.mp4" });
    expect(filaDe(OTRA_ORG).drive_file_id).toBe("drive-viejo");
  });

  it("⭐ con la base caída devuelve el texto fijo (antes terminaba bien) y se registra", async () => {
    base.errores["content_pieces:update"] = { message: "TypeError: fetch failed" };
    await expect(linkDriveFileToContentAction(PIEZA, ARCHIVO)).resolves.toEqual({ success: false, error: TEXTO_FIJO });
    expect(base.reportes).toHaveLength(1);
    expect(base.reportes[0].contexto).toEqual({ accion: "[updateContentPiece]" });
  });

  it("⭐ un ID inválido o sin sesión vuelven con el motivo, sin escribir", async () => {
    await expect(linkDriveFileToContentAction("no-es-un-id", ARCHIVO)).resolves.toEqual({
      success: false,
      error: "ID inválido",
    });
    base.sesion = false;
    await expect(linkDriveFileToContentAction(PIEZA, ARCHIVO)).resolves.toEqual({
      success: false,
      error: "Sesión no válida",
    });
    expect(base.escrituras()).toEqual([]);
  });
});

describe("unlinkDriveFileAction", () => {
  it("⭐ desvincula sólo la pieza de la organización y devuelve éxito", async () => {
    await expect(unlinkDriveFileAction(PIEZA)).resolves.toEqual({ success: true, data: undefined });
    expect(filaDe(ORG)).toMatchObject({ drive_file_id: null, drive_file_name: null, drive_file_url: null });
    expect(filaDe(OTRA_ORG).drive_file_id).toBe("drive-viejo");
  });

  it("⭐ con la base caída devuelve el texto fijo (antes terminaba bien)", async () => {
    base.lanza = new TypeError("fetch failed");
    await expect(unlinkDriveFileAction(PIEZA)).resolves.toEqual({ success: false, error: TEXTO_FIJO });
    expect(base.reportes).toHaveLength(1);
  });

  it("un ID inválido vuelve con el motivo", async () => {
    await expect(unlinkDriveFileAction("x")).resolves.toEqual({ success: false, error: "ID inválido" });
  });
});
