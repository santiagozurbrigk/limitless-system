import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ESTADOS_DE_ORG,
  ETIQUETA_DE_ESTADO_DE_ORG,
  VARIANTE_DE_ESTADO_DE_ORG,
  estadoDeOrg,
  planPorMrr,
} from "../estado-de-org";

/**
 * Tipos del estado de la organización alineados con la base: el check de
 * `organizations.status` admite `active`, `paused` y `churned`, nada más.
 */

let aviso: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => aviso.mockRestore());

describe("estadoDeOrg", () => {
  it("⭐ los tres estados de la base pasan tal cual", () => {
    expect(estadoDeOrg("active")).toBe("active");
    expect(estadoDeOrg("paused")).toBe("paused");
    expect(estadoDeOrg("churned")).toBe("churned");
    expect(aviso).not.toHaveBeenCalled();
  });

  it("⭐ una org pausada o dada de baja ya no se muestra como 'inactive'", () => {
    expect(estadoDeOrg("paused")).not.toBe("inactive");
    expect(estadoDeOrg("churned")).not.toBe("inactive");
  });

  it("un valor desconocido nunca se muestra como activa, y avisa", () => {
    for (const raro of ["trial", "inactive", "", null, undefined]) {
      expect(estadoDeOrg(raro)).toBe("paused");
    }
    expect(aviso).toHaveBeenCalledTimes(5);
  });
});

describe("textos y colores", () => {
  it("cada estado de la base tiene etiqueta y variante, y no hay de más", () => {
    expect(Object.keys(ETIQUETA_DE_ESTADO_DE_ORG).sort()).toEqual([...ESTADOS_DE_ORG].sort());
    expect(Object.keys(VARIANTE_DE_ESTADO_DE_ORG).sort()).toEqual([...ESTADOS_DE_ORG].sort());
  });

  it("textos claros para pausada y dada de baja", () => {
    expect(ETIQUETA_DE_ESTADO_DE_ORG.paused).toBe("Pausada");
    expect(ETIQUETA_DE_ESTADO_DE_ORG.churned).toBe("Dada de baja");
    expect(VARIANTE_DE_ESTADO_DE_ORG.active).toBe("success");
  });
});

describe("planPorMrr", () => {
  it("estima el plan sólo por MRR (sin rama de trial)", () => {
    expect(planPorMrr(0)).toBe("starter");
    expect(planPorMrr(29999)).toBe("starter");
    expect(planPorMrr(30000)).toBe("growth");
    expect(planPorMrr(50000)).toBe("enterprise");
  });
});
