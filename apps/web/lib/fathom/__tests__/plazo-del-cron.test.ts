import { describe, expect, it } from "vitest";
import {
  MARGEN_DESPUES_DE_ESPERAR_MS,
  PLAZO_DEL_CRON_MS,
  cabeLaEspera,
  miembrosPrimero,
  numeroDeCorrida,
  ordenDeLaTanda,
  plazoDeLaCorrida,
  quedaTiempo,
  rotar,
} from "@/lib/fathom/plazo-del-cron";

/** SCRUM-36 · N-1: el plazo de la corrida del cron de Fathom y el orden rotativo. */

describe("plazo de la corrida", () => {
  it("deja margen bajo el maxDuration de 60 s del cron", () => {
    expect(plazoDeLaCorrida(1_000)).toBe(1_000 + PLAZO_DEL_CRON_MS);
    expect(PLAZO_DEL_CRON_MS).toBeLessThanOrEqual(45_000);
  });

  it("sin plazo (sincronización manual) siempre hay tiempo y siempre se puede esperar", () => {
    expect(quedaTiempo(undefined)).toBe(true);
    expect(cabeLaEspera(undefined, 10_000)).toBe(true);
  });

  it("quedaTiempo: hasta el plazo, sin incluirlo", () => {
    expect(quedaTiempo(100, 99)).toBe(true);
    expect(quedaTiempo(100, 100)).toBe(false);
  });

  it("⭐ cabeLaEspera: la espera más el margen para reintentar y guardar tienen que entrar", () => {
    const plazo = 45_000;
    const justo = plazo - 10_000 - MARGEN_DESPUES_DE_ESPERAR_MS;
    expect(cabeLaEspera(plazo, 10_000, justo)).toBe(true);
    expect(cabeLaEspera(plazo, 10_000, justo + 1)).toBe(false);
  });
});

describe("orden rotativo", () => {
  it("⭐ cada conexión pasa por el primer lugar y ninguna queda siempre última", () => {
    const conexiones = ["a", "b", "c", "d"];
    const ultimas = new Set<string>();
    const primeras = new Set<string>();
    for (let corrida = 100; corrida < 104; corrida++) {
      const orden = rotar(conexiones, corrida);
      expect([...orden].sort()).toEqual(conexiones);
      primeras.add(orden[0]);
      ultimas.add(orden[orden.length - 1]);
    }
    expect(primeras.size).toBe(4);
    expect(ultimas.size).toBe(4);
  });

  it("listas cortas y corridas negativas", () => {
    expect(rotar([], 3)).toEqual([]);
    expect(rotar(["x"], 3)).toEqual(["x"]);
    expect(rotar(["a", "b", "c"], -1)).toEqual(["c", "a", "b"]);
  });

  it("las tandas se alternan: los miembros no van siempre después de las orgs", () => {
    const corrida = numeroDeCorrida(Date.parse("2026-10-05T10:00:00Z"));
    expect(numeroDeCorrida(Date.parse("2026-10-05T10:59:59Z"))).toBe(corrida);
    expect(miembrosPrimero(corrida)).not.toBe(miembrosPrimero(corrida + 1));
  });
});

describe("ordenDeLaTanda (N-2)", () => {
  /** Quién arranca primero de toda la corrida, en las corridas en que va primero esa tanda. */
  function primerasDeLaTanda(n: number, tandaPrimera: (corrida: number) => boolean) {
    const conexiones = Array.from({ length: n }, (_, i) => `c${i}`);
    const primeras = new Set<string>();
    // Un ciclo acotado: 2 × n corridas alcanzan.
    for (let corrida = 0; corrida < 2 * n; corrida++) {
      if (tandaPrimera(corrida)) primeras.add(ordenDeLaTanda(conexiones, corrida)[0]);
    }
    return { conexiones, primeras };
  }

  for (const n of [1, 2, 3, 4, 5, 6]) {
    it(`⭐ con ${n} orgs, cada una arranca primera de la corrida dentro de ${2 * n} horas`, () => {
      const { conexiones, primeras } = primerasDeLaTanda(n, (c) => !miembrosPrimero(c));
      expect([...primeras].sort()).toEqual(conexiones);
    });

    it(`⭐ con ${n} miembros, cada uno arranca primero de la corrida dentro de ${2 * n} horas`, () => {
      const { conexiones, primeras } = primerasDeLaTanda(n, (c) => miembrosPrimero(c));
      expect([...primeras].sort()).toEqual(conexiones);
    });
  }

  it("el defecto que corrige: rotar con la misma paridad deja afuera a la de índice impar", () => {
    const arrancan = new Set<string>();
    for (let corrida = 0; corrida < 48; corrida += 2) arrancan.add(rotar(["A", "B"], corrida)[0]);
    expect([...arrancan]).toEqual(["A"]);
  });
});
