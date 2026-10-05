/**
 * SCRUM-172 (reabierta): la cola del cron de métricas no se traba con piezas
 * cuyos analytics Zernio nunca reconoce. Cada pieza intentada queda con
 * `metrics_checked_at`, con o sin dato, y pasa al final de la cola.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

type Pieza = {
  id: string;
  organization_id: string;
  source: string;
  platform_post_id: string | null;
  metrics: unknown;
  metrics_updated_at: string | null;
  metrics_checked_at: string | null;
};

const estado = vi.hoisted(() => ({
  piezas: [] as Array<Record<string, unknown>>,
  ordenes: [] as Array<{ columna: string; opciones: unknown }>,
  updates: [] as Array<{ id: string; cambios: Record<string, unknown> }>,
  analytics: {} as Record<string, unknown>,
  fallaUpdateDe: null as string | null,
  reloj: 0,
}));

/** Supabase en memoria: filtra, ordena con NULLS FIRST/LAST y limita como Postgres. */
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const filtros: Array<(fila: Record<string, unknown>) => boolean> = [];
      let orden: { columna: string; asc: boolean; nullsFirst: boolean } | null = null;
      const consulta = {
        select: () => consulta,
        eq: (columna: string, valor: unknown) => {
          filtros.push((fila) => fila[columna] === valor);
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
        order: (columna: string, opciones: { ascending: boolean; nullsFirst: boolean }) => {
          estado.ordenes.push({ columna, opciones });
          orden = { columna, asc: opciones.ascending, nullsFirst: opciones.nullsFirst };
          return consulta;
        },
        limit: async (n: number) => {
          let filas = estado.piezas.filter((fila) => filtros.every((f) => f(fila)));
          if (orden) {
            const { columna, asc, nullsFirst } = orden;
            filas = [...filas].sort((x, y) => {
              const a = x[columna] as string | null;
              const b = y[columna] as string | null;
              if (a === null && b === null) return 0;
              if (a === null) return nullsFirst ? -1 : 1;
              if (b === null) return nullsFirst ? 1 : -1;
              return asc ? a.localeCompare(b) : b.localeCompare(a);
            });
          }
          return {
            data: filas.slice(0, n).map((f) => ({ id: f.id, platform_post_id: f.platform_post_id })),
            error: null,
          };
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

function pieza(id: string, cambios: Partial<Pieza> = {}): Pieza {
  return {
    id,
    organization_id: "org-1",
    source: "zernio",
    platform_post_id: `ig-${id}`,
    metrics: null,
    metrics_updated_at: null,
    metrics_checked_at: null,
    ...cambios,
  };
}

function buscar(id: string): Pieza {
  return estado.piezas.find((p) => p.id === id) as unknown as Pieza;
}

/** Avanza el reloj un día por corrida, como el cron diario. */
async function correrCron(ids?: string[]) {
  estado.reloj += 1;
  vi.setSystemTime(new Date(Date.UTC(2026, 9, 4 + estado.reloj, 3, 0, 0)));
  return syncContentMetricsForOrg("org-1", ids);
}

describe("syncContentMetricsForOrg · cola del cron", () => {
  beforeEach(() => {
    estado.piezas = [];
    estado.ordenes = [];
    estado.updates = [];
    estado.analytics = {};
    estado.fallaUpdateDe = null;
    estado.reloj = 0;
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("⭐ 55 piezas sin dato y 1 real vieja: en a lo sumo 2 corridas la real se actualiza", async () => {
    for (let i = 0; i < 55; i++) {
      estado.piezas.push(pieza(`historia-${i}`));
      estado.analytics[`ig-historia-${i}`] = {};
    }
    estado.piezas.push(
      pieza("real", {
        metrics: { likes: 1 },
        metrics_updated_at: "2026-01-01T00:00:00.000Z",
        metrics_checked_at: "2026-01-01T00:00:00.000Z",
      })
    );
    estado.analytics["ig-real"] = { likes: 99, views: 1200 };

    const primera = await correrCron();
    expect(primera).toEqual({ attempted: 50, updated: 0, failed: 50 });

    const segunda = await correrCron();
    expect(segunda.updated).toBe(1);
    expect(buscar("real").metrics).toMatchObject({ likes: 99, views: 1200 });
    expect(buscar("real").metrics_updated_at).toBe("2026-10-06T03:00:00.000Z");
  });

  it("⭐ toda pieza intentada queda con metrics_checked_at, haya o no dato", async () => {
    estado.piezas = [pieza("con-dato"), pieza("sin-dato"), pieza("lanza")];
    estado.analytics = {
      "ig-con-dato": { likes: 3 },
      "ig-sin-dato": { instagram: {} },
      "ig-lanza": new Error("Zernio 429"),
    };

    await correrCron();

    for (const id of ["con-dato", "sin-dato", "lanza"]) {
      expect(buscar(id).metrics_checked_at).toBe("2026-10-05T03:00:00.000Z");
    }
    // Un solo update por pieza.
    expect(estado.updates.map((u) => u.id).sort()).toEqual(["con-dato", "lanza", "sin-dato"]);
  });

  it("⭐ una pieza sin dato no pisa metrics ni metrics_updated_at", async () => {
    estado.piezas = [
      pieza("medida", {
        metrics: { likes: 40, views: 900 },
        metrics_updated_at: "2026-09-01T00:00:00.000Z",
        metrics_checked_at: "2026-09-01T00:00:00.000Z",
      }),
    ];
    estado.analytics = { "ig-medida": {} };

    const r = await correrCron();

    expect(r).toEqual({ attempted: 1, updated: 0, failed: 1 });
    expect(estado.updates[0].cambios).toEqual({ metrics_checked_at: "2026-10-05T03:00:00.000Z" });
    expect(buscar("medida").metrics).toEqual({ likes: 40, views: 900 });
    expect(buscar("medida").metrics_updated_at).toBe("2026-09-01T00:00:00.000Z");
  });

  it("⭐ si getPostAnalytics lanza, igual marca el intento y cuenta failed", async () => {
    estado.piezas = [pieza("rota"), pieza("ok")];
    estado.analytics = { "ig-rota": new Error("Zernio 429"), "ig-ok": { likes: 2 } };

    const r = await correrCron();

    expect(r).toEqual({ attempted: 2, updated: 1, failed: 1 });
    expect(buscar("rota").metrics_checked_at).toBe("2026-10-05T03:00:00.000Z");
    expect(buscar("rota").metrics).toBeNull();
    expect(buscar("ok").metrics).toMatchObject({ likes: 2 });
  });

  it("⭐ ordena por metrics_checked_at: primero las nunca medidas y después las más viejas", async () => {
    estado.piezas = [
      pieza("reciente", { metrics_checked_at: "2026-10-03T00:00:00.000Z" }),
      pieza("vieja", { metrics_checked_at: "2026-08-01T00:00:00.000Z" }),
      pieza("nueva"),
      pieza("intermedia", { metrics_checked_at: "2026-09-15T00:00:00.000Z" }),
    ];
    for (const p of estado.piezas) estado.analytics[p.platform_post_id as string] = { likes: 1 };

    await correrCron();

    expect(estado.ordenes).toEqual([
      { columna: "metrics_checked_at", opciones: { ascending: true, nullsFirst: true } },
    ]);
    expect(estado.updates.map((u) => u.id)).toEqual(["nueva", "vieja", "intermedia", "reciente"]);
  });

  it("si falla el update de una pieza, cuenta como fallo, se loguea y sigue con el resto", async () => {
    estado.piezas = [pieza("a"), pieza("b")];
    estado.analytics = { "ig-a": { likes: 1 }, "ig-b": { likes: 2 } };
    estado.fallaUpdateDe = "a";

    const r = await correrCron();

    expect(r).toEqual({ attempted: 2, updated: 1, failed: 1 });
    expect(buscar("b").metrics).toMatchObject({ likes: 2 });
    expect(console.error).toHaveBeenCalledWith(
      "[syncContentMetrics] no se pudo guardar el intento de la pieza",
      expect.objectContaining({ contentPieceId: "a" })
    );
  });

  it("con contentPieceIds sólo intenta esas piezas", async () => {
    estado.piezas = [pieza("a"), pieza("b"), pieza("c")];
    estado.analytics = { "ig-a": { likes: 1 }, "ig-b": { likes: 2 }, "ig-c": { likes: 3 } };

    const r = await correrCron(["b"]);

    expect(r).toEqual({ attempted: 1, updated: 1, failed: 0 });
    expect(estado.updates.map((u) => u.id)).toEqual(["b"]);
    expect(buscar("a").metrics_checked_at).toBeNull();
  });

  it("la sync de contenido no toca metrics_checked_at: una pieza nueva entra a la cola sin medir", () => {
    const post = { platform: "instagram", platformPostId: "ig-1", postType: "reel", analytics: { likes: 1 } } as ZernioPost;
    const fila = mapExternalPostToRow(post, "org-1", "2026-10-04T12:00:00.000Z")!;
    expect(fila).not.toHaveProperty("metrics_checked_at");
    expect(cambiosParaActualizar(fila, null)).not.toHaveProperty("metrics_checked_at");
  });
});
