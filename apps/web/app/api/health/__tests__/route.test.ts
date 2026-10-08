import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-85 · `GET /api/health`: 200 `ok`, 200 `degradado` si falla Storage, 503
 * si la base no responde (o no responde a tiempo), sin caché y sin ningún dato
 * sensible en la respuesta. Que sea pública lo prueba
 * `lib/supabase/__tests__/public-paths.test.ts`.
 */

const sim = vi.hoisted(() => ({
  base: "ok" as "ok" | "error" | "colgada",
  storage: "ok" as "ok" | "error" | "lanza",
  consultas: 0,
}));

const MENSAJE_DE_LA_BASE =
  'relation "public.organizations" does not exist (password=hunter2, host db.nrzlylzbmsuowzhpdnjl.supabase.co)';

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(tabla: string) {
      let senal: AbortSignal | null = null;
      const builder = {
        select: () => builder,
        limit: () => builder,
        abortSignal(signal: AbortSignal) {
          senal = signal;
          return builder;
        },
        then<T>(resolver: (valor: { data: unknown; error: unknown }) => T, rechazar?: (e: unknown) => T) {
          sim.consultas++;
          const resultado: Promise<{ data: unknown; error: unknown }> =
            sim.base === "colgada"
              ? new Promise((_, r) => senal?.addEventListener("abort", () => r(new Error("AbortError"))))
              : Promise.resolve(
                  sim.base === "error"
                    ? { data: null, error: { message: MENSAJE_DE_LA_BASE, code: "42P01" } }
                    : { data: [{ id: "x" }], error: null }
                );
          expect(tabla).toBe("organizations");
          return resultado.then(resolver, rechazar);
        },
      };
      return builder;
    },
    storage: {
      from: () => ({
        list: async () => {
          if (sim.storage === "lanza") throw new Error("storage-api caído: x-api-key=abc");
          return sim.storage === "error"
            ? { data: null, error: { message: 'Bucket "content-thumbnails" not found' } }
            : { data: [{ name: "org-1" }], error: null };
        },
      }),
    },
  }),
}));

const ENTORNO = {
  NEXT_PUBLIC_SUPABASE_URL: "https://nrzlylzbmsuowzhpdnjl.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-clave-publica-de-prueba",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-clave-secreta-de-prueba",
  CRON_SECRET: "cron-secreto-de-prueba",
  ENCRYPTION_MASTER_KEY: "master-key-secreta-de-prueba",
  VERCEL_GIT_COMMIT_SHA: "cdfca4391111222233334444555566667777aaaa",
  VERCEL_ENV: "production",
};

/** Cada test importa la ruta de nuevo: el lector guarda el resultado 10 s por instancia. */
async function pedir(): Promise<Response> {
  vi.resetModules();
  const { GET } = await import("../route");
  return GET();
}

beforeEach(() => {
  sim.base = "ok";
  sim.storage = "ok";
  sim.consultas = 0;
  for (const [nombre, valor] of Object.entries(ENTORNO)) vi.stubEnv(nombre, valor);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("GET /api/health", () => {
  it("⭐ 200 ok con la base, Storage y las variables bien", async () => {
    const respuesta = await pedir();
    expect(respuesta.status).toBe(200);
    const cuerpo = await respuesta.json();
    expect(cuerpo).toEqual({
      status: "ok",
      chequeos: { base: true, storage: true, variables: true },
      version: { commit: "cdfca43", entorno: "production" },
      hora: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
    });
  });

  it("no se cachea en el navegador ni en la CDN", async () => {
    const respuesta = await pedir();
    expect(respuesta.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(respuesta.headers.get("cdn-cache-control")).toBe("no-store");
    expect(respuesta.headers.get("vercel-cdn-cache-control")).toBe("no-store");
  });

  it.each(["error", "lanza"] as const)("200 degradado si Storage %s", async (modo) => {
    sim.storage = modo;
    const respuesta = await pedir();
    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toMatchObject({
      status: "degradado",
      chequeos: { base: true, storage: false, variables: true },
    });
  });

  it("200 degradado si falta una variable crítica, sin decir cuál", async () => {
    vi.stubEnv("ENCRYPTION_MASTER_KEY", "");
    const respuesta = await pedir();
    expect(respuesta.status).toBe(200);
    const texto = await respuesta.text();
    expect(JSON.parse(texto)).toMatchObject({ status: "degradado", chequeos: { variables: false } });
    expect(texto).not.toContain("ENCRYPTION");
  });

  it("⭐ 503 caído si la base responde con error", async () => {
    sim.base = "error";
    const respuesta = await pedir();
    expect(respuesta.status).toBe(503);
    expect(await respuesta.json()).toMatchObject({ status: "caido", chequeos: { base: false } });
  });

  it("⭐ 503 caído si la base no responde a tiempo: el pedido no queda colgado", async () => {
    sim.base = "colgada";
    vi.resetModules();
    const { GET } = await import("../route");
    vi.useFakeTimers();
    const pedido = GET();
    await vi.advanceTimersByTimeAsync(3000);
    const respuesta = await pedido;
    expect(respuesta.status).toBe(503);
    expect(await respuesta.json()).toMatchObject({ status: "caido", chequeos: { base: false, storage: true } });
  });

  it("⭐ nunca lleva mensajes de error, tablas, buckets, variables ni valores", async () => {
    sim.base = "error";
    sim.storage = "lanza";
    const texto = await (await pedir()).text();
    const prohibidos = [
      ...Object.values(ENTORNO).filter((valor) => valor !== "production"),
      ...Object.keys(ENTORNO),
      "organizations",
      "content-thumbnails",
      "hunter2",
      "password",
      "relation",
      "42P01",
      "x-api-key",
      "supabase",
      "error",
      "message",
    ];
    for (const prohibido of prohibidos) {
      expect(texto, prohibido).not.toContain(prohibido);
    }
    // Sólo estas claves, en cualquier estado.
    const cuerpo = JSON.parse(texto);
    expect(Object.keys(cuerpo).sort()).toEqual(["chequeos", "hora", "status", "version"]);
    expect(Object.keys(cuerpo.chequeos).sort()).toEqual(["base", "storage", "variables"]);
    expect(Object.keys(cuerpo.version).sort()).toEqual(["commit", "entorno"]);
  });

  it("es barata: pedidos seguidos de la misma instancia reusan la medición", async () => {
    vi.resetModules();
    const { GET } = await import("../route");
    await Promise.all(Array.from({ length: 50 }, () => GET()));
    await GET();
    expect(sim.consultas).toBe(1);
  });
});
