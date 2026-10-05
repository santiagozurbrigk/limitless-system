import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ESTADOS_DE_ORG,
  accionDeEstado,
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

  it("⭐ un valor desconocido se muestra como desconocido (no se inventa un estado), y avisa", () => {
    for (const raro of ["trial", "inactive", "", null, undefined]) {
      expect(estadoDeOrg(raro)).toBe("unknown");
    }
    expect(aviso).toHaveBeenCalledTimes(5);
    expect(ETIQUETA_DE_ESTADO_DE_ORG.unknown).toBe("Desconocido");
  });
});

describe("textos y colores", () => {
  it("cada estado de la base y el desconocido tienen etiqueta y variante, y no hay de más", () => {
    const esperados = [...ESTADOS_DE_ORG, "unknown"].sort();
    expect(Object.keys(ETIQUETA_DE_ESTADO_DE_ORG).sort()).toEqual(esperados);
    expect(Object.keys(VARIANTE_DE_ESTADO_DE_ORG).sort()).toEqual(esperados);
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

describe("accionDeEstado", () => {
  it("una activa se puede pausar; una pausada o dada de baja, activar", () => {
    expect(accionDeEstado("active")).toEqual({ etiqueta: "Pausar", activar: false });
    expect(accionDeEstado("paused")).toEqual({ etiqueta: "Activar", activar: true });
    expect(accionDeEstado("churned")).toEqual({ etiqueta: "Activar", activar: true });
  });

  it("⭐ con estado desconocido no se ofrece ninguna acción", () => {
    expect(accionDeEstado("unknown")).toBeNull();
  });
});
