import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-85 · el chequeo de salud: estado según qué responde, plazos cortos,
 * versión desplegada y un lector barato ante muchos pedidos.
 */

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    throw new Error("este test no usa la base real");
  },
}));

import {
  crearLectorDeSalud,
  estadoDeSalud,
  medirSalud,
  PLAZO_POR_CHEQUEO_MS,
  variablesCriticasPresentes,
  versionDesplegada,
  type RespuestaDeSalud,
  type SondasDeSalud,
} from "../salud";

const HORA = new Date("2026-10-07T15:00:00Z");

function sondas(cambios: Partial<SondasDeSalud> = {}): SondasDeSalud {
  return {
    base: async () => true,
    storage: async () => true,
    variables: () => true,
    version: () => ({ commit: "cdfca43", entorno: "production" }),
    ahora: () => HORA,
    ...cambios,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("estadoDeSalud", () => {
  it("caído sin base; degradado si falla algo secundario; ok si todo responde", () => {
    expect(estadoDeSalud({ base: false, storage: true, variables: true })).toBe("caido");
    expect(estadoDeSalud({ base: false, storage: false, variables: false })).toBe("caido");
    expect(estadoDeSalud({ base: true, storage: false, variables: true })).toBe("degradado");
    expect(estadoDeSalud({ base: true, storage: true, variables: false })).toBe("degradado");
    expect(estadoDeSalud({ base: true, storage: true, variables: true })).toBe("ok");
  });
});

describe("medirSalud", () => {
  it("todo responde: ok, con versión y hora", async () => {
    await expect(medirSalud(sondas())).resolves.toEqual({
      status: "ok",
      chequeos: { base: true, storage: true, variables: true },
      version: { commit: "cdfca43", entorno: "production" },
      hora: "2026-10-07T15:00:00.000Z",
    });
  });

  it("Storage lanza: degradado, sin el mensaje del error", async () => {
    const salud = await medirSalud(
      sondas({
        storage: async () => {
          throw new Error('bucket "content-thumbnails" not found');
        },
      })
    );
    expect(salud.status).toBe("degradado");
    expect(salud.chequeos).toEqual({ base: true, storage: false, variables: true });
    expect(JSON.stringify(salud)).not.toContain("content-thumbnails");
  });

  it("la base no responde: caído", async () => {
    const salud = await medirSalud(sondas({ base: async () => false }));
    expect(salud.status).toBe("caido");
  });

  it("⭐ una base colgada vence a los 3 s, se aborta y cuenta como caída", async () => {
    vi.useFakeTimers();
    let abortada = false;
    const medicion = medirSalud(
      sondas({
        base: (signal) =>
          new Promise<boolean>(() => {
            signal.addEventListener("abort", () => {
              abortada = true;
            });
          }),
      })
    );
    await vi.advanceTimersByTimeAsync(PLAZO_POR_CHEQUEO_MS);
    const salud = await medicion;
    expect(salud.status).toBe("caido");
    expect(salud.chequeos.base).toBe(false);
    expect(salud.chequeos.storage).toBe(true);
    expect(abortada).toBe(true);
  });

  it("los chequeos corren en paralelo: dos colgados no suman sus plazos", async () => {
    vi.useFakeTimers();
    const colgada = () => new Promise<boolean>(() => {});
    const medicion = medirSalud(sondas({ base: colgada, storage: colgada }));
    await vi.advanceTimersByTimeAsync(PLAZO_POR_CHEQUEO_MS);
    await expect(medicion).resolves.toMatchObject({ status: "caido" });
  });

  it("las sondas reales con la base inalcanzable (sin credenciales) dan caído, sin lanzar", async () => {
    const salud = await medirSalud(undefined, 50);
    expect(salud.status).toBe("caido");
    expect(salud.chequeos.base).toBe(false);
    expect(salud.chequeos.storage).toBe(false);
  });
});

describe("variablesCriticasPresentes", () => {
  const completas = {
    NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    CRON_SECRET: "cron",
    ENCRYPTION_MASTER_KEY: "clave",
  };

  it("todas presentes, aceptando los nombres alternativos de las claves de Supabase", () => {
    expect(variablesCriticasPresentes(completas)).toBe(true);
    expect(
      variablesCriticasPresentes({
        ...completas,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
        SUPABASE_SERVICE_ROLE_KEY: undefined,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pub",
        SUPABASE_SECRET_KEY: "secret",
      })
    ).toBe(true);
  });

  it.each(["NEXT_PUBLIC_SUPABASE_URL", "CRON_SECRET", "ENCRYPTION_MASTER_KEY", "SUPABASE_SERVICE_ROLE_KEY"])(
    "falta %s (o está en blanco): false",
    (nombre) => {
      expect(variablesCriticasPresentes({ ...completas, [nombre]: undefined })).toBe(false);
      expect(variablesCriticasPresentes({ ...completas, [nombre]: "   " })).toBe(false);
    }
  );
});

describe("versionDesplegada", () => {
  it("el commit corto y el entorno de Vercel", () => {
    expect(
      versionDesplegada({
        VERCEL_GIT_COMMIT_SHA: "CDFCA439aaaabbbbccccddddeeeeffff00001111",
        VERCEL_ENV: "production",
      })
    ).toEqual({ commit: "cdfca43", entorno: "production" });
  });

  it("fuera de Vercel, o con valores raros, null", () => {
    expect(versionDesplegada({})).toEqual({ commit: null, entorno: null });
    expect(versionDesplegada({ VERCEL_GIT_COMMIT_SHA: "<script>", VERCEL_ENV: "Prod uction" })).toEqual({
      commit: null,
      entorno: null,
    });
  });
});

describe("crearLectorDeSalud", () => {
  const respuesta = (hora: string): RespuestaDeSalud => ({
    status: "ok",
    chequeos: { base: true, storage: true, variables: true },
    version: { commit: null, entorno: null },
    hora,
  });

  it("⭐ cien pedidos a la vez comparten una sola medición", async () => {
    let resolver: (valor: RespuestaDeSalud) => void = () => {};
    const medir = vi.fn(() => new Promise<RespuestaDeSalud>((r) => (resolver = r)));
    const leer = crearLectorDeSalud(medir, 10_000, () => 0);
    const pedidos = Array.from({ length: 100 }, () => leer());
    resolver(respuesta("a"));
    const resultados = await Promise.all(pedidos);
    expect(medir).toHaveBeenCalledTimes(1);
    expect(new Set(resultados.map((r) => r.hora))).toEqual(new Set(["a"]));
  });

  it("reusa el resultado mientras está vigente y vuelve a medir después", async () => {
    let ahora = 0;
    let n = 0;
    const medir = vi.fn(async () => respuesta(String(++n)));
    const leer = crearLectorDeSalud(medir, 10_000, () => ahora);
    expect((await leer()).hora).toBe("1");
    ahora = 9_999;
    expect((await leer()).hora).toBe("1");
    ahora = 10_000;
    expect((await leer()).hora).toBe("2");
    expect(medir).toHaveBeenCalledTimes(2);
  });
});
