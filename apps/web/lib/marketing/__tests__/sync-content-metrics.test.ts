/**
 * SCRUM-172 (reabierta): la cola del cron de métricas no se traba ni se diluye
 * con piezas cuyos analytics Zernio nunca reconoce. Las nuevas se miden primero,
 * las que tienen métricas se refrescan antes que los reintentos sin dato, una
 * pieza sin dato espera antes de volver y una historia vencida no vuelve más.
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

/** Condición de PostgREST `col.is.null` o `col.lte."valor"`. */
function condicion(texto: string): (fila: Fila) => boolean {
  const [columna, operador, ...resto] = texto.split(".");
  const valor = resto.join(".").replace(/^"|"$/g, "");
  if (operador === "is" && valor === "null") return (fila) => fila[columna] === null;
  if (operador === "lte") {
    return (fila) => fila[columna] !== null && comparar(fila[columna] as string, valor) <= 0;
  }
  throw new Error(`condición no soportada en el falso: ${texto}`);
}

/** Supabase en memoria: filtra, ordena con NULLS FIRST/LAST y limita como Postgres. */
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const filtros: Array<(fila: Fila) => boolean> = [];
      const ordenes: Array<{ columna: string; asc: boolean; nullsFirst: boolean }> = [];
      const consulta = {
        select: () => consulta,
        eq: (columna: string, valor: unknown) => {
          filtros.push((fila) => fila[columna] === valor);
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
        limit: async (n: number) => {
          let filas = estado.piezas.filter((fila) => filtros.every((f) => f(fila)));
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
          return { data: filas.slice(0, n).map((f) => ({ ...f })), error: null };
        },
        update: (cambios: Record<string, unknown>) => {
          const filtrosUpdate: Array<[string, unknown]> = [];
          const encadenado = {
            eq: (columna: string, valor: unknown) => {
              filtrosUpdate.push([columna, valor]);
              if (filtrosUpdate.length < 2) return encadenado;
              const id = filtrosUpdate.find(([c]) => c === "id")?.[1] as string;
              if (estado.fallaUpdateDe === id) {
                return Promise.resolve({ error: { message: "la base no respondió" } });
              }
              estado.updates.push({ id, cambios });
              for (const fila of estado.piezas) {
                if (filtrosUpdate.every(([c, v]) => fila[c] === v)) Object.assign(fila, cambios);
              }
              return Promise.resolve({ error: null });
            },
          };
          return encadenado;
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
      const respuesta = estado.analytics[postId];
      if (respuesta instanceof Error) throw respuesta;
      return respuesta;
    },
  }),
}));

import { syncContentMetricsForOrg } from "../sync-content-metrics";
import { cambiosParaActualizar, mapExternalPostToRow } from "@/lib/zernio/filas-de-contenido";
import type { ZernioPost } from "@/lib/zernio/client";

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

function buscar(id: string): Pieza {
  return estado.piezas.find((p) => p.id === id) as unknown as Pieza;
}

function intentadas(): string[] {
  return estado.updates.map((u) => u.id);
}

/** Corre el cron en el día `d` (0 = primera corrida) y limpia el registro de updates. */
async function correrCron(d: number, ids?: string[]) {
  dia = d;
  vi.setSystemTime(new Date(ahora()));
  estado.updates = [];
  return syncContentMetricsForOrg("org-1", ids);
}

