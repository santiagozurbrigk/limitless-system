import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-85 · registro de corridas de los crons (`corridas_de_procesos`).
 *
 * Cada corrida autorizada de un cron queda registrada con su estado (`ok`,
 * `fallo`, `parcial`) y sus orgs fallidas; una falla del registro nunca rompe el
 * cron; cada cierre borra las corridas de más de 30 días de ese proceso.
 */

type Fila = Record<string, unknown> & { id: string };

const sim = vi.hoisted(() => ({
  filas: [] as Fila[],
  borrados: [] as { proceso: unknown; antesDe: unknown }[],
  /** Qué hace la base: `ok`, `error` (responde con error) o `colgada` (no responde nunca). */
  base: "ok" as "ok" | "error" | "colgada",
  checkIns: [] as { status: string }[],
}));

vi.mock("@sentry/nextjs", () => ({
  captureCheckIn: (checkIn: { status: string }) => {
    sim.checkIns.push(checkIn);
    return "check-in";
  },
  flush: async () => true,
  withScope: (fn: (scope: unknown) => void) =>
    fn({ setTags: () => {}, setTag: () => {}, setExtras: () => {} }),
  captureException: () => {},
}));

/**
 * Lo mínimo del cliente de supabase-js que usa `almacenEnLaBase`: insert,
 * update y delete sobre `corridas_de_procesos`, con `abortSignal`.
 */
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(tabla: string) {
      expect(tabla).toBe("corridas_de_procesos");
      const filtros: Record<string, unknown> = {};
      let operacion: { tipo: "insert" | "update" | "delete"; fila?: Record<string, unknown> } | null =
        null;
      let senal: AbortSignal | null = null;

      const ejecutar = (): Promise<{ data: unknown; error: { message: string } | null }> => {
        if (sim.base === "colgada") {
          return new Promise((_, rechazar) =>
            senal?.addEventListener("abort", () => rechazar(new Error("AbortError")))
          );
        }
        if (sim.base === "error") {
          return Promise.resolve({
            data: null,
            error: { message: 'relation "public.corridas_de_procesos" does not exist' },
          });
        }
        if (operacion?.tipo === "insert") {
          const fila = { id: `corrida-${sim.filas.length + 1}`, ...operacion.fila };
          sim.filas.push(fila);
          return Promise.resolve({ data: { id: fila.id }, error: null });
        }
        if (operacion?.tipo === "update") {
          const fila = sim.filas.find((f) => f.id === filtros.id);
          if (fila) Object.assign(fila, operacion.fila);
          return Promise.resolve({ data: null, error: null });
        }
        sim.borrados.push({ proceso: filtros.proceso, antesDe: filtros.inicio_lt });
        return Promise.resolve({ data: null, error: null });
      };

      const builder = {
        insert(fila: Record<string, unknown>) {
          operacion = { tipo: "insert", fila };
          return builder;
        },
        update(fila: Record<string, unknown>) {
          operacion = { tipo: "update", fila };
          return builder;
        },
        delete() {
          operacion = { tipo: "delete" };
          return builder;
        },
        select: () => builder,
        eq(columna: string, valor: unknown) {
          filtros[columna] = valor;
          return builder;
        },
        lt(columna: string, valor: unknown) {
          filtros[`${columna}_lt`] = valor;
          return builder;
        },
        abortSignal(signal: AbortSignal) {
          senal = signal;
          return builder;
        },
        single: () => ejecutar(),
        then<T>(
          resolver: (valor: { data: unknown; error: { message: string } | null }) => T,
          rechazar?: (error: unknown) => T
        ) {
          return ejecutar().then(resolver, rechazar);
        },
      };
      return builder;
    },
  }),
}));

import { anotarOrganizacion } from "../corrida-en-curso";
import { conMonitorDeCron } from "../cron-monitor";
import {
  conRegistroDeCorrida,
  estadoDeCierre,
  mensajeDeErrorSaneado,
  PLAZO_DEL_REGISTRO_MS,
  type AlmacenDeCorridas,
  type CierreDeCorrida,
} from "../registro-de-corridas";
import { reportarFalla } from "../reportar-falla";

const ORG_A = "0a000000-0000-4000-8000-000000000001";
const ORG_B = "0b000000-0000-4000-8000-000000000002";
const ORG_C = "0c000000-0000-4000-8000-000000000003";

