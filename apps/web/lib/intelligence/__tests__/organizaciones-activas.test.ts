import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCRUM-210 · [CRONS-ORGS-INACTIVAS]: los procesos automáticos de IA corren
 * sólo sobre organizaciones founder activas, nunca sobre una pausada o dada
 * de baja.
 */

const sim = vi.hoisted(() => ({
  filas: [] as Array<{ id: string; account_type: string; status: string; experience?: string }>,
  error: null as { message: string } | null,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(tabla: string) {
      expect(tabla).toBe("organizations");
      const filtros: Array<[string, unknown]> = [];
      const enListas: Array<[string, unknown[]]> = [];
      const builder = {
        select: () => builder,
        eq(columna: string, valor: unknown) {
          filtros.push([columna, valor]);
          return builder;
        },
        in(columna: string, valores: unknown[]) {
          enListas.push([columna, valores]);
          return builder;
        },
        maybeSingle() {
          const data = sim.filas.filter((f) =>
            filtros.every(([c, v]) => (f as Record<string, unknown>)[c] === v)
          );
          return Promise.resolve({ data: sim.error ? null : data[0] ?? null, error: sim.error });
        },
        then(resolver: (r: unknown) => void) {
          const data = sim.filas.filter(
            (f) =>
              filtros.every(([c, v]) => (f as Record<string, unknown>)[c] === v) &&
              enListas.every(([c, vs]) => vs.includes((f as Record<string, unknown>)[c]))
          );
          resolver({ data: sim.error ? null : data, error: sim.error });
        },
      };
      return builder;
    },
  }),
}));

import {
  filtrarOrganizacionesConProcesosDeFondo,
  listActiveOrganizationIds,
  organizacionSigueActiva,
} from "../organizaciones-activas";
import * as generateSnapshot from "../generate-snapshot";

beforeEach(() => {
  sim.error = null;
  sim.filas = [
    { id: "activa", account_type: "founder", status: "active" },
    { id: "pausada", account_type: "founder", status: "paused" },
    { id: "baja", account_type: "founder", status: "churned" },
    { id: "holding", account_type: "holding", status: "active" },
    { id: "webinar", account_type: "founder", status: "active", experience: "webinar" },
    { id: "gestion", account_type: "founder", status: "active", experience: "limitless" },
    { id: "completa", account_type: "founder", status: "active", experience: "full" },
  ];
});

describe("listActiveOrganizationIds", () => {
  it("⭐ sólo devuelve las founder activas: ni pausadas, ni dadas de baja, ni holdings", async () => {
    await expect(listActiveOrganizationIds()).resolves.toEqual(["activa", "gestion", "completa"]);
  });

  it("⭐ SCRUM-525: una cuenta webinar activa no entra; full y limitless siguen", async () => {
    const ids = await listActiveOrganizationIds();
    expect(ids).not.toContain("webinar");
    expect(ids).toContain("completa");
    expect(ids).toContain("gestion");
  });

  it("hay una sola definición: generate-snapshot ya no la reexporta", () => {
    // Los crons y generadores la importan de `organizaciones-activas`; si
    // generate-snapshot volviera a exportar una, podría ser otra copia.
    expect(generateSnapshot).not.toHaveProperty("listActiveOrganizationIds");
  });

  it("si la base falla, el error sube en vez de devolver una lista vacía", async () => {
    sim.error = { message: "fallo de red" };
    await expect(listActiveOrganizationIds()).rejects.toThrow("fallo de red");
  });
});

describe("organizacionSigueActiva (SCRUM-525)", () => {
  it("una webinar activa no se procesa, aunque la haya encolado una corrida manual", async () => {
    await expect(organizacionSigueActiva("webinar")).resolves.toBe(false);
  });

  it("una full o limitless activa sí; una pausada no, como antes", async () => {
    await expect(organizacionSigueActiva("completa")).resolves.toBe(true);
    await expect(organizacionSigueActiva("gestion")).resolves.toBe(true);
    await expect(organizacionSigueActiva("activa")).resolves.toBe(true);
    await expect(organizacionSigueActiva("pausada")).resolves.toBe(false);
  });
});

describe("filtrarOrganizacionesConProcesosDeFondo (SCRUM-525)", () => {
  it("⭐ saca las webinar y las que no existen, sin repetidos y en el orden recibido", async () => {
    await expect(
      filtrarOrganizacionesConProcesosDeFondo(["completa", "webinar", "fantasma", "gestion", "completa"])
    ).resolves.toEqual(["completa", "gestion"]);
  });

  it("con la lista vacía no consulta la base", async () => {
    sim.error = { message: "no debería consultar" };
    await expect(filtrarOrganizacionesConProcesosDeFondo([])).resolves.toEqual([]);
  });

  it("si la base falla, lanza en vez de procesar a ciegas", async () => {
    sim.error = { message: "fallo de red" };
    await expect(filtrarOrganizacionesConProcesosDeFondo(["completa"])).rejects.toThrow("fallo de red");
  });
});
