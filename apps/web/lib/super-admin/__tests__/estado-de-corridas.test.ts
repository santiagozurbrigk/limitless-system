import { describe, expect, it, vi } from "vitest";

/**
 * SCRUM-85 · cómo se ve la última corrida de cada cron en Infraestructura, y de
 * dónde sale (`loadUltimasCorridas`).
 */

const sim = vi.hoisted(() => ({
  filas: {} as Record<string, Record<string, unknown> | null>,
  errorDeLectura: null as { message: string } | null,
  orgsPedidas: [] as string[],
}));

vi.mock("@/lib/auth/require-super-admin", () => ({ requireSuperAdmin: async () => ({}) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(tabla: string) {
      const filtros: Record<string, unknown> = {};
      const builder = {
        select: () => builder,
        order: () => builder,
        limit: () => builder,
        eq(columna: string, valor: unknown) {
          filtros[columna] = valor;
          return builder;
        },
        async in(_columna: string, ids: string[]) {
          sim.orgsPedidas = ids;
          return { data: [{ id: ORG_A, name: "Academia Norte" }], error: null };
        },
        async maybeSingle() {
          expect(tabla).toBe("corridas_de_procesos");
          if (sim.errorDeLectura) return { data: null, error: sim.errorDeLectura };
          return { data: sim.filas[filtros.proceso as string] ?? null, error: null };
        },
      };
      return builder;
    },
  }),
}));
vi.mock("@sentry/nextjs", () => ({}));

import { CORRIDA_SIN_CIERRE_MS, vistaDeCorrida } from "../estado-de-corridas";
import { loadUltimasCorridas } from "../queries";

const ORG_A = "0a000000-0000-4000-8000-000000000001";
const ORG_B = "0b000000-0000-4000-8000-000000000002";
const AHORA = new Date("2026-10-07T12:00:00Z");

const base = {
  inicio: "2026-10-07T11:00:00Z",
  fin: "2026-10-07T11:00:04Z",
  orgsProcesadas: 5,
  orgsFallidas: 0,
  organizacionesFallidas: [],
  error: null,
};

describe("vistaDeCorrida", () => {
  it("sin corridas", () => {
    expect(vistaDeCorrida(null, AHORA)).toEqual({
      tono: "neutro",
      etiqueta: "Sin corridas registradas",
      detalle: null,
    });
  });

  it("ok, con las orgs procesadas o sin detalle si el proceso no las informa", () => {
    expect(vistaDeCorrida({ ...base, estado: "ok" }, AHORA)).toEqual({
      tono: "ok",
      etiqueta: "OK",
      detalle: "5 orgs procesadas",
    });
    expect(
      vistaDeCorrida({ ...base, estado: "ok", orgsProcesadas: null, orgsFallidas: null }, AHORA).detalle
    ).toBeNull();
  });

  it("⭐ parcial nombra las orgs que fallaron", () => {
    const vista = vistaDeCorrida(
      {
        ...base,
        estado: "parcial",
        orgsFallidas: 3,
        organizacionesFallidas: [
          { id: ORG_A, nombre: "Academia Norte" },
          { id: ORG_B, nombre: null },
        ],
      },
      AHORA
    );
    expect(vista).toEqual({
      tono: "aviso",
      etiqueta: "Parcial: 3 de 5 orgs fallaron",
      detalle: `Fallaron: Academia Norte, ${ORG_B}, 1 sin identificar`,
    });
  });

  it("falló, con el mensaje saneado que se guardó", () => {
    expect(
      vistaDeCorrida({ ...base, estado: "fallo", error: "El proceso respondió con estado 500" }, AHORA)
    ).toEqual({ tono: "error", etiqueta: "Falló", detalle: "El proceso respondió con estado 500" });
  });

  it("⭐ en curso hasta 15 min; después, sin cierre (se cortó o quedó colgada)", () => {
    const hace = (ms: number) => new Date(AHORA.getTime() - ms).toISOString();
    expect(
      vistaDeCorrida({ ...base, estado: "en_curso", fin: null, inicio: hace(60_000) }, AHORA).etiqueta
    ).toBe("En curso");
    const cortada = vistaDeCorrida(
      { ...base, estado: "en_curso", fin: null, inicio: hace(CORRIDA_SIN_CIERRE_MS + 1) },
      AHORA
    );
    expect(cortada).toMatchObject({ tono: "error", etiqueta: "Sin cierre" });
  });
});

describe("loadUltimasCorridas", () => {
  it("⭐ una fila por cron de vercel.json, con el nombre de las orgs fallidas", async () => {
    sim.errorDeLectura = null;
    sim.filas = {
      "/api/cron/ghl-sync": {
        estado: "parcial",
        inicio: "2026-10-07T11:00:00Z",
        fin: "2026-10-07T11:00:09Z",
        orgs_procesadas: 4,
        orgs_fallidas: 1,
        organizaciones_fallidas: [ORG_A],
        error: null,
      },
    };
    const corridas = await loadUltimasCorridas();
    expect(corridas.disponible).toBe(true);
    expect(corridas.procesos).toHaveLength(19);
    const ghl = corridas.procesos.find((p) => p.proceso === "/api/cron/ghl-sync");
    expect(ghl).toEqual({
      proceso: "/api/cron/ghl-sync",
      horario: "0 * * * *",
      corrida: {
        estado: "parcial",
        inicio: "2026-10-07T11:00:00Z",
        fin: "2026-10-07T11:00:09Z",
        orgsProcesadas: 4,
        orgsFallidas: 1,
        organizacionesFallidas: [{ id: ORG_A, nombre: "Academia Norte" }],
        error: null,
      },
    });
    expect(sim.orgsPedidas).toEqual([ORG_A]);
    expect(corridas.procesos.filter((p) => p.corrida === null)).toHaveLength(18);
  });

  it("si no se puede leer el registro, lo dice en vez de mostrar estados inventados", async () => {
    sim.errorDeLectura = { message: 'relation "corridas_de_procesos" does not exist' };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const corridas = await loadUltimasCorridas();
    expect(corridas.disponible).toBe(false);
    expect(corridas.procesos.every((p) => p.corrida === null)).toBe(true);
  });
});
