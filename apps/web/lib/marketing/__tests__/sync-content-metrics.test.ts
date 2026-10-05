/**
 * SCRUM-172 (reabierta): la cola del cron de métricas no se traba ni se diluye
 * con piezas cuyos analytics Zernio nunca reconoce. Las nuevas se miden primero,
 * las que tienen métricas se refrescan antes que los reintentos sin dato, una
 * pieza sin dato espera antes de volver y una historia se mide una sola vez.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

type Pieza = {
  id: string;
  organization_id: string;
  source: string;
  type: string;
  platform_post_id: string | null;
  published_at: string | null;
  created_at: string;
  metrics: unknown;
  metrics_updated_at: string | null;
  metrics_checked_at: string | null;
  metrics_intentos_sin_dato: number;
  metrics_reintentar_desde: string | null;
};

type Fila = Record<string, unknown>;

const estado = vi.hoisted(() => ({
  piezas: [] as Array<Record<string, unknown>>,
  updates: [] as Array<{ id: string; cambios: Record<string, unknown> }>,
  cierres: 0,
  pedidos: [] as string[],
  analytics: {} as Record<string, unknown>,
  fallaUpdateDe: null as string | null,
}));

/** Compara como Postgres: `infinity` es mayor que cualquier fecha. */
function comparar(a: string, b: string): number {
  if (a === b) return 0;
  if (a === "infinity") return 1;
  if (b === "infinity") return -1;
  return a < b ? -1 : 1;
}

/** Condición de PostgREST `col.is.null`, `col.lte."valor"` o `col.neq.valor`. */
function condicion(texto: string): (fila: Fila) => boolean {
  const [columna, operador, ...resto] = texto.split(".");
  const valor = resto.join(".").replace(/^"|"$/g, "");
  if (operador === "is" && valor === "null") return (fila) => fila[columna] === null;
  if (operador === "lte") {
    return (fila) => fila[columna] !== null && comparar(fila[columna] as string, valor) <= 0;
  }
  if (operador === "neq") return (fila) => fila[columna] !== null && fila[columna] !== valor;
  throw new Error(`condición no soportada en el falso: ${texto}`);
}

/**
 * Supabase en memoria: select y update con filtros (eq, neq, is, not, in, or),
 * orden con NULLS FIRST/LAST y límite, como Postgres.
 */
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const filtros: Array<(fila: Fila) => boolean> = [];
      const ordenes: Array<{ columna: string; asc: boolean; nullsFirst: boolean }> = [];
      let limite: number | null = null;
      let cambios: Record<string, unknown> | null = null;
      let idDelUpdate: unknown = null;

      const ejecutar = () => {
        let filas = estado.piezas.filter((fila) => filtros.every((f) => f(fila)));
        if (cambios) {
          if (idDelUpdate !== null) {
            if (estado.fallaUpdateDe === idDelUpdate) {
              return { data: null, error: { message: "la base no respondió" } };
            }
            estado.updates.push({ id: idDelUpdate as string, cambios });
          } else {
            estado.cierres += filas.length;
          }
          for (const fila of filas) Object.assign(fila, cambios);
          return { data: null, error: null };
        }
        for (const { columna, asc, nullsFirst } of [...ordenes].reverse()) {
          filas = [...filas].sort((x, y) => {
            const a = x[columna] as string | null;
            const b = y[columna] as string | null;
            if (a === null && b === null) return 0;
            if (a === null) return nullsFirst ? -1 : 1;
            if (b === null) return nullsFirst ? 1 : -1;
            return asc ? comparar(a, b) : comparar(b, a);
          });
        }
        if (limite !== null) filas = filas.slice(0, limite);
        return { data: filas.map((f) => ({ ...f })), error: null };
      };

      const consulta = {
        select: () => consulta,
        update: (c: Record<string, unknown>) => {
          cambios = c;
          return consulta;
        },
        eq: (columna: string, valor: unknown) => {
          if (columna === "id") idDelUpdate = valor;
          filtros.push((fila) => fila[columna] === valor);
          return consulta;
        },
        lte: (columna: string, valor: string) => {
          filtros.push((fila) => fila[columna] !== null && comparar(fila[columna] as string, valor) <= 0);
          return consulta;
        },
        gt: (columna: string, valor: string) => {
          filtros.push((fila) => fila[columna] !== null && comparar(fila[columna] as string, valor) > 0);
          return consulta;
        },
        neq: (columna: string, valor: unknown) => {
          filtros.push((fila) => fila[columna] !== null && fila[columna] !== valor);
          return consulta;
        },
        is: (columna: string, valor: unknown) => {
          if (valor === null) filtros.push((fila) => fila[columna] === null);
          return consulta;
        },
        not: (columna: string, operador: string, valor: unknown) => {
          if (operador === "is" && valor === null) filtros.push((fila) => fila[columna] !== null);
          return consulta;
        },
        in: (columna: string, valores: unknown[]) => {
          filtros.push((fila) => valores.includes(fila[columna]));
          return consulta;
        },
        or: (expresion: string) => {
          const partes = expresion.split(/,(?=[a-z_]+\.)/).map(condicion);
          filtros.push((fila) => partes.some((p) => p(fila)));
          return consulta;
        },
        order: (columna: string, opciones: { ascending: boolean; nullsFirst?: boolean }) => {
          ordenes.push({
            columna,
            asc: opciones.ascending,
            nullsFirst: opciones.nullsFirst ?? !opciones.ascending,
          });
          return consulta;
        },
        limit: (n: number) => {
          limite = n;
          return consulta;
        },
        then: (resolver: (r: unknown) => unknown, rechazar?: (e: unknown) => unknown) => {
          try {
            return Promise.resolve(resolver(ejecutar()));
          } catch (e) {
            return rechazar ? Promise.resolve(rechazar(e)) : Promise.reject(e);
          }
        },
      };
      return consulta;
    },
  }),
}));

