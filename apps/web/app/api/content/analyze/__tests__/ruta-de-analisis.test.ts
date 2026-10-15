import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-502 (AR pasada 1): `POST /api/content/analyze` es el camino del botón
 * "Analizar" del detalle de una pieza (`content-piece-detail.tsx`), que muestra
 * "Análisis completado" con un 2xx y el `error` del cuerpo con cualquier otro
 * status. La acción devuelve su error como valor: la ruta tiene que pasarlo.
 */

const sim = vi.hoisted(() => ({
  sesion: true,
  resultado: null as unknown,
  pedidos: [] as unknown[],
}));

vi.mock("@/lib/auth/require-auth", () => ({
  requireAuthContext: async () => {
    if (!sim.sesion) throw new Error("Unauthorized");
    return {};
  },
}));
vi.mock("@/app/marketing/content/actions", () => ({
  analyzeContentPieceAction: async (id: unknown) => {
    sim.pedidos.push(id);
    return sim.resultado;
  },
}));

import { POST } from "../route";

const PIEZA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TEXTO_FIJO = "Ocurrió un error inesperado. Intentá de nuevo.";

function pedido(cuerpo: unknown) {
  return new Request("http://localhost/api/content/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  }) as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  sim.sesion = true;
  sim.resultado = null;
  sim.pedidos = [];
});

describe("POST /api/content/analyze", () => {
  it("con éxito devuelve el análisis", async () => {
    sim.resultado = { success: true, data: { why_it_worked: "porque sí" } };
    const r = await POST(pedido({ contentPieceId: PIEZA }));
    expect(r.status).toBe(200);
    await expect(r.json()).resolves.toEqual({ analysis: { why_it_worked: "porque sí" } });
    expect(sim.pedidos).toEqual([PIEZA]);
  });

  it("⭐ un rechazo de la acción no es «Análisis completado»: 500 con el motivo", async () => {
    sim.resultado = { success: false, error: "Esta pieza no tiene un video de Drive vinculado." };
    const r = await POST(pedido({ contentPieceId: PIEZA }));
    expect(r.status).toBe(500);
    await expect(r.json()).resolves.toEqual({ error: "Esta pieza no tiene un video de Drive vinculado." });
  });

  it("⭐ una falla de la acción: 500 con el texto fijo", async () => {
    sim.resultado = { success: false, error: TEXTO_FIJO };
    const r = await POST(pedido({ contentPieceId: PIEZA }));
    expect(r.status).toBe(500);
    await expect(r.json()).resolves.toEqual({ error: TEXTO_FIJO });
  });

  it("sin sesión responde 401 sin llamar a la acción", async () => {
    sim.sesion = false;
    const r = await POST(pedido({ contentPieceId: PIEZA }));
    expect(r.status).toBe(401);
    expect(sim.pedidos).toEqual([]);
  });

  it("sin contentPieceId responde 400", async () => {
    const r = await POST(pedido({}));
    expect(r.status).toBe(400);
    expect(sim.pedidos).toEqual([]);
  });
});
