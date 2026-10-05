import { describe, expect, it } from "vitest";
import {
  armarLote,
  diasDeEspera,
  esHistoriaVencida,
  NUNCA,
  proximoIntento,
} from "../cola-de-metricas";

/**
 * SCRUM-172 (reabierta): reglas de la cola del cron de métricas. Espera
 * creciente para las piezas sin dato y fin de reintentos para historias vencidas.
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

describe("esHistoriaVencida", () => {
  it("⭐ una historia vence a las 48 h de publicada", () => {
    expect(esHistoriaVencida({ type: "story", published_at: haceHoras(30) }, AHORA)).toBe(false);
    expect(esHistoriaVencida({ type: "story", published_at: haceHoras(48) }, AHORA)).toBe(true);
    expect(esHistoriaVencida({ type: "story", published_at: haceHoras(50) }, AHORA)).toBe(true);
  });

  it("una historia sin fecha de publicación se da por vencida; un reel nunca vence", () => {
    expect(esHistoriaVencida({ type: "story", published_at: null }, AHORA)).toBe(true);
    expect(esHistoriaVencida({ type: "reel", published_at: haceHoras(5000) }, AHORA)).toBe(false);
  });
});

describe("proximoIntento", () => {
  it("una pieza sin dato espera según sus intentos", () => {
    expect(proximoIntento({ type: "reel" }, 1, AHORA)).toBe("2026-10-06T03:00:00.000Z");
    expect(proximoIntento({ type: "reel" }, 3, AHORA)).toBe("2026-10-09T03:00:00.000Z");
  });

  it("⭐ una historia joven se reintenta a más tardar al cumplir 48 h; una vencida, nunca", () => {
    expect(proximoIntento({ type: "story", published_at: haceHoras(30) }, 1, AHORA)).toBe(
      new Date(AHORA.getTime() + 18 * HORA).toISOString()
    );
    expect(proximoIntento({ type: "story", published_at: haceHoras(10) }, 1, AHORA)).toBe(
      new Date(AHORA.getTime() + 24 * HORA).toISOString()
    );
    expect(proximoIntento({ type: "story", published_at: haceHoras(50) }, 1, AHORA)).toBe(NUNCA);
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
