import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { crearBaseFalsa, type BaseFalsa } from "./base-falsa-de-claves";

/**
 * SCRUM-527: claves de ingesta de la landing. Generación, hash y
 * `verificarClaveDeIngesta`, que usa el endpoint de SCRUM-528.
 */

const sim = vi.hoisted(() => ({
  reportes: [] as Array<{ error: unknown; contexto: unknown }>,
  bytesPedidos: [] as number[],
}));

vi.mock("@/lib/observability/reportar-falla", () => ({
  reportarFalla: (error: unknown, contexto: unknown) => sim.reportes.push({ error, contexto }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    throw new Error("los tests pasan su propio cliente");
  },
}));
vi.mock("node:crypto", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:crypto")>();
  return {
    ...real,
    randomBytes: (n: number) => {
      sim.bytesPedidos.push(n);
      return real.randomBytes(n);
    },
  };
});

const {
  BYTES_ALEATORIOS_DE_LA_CLAVE,
  INTERVALO_MINIMO_ULTIMO_USO_MS,
  PREFIJO_CLAVE_DE_INGESTA,
  generarClaveDeIngesta,
  hashDeClaveDeIngesta,
  hayQueAnotarElUso,
  tieneFormatoDeClaveDeIngesta,
  verificarClaveDeIngesta,
} = await import("@/lib/webinar/claves-de-ingesta");
const { FallaDeLaBase } = await import("@/lib/server/action-result");

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTRA_ORG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const AHORA = new Date("2026-10-16T12:00:00.000Z");
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

let base: BaseFalsa;
let avisos: ReturnType<typeof vi.spyOn>;
let errores: ReturnType<typeof vi.spyOn>;

function fila(clave: string, extra: Record<string, unknown> = {}) {
  return {
    id: `id-${clave.slice(-6)}`,
    organization_id: ORG,
    key_hash: sha256(clave),
    label: "Landing principal",
    created_at: "2026-10-01T00:00:00.000Z",
    last_used_at: null,
    revoked_at: null,
    ...extra,
  };
}

/** Las tareas de `last_used_at` que la verificación mandó a segundo plano. */
let enEspera: Promise<void>[] = [];

function verificar(
  token: unknown,
  extra: Partial<Parameters<typeof verificarClaveDeIngesta>[1]> = {},
) {
  return verificarClaveDeIngesta(token, {
    cliente: base.cliente() as SupabaseClient,
    ahora: () => AHORA,
    enSegundoPlano: (t) => enEspera.push(t),
    ...extra,
  });
}

/** Todo lo que salió por consola o a Sentry, en un texto. */
function todoLoRegistrado(): string {
  return JSON.stringify([
    avisos.mock.calls,
    errores.mock.calls,
    sim.reportes.map((r) => [String((r.error as Error)?.message), r.contexto]),
  ]);
}

