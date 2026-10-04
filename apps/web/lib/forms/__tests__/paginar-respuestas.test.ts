import { describe, expect, it } from "vitest";
import {
  MAX_PAGINAS_DE_RESPUESTAS,
  traerRespuestasGoogleForms,
  traerRespuestasTypeform,
  type PaginaJson,
} from "@/lib/forms/paginar-respuestas";

/** Typeform simulado: `total` respuestas ordenadas de la más nueva a la más vieja. */
function typeformCon(total: number, fallarEnPagina?: number) {
  const todas = Array.from({ length: total }, (_, i) => ({ token: `t${total - i}` }));
  const urls: string[] = [];
  const pedir: PaginaJson = async (url) => {
    urls.push(url);
    if (fallarEnPagina !== undefined && urls.length - 1 === fallarEnPagina) {
      return { ok: false, status: 500, json: null };
    }
    const before = new URL(url).searchParams.get("before");
    const desde = before ? todas.findIndex((r) => r.token === before) + 1 : 0;
    return { ok: true, status: 200, json: { items: todas.slice(desde, desde + 1000) } };
  };
  return { pedir, urls };
}

describe("traerRespuestasTypeform", () => {
  it("trae las 2.500 respuestas en 3 páginas, paginando con before", async () => {
    const { pedir, urls } = typeformCon(2500);
    const r = await traerRespuestasTypeform(pedir, "F1", "2026-10-01T00:00:00Z");
    expect(r.completo).toBe(true);
    expect(r.items).toHaveLength(2500);
    expect(new Set(r.items.map((i) => i.token)).size).toBe(2500);
    expect(urls).toHaveLength(3);
    expect(urls[1]).toContain("before=t1501");
    // El filtro `since` se mantiene en todas las páginas.
    expect(urls.every((u) => u.includes("since="))).toBe(true);
  });

  it("si una página falla, avisa que quedó incompleto (el cursor no debe avanzar)", async () => {
    const { pedir } = typeformCon(2500, 1);
    const r = await traerRespuestasTypeform(pedir, "F1", null);
    expect(r.completo).toBe(false);
    expect(r.items).toHaveLength(1000);
  });

  it("con exactamente 1.000 pide una página más y termina", async () => {
    const { pedir, urls } = typeformCon(1000);
    const r = await traerRespuestasTypeform(pedir, "F1", null);
    expect(r).toMatchObject({ completo: true });
    expect(r.items).toHaveLength(1000);
    expect(urls).toHaveLength(2);
  });
});

describe("traerRespuestasGoogleForms", () => {
  it("sigue nextPageToken hasta el final, con el mismo filtro", async () => {
    const urls: string[] = [];
    const pedir: PaginaJson = async (url) => {
      urls.push(url);
      const token = new URL(url).searchParams.get("pageToken");
      const pagina = token ? Number(token) : 0;
      const responses = Array.from({ length: 1000 }, (_, i) => ({ responseId: `r${pagina}-${i}` }));
      return {
        ok: true,
        status: 200,
        json: { responses: pagina < 2 ? responses : responses.slice(0, 300), nextPageToken: pagina < 2 ? String(pagina + 1) : undefined },
      };
    };
    const r = await traerRespuestasGoogleForms(pedir, "G1", "2026-10-01T00:00:00Z");
    expect(r.completo).toBe(true);
    expect(r.items).toHaveLength(2300);
    expect(urls.every((u) => u.includes("filter=timestamp"))).toBe(true);
  });

  it("devuelve el status si falla (403 = sin permiso)", async () => {
    const r = await traerRespuestasGoogleForms(
      async () => ({ ok: false, status: 403, json: null }),
      "G1",
      null
    );
    expect(r).toMatchObject({ completo: false, status: 403, items: [] });
  });

  it("corta en el tope de páginas y lo marca como incompleto", async () => {
    let n = 0;
    const r = await traerRespuestasGoogleForms(
      async () => ({ ok: true, status: 200, json: { responses: [{}], nextPageToken: String(++n) } }),
      "G1",
      null
    );
    expect(r.completo).toBe(false);
    expect(n).toBe(MAX_PAGINAS_DE_RESPUESTAS);
  });
});
