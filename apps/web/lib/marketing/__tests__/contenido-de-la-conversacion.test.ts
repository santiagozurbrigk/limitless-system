import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveContentAssetFromConversation } from "../resolve-content-from-conversation";
import { FallaDeLaBase } from "@/lib/server/action-result";

/**
 * SCRUM-504 (AR pasada 3, MENOR-3): `resolveContentAssetFromConversation`
 * descarta los errores por defecto, como siempre: el ranking de contenido de
 * Marketing (`getSalesContentRank`, sin `try` por conversación) no se corta
 * por la falla de una lectura. Sólo el recorrido del lead pide `lanzarSiFalla`.
 */

function base(errores: Record<string, { message: string } | null>, filas: Record<string, unknown[]> = {}) {
  return {
    from(tabla: string) {
      const resultado = () => {
        const error = errores[tabla] ?? null;
        return error ? { data: null, error } : { data: (filas[tabla] ?? [])[0] ?? null, error: null };
      };
      const builder = {
        select: () => builder,
        eq: () => builder,
        ilike: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => resultado(),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

const conversacion = { utm_link_id: "utm-1", source_video_title: "Mi video" };

describe("resolveContentAssetFromConversation", () => {
  it("⭐ sin opciones, una lectura con error no lanza: resuelve null, como siempre", async () => {
    const supabase = base({
      utm_links: { message: "TypeError: fetch failed" },
      content_assets: { message: "TypeError: fetch failed" },
    });
    await expect(resolveContentAssetFromConversation(supabase, "org-1", conversacion)).resolves.toBeNull();
  });

  it("⭐ con lanzarSiFalla, la misma falla lanza FallaDeLaBase", async () => {
    const supabase = base({ utm_links: { message: "TypeError: fetch failed" } });
    await expect(
      resolveContentAssetFromConversation(supabase, "org-1", conversacion, { lanzarSiFalla: true })
    ).rejects.toBeInstanceOf(FallaDeLaBase);
  });

  it("⭐ con lanzarSiFalla, una falla al buscar por título también lanza", async () => {
    const supabase = base({ content_assets: { message: "TypeError: fetch failed" } });
    await expect(
      resolveContentAssetFromConversation(
        supabase,
        "org-1",
        { utm_link_id: null, source_video_title: "Mi video" },
        { lanzarSiFalla: true }
      )
    ).rejects.toBeInstanceOf(FallaDeLaBase);
  });

  it("encuentra el contenido por título", async () => {
    const supabase = base({}, {
      content_assets: [{ id: "a1", title: "Mi video", content_type: "reel", platform: "instagram", published_at: null }],
    });
    const r = await resolveContentAssetFromConversation(supabase, "org-1", { utm_link_id: null, source_video_title: "Mi video" });
    expect(r).toMatchObject({ id: "a1", type: "reel" });
  });
});
