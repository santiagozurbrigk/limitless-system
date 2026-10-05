import { afterEach, describe, expect, it, vi } from "vitest";
import { createZernioClient, ZernioHttpError, ZernioTimeoutError, ZERNIO_TIMEOUT_MS } from "../client";

/**
 * SCRUM-172: una respuesta no exitosa de Zernio lleva su status, para que el
 * cron de métricas distinga un 404 (post borrado) de un 429 o un 5xx.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function responder(status: number, cuerpo: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(cuerpo, { status, headers: { "content-type": "application/json" } }))
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
}

describe("zernioFetchJson", () => {
  it("⭐ un HTTP 404 lanza ZernioHttpError con el status y el mensaje de siempre", async () => {
    responder(404, '{"error":"not found"}');

    const error = await createZernioClient("sk_prueba")
      .getPostAnalytics("ig-1")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ZernioHttpError);
    expect(error).toMatchObject({ status: 404 });
    expect((error as Error).message).toMatch(/^Zernio getPostAnalytics: HTTP 404/);
  });

  it("un HTTP 429 también lleva su status", async () => {
    responder(429, '{"error":"rate limit"}');

    await expect(createZernioClient("sk_prueba").getPostAnalytics("ig-1")).rejects.toMatchObject({
      status: 429,
    });
  });
});

/** Un fetch que no responde nunca: sólo termina si lo corta la señal. */
function colgarse() {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolver, rechazar) => {
          init?.signal?.addEventListener("abort", () => rechazar(init.signal?.reason));
        })
    )
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
}

describe("zernioFetchJson · timeout", () => {
  it("⭐ un pedido colgado se corta con ZernioTimeoutError", async () => {
    colgarse();

    const inicio = Date.now();
    const error = await createZernioClient("sk_prueba", { timeoutMs: 50 })
      .getPostAnalytics("ig-1")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ZernioTimeoutError);
    expect((error as Error).message).toBe("Zernio getPostAnalytics: sin respuesta en 0.05 s");
    expect(Date.now() - inicio).toBeLessThan(2000);
  });

  it("todo pedido lleva una señal con el timeout de 15 s por defecto", async () => {
    responder(200, '{"posts":[]}');

    await createZernioClient("sk_prueba").getPostAnalytics("ig-1");

    const init = (fetch as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock.calls[0][1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(ZERNIO_TIMEOUT_MS).toBe(15_000);
  });
});
