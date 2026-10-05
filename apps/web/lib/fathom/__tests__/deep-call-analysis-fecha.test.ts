/**
 * SCRUM-493: la fecha de una llamada que se guarda en `linked_calls` es la del
 * día de la organización. Antes salía del día de UTC (con fecha o sin ella).
 */
import { afterEach, describe, expect, it } from "vitest";
import { conZona, restaurarZona } from "@/lib/fechas/__tests__/zona";
import { formatDateLabel } from "../deep-call-analysis";

afterEach(restaurarZona);

describe("⭐ formatDateLabel con la zona de la organización", () => {
  const argentina = "America/Argentina/Buenos_Aires";
  /** 1-oct 22:00 ART = 2-oct 01:00 UTC. */
  const lasVeintidos = new Date("2026-10-02T01:00:00Z");

  it("sin fecha, el hoy de la organización (no el de UTC)", () => {
    conZona("UTC");
    expect(formatDateLabel(null, argentina, lasVeintidos)).toBe("2026-10-01");
    expect(formatDateLabel(undefined, null, lasVeintidos)).toBe("2026-10-01");
    expect(formatDateLabel("no es una fecha", argentina, lasVeintidos)).toBe("2026-10-01");
  });

  it("una llamada de las 22:00 en Argentina queda con ese día", () => {
    conZona("UTC");
    expect(formatDateLabel("2026-10-02T01:00:00Z", argentina)).toBe("2026-10-01");
    expect(formatDateLabel("2026-09-15", argentina)).toBe("2026-09-15");
  });

  it("una llamada de las 21:00 en punto (00:00:00 UTC) es de ese día: es un instante, no una fecha sin hora", () => {
    conZona("UTC");
    // `call_date` sale de `recordingStart ?? scheduledStart`: un turno de las 21:00 ART.
    expect(formatDateLabel("2026-10-02T00:00:00Z", argentina)).toBe("2026-10-01");
    expect(formatDateLabel("2026-10-02T00:00:00.000Z", argentina)).toBe("2026-10-01");
  });
});
