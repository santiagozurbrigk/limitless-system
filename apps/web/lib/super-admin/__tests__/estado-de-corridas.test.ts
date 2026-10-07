import { describe, expect, it, vi } from "vitest";

/**
 * SCRUM-85 · cómo se ve la última corrida de cada cron en Infraestructura, y de
 * dónde sale (`loadUltimasCorridas`).
 */

const sim = vi.hoisted(() => ({
  filas: {} as Record<string, Record<string, unknown> | null>,
  errorDeLectura: null as { message: string } | null,
  orgsPedidas: [] as string[],
  superAdmin: true,
  consultas: 0,
  ordenes: [] as { columna: string; opciones: Record<string, unknown> }[],
}));

vi.mock("@/lib/auth/require-super-admin", () => ({
  requireSuperAdmin: async () => {
    if (!sim.superAdmin) throw new Error("Sin permisos de super admin");
    return { id: "u-1", email: "staff@limitless.com" };
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(tabla: string) {
      sim.consultas += 1;
      const filtros: Record<string, unknown> = {};
      const builder = {
        select: () => builder,
        order(columna: string, opciones: Record<string, unknown>) {
          if (filtros.proceso === "/api/cron/ghl-sync") sim.ordenes.push({ columna, opciones });
          return builder;
        },
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

import { AVISO_DE_FAN_OUT, CORRIDA_SIN_CIERRE_MS, vistaDeCorrida } from "../estado-de-corridas";
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
  jobsEncolados: null,
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

  it("⭐ fan-out con todos los jobs publicados: Encolado, nunca OK ni orgs procesadas", () => {
    const vista = vistaDeCorrida({ ...base, estado: "encolado", jobsEncolados: 5 }, AHORA);
    expect(vista).toEqual({ tono: "neutro", etiqueta: "Encolado: 5 jobs encolados", detalle: AVISO_DE_FAN_OUT });
    expect(JSON.stringify(vista)).not.toMatch(/OK|procesada/);
    expect(vistaDeCorrida({ ...base, estado: "encolado", orgsProcesadas: 1, jobsEncolados: 1 }, AHORA).etiqueta).toBe(
      "Encolado: 1 job encolado"
    );
  });

  it("⭐ fan-out parcial: dice qué jobs no se pudieron encolar y que el resto no está confirmado", () => {
    const vista = vistaDeCorrida(
      {
        ...base,
        estado: "parcial",
        orgsFallidas: 1,
        jobsEncolados: 4,
        organizacionesFallidas: [{ id: ORG_A, nombre: "Academia Norte" }],
      },
      AHORA
    );
    expect(vista).toEqual({
      tono: "aviso",
      etiqueta: "Parcial: 1 de 5 jobs no se pudieron encolar",
      detalle: `No se encolaron: Academia Norte. ${AVISO_DE_FAN_OUT}`,
    });
  });

  it("fan-out que falló muestra los jobs encolados, no orgs procesadas", () => {
    expect(
      vistaDeCorrida({ ...base, estado: "fallo", jobsEncolados: 2 }, AHORA).detalle
    ).toBe("2 jobs encolados");
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
  it("⭐ quien no es super admin no lee nada: se rechaza antes de consultar la base", async () => {
    sim.superAdmin = false;
    sim.consultas = 0;
    sim.errorDeLectura = null;
    sim.filas = {};
    await expect(loadUltimasCorridas()).rejects.toThrow("Sin permisos de super admin");
    expect(sim.consultas).toBe(0);
    sim.superAdmin = true;
  });

  it("⭐ una fila por cron de vercel.json, con el nombre de las orgs fallidas", async () => {
    sim.errorDeLectura = null;
    sim.ordenes = [];
    sim.filas = {
      "/api/cron/ghl-sync": {
        estado: "parcial",
        inicio: "2026-10-07T11:00:00Z",
        fin: "2026-10-07T11:00:09Z",
        orgs_procesadas: 4,
        orgs_fallidas: 1,
        organizaciones_fallidas: [ORG_A],
        jobs_encolados: null,
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
        jobsEncolados: null,
        error: null,
      },
    });
    // Con el mismo inicio gana la cerrada: nunca una fila en curso por empate.
    expect(sim.ordenes).toEqual([
      { columna: "inicio", opciones: { ascending: false } },
      { columna: "fin", opciones: { ascending: false, nullsFirst: false } },
    ]);
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
