import { describe, expect, it } from "vitest";
import type { FathomMeetingRecord } from "@/lib/fathom/api";
import {
  PLAZO_DE_REINTENTOS_MS,
  SOLAPE_MS,
  TRAMO_MS,
  calcularNuevoCursor,
  fechaDeCreacion,
  inicioDelTramoSiguiente,
  ordenDeLlegada,
  siguienteTramo,
  type LecturaDeVentana,
  type ResultadoDeReunion,
} from "@/lib/fathom/cursor";

/**
 * SCRUM-36 · [FATHOM-SYNC-CURSOR]: el cursor de la sync de Fathom nunca pasa
 * del `created_at` de una reunión que no se guardó, ni de lo que quedó sin leer.
 */

const AHORA = new Date("2026-10-05T12:00:00.000Z");
const ANTERIOR = "2026-10-05T08:00:00.000Z";

function reunion(id: string, createdAt?: string, recordingStart?: string): FathomMeetingRecord {
  return {
    id,
    recording_id: id,
    title: `Reunión ${id}`,
    calendar_invitees: [],
    created_at: createdAt,
    recording_start_time: recordingStart,
  };
}

function menosSolape(iso: string): string {
  return new Date(new Date(iso).getTime() - SOLAPE_MS).toISOString();
}

const COMPLETA: Pick<LecturaDeVentana, "cortada" | "completaHasta" | "tramoCortado"> = {
  cortada: false,
  completaHasta: null,
  tramoCortado: [],
};

function decidir(
  resultados: ResultadoDeReunion[],
  lectura = COMPLETA,
  cursorAnterior: string | null = ANTERIOR
) {
  return calcularNuevoCursor({ cursorAnterior, lectura, resultados, ahora: AHORA });
}

const R1 = reunion("1", "2026-10-05T09:00:00.000Z");
const R2 = reunion("2", "2026-10-05T10:00:00.000Z");
const R3 = reunion("3", "2026-10-05T11:00:00.000Z");

