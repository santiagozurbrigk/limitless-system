/**
 * SCRUM-542: el valor con estado, fuente y motivo, y cómo se combinan los
 * números que salen de otros.
 */
import { describe, expect, it } from "vitest";
import {
  ESTADOS_DEL_DATO,
  ETIQUETA_DEL_ESTADO,
  conError,
  derivar,
  desactualizado,
  faltaConfigurar,
  medido,
  sinFuente,
  sumar,
  tasa,
  tieneValor,
} from "../dato";

const HOY = "2026-11-01T12:00:00.000Z";
const AYER = "2026-10-31T12:00:00.000Z";

describe("los cinco estados", () => {
  it("son exactamente medido, sin fuente, falta configurar, desactualizado y error", () => {
    expect([...ESTADOS_DEL_DATO]).toEqual([
      "medido",
      "sin_fuente",
      "falta_configurar",
      "desactualizado",
      "error",
    ]);
    expect(Object.values(ETIQUETA_DEL_ESTADO)).toEqual([
      "Medido",
      "Sin fuente",
      "Falta configurar",
      "Desactualizado",
      "Error",
    ]);
  });

  it("sólo medido y desactualizado traen valor; los demás traen motivo y valor null", () => {
    expect(medido(3, "landing", HOY)).toEqual({
      state: "medido",
      value: 3,
      source: "landing",
      reason: null,
      measuredAt: HOY,
    });
    expect(tieneValor(desactualizado(3, "meta_ads", AYER, "viejo"))).toBe(true);
    for (const d of [
      sinFuente("ghl", "no conectado"),
      faltaConfigurar("configuracion", "falta"),
      conError("commas", "falló"),
    ]) {
      expect(d.value).toBeNull();
      expect(d.reason).not.toBe("");
      expect(tieneValor(d)).toBe(false);
    }
  });
});

describe("derivar", () => {
  it("todo medido: calcula, conserva la fuente común y la fecha más vieja", () => {
    const r = sumar([medido(2, "zoom", HOY), medido(5, "zoom", AYER)]);
    expect(r).toEqual(medido(7, "zoom", AYER));
  });

  it("fuentes distintas: la fuente es calculado", () => {
    expect(sumar([medido(1, "zoom", HOY), medido(1, "landing", HOY)]).source).toBe("calculado");
  });

  it("uno desactualizado: calcula igual y queda desactualizado con su motivo", () => {
    const r = sumar([medido(2, "zoom", HOY), desactualizado(5, "zoom", AYER, "hace 3 días")]);
    expect(r).toEqual(desactualizado(7, "zoom", AYER, "hace 3 días"));
  });

  it("uno sin valor: el resultado no tiene valor y lleva el motivo de ese", () => {
    const r = sumar([medido(2, "zoom", HOY), faltaConfigurar("configuracion", "minuto de la oferta")]);
    expect(r.state).toBe("falta_configurar");
    expect(r.value).toBeNull();
    expect(r.reason).toBe("minuto de la oferta");
  });

  it("error tapa a falta configurar, que tapa a sin fuente, que tapa a desactualizado", () => {
    const viejo = desactualizado(1, "meta_ads", AYER, "viejo");
    const sin = sinFuente("ghl", "sin");
    const falta = faltaConfigurar("configuracion", "falta");
    const error = conError("commas", "error");
    expect(sumar([viejo, sin]).state).toBe("sin_fuente");
    expect(sumar([sin, falta, viejo]).state).toBe("falta_configurar");
    expect(sumar([falta, error, sin]).state).toBe("error");
    expect(sumar([error, falta]).reason).toBe("error");
  });

  it("nunca se llama al cálculo si falta un valor (no se inventa un cero)", () => {
    let llamado = false;
    derivar([medido(1, "zoom", HOY), sinFuente("ghl", "x")] as const, () => {
      llamado = true;
      return 0;
    });
    expect(llamado).toBe(false);
  });

  it("sin entradas lanza: es un error de programación", () => {
    expect(() => derivar([], () => 0)).toThrow();
  });
});

describe("tasa", () => {
  it("parte sobre total, con fuente calculado", () => {
    expect(tasa(medido(1, "whop", HOY), medido(4, "landing", HOY))).toEqual(
      medido(0.25, "calculado", HOY)
    );
  });

  it("con cero en el denominador es un valor medido null (se muestra —), no un cero", () => {
    const r = tasa(medido(0, "whop", HOY), medido(0, "zoom", HOY));
    expect(r.state).toBe("medido");
    expect(r.value).toBeNull();
  });

  it("hereda el estado sin valor de una entrada", () => {
    const r = tasa(conError("commas", "falló"), medido(4, "landing", HOY));
    expect(r).toEqual(conError("commas", "falló"));
  });
});