vi.mock("@/lib/zernio/integration", () => ({
  getZernioIntegrationForOrg: async () => ({ id: "int-1" }),
  getZernioClientForOrganization: async () => ({
    getPostAnalytics: async (postId: string) => {
      estado.pedidos.push(postId);
      const respuesta = estado.analytics[postId];
      if (respuesta instanceof Error) throw respuesta;
      return respuesta;
    },
  }),
}));

import { syncContentMetricsForOrg } from "../sync-content-metrics";
import { cambiosParaActualizar, mapExternalPostToRow } from "@/lib/zernio/filas-de-contenido";
import { ZernioHttpError, type ZernioPost } from "@/lib/zernio/client";

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;
/** Primera corrida del cron: 2026-10-05 03:00 UTC. */
const INICIO = Date.UTC(2026, 9, 5, 3, 0, 0);
let dia = 0;

function ahora(): number {
  return INICIO + dia * DIA;
}

function hace(ms: number): string {
  return new Date(ahora() - ms).toISOString();
}

function pieza(id: string, cambios: Partial<Pieza> = {}): Pieza {
  return {
    id,
    organization_id: "org-1",
    source: "zernio",
    type: "reel",
    platform_post_id: `ig-${id}`,
    published_at: "2026-09-01T00:00:00.000Z",
    created_at: "2026-09-01T00:00:00.000Z",
    metrics: null,
    metrics_updated_at: null,
    metrics_checked_at: null,
    metrics_intentos_sin_dato: 0,
    metrics_reintentar_desde: null,
    ...cambios,
  };
}

/** Una pieza ya medida, con su intento en `checkedAt`. */
function medida(id: string, checkedAt: string, cambios: Partial<Pieza> = {}): Pieza {
  return pieza(id, {
    metrics: { likes: 1 },
    metrics_updated_at: checkedAt,
    metrics_checked_at: checkedAt,
    ...cambios,
  });
}

/** Una historia publicada hace `horas`, todavía sin pedir. */
function historia(id: string, horas: number, cambios: Partial<Pieza> = {}): Pieza {
  const publicada = hace(horas * HORA);
  return pieza(id, { type: "story", published_at: publicada, created_at: publicada, ...cambios });
}

function buscar(id: string): Pieza {
  return estado.piezas.find((p) => p.id === id) as unknown as Pieza;
}

function intentadas(): string[] {
  return estado.updates.map((u) => u.id);
}