beforeEach(() => {
  enEspera = [];
  sim.reportes = [];
  sim.bytesPedidos = [];
  base = crearBaseFalsa();
  avisos = vi.spyOn(console, "warn").mockImplementation(() => {});
  errores = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("generarClaveDeIngesta", () => {
  it("tiene prefijo reconocible y 32 bytes de crypto en base64url", () => {
    const { clave } = generarClaveDeIngesta();
    expect(clave.startsWith(PREFIJO_CLAVE_DE_INGESTA)).toBe(true);
    expect(clave).toMatch(/^lmt_ing_[A-Za-z0-9_-]{43}$/);
    expect(BYTES_ALEATORIOS_DE_LA_CLAVE).toBe(32);
    expect(sim.bytesPedidos).toEqual([32]);
    expect(Buffer.from(clave.slice(PREFIJO_CLAVE_DE_INGESTA.length), "base64url")).toHaveLength(32);
  });

  it("no usa Math.random", () => {
    const random = vi.spyOn(Math, "random");
    generarClaveDeIngesta();
    expect(random).not.toHaveBeenCalled();
  });

  it("dos claves nunca salen iguales", () => {
    const claves = new Set(Array.from({ length: 200 }, () => generarClaveDeIngesta().clave));
    expect(claves.size).toBe(200);
  });

  it("devuelve el sha256 en hexadecimal de la clave entera, que no es la clave", () => {
    const { clave, hash } = generarClaveDeIngesta();
    expect(hash).toBe(sha256(clave));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(clave.slice(PREFIJO_CLAVE_DE_INGESTA.length));
    expect(hashDeClaveDeIngesta(clave)).toBe(hash);
  });

  it("reconoce el formato y rechaza lo demás", () => {
    expect(tieneFormatoDeClaveDeIngesta(generarClaveDeIngesta().clave)).toBe(true);
    for (const malo of [
      "",
      "lmt_ing_corta",
      `otro_${"a".repeat(43)}`,
      `lmt_ing_${"a".repeat(42)}!`,
      `lmt_ing_${"a".repeat(44)}`,
      ` lmt_ing_${"a".repeat(43)}`,
      null,
      undefined,
      42,
    ]) {
      expect(tieneFormatoDeClaveDeIngesta(malo), String(malo)).toBe(false);
    }
  });
});

describe("verificarClaveDeIngesta", () => {
  it("una clave válida devuelve su organización y su id", async () => {
    const { clave } = generarClaveDeIngesta();
    base.tablas.ingest_keys = [fila(clave)];

    expect(await verificar(clave)).toEqual({ organizationId: ORG, claveId: `id-${clave.slice(-6)}` });
  });

  it("busca por el hash, nunca por la clave", async () => {
    const { clave } = generarClaveDeIngesta();
    base.tablas.ingest_keys = [fila(clave)];
    await verificar(clave);

    const lectura = base.consultas[0];
    expect(lectura.tabla).toBe("ingest_keys");
    expect(lectura.filtros).toEqual([["key_hash", "eq", sha256(clave)]]);
    expect(JSON.stringify(base.consultas)).not.toContain(clave);
  });

  it("una clave revocada deja de autenticar (criterio de aceptación)", async () => {
    const { clave } = generarClaveDeIngesta();
    base.tablas.ingest_keys = [fila(clave)];
    expect(await verificar(clave)).not.toBeNull();

    base.tablas.ingest_keys[0].revoked_at = "2026-10-16T11:00:00.000Z";
    expect(await verificar(clave)).toBeNull();
  });

  it("una clave que no existe no autentica", async () => {
    base.tablas.ingest_keys = [fila(generarClaveDeIngesta().clave)];
    expect(await verificar(generarClaveDeIngesta().clave)).toBeNull();
  });

  it("devuelve la organización de la clave, no otra", async () => {
    const a = generarClaveDeIngesta().clave;
    const b = generarClaveDeIngesta().clave;
    base.tablas.ingest_keys = [fila(a), fila(b, { organization_id: OTRA_ORG, id: "id-b" })];

    expect(await verificar(b)).toEqual({ organizationId: OTRA_ORG, claveId: "id-b" });
  });

  it("un token sin la forma de una clave se rechaza sin consultar la base", async () => {
    for (const token of ["", "Bearer algo", "lmt_ing_corta", null, undefined, { clave: 1 }]) {
      expect(await verificar(token)).toBeNull();
    }
    expect(base.consultas).toHaveLength(0);
  });

  it("si la fila devuelta no tiene el mismo hash, no autentica", async () => {
    const { clave } = generarClaveDeIngesta();
    // Un cliente que devuelve una fila con otro hash (una consulta mal armada).
    const cliente = {
      from: () => {
        const b = {
          select: () => b,
          eq: () => b,
          maybeSingle: async () => ({
            data: { ...fila(generarClaveDeIngesta().clave), last_used_at: AHORA.toISOString() },
            error: null,
          }),
        };
        return b;
      },
    } as unknown as SupabaseClient;
    expect(
      await verificarClaveDeIngesta(clave, { cliente, ahora: () => AHORA, enSegundoPlano: () => {} }),
    ).toBeNull();
  });

  it("si la base falla al buscar, lanza una falla con texto fijo, sin la clave ni el hash", async () => {
    const { clave } = generarClaveDeIngesta();
    base.errores["ingest_keys:select"] = { message: `boom ${sha256(clave)}`, code: "XX000" };

    const error = await verificar(clave).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FallaDeLaBase);
    expect((error as Error).message).toBe("No se pudo leer la clave de ingesta.");
    expect((error as InstanceType<typeof FallaDeLaBase>).code).toBe("XX000");
    expect(JSON.stringify(error)).not.toContain(sha256(clave));
  });

  describe("último uso", () => {
    it("anota last_used_at de esa clave, filtrando por id y organización", async () => {
      const { clave } = generarClaveDeIngesta();
      base.tablas.ingest_keys = [fila(clave)];
      const tareas: Promise<void>[] = [];
      await verificar(clave, { enSegundoPlano: (t) => tareas.push(t) });
      await Promise.all(tareas);

      expect(tareas).toHaveLength(1);
      const escritura = base.consultas.find((c) => c.op === "update");
      expect(escritura?.valores).toEqual({ last_used_at: AHORA.toISOString() });
      expect(escritura?.filtros).toEqual([
        ["id", "eq", `id-${clave.slice(-6)}`],
        ["organization_id", "eq", ORG],
      ]);
      expect(base.tablas.ingest_keys[0].last_used_at).toBe(AHORA.toISOString());
    });

    it("enSegundoPlano es obligatoria: sin ella no compila (AR pasada 1)", async () => {
      const { clave } = generarClaveDeIngesta();
      base.tablas.ingest_keys = [fila(clave)];
      const cliente = base.cliente() as SupabaseClient;
      // Si la opción volviera a ser opcional, tsc marca la directiva sin uso.
      // @ts-expect-error falta enSegundoPlano
      const sinOpcion = () => verificarClaveDeIngesta(clave, { cliente });
      // En ejecución tampoco hay un camino suelto: sin la función, lanza.
      await expect(sinOpcion()).rejects.toThrow();
    });

    it("un last_used_at ilegible se vuelve a anotar", async () => {
      const { clave } = generarClaveDeIngesta();
      base.tablas.ingest_keys = [fila(clave, { last_used_at: "no-es-una-fecha" })];
      await verificar(clave);
      await Promise.all(enEspera);
      expect(enEspera).toHaveLength(1);
      expect(base.tablas.ingest_keys[0].last_used_at).toBe(AHORA.toISOString());
    });

    it("hayQueAnotarElUso: nunca, ilegible y viejo sí; reciente no", () => {
      expect(hayQueAnotarElUso(null, AHORA)).toBe(true);
      expect(hayQueAnotarElUso("no-es-una-fecha", AHORA)).toBe(true);
      expect(hayQueAnotarElUso(new Date(AHORA.getTime() - INTERVALO_MINIMO_ULTIMO_USO_MS).toISOString(), AHORA)).toBe(true);
      expect(hayQueAnotarElUso(new Date(AHORA.getTime() - 1000).toISOString(), AHORA)).toBe(false);
    });

    it("no la reescribe si se anotó hace menos de un minuto", async () => {
      const { clave } = generarClaveDeIngesta();
      const hace = new Date(AHORA.getTime() - INTERVALO_MINIMO_ULTIMO_USO_MS + 1000).toISOString();
      base.tablas.ingest_keys = [fila(clave, { last_used_at: hace })];
      const tareas: Promise<void>[] = [];

      expect(await verificar(clave, { enSegundoPlano: (t) => tareas.push(t) })).not.toBeNull();
      expect(tareas).toHaveLength(0);
      expect(base.consultas.some((c) => c.op === "update")).toBe(false);
    });

    it("la reescribe si pasó un minuto o más", async () => {
      const { clave } = generarClaveDeIngesta();
      const hace = new Date(AHORA.getTime() - INTERVALO_MINIMO_ULTIMO_USO_MS).toISOString();
      base.tablas.ingest_keys = [fila(clave, { last_used_at: hace })];
      const tareas: Promise<void>[] = [];
      await verificar(clave, { enSegundoPlano: (t) => tareas.push(t) });
      await Promise.all(tareas);
      expect(base.tablas.ingest_keys[0].last_used_at).toBe(AHORA.toISOString());
    });

    it("no esperarla: la verificación responde antes de que termine la escritura", async () => {
      const { clave } = generarClaveDeIngesta();
      let soltar: () => void = () => {};
      const cliente = {
        from: () => {
          let op = "select";
          const b = {
            select: () => b,
            update: () => ((op = "update"), b),
            eq: () => b,
            maybeSingle: async () => ({ data: fila(clave), error: null }),
            then: (r: (v: unknown) => unknown) =>
              op === "update"
                ? new Promise<void>((ok) => (soltar = ok)).then(() => r({ error: null }))
                : Promise.resolve(r({ error: null })),
          };
          return b;
        },
      } as unknown as SupabaseClient;

      const tareas: Promise<void>[] = [];
      const resultado = await verificarClaveDeIngesta(clave, {
        cliente,
        ahora: () => AHORA,
        enSegundoPlano: (t) => tareas.push(t),
      });
      expect(resultado?.organizationId).toBe(ORG);
      let terminada = false;
      void tareas[0].then(() => (terminada = true));
      await Promise.resolve();
      expect(terminada).toBe(false);
      soltar();
      await tareas[0];
      expect(terminada).toBe(true);
    });

    it("si anotar el uso falla como valor, la clave sigue valiendo y se registra sin la clave ni el hash", async () => {
      const { clave } = generarClaveDeIngesta();
      base.tablas.ingest_keys = [fila(clave)];
      base.errores["ingest_keys:update"] = { message: `boom ${clave} ${sha256(clave)}`, code: "XX000" };
      const tareas: Promise<void>[] = [];

      expect(await verificar(clave, { enSegundoPlano: (t) => tareas.push(t) })).toEqual({
        organizationId: ORG,
        claveId: `id-${clave.slice(-6)}`,
      });
      await expect(Promise.all(tareas)).resolves.toBeDefined();

      expect(avisos).toHaveBeenCalledWith(
        "[verificarClaveDeIngesta] No se pudo anotar el último uso de la clave de ingesta.",
      );
      expect(sim.reportes).toHaveLength(1);
      expect((sim.reportes[0].error as Error).message).toBe(
        "No se pudo anotar el último uso de la clave de ingesta.",
      );
      expect(sim.reportes[0].contexto).toEqual({ organizationId: ORG, provider: "landing" });
      expect(todoLoRegistrado()).not.toContain(clave);
      expect(todoLoRegistrado()).not.toContain(sha256(clave));
    });

    it("si anotar el uso lanza (la red), la clave sigue valiendo y se registra", async () => {
      const { clave } = generarClaveDeIngesta();
      base.tablas.ingest_keys = [fila(clave)];
      base.lanza["ingest_keys:update"] = new TypeError(`fetch failed ${clave}`);
      const tareas: Promise<void>[] = [];

      expect(await verificar(clave, { enSegundoPlano: (t) => tareas.push(t) })).not.toBeNull();
      await Promise.all(tareas);
      expect(sim.reportes).toHaveLength(1);
      expect(todoLoRegistrado()).not.toContain(clave);
    });
  });
});