/** Un almacén en memoria para probar la lógica sin el cliente de supabase-js. */
function almacenEnMemoria() {
  const abiertas: { proceso: string; inicio: Date }[] = [];
  const cierres: CierreDeCorrida[] = [];
  const borrados: { proceso: string; antesDe: Date }[] = [];
  const almacen: AlmacenDeCorridas = {
    abrir: async (proceso, inicio) => {
      abiertas.push({ proceso, inicio });
      return `id-${abiertas.length}`;
    },
    cerrar: async (cierre) => {
      cierres.push(cierre);
    },
    borrarViejas: async (proceso, antesDe) => {
      borrados.push({ proceso, antesDe });
    },
  };
  return { almacen, abiertas, cierres, borrados };
}

const RUTA = "/api/cron/ghl-sync";

beforeEach(() => {
  sim.filas = [];
  sim.borrados = [];
  sim.base = "ok";
  sim.checkIns = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("estadoDeCierre", () => {
  it("falla si el cron falló; parcial si alguna org falló; ok si no", () => {
    expect(estadoDeCierre(true, 0)).toBe("fallo");
    expect(estadoDeCierre(true, 3)).toBe("fallo");
    expect(estadoDeCierre(false, 1)).toBe("parcial");
    expect(estadoDeCierre(false, 0)).toBe("ok");
  });
});

describe("conRegistroDeCorrida", () => {
  it("registra una corrida exitosa como ok, con las orgs procesadas", async () => {
    const { almacen, abiertas, cierres } = almacenEnMemoria();
    const respuesta = await conRegistroDeCorrida(
      RUTA,
      async () => {
        anotarOrganizacion(ORG_A, "ok");
        anotarOrganizacion(ORG_B, "ok");
        return Response.json({ ok: true });
      },
      almacen
    );

    expect(respuesta.status).toBe(200);
    expect(abiertas).toEqual([{ proceso: RUTA, inicio: expect.any(Date) }]);
    expect(cierres).toHaveLength(1);
    expect(cierres[0]).toMatchObject({
      id: "id-1",
      proceso: RUTA,
      estado: "ok",
      orgsProcesadas: 2,
      orgsFallidas: 0,
      organizacionesFallidas: [],
      error: null,
    });
    expect(cierres[0].fin.getTime()).toBeGreaterThanOrEqual(cierres[0].inicio.getTime());
  });

  it("sin orgs anotadas deja las columnas de orgs en null (el proceso no las informa)", async () => {
    const { almacen, cierres } = almacenEnMemoria();
    await conRegistroDeCorrida(RUTA, async () => Response.json({ ok: true }), almacen);
    expect(cierres[0]).toMatchObject({ estado: "ok", orgsProcesadas: null, orgsFallidas: null });
  });

  it("⭐ una org que falla (reportarFalla con organizationId) deja la corrida parcial con su id", async () => {
    const { almacen, cierres } = almacenEnMemoria();
    await conRegistroDeCorrida(
      RUTA,
      async () => {
        anotarOrganizacion(ORG_A, "ok");
        reportarFalla(new Error("token vencido"), { cron: RUTA, organizationId: ORG_B, provider: "ghl" });
        // Una org que falló en un paso sigue fallida aunque otro la anote ok.
        anotarOrganizacion(ORG_B, "ok");
        return Response.json({ ok: true });
      },
      almacen
    );
    expect(cierres[0]).toMatchObject({
      estado: "parcial",
      orgsProcesadas: 2,
      orgsFallidas: 1,
      organizacionesFallidas: [ORG_B],
    });
  });

  it("la falla de una server action no cuenta como org fallida del cron", async () => {
    const { almacen, cierres } = almacenEnMemoria();
    await conRegistroDeCorrida(
      RUTA,
      async () => {
        anotarOrganizacion(ORG_A, "ok");
        reportarFalla(new Error("x"), { accion: "[algo]", organizationId: ORG_B });
        return Response.json({ ok: true });
      },
      almacen
    );
    expect(cierres[0]).toMatchObject({ estado: "ok", orgsProcesadas: 1, orgsFallidas: 0 });
  });

  it("un id que no es uuid cuenta como fallida pero no va a la columna uuid[]", async () => {
    const { almacen, cierres } = almacenEnMemoria();
    await conRegistroDeCorrida(
      RUTA,
      async () => {
        anotarOrganizacion("no-es-un-uuid", "fallo");
        return Response.json({ ok: true });
      },
      almacen
    );
    expect(cierres[0]).toMatchObject({ estado: "parcial", orgsFallidas: 1, organizacionesFallidas: [] });
  });

  it("registra como fallo un cron que responde 5xx, sin leer su cuerpo", async () => {
    const { almacen, cierres } = almacenEnMemoria();
    const respuesta = await conRegistroDeCorrida(
      RUTA,
      async () => Response.json({ ok: false, error: "clave sk-ant-api03-SECRETO" }, { status: 500 }),
      almacen
    );
    expect(respuesta.status).toBe(500);
    expect(cierres[0]).toMatchObject({ estado: "fallo", error: "El proceso respondió con estado 500" });
    expect(await respuesta.json()).toEqual({ ok: false, error: "clave sk-ant-api03-SECRETO" });
  });

  it("registra como fallo un cron que lanza, con el mensaje saneado, y relanza el mismo error", async () => {
    const { almacen, cierres } = almacenEnMemoria();
    const error = new Error("fetch https://api.x.com/v1?token=abc falló para ana@cliente.com");
    await expect(
      conRegistroDeCorrida(
        RUTA,
        async () => {
          throw error;
        },
        almacen
      )
    ).rejects.toBe(error);
    expect(cierres[0]).toMatchObject({
      estado: "fallo",
      error: "fetch https://api.x.com/v1 falló para [email]",
    });
  });

  it("después de cada cierre borra las corridas del proceso con más de 30 días", async () => {
    const { almacen, cierres, borrados } = almacenEnMemoria();
    const reloj = [new Date("2026-10-07T12:00:00Z"), new Date("2026-10-07T12:00:05Z")];
    await conRegistroDeCorrida(RUTA, async () => Response.json({ ok: true }), almacen, () => reloj.shift()!);
    expect(cierres[0].fin.toISOString()).toBe("2026-10-07T12:00:05.000Z");
    expect(borrados).toEqual([{ proceso: RUTA, antesDe: new Date("2026-09-07T12:00:05.000Z") }]);
  });

  it("dos corridas en paralelo no mezclan sus orgs", async () => {
    const { almacen, cierres } = almacenEnMemoria();
    await Promise.all([
      conRegistroDeCorrida(
        "/api/cron/a",
        async () => {
          await new Promise((r) => setTimeout(r, 5));
          anotarOrganizacion(ORG_A, "fallo");
          return Response.json({});
        },
        almacen
      ),
      conRegistroDeCorrida(
        "/api/cron/b",
        async () => {
          anotarOrganizacion(ORG_C, "ok");
          await new Promise((r) => setTimeout(r, 1));
          return Response.json({});
        },
        almacen
      ),
    ]);
    const porProceso = Object.fromEntries(cierres.map((c) => [c.proceso, c]));
    expect(porProceso["/api/cron/a"]).toMatchObject({ estado: "parcial", organizacionesFallidas: [ORG_A] });
    expect(porProceso["/api/cron/b"]).toMatchObject({ estado: "ok", orgsProcesadas: 1, orgsFallidas: 0 });
  });

  it("anotar fuera de una corrida no hace nada ni lanza", () => {
    expect(() => anotarOrganizacion(ORG_A, "fallo")).not.toThrow();
  });

  describe("⭐ una falla del registro no rompe el cron", () => {
    it("si abrir y cerrar lanzan, el cron corre y devuelve lo suyo", async () => {
      const handler = vi.fn(async () => Response.json({ ok: true, synced: 3 }));
      const almacen: AlmacenDeCorridas = {
        abrir: async () => {
          throw new Error("la base no responde");
        },
        cerrar: async () => {
          throw new Error("la base no responde");
        },
        borrarViejas: async () => {
          throw new Error("la base no responde");
        },
      };
      const respuesta = await conRegistroDeCorrida(RUTA, handler, almacen);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(respuesta.status).toBe(200);
      expect(await respuesta.json()).toEqual({ ok: true, synced: 3 });
    });

    it("si el cron lanza y el registro también, sale el error del cron", async () => {
      const almacen: AlmacenDeCorridas = {
        abrir: async () => null,
        cerrar: async () => {
          throw new Error("del registro");
        },
        borrarViejas: async () => {},
      };
      await expect(
        conRegistroDeCorrida(
          RUTA,
          async () => {
            throw new Error("del cron");
          },
          almacen
        )
      ).rejects.toThrow("del cron");
    });

    it("si la base no responde, cada escritura se corta a los 2 s y el cron sigue", async () => {
      vi.useFakeTimers();
      const handler = vi.fn(async () => Response.json({ ok: true }));
      const almacen: AlmacenDeCorridas = {
        abrir: () => new Promise(() => {}),
        cerrar: () => new Promise(() => {}),
        borrarViejas: () => new Promise(() => {}),
      };
      const corrida = conRegistroDeCorrida(RUTA, handler, almacen);
      await vi.advanceTimersByTimeAsync(PLAZO_DEL_REGISTRO_MS);
      expect(handler).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(2 * PLAZO_DEL_REGISTRO_MS);
      expect((await corrida).status).toBe(200);
    });

    it("sin fila abierta (abrir falló) el cierre inserta la corrida entera", async () => {
      const cierres: CierreDeCorrida[] = [];
      const almacen: AlmacenDeCorridas = {
        abrir: async () => {
          throw new Error("x");
        },
        cerrar: async (cierre) => {
          cierres.push(cierre);
        },
        borrarViejas: async () => {},
      };
      await conRegistroDeCorrida(RUTA, async () => Response.json({}), almacen);
      expect(cierres[0]).toMatchObject({ id: null, proceso: RUTA, estado: "ok" });
    });
  });
});

describe("conMonitorDeCron registra en corridas_de_procesos", () => {
  const SECRETO = "secreto-de-cron-de-prueba";
  const pedido = (auth?: string) =>
    new Request("https://app.test/api/cron/ghl-sync", {
      headers: auth ? { authorization: auth } : {},
    });

  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", SECRETO);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("⭐ abre la fila en en_curso, la cierra con el estado y aplica la retención", async () => {
    let enCursoDuranteElCron: unknown = null;
    const cron = conMonitorDeCron(RUTA, async () => {
      enCursoDuranteElCron = sim.filas[0]?.estado;
      reportarFalla(new Error("token vencido"), { cron: RUTA, organizationId: ORG_A });
      anotarOrganizacion(ORG_B, "ok");
      return Response.json({ ok: true });
    });

    const respuesta = await cron(pedido(`Bearer ${SECRETO}`));

    expect(respuesta.status).toBe(200);
    expect(enCursoDuranteElCron).toBe("en_curso");
    expect(sim.filas).toHaveLength(1);
    expect(sim.filas[0]).toMatchObject({
      proceso: RUTA,
      estado: "parcial",
      orgs_procesadas: 2,
      orgs_fallidas: 1,
      organizaciones_fallidas: [ORG_A],
      error: null,
    });
    expect(typeof sim.filas[0].fin).toBe("string");
    expect(sim.borrados).toEqual([{ proceso: RUTA, antesDe: expect.any(String) }]);
    // El monitor de Sentry sigue igual: el cron respondió bien.
    expect(sim.checkIns.map((c) => c.status)).toEqual(["in_progress", "ok"]);
  });

  it("un pedido sin credencial no es una corrida: no se registra", async () => {
    const cron = conMonitorDeCron(RUTA, async () => Response.json({ error: "Unauthorized" }, { status: 401 }));
    await cron(pedido());
    await cron(pedido("Bearer otro"));
    expect(sim.filas).toHaveLength(0);
  });

  it("si la tabla no existe (migración sin aplicar) el cron corre igual y responde lo suyo", async () => {
    sim.base = "error";
    const cron = conMonitorDeCron(RUTA, async () => Response.json({ ok: true, synced: 1 }));
    const respuesta = await cron(pedido(`Bearer ${SECRETO}`));
    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toEqual({ ok: true, synced: 1 });
    expect(sim.checkIns.map((c) => c.status)).toEqual(["in_progress", "ok"]);
  });

  it("si la base está colgada, el registro no le suma más que sus plazos al cron", async () => {
    vi.useFakeTimers();
    sim.base = "colgada";
    const cron = conMonitorDeCron(RUTA, async () => Response.json({ ok: true }));
    const corrida = cron(pedido(`Bearer ${SECRETO}`));
    await vi.advanceTimersByTimeAsync(3 * PLAZO_DEL_REGISTRO_MS);
    expect((await corrida).status).toBe(200);
  });
});