beforeEach(() => {
  estado.piezas = [];
  estado.updates = [];
  estado.analytics = {};
  estado.fallaUpdateDe = null;
  dia = 0;
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("syncContentMetricsForOrg · la cola no se diluye", () => {
  it("⭐ 100 historias muertas + 50 reels medidos: después de medir las nuevas, los reels se refrescan todos los días", async () => {
    for (let i = 0; i < 100; i++) {
      estado.piezas.push(
        pieza(`historia-${i}`, {
          type: "story",
          published_at: hace(10 * DIA),
          created_at: `2026-09-${String(10 + (i % 20)).padStart(2, "0")}T00:00:00.000Z`,
        })
      );
      estado.analytics[`ig-historia-${i}`] = {};
    }
    for (let i = 0; i < 50; i++) {
      estado.piezas.push(medida(`reel-${i}`, "2026-09-20T00:00:00.000Z"));
      estado.analytics[`ig-reel-${i}`] = { likes: 10 + i };
    }

    const actualizadasPorDia: number[] = [];
    for (let d = 0; d < 6; d++) {
      const r = await correrCron(d);
      actualizadasPorDia.push(r.updated);
    }

    // Días 0 y 1: las 100 historias son nuevas y se miden primero (una vez).
    // Desde el día 2, los 50 reels todos los días (antes: [0,0,50,0,0,50]).
    expect(actualizadasPorDia).toEqual([0, 0, 50, 50, 50, 50]);
    expect(estado.piezas.filter((p) => p.type === "story").every((p) => p.metrics_reintentar_desde === "infinity")).toBe(true);
  });

  it("⭐ una historia de 30 h sin dato se reintenta antes de las 48 h; una de 50 h no se reintenta más", async () => {
    estado.piezas = [
      pieza("joven", { type: "story", published_at: hace(30 * HORA) }),
      pieza("vencida", { type: "story", published_at: hace(50 * HORA) }),
    ];
    estado.analytics = { "ig-joven": {}, "ig-vencida": {} };

    await correrCron(0);
    expect(buscar("joven").metrics_reintentar_desde).toBe(
      new Date(ahora() + 18 * HORA).toISOString()
    );
    expect(buscar("vencida").metrics_reintentar_desde).toBe("infinity");

    // Al día siguiente la joven (ya con 54 h) se reintenta una última vez; la vencida no.
    await correrCron(1);
    expect(intentadas()).toEqual(["joven"]);
    expect(buscar("joven").metrics_reintentar_desde).toBe("infinity");

    await correrCron(2);
    expect(intentadas()).toEqual([]);
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

  it("⭐ una historia con métricas medida pasadas las 48 h no vuelve a ocupar lugares del lote", async () => {
    estado.piezas = [
      medida("historia-vieja", "2026-10-01T00:00:00.000Z", { type: "story", published_at: hace(5 * 24 * HORA) }),
      medida("historia-joven", "2026-10-04T20:00:00.000Z", { type: "story", published_at: hace(20 * HORA) }),
      medida("reel", "2026-10-02T00:00:00.000Z"),
    ];
    estado.analytics = {
      "ig-historia-vieja": { likes: 30 },
      "ig-historia-joven": { likes: 5 },
      "ig-reel": { likes: 9 },
    };

    await correrCron(0);
    expect(intentadas().sort()).toEqual(["historia-joven", "historia-vieja", "reel"]);
    expect(buscar("historia-vieja")).toMatchObject({
      metrics: expect.objectContaining({ likes: 30 }),
      metrics_reintentar_desde: "infinity",
    });
    expect(buscar("historia-joven").metrics_reintentar_desde).toBeNull();

    // Al día siguiente la joven (ya con 44 h) se refresca; la vieja no vuelve.
    await correrCron(1);
    expect(intentadas().sort()).toEqual(["historia-joven", "reel"]);

    // Y cuando la joven se mide pasadas las 48 h, tampoco vuelve.
    await correrCron(2);
    expect(buscar("historia-joven").metrics_reintentar_desde).toBe("infinity");
    await correrCron(3);
    expect(intentadas()).toEqual(["reel"]);
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

  it("si getPostAnalytics lanza con una historia vencida sin métricas, no se reintenta más", async () => {
    estado.piezas = [pieza("historia", { type: "story", published_at: hace(3 * DIA) })];
    estado.analytics = { "ig-historia": new Error("Zernio 429") };

    await correrCron(0);

    expect(buscar("historia").metrics_reintentar_desde).toBe("infinity");
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

  it("con contentPieceIds intenta esas piezas aunque estén esperando", async () => {
    estado.piezas = [
      pieza("a"),
      pieza("b", { metrics_checked_at: hace(HORA), metrics_reintentar_desde: "infinity" }),
      pieza("c"),
    ];
    estado.analytics = { "ig-a": { likes: 1 }, "ig-b": { likes: 2 }, "ig-c": { likes: 3 } };

    const r = await correrCron(0, ["b"]);

    expect(r).toEqual({ attempted: 1, updated: 1, failed: 0 });
    expect(intentadas()).toEqual(["b"]);
    expect(buscar("a").metrics_checked_at).toBeNull();
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