/** Corre el cron en el día `d` (0 = primera corrida) y limpia los registros. */
async function correrCron(d: number, ids?: string[]) {
  dia = d;
  vi.setSystemTime(new Date(ahora()));
  estado.updates = [];
  estado.pedidos = [];
  estado.cierres = 0;
  return syncContentMetricsForOrg("org-1", ids);
}

beforeEach(() => {
  estado.piezas = [];
  estado.updates = [];
  estado.pedidos = [];
  estado.cierres = 0;
  estado.analytics = {};
  estado.fallaUpdateDe = null;
  dia = 0;
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("syncContentMetricsForOrg · la cola no se diluye", () => {
  it("⭐ 100 historias viejas sin pedir + 50 reels: se cierran sin pedirlas y los reels se refrescan todos los días", async () => {
    for (let i = 0; i < 100; i++) {
      estado.piezas.push(historia(`historia-${i}`, 10 * 24));
      estado.analytics[`ig-historia-${i}`] = {};
    }
    for (let i = 0; i < 50; i++) {
      estado.piezas.push(medida(`reel-${i}`, "2026-09-20T00:00:00.000Z"));
      estado.analytics[`ig-reel-${i}`] = { likes: 10 + i };
    }

    const actualizadasPorDia: number[] = [];
    const pedidosDeHistorias: number[] = [];
    for (let d = 0; d < 6; d++) {
      const r = await correrCron(d);
      actualizadasPorDia.push(r.updated);
      pedidosDeHistorias.push(estado.pedidos.filter((p) => p.startsWith("ig-historia")).length);
    }

    expect(actualizadasPorDia).toEqual([50, 50, 50, 50, 50, 50]);
    expect(pedidosDeHistorias).toEqual([0, 0, 0, 0, 0, 0]);
    expect(
      estado.piezas.filter((p) => p.type === "story").every((p) => p.metrics_reintentar_desde === "infinity")
    ).toBe(true);
  });

  describe.each([5, 8, 15])("⭐ 40 días con 100 reels y %i historias por día", (porDia) => {
    it("cada historia se pide una vez, los reels se refrescan a ritmo estable y la fila no crece", async () => {
      for (let i = 0; i < 100; i++) {
        estado.piezas.push(medida(`reel-${i}`, "2026-09-20T00:00:00.000Z"));
        estado.analytics[`ig-reel-${i}`] = { likes: 1 + i };
      }
      // 5 reels que Zernio nunca mide (reintentos sin dato que no son historias).
      for (let i = 0; i < 5; i++) {
        estado.piezas.push(pieza(`muerto-${i}`));
        estado.analytics[`ig-muerto-${i}`] = {};
      }

      const pedidosPorHistoria = new Map<string, number>();
      const reelsPorDia: number[] = [];
      const historiasPorDia: number[] = [];
      const abiertasPorDia: number[] = [];
      const intentosDeMuertos: number[] = [];
      for (let d = 0; d < 40; d++) {
        dia = d;
        // Historias publicadas a lo largo de las 24 h antes de la corrida; peor
        // caso: Zernio nunca manda sus métricas.
        for (let i = 0; i < porDia; i++) {
          const id = `h-${d}-${i}`;
          estado.piezas.push(historia(id, ((i + 0.5) * 24) / porDia));
          estado.analytics[`ig-${id}`] = {};
        }
        await correrCron(d);
        reelsPorDia.push(estado.pedidos.filter((p) => p.startsWith("ig-reel")).length);
        historiasPorDia.push(estado.pedidos.filter((p) => p.startsWith("ig-h-")).length);
        for (const p of estado.pedidos.filter((x) => x.startsWith("ig-h-"))) {
          pedidosPorHistoria.set(p, (pedidosPorHistoria.get(p) ?? 0) + 1);
        }
        abiertasPorDia.push(
          estado.piezas.filter((p) => p.type === "story" && p.metrics_reintentar_desde !== "infinity").length
        );
        intentosDeMuertos.push(estado.pedidos.filter((p) => p.startsWith("ig-muerto")).length);
      }

      // Cada historia se pidió una sola vez: todas las que en la última corrida
      // tenían 30 h o más, y ninguna más joven.
      expect(Math.max(...pedidosPorHistoria.values())).toBe(1);
      const listas = estado.piezas
        .filter((p) => p.type === "story" && ahora() - new Date(p.published_at as string).getTime() >= 30 * HORA)
        .map((p) => `ig-${p.id}`)
        .sort();
      expect([...pedidosPorHistoria.keys()].sort()).toEqual(listas);
      // Desde el día 2 cada corrida pide exactamente las historias de un día y los
      // reels usan el resto del lote (menos los muertos el día que les toca).
      for (let d = 2; d < 40; d++) {
        expect(historiasPorDia[d]).toBe(porDia);
        expect(reelsPorDia[d]).toBe(50 - porDia - intentosDeMuertos[d]);
      }
      // La fila de historias abiertas no crece: son las de los últimos dos días.
      expect(Math.max(...abiertasPorDia)).toBeLessThanOrEqual(2 * porDia);
      // Los muertos se reintentan con su espera (días 0, 1, 3, 7, 15 y 31), sin demoras.
      const diasConMuertos = intentosDeMuertos.flatMap((n, d) => (n > 0 ? [d] : []));
      expect(diasConMuertos).toEqual([0, 1, 3, 7, 15, 31]);
    });
  });

  it("⭐ una historia entra a la cola a las 30 h, se pide una sola vez y queda cerrada", async () => {
    estado.piezas = [historia("joven", 20), historia("lista", 31)];
    estado.analytics = { "ig-joven": {}, "ig-lista": { likes: 12, reach: 300 } };

    await correrCron(0);
    expect(estado.pedidos).toEqual(["ig-lista"]);
    expect(buscar("lista")).toMatchObject({
      metrics: expect.objectContaining({ likes: 12 }),
      metrics_reintentar_desde: "infinity",
    });

    // Al día siguiente la joven tiene 44 h: se pide una vez, sin dato, y se cierra.
    await correrCron(1);
    expect(estado.pedidos).toEqual(["ig-joven"]);
    expect(buscar("joven")).toMatchObject({ metrics: null, metrics_reintentar_desde: "infinity" });

    await correrCron(2);
    expect(estado.pedidos).toEqual([]);
  });

  it("⭐ cierra sin pedirlas las historias abiertas de más de 7 días o sin fecha", async () => {
    estado.piezas = [
      historia("vieja", 200),
      historia("sin-fecha", 0, { published_at: null }),
      historia("a-tiempo", 50),
      historia("medida-vieja", 170, {
        metrics: { likes: 3 },
        metrics_updated_at: "2026-10-01T00:00:00.000Z",
        metrics_checked_at: "2026-10-01T00:00:00.000Z",
      }),
    ];
    estado.analytics = { "ig-vieja": {}, "ig-sin-fecha": {}, "ig-a-tiempo": {}, "ig-medida-vieja": { likes: 4 } };

    await correrCron(0);

    expect(estado.cierres).toBe(3);
    expect(estado.pedidos).toEqual(["ig-a-tiempo"]);
    for (const id of ["vieja", "sin-fecha", "medida-vieja", "a-tiempo"]) {
      expect(buscar(id).metrics_reintentar_desde).toBe("infinity");
    }
    expect(buscar("medida-vieja").metrics).toEqual({ likes: 3 });
  });

  it("⭐ una historia de 50 h no se pierde si un día el cron no corre", async () => {
    estado.piezas = [historia("h", 50)];
    estado.analytics = { "ig-h": { likes: 8 } };

    // Día 0: el cron no corre. Día 1: la historia tiene 74 h y se pide.
    await correrCron(1);
    expect(estado.pedidos).toEqual(["ig-h"]);
    expect(buscar("h")).toMatchObject({ metrics: expect.objectContaining({ likes: 8 }), metrics_reintentar_desde: "infinity" });
  });

  it("⭐ una historia con 429 no se marca y se pide al día siguiente", async () => {
    estado.piezas = [historia("h", 50)];
    estado.analytics = { "ig-h": new ZernioHttpError("Zernio getPostAnalytics: HTTP 429", 429) };

    const r = await correrCron(0);
    expect(r).toEqual({ attempted: 1, updated: 0, failed: 1 });
    expect(buscar("h")).toMatchObject({ metrics_checked_at: null, metrics_reintentar_desde: null });

    estado.analytics = { "ig-h": { likes: 3 } };
    await correrCron(1);
    expect(estado.pedidos).toEqual(["ig-h"]);
    expect(buscar("h").metrics_reintentar_desde).toBe("infinity");
  });

  it("⭐ dos corridas fallidas seguidas tampoco la pierden; recién a los 7 días se cierra sin pedirla", async () => {
    estado.piezas = [historia("h", 50)];
    estado.analytics = { "ig-h": new ZernioHttpError("Zernio getPostAnalytics: HTTP 429", 429) };

    const pedidaPorDia: boolean[] = [];
    for (let d = 0; d < 6; d++) {
      await correrCron(d);
      pedidaPorDia.push(estado.pedidos.includes("ig-h"));
    }

    // 50, 74, 98, 122 y 146 h: se pide; 170 h: se cierra sin pedirla.
    expect(pedidaPorDia).toEqual([true, true, true, true, true, false]);
    expect(buscar("h").metrics_reintentar_desde).toBe("infinity");
  });

  it("⭐ una historia joven con métricas viejas (backfill) no se pide antes de las 30 h", async () => {
    estado.piezas = [
      historia("joven-medida", 20, {
        metrics: { likes: 2 },
        metrics_updated_at: hace(10 * HORA),
        metrics_checked_at: hace(10 * HORA),
      }),
      medida("reel", "2026-10-01T00:00:00.000Z"),
    ];
    estado.analytics = { "ig-joven-medida": { likes: 5 }, "ig-reel": { likes: 1 } };

    await correrCron(0);
    expect(estado.pedidos).toEqual(["ig-reel"]);

    // Al día siguiente tiene 44 h: se pide una vez y queda cerrada.
    await correrCron(1);
    expect(estado.pedidos).toContain("ig-joven-medida");
    expect(buscar("joven-medida")).toMatchObject({
      metrics: expect.objectContaining({ likes: 5 }),
      metrics_reintentar_desde: "infinity",
    });
  });

  it("⭐ con 200 piezas nuevas, las historias listas entran primero", async () => {
    for (let i = 0; i < 200; i++) {
      estado.piezas.push(pieza(`nueva-${i}`, { created_at: `2026-09-${String(1 + (i % 28)).padStart(2, "0")}T00:00:00.000Z` }));
      estado.analytics[`ig-nueva-${i}`] = { likes: 1 };
    }
    for (let i = 0; i < 3; i++) {
      estado.piezas.push(historia(`historia-${i}`, 40 + i, { created_at: "2026-10-05T00:00:00.000Z" }));
      estado.analytics[`ig-historia-${i}`] = {};
    }

    const r = await correrCron(0);

    expect(r.attempted).toBe(50);
    expect(estado.pedidos.filter((p) => p.startsWith("ig-historia"))).toHaveLength(3);
    expect(estado.pedidos.filter((p) => p.startsWith("ig-nueva"))).toHaveLength(47);
  });

  it("⭐ una pieza sin dato se reintenta recién cuando vence su espera (1, 2, 4 días)", async () => {
    estado.piezas = [pieza("vacia")];
    estado.analytics = { "ig-vacia": {} };

    const intentosPorDia: boolean[] = [];
    for (let d = 0; d < 8; d++) {
      await correrCron(d);
      intentosPorDia.push(intentadas().includes("vacia"));
    }

    // Intentos los días 0, 1, 3 y 7: esperas de 1, 2 y 4 días.
    expect(intentosPorDia).toEqual([true, true, false, true, false, false, false, true]);
    expect(buscar("vacia").metrics_intentos_sin_dato).toBe(4);
    expect(buscar("vacia").metrics).toBeNull();
  });

  it("cuando por fin llegan métricas, se guardan y la pieza vuelve a la cola normal", async () => {
    estado.piezas = [pieza("tardia", { metrics_intentos_sin_dato: 3, metrics_checked_at: hace(5 * DIA), metrics_reintentar_desde: hace(HORA) })];
    estado.analytics = { "ig-tardia": { likes: 7 } };

    const r = await correrCron(0);

    expect(r.updated).toBe(1);
    expect(buscar("tardia")).toMatchObject({
      metrics: expect.objectContaining({ likes: 7 }),
      metrics_intentos_sin_dato: 0,
      metrics_reintentar_desde: null,
    });
  });

  it("⭐ una pieza nueva entra primero aunque haya 60 piezas medidas esperando", async () => {
    for (let i = 0; i < 60; i++) {
      estado.piezas.push(medida(`reel-${i}`, "2026-09-01T00:00:00.000Z"));
      estado.analytics[`ig-reel-${i}`] = { likes: 1 };
    }
    estado.piezas.push(pieza("nueva", { created_at: "2026-10-04T00:00:00.000Z" }));
    estado.analytics["ig-nueva"] = { likes: 3 };

    const r = await correrCron(0);

    expect(r.attempted).toBe(50);
    expect(intentadas()).toContain("nueva");
  });

  it("⭐ las piezas con métricas tienen prioridad: los reintentos sin dato toman a lo sumo 10 lugares", async () => {
    for (let i = 0; i < 60; i++) {
      estado.piezas.push(medida(`reel-${i}`, "2026-09-20T00:00:00.000Z"));
      estado.analytics[`ig-reel-${i}`] = { likes: 1 };
    }
    for (let i = 0; i < 20; i++) {
      // Intentadas antes que los reels y con la espera vencida.
      estado.piezas.push(
        pieza(`vacia-${i}`, { metrics_checked_at: "2026-09-01T00:00:00.000Z", metrics_intentos_sin_dato: 1 })
      );
      estado.analytics[`ig-vacia-${i}`] = {};
    }

    await correrCron(0);

    expect(intentadas().filter((id) => id.startsWith("reel-"))).toHaveLength(40);
    expect(intentadas().filter((id) => id.startsWith("vacia-"))).toHaveLength(10);
  });

  it("si sobran lugares, los reintentos sin dato los ocupan", async () => {
    for (let i = 0; i < 5; i++) {
      estado.piezas.push(medida(`reel-${i}`, "2026-09-20T00:00:00.000Z"));
      estado.analytics[`ig-reel-${i}`] = { likes: 1 };
    }
    for (let i = 0; i < 20; i++) {
      estado.piezas.push(pieza(`vacia-${i}`, { metrics_checked_at: "2026-09-01T00:00:00.000Z" }));
      estado.analytics[`ig-vacia-${i}`] = {};
    }

    const r = await correrCron(0);

    expect(r.attempted).toBe(25);
  });
});

describe("syncContentMetricsForOrg · cada intento", () => {
  it("⭐ toda pieza intentada queda con metrics_checked_at, haya o no dato", async () => {
    estado.piezas = [pieza("con-dato"), pieza("sin-dato"), pieza("lanza")];
    estado.analytics = {
      "ig-con-dato": { likes: 3 },
      "ig-sin-dato": { instagram: {} },
      "ig-lanza": new Error("Zernio 429"),
    };

    await correrCron(0);

    for (const id of ["con-dato", "sin-dato", "lanza"]) {
      expect(buscar(id).metrics_checked_at).toBe(new Date(ahora()).toISOString());
    }
    // Un solo update por pieza.
    expect(intentadas().sort()).toEqual(["con-dato", "lanza", "sin-dato"]);
  });

  it("⭐ una pieza sin dato no pisa metrics ni metrics_updated_at, y suma un intento", async () => {
    estado.piezas = [
      medida("medida", "2026-09-01T00:00:00.000Z", { metrics: { likes: 40, views: 900 } }),
    ];
    estado.analytics = { "ig-medida": {} };

    const r = await correrCron(0);

    expect(r).toEqual({ attempted: 1, updated: 0, failed: 1 });
    expect(estado.updates[0].cambios).toEqual({
      metrics_checked_at: new Date(ahora()).toISOString(),
      metrics_intentos_sin_dato: 1,
      metrics_reintentar_desde: new Date(ahora() + DIA).toISOString(),
    });
    expect(buscar("medida").metrics).toEqual({ likes: 40, views: 900 });
    expect(buscar("medida").metrics_updated_at).toBe("2026-09-01T00:00:00.000Z");
  });

  it("⭐ si getPostAnalytics lanza, marca el intento sin sumar espera y cuenta failed", async () => {
    estado.piezas = [pieza("rota"), pieza("ok")];
    estado.analytics = { "ig-rota": new Error("Zernio 429"), "ig-ok": { likes: 2 } };

    const r = await correrCron(0);

    expect(r).toEqual({ attempted: 2, updated: 1, failed: 1 });
    expect(estado.updates.find((u) => u.id === "rota")?.cambios).toEqual({
      metrics_checked_at: new Date(ahora()).toISOString(),
    });
    expect(buscar("ok").metrics).toMatchObject({ likes: 2 });
  });

  it("⭐ un 404 de Zernio (post borrado) cuenta como sin dato: suma un intento y espera", async () => {
    estado.piezas = [pieza("borrado"), historia("historia-borrada", 40)];
    estado.analytics = {
      "ig-borrado": new ZernioHttpError("Zernio getPostAnalytics: HTTP 404 — not found", 404),
      "ig-historia-borrada": new ZernioHttpError("Zernio getPostAnalytics: HTTP 404 — not found", 404),
    };

    const r = await correrCron(0);

    expect(r).toEqual({ attempted: 2, updated: 0, failed: 2 });
    expect(buscar("borrado")).toMatchObject({
      metrics_intentos_sin_dato: 1,
      metrics_reintentar_desde: new Date(ahora() + DIA).toISOString(),
    });
    expect(buscar("historia-borrada").metrics_reintentar_desde).toBe("infinity");

    // Al día siguiente vuelve (espera de 1 día); al otro, no (espera de 2).
    await correrCron(1);
    expect(estado.pedidos).toEqual(["ig-borrado"]);
    await correrCron(2);
    expect(estado.pedidos).toEqual([]);
  });

  it.each([429, 408, 500, 503])("un HTTP %i es pasajero: marca el intento sin sumar espera", async (status) => {
    estado.piezas = [pieza("pasajero")];
    estado.analytics = { "ig-pasajero": new ZernioHttpError(`Zernio getPostAnalytics: HTTP ${status}`, status) };

    await correrCron(0);

    expect(estado.updates[0].cambios).toEqual({ metrics_checked_at: new Date(ahora()).toISOString() });
  });

  it("si falla el update de una pieza, cuenta como fallo, se loguea y sigue con el resto", async () => {
    estado.piezas = [pieza("a"), pieza("b")];
    estado.analytics = { "ig-a": { likes: 1 }, "ig-b": { likes: 2 } };
    estado.fallaUpdateDe = "a";

    const r = await correrCron(0);

    expect(r).toEqual({ attempted: 2, updated: 1, failed: 1 });
    expect(buscar("b").metrics).toMatchObject({ likes: 2 });
    expect(console.error).toHaveBeenCalledWith(
      "[syncContentMetrics] no se pudo guardar el intento de la pieza",
      expect.objectContaining({ contentPieceId: "a" })
    );
  });

  it("con contentPieceIds intenta esas piezas aunque estén esperando o cerradas", async () => {
    estado.piezas = [
      pieza("a"),
      historia("b", 100, { metrics_checked_at: hace(HORA), metrics_reintentar_desde: "infinity" }),
      pieza("c"),
    ];
    estado.analytics = { "ig-a": { likes: 1 }, "ig-b": { likes: 2 }, "ig-c": { likes: 3 } };

    const r = await correrCron(0, ["b"]);

    expect(r).toEqual({ attempted: 1, updated: 1, failed: 0 });
    expect(intentadas()).toEqual(["b"]);
    expect(buscar("a").metrics_checked_at).toBeNull();
    expect(estado.cierres).toBe(0);
  });

  it("la sync de contenido no toca las columnas de la cola: una pieza nueva entra sin medir", () => {
    const post = { platform: "instagram", platformPostId: "ig-1", postType: "reel", analytics: { likes: 1 } } as ZernioPost;
    const fila = mapExternalPostToRow(post, "org-1", "2026-10-04T12:00:00.000Z")!;
    for (const columna of ["metrics_checked_at", "metrics_intentos_sin_dato", "metrics_reintentar_desde"]) {
      expect(fila).not.toHaveProperty(columna);
      expect(cambiosParaActualizar(fila, null)).not.toHaveProperty(columna);
    }
  });
});