describe("calcularNuevoCursor", () => {
  it("⭐ una falla y otra entra: el cursor no pasa de la que falló", () => {
    const decision = decidir([
      { meeting: R1, guardada: false },
      { meeting: R2, guardada: true },
    ]);
    expect(decision.cursor).toBe(menosSolape(R1.created_at!));
    expect(new Date(decision.cursor!).getTime()).toBeLessThan(
      new Date(R1.created_at!).getTime()
    );
    expect(decision.avanza).toBe(true);
    expect(decision.descartadas).toEqual([]);
  });

  it("la que falló es la más nueva: el cursor queda antes de ella, no en la más nueva guardada", () => {
    const decision = decidir([
      { meeting: R1, guardada: true },
      { meeting: R3, guardada: false },
      { meeting: R2, guardada: true },
    ]);
    expect(decision.cursor).toBe(menosSolape(R3.created_at!));
  });

  it("todas bien: avanza a la más nueva menos el solape", () => {
    const decision = decidir([
      { meeting: R1, guardada: true },
      { meeting: R3, guardada: true },
      { meeting: R2, guardada: true },
    ]);
    expect(decision.cursor).toBe(menosSolape(R3.created_at!));
    expect(decision.motivo).toContain("lectura completa");
  });

  it("⭐ el solape: la corrida siguiente vuelve a pedir lo de los últimos minutos", () => {
    const decision = decidir([{ meeting: R3, guardada: true }]);
    const cursor = new Date(decision.cursor!).getTime();
    expect(new Date(R3.created_at!).getTime() - cursor).toBe(SOLAPE_MS);
  });

  it("todas fallan: no avanza", () => {
    const decision = decidir([
      { meeting: R1, guardada: false },
      { meeting: R2, guardada: false },
    ]);
    // R1 - solape (08:30) es posterior al anterior (08:00): avanza hasta ahí y no más.
    expect(decision.cursor).toBe(menosSolape(R1.created_at!));
    const pegada = reunion("p", "2026-10-05T08:10:00.000Z");
    const otra = decidir([{ meeting: pegada, guardada: false }]);
    expect(otra.avanza).toBe(false);
    expect(otra.cursor).toBe(ANTERIOR);
  });

  it("nunca retrocede", () => {
    const vieja = reunion("v", "2026-10-05T08:05:00.000Z");
    const decision = decidir([{ meeting: vieja, guardada: true }]);
    expect(decision.avanza).toBe(false);
    expect(decision.cursor).toBe(ANTERIOR);
  });

  it("⭐ nada guardado y nada fallado: queda donde estaba, sin usar la hora del servidor", () => {
    const decision = decidir([]);
    expect(decision.avanza).toBe(false);
    expect(decision.cursor).toBe(ANTERIOR);
    expect(decision.trabada).toBe(false);
  });

  it("sin cursor anterior (traer todo) y algo guardado: arranca un cursor", () => {
    const decision = decidir([{ meeting: R2, guardada: true }], COMPLETA, null);
    expect(decision.cursor).toBe(menosSolape(R2.created_at!));
  });

  it("sin cursor anterior y nada leído: sigue sin cursor", () => {
    const decision = decidir([], COMPLETA, null);
    expect(decision.cursor).toBeNull();
    expect(decision.avanza).toBe(false);
  });

  describe("corte por tope de páginas", () => {
    it("⭐ orden descendente: lo que falta es más viejo, no avanza", () => {
      const tramo = [R3, R2];
      const decision = decidir(
        [
          { meeting: R3, guardada: true },
          { meeting: R2, guardada: true },
        ],
        { cortada: true, completaHasta: null, tramoCortado: tramo }
      );
      expect(decision.avanza).toBe(false);
      expect(decision.cursor).toBe(ANTERIOR);
      expect(decision.trabada).toBe(true);
    });

    it("orden ascendente: avanza hasta lo último leído, no más", () => {
      const tramo = [R1, R2];
      const decision = decidir(
        [
          { meeting: R1, guardada: true },
          { meeting: R2, guardada: true },
        ],
        { cortada: true, completaHasta: null, tramoCortado: tramo }
      );
      expect(decision.cursor).toBe(menosSolape(R2.created_at!));
      expect(decision.trabada).toBe(false);
    });

    it("orden ascendente con una falla: frena en la falla", () => {
      const decision = decidir(
        [
          { meeting: R1, guardada: false },
          { meeting: R2, guardada: true },
        ],
        { cortada: true, completaHasta: null, tramoCortado: [R1, R2] }
      );
      expect(decision.cursor).toBe(menosSolape(R1.created_at!));
    });

    it("orden desconocido (una sola reunión): se trata como descendente", () => {
      const decision = decidir([{ meeting: R2, guardada: true }], {
        cortada: true,
        completaHasta: null,
        tramoCortado: [R2],
      });
      expect(decision.avanza).toBe(false);
    });

    it("con tramos cerrados antes del corte: avanza hasta el último tramo completo", () => {
      const completaHasta = "2026-10-05T09:30:00.000Z";
      const decision = decidir(
        [
          { meeting: R1, guardada: true },
          { meeting: R3, guardada: true },
          { meeting: R2, guardada: true },
        ],
        { cortada: true, completaHasta, tramoCortado: [R3, R2] }
      );
      expect(decision.cursor).toBe(menosSolape(completaHasta));
      expect(decision.trabada).toBe(false);
    });

    it("un tramo cerrado sin reuniones también es terreno ganado", () => {
      const completaHasta = "2026-10-05T10:00:00.000Z";
      const decision = decidir([], { cortada: false, completaHasta, tramoCortado: [] });
      expect(decision.cursor).toBe(menosSolape(completaHasta));
    });
  });

  describe("created_at ausente o inválido", () => {
    it("guardada sin created_at: usa el inicio de grabación, que nunca es posterior", () => {
      const sinCreated = reunion("s", undefined, "2026-10-05T10:30:00.000Z");
      const decision = decidir([{ meeting: sinCreated, guardada: true }]);
      expect(decision.cursor).toBe(menosSolape("2026-10-05T10:30:00.000Z"));
    });

    it("created_at ilegible: igual que ausente", () => {
      const ilegible = reunion("i", "ayer a la tarde", "2026-10-05T10:30:00.000Z");
      expect(fechaDeCreacion(ilegible)).toBe(new Date("2026-10-05T10:30:00.000Z").getTime());
    });

    it("guardada sin ninguna fecha: no aporta techo", () => {
      const decision = decidir([{ meeting: reunion("x"), guardada: true }]);
      expect(decision.avanza).toBe(false);
    });

    it("falla sin ninguna fecha: no puede frenar el cursor y se reporta", () => {
      const sinFecha = reunion("x");
      const decision = decidir([
        { meeting: sinFecha, guardada: false },
        { meeting: R2, guardada: true },
      ]);
      expect(decision.sinFecha).toEqual([sinFecha]);
      expect(decision.cursor).toBe(menosSolape(R2.created_at!));
    });
  });

  describe("una reunión que falla siempre", () => {
    const vieja = reunion("corrupta", "2026-10-03T10:00:00.000Z");
    const anteriorFrenado = menosSolape(vieja.created_at!);

    it("⭐ pasado el plazo y si ya frenaba el cursor: se descarta, se reporta y se sigue", () => {
      const decision = calcularNuevoCursor({
        cursorAnterior: anteriorFrenado,
        lectura: COMPLETA,
        resultados: [
          { meeting: vieja, guardada: false },
          { meeting: R2, guardada: true },
        ],
        ahora: AHORA,
      });
      expect(AHORA.getTime() - new Date(vieja.created_at!).getTime()).toBeGreaterThan(
        PLAZO_DE_REINTENTOS_MS
      );
      expect(decision.descartadas).toEqual([vieja]);
      expect(decision.cursor).toBe(menosSolape(R2.created_at!));
    });

    it("dentro del plazo: sigue frenando aunque ya frenaba", () => {
      const reciente = reunion("r", "2026-10-05T09:00:00.000Z");
      const decision = calcularNuevoCursor({
        cursorAnterior: menosSolape(reciente.created_at!),
        lectura: COMPLETA,
        resultados: [
          { meeting: reciente, guardada: false },
          { meeting: R3, guardada: true },
        ],
        ahora: AHORA,
      });
      expect(decision.descartadas).toEqual([]);
      expect(decision.avanza).toBe(false);
    });

    it("vieja pero fallando por primera vez (el cursor venía más atrás): frena, no se descarta", () => {
      const decision = calcularNuevoCursor({
        cursorAnterior: "2026-10-02T00:00:00.000Z",
        lectura: COMPLETA,
        resultados: [
          { meeting: vieja, guardada: false },
          { meeting: R2, guardada: true },
        ],
        ahora: AHORA,
      });
      expect(decision.descartadas).toEqual([]);
      expect(decision.cursor).toBe(anteriorFrenado);
    });
  });
});

