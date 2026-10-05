import { describe, expect, it } from "vitest";
import {
  armarLote,
  diasDeEspera,
  historiasACerrarHasta,
  historiasListasHasta,
  NUNCA,
  proximoIntento,
} from "../cola-de-metricas";

/**
 * SCRUM-172 (reabierta): reglas de la cola del cron de métricas. Espera
 * creciente para las piezas sin dato; las historias se miden una sola vez.
 */

const AHORA = new Date("2026-10-05T03:00:00.000Z");
const HORA = 60 * 60 * 1000;

function haceHoras(horas: number): string {
  return new Date(AHORA.getTime() - horas * HORA).toISOString();
}

describe("diasDeEspera", () => {
  it("⭐ duplica la espera y la corta en 16 días", () => {
    expect([1, 2, 3, 4, 5, 6, 20].map(diasDeEspera)).toEqual([1, 2, 4, 8, 16, 16, 16]);
  });
});

describe("ventana de las historias", () => {
  it("⭐ una historia se puede medir desde las 30 h y se cierra sin pedirla a las 72 h", () => {
    expect(historiasListasHasta(AHORA)).toBe(haceHoras(30));
    expect(historiasACerrarHasta(AHORA)).toBe(haceHoras(72));
  });
});

describe("proximoIntento", () => {
  it("una pieza sin dato espera según sus intentos", () => {
    expect(proximoIntento({ type: "reel" }, 1, AHORA)).toBe("2026-10-06T03:00:00.000Z");
    expect(proximoIntento({ type: "reel" }, 3, AHORA)).toBe("2026-10-09T03:00:00.000Z");
  });

  it("⭐ una historia no se reintenta nunca: se mide una sola vez", () => {
    expect(proximoIntento({ type: "story" }, 1, AHORA)).toBe(NUNCA);
  });
});

describe("armarLote", () => {
  const medidas = Array.from({ length: 60 }, (_, i) => `m${i}`);
  const sinDato = Array.from({ length: 20 }, (_, i) => `s${i}`);

  it("⭐ los reintentos sin dato toman a lo sumo el cupo cuando hay piezas medidas", () => {
    const lote = armarLote(medidas, sinDato, 50);
    expect(lote.filter((x) => x.startsWith("m"))).toHaveLength(40);
    expect(lote.filter((x) => x.startsWith("s"))).toHaveLength(10);
  });

  it("si faltan piezas medidas, los reintentos ocupan lo que sobra", () => {
    expect(armarLote(medidas.slice(0, 5), sinDato, 50)).toHaveLength(25);
  });

  it("sin reintentos, las medidas ocupan todo el lote", () => {
    expect(armarLote(medidas, [], 50)).toHaveLength(50);
  });

  it("sin lugares no arma nada", () => {
    expect(armarLote(medidas, sinDato, 0)).toEqual([]);
  });
});
