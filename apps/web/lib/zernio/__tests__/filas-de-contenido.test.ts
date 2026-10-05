import { describe, expect, it } from "vitest";
import type { ZernioPost } from "@/lib/zernio/client";
import { cambiosParaActualizar, mapExternalPostToRow } from "../filas-de-contenido";

/**
 * SCRUM-172: la sync de contenido usa las métricas que se guardan tanto al
 * insertar una pieza nueva como al actualizar una existente.
 */

const AHORA = "2026-10-04T12:00:00.000Z";

function post(analytics: unknown): ZernioPost {
  return { platform: "instagram", platformPostId: "ig-1", postType: "reel", analytics } as ZernioPost;
}

describe("mapExternalPostToRow", () => {
  it("⭐ un post sin analytics reconocibles se inserta con métricas en null", () => {
    const fila = mapExternalPostToRow(post({}), "org-1", AHORA);
    expect(fila).toMatchObject({ platform_post_id: "ig-1", type: "reel", metrics: null, metrics_updated_at: null });
  });

  it("un post con analytics reconocibles se inserta con sus métricas", () => {
    const fila = mapExternalPostToRow(post({ likes: 4, views: 90 }), "org-1", AHORA);
    expect(fila?.metrics).toMatchObject({ likes: 4, views: 90 });
    expect(fila?.metrics_updated_at).toBe(AHORA);
  });
});

describe("cambiosParaActualizar", () => {
  it("⭐ en una pieza existente, sin analytics reconocibles no se tocan las métricas", () => {
    const fila = mapExternalPostToRow(post(null), "org-1", AHORA)!;
    const cambios = cambiosParaActualizar(fila, null);
    expect(cambios).not.toHaveProperty("metrics");
    expect(cambios).not.toHaveProperty("metrics_updated_at");
    expect(cambios).toMatchObject({ type: "reel", status: "published" });
  });

  it("con analytics reconocibles actualiza las métricas", () => {
    const fila = mapExternalPostToRow(post({ likes: 7 }), "org-1", AHORA)!;
    expect(cambiosParaActualizar(fila, "https://thumb")).toMatchObject({
      metrics: expect.objectContaining({ likes: 7 }),
      metrics_updated_at: AHORA,
      thumbnail_url: "https://thumb",
    });
  });
});