describe("mensajeDeErrorSaneado", () => {
  it("saca query, emails, tokens y claves, y deja los ids de org", () => {
    const texto = mensajeDeErrorSaneado(
      new Error(
        `GET https://api.ghl.com/v2/x?apiKey=123 org=${ORG_A} user=ana.perez+1@mail.com ` +
          "Authorization: Bearer abc.def.ghi token=xyz123 sk-ant-api03-AAAAAAAAAAAAAAAA " +
          "jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.firma " +
          "hex 0123456789abcdef0123456789abcdef0123"
      )
    );
    expect(texto).toContain("https://api.ghl.com/v2/x");
    expect(texto).toContain(ORG_A);
    for (const sensible of [
      "apiKey=123",
      "ana.perez",
      "abc.def.ghi",
      "xyz123",
      "sk-ant",
      "eyJhbGci",
      "0123456789abcdef0123456789abcdef",
    ]) {
      expect(texto).not.toContain(sensible);
    }
  });

  it("acepta el objeto de error de supabase-js y corta a 300 caracteres", () => {
    expect(mensajeDeErrorSaneado({ message: "permission denied", code: "42501" })).toBe("permission denied");
    const largo = mensajeDeErrorSaneado(new Error("palabra ".repeat(100)));
    expect(largo.length).toBe(300);
    expect(largo.endsWith("…")).toBe(true);
  });
});