describe("ordenDeLlegada", () => {
  it("ascendente, descendente y desconocido", () => {
    expect(ordenDeLlegada([R1, R2, R3])).toBe("ascendente");
    expect(ordenDeLlegada([R3, R2, R1])).toBe("descendente");
    expect(ordenDeLlegada([R2, R1, R3])).toBe("desconocido");
    expect(ordenDeLlegada([R2])).toBe("desconocido");
    expect(ordenDeLlegada([R3, reunion("x"), R1])).toBe("descendente");
  });
});

describe("siguienteTramo", () => {
  it("al día: un solo pedido hasta el presente", () => {
    expect(siguienteTramo(ANTERIOR, AHORA)).toEqual({ desde: ANTERIOR, hasta: null });
  });

  it("⭐ atrasado más de dos tramos: pide un tramo cerrado desde el más viejo", () => {
    const desde = "2026-10-01T00:00:00.000Z";
    const tramo = siguienteTramo(desde, AHORA);
    expect(tramo.desde).toBe(desde);
    expect(new Date(tramo.hasta!).getTime() - new Date(desde).getTime()).toBe(TRAMO_MS);
    expect(AHORA.getTime() - new Date(tramo.hasta!).getTime()).toBeGreaterThan(TRAMO_MS);
  });

  it("sin cursor: sin filtro", () => {
    expect(siguienteTramo(null, AHORA)).toEqual({ desde: null, hasta: null });
  });

  it("los tramos se pisan un segundo", () => {
    expect(inicioDelTramoSiguiente("2026-10-01T06:00:00.000Z")).toBe(
      "2026-10-01T05:59:59.000Z"
    );
  });
});
