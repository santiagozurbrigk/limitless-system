import { afterEach, describe, expect, it } from "vitest";
import { conZona, restaurarZona } from "@/lib/fechas/__tests__/zona";
import { fechaAInstanteEnZona } from "@/lib/fechas/calendario";
import {
  buildLeadThread,
  isActionable,
  LEAD_THREAD_STATE_LABEL,
  ACTIONABLE_STATES,
  type LeadAttempt,
} from "@/lib/sales/lead-thread";

const NOW = new Date("2026-09-10T12:00:00Z");
/** La zona de la organización. */
const ZONA = "America/Argentina/Buenos_Aires";

/** Días respecto de "ahora". Negativo = pasado. */
function day(offset: number): string {
  return new Date(NOW.getTime() + offset * 24 * 60 * 60 * 1000).toISOString();
}

function attempt(over: Partial<LeadAttempt> = {}): LeadAttempt {
  return {
    id: "a1",
    scheduledAt: day(-3),
    status: "not_closed",
    nextAction: null,
    nextActionAt: null,
    preCallQualification: null,
    postCallQualification: null,
    ...over,
  };
}

describe("la fuga que la Fase 2 viene a tapar", () => {
  it("una llamada que no cerró y sin próximo paso queda marcada como fuga", () => {
    // El lead tuvo su llamada, no compró, y nadie definió qué sigue: quedó sin
    // dueño y sin fecha.
    const thread = buildLeadThread([attempt()], NOW, ZONA);
    expect(thread.state).toBe("stalled");
    expect(thread.actionableAttemptId).toBe("a1");
    expect(isActionable(thread.state)).toBe(true);
  });

  it("un no show sin próximo paso también es una fuga", () => {
    const thread = buildLeadThread([attempt({ status: "no_show" })], NOW, ZONA);
    expect(thread.state).toBe("stalled");
  });

  it("con próximo paso a futuro deja de ser una fuga", () => {
    const thread = buildLeadThread(
      [attempt({ nextAction: "follow_up", nextActionAt: day(3) })],
      NOW,
      ZONA
    );
    expect(thread.state).toBe("follow_up_planned");
    expect(isActionable(thread.state)).toBe(false);
  });
});

describe("trabajo pendiente", () => {
  it("una llamada que ya pasó sin resultado pide que se cargue", () => {
    const thread = buildLeadThread(
      [attempt({ status: "scheduled", scheduledAt: day(-1) })],
      NOW,
      ZONA
    );
    expect(thread.state).toBe("pending_outcome");
    expect(thread.actionableAttemptId).toBe("a1");
  });

  it("un seguimiento vencido pesa más que un resultado sin cargar", () => {
    // Una fecha que pasó es un compromiso incumplido.
    const thread = buildLeadThread(
      [
        attempt({
          id: "vencido",
          status: "not_closed",
          nextAction: "reschedule",
          nextActionAt: day(-2),
        }),
        attempt({ id: "sin-resultado", status: "scheduled", scheduledAt: day(-1) }),
      ],
      NOW,
      ZONA
    );
    expect(thread.state).toBe("follow_up_due");
    expect(thread.actionableAttemptId).toBe("vencido");
  });

  it("una llamada asistida sin resultado también pide desenlace", () => {
    const thread = buildLeadThread(
      [attempt({ status: "attended", scheduledAt: day(-1) })],
      NOW,
      ZONA
    );
    expect(thread.state).toBe("pending_outcome");
  });
});

describe("estados que no piden nada", () => {
  it("un turno futuro está en curso", () => {
    const thread = buildLeadThread(
      [attempt({ status: "scheduled", scheduledAt: day(2) })],
      NOW,
      ZONA
    );
    expect(thread.state).toBe("scheduled");
    expect(thread.actionableAttemptId).toBeNull();
  });

  it("una venta cerrada gana sobre todo lo demás", () => {
    const thread = buildLeadThread(
      [
        attempt({ id: "cerrada", status: "closed", scheduledAt: day(-1) }),
        attempt({ id: "vieja", status: "not_closed", scheduledAt: day(-30) }),
      ],
      NOW,
      ZONA
    );
    expect(thread.state).toBe("won");
    expect(thread.actionableAttemptId).toBeNull();
  });

  it("una cancelada no pide cargar resultado: no hay nada que cargar", () => {
    const thread = buildLeadThread(
      [attempt({ status: "cancelled", nextAction: "reschedule", nextActionAt: day(5) })],
      NOW,
      ZONA
    );
    expect(thread.state).toBe("follow_up_planned");
  });
});

describe("perdido", () => {
  it("se declara desde el intento más reciente", () => {
    const thread = buildLeadThread([attempt({ nextAction: "lost" })], NOW, ZONA);
    expect(thread.state).toBe("lost");
  });

  it("un perdido viejo seguido de un turno nuevo significa que el lead volvió", () => {
    const thread = buildLeadThread(
      [
        attempt({ id: "viejo", scheduledAt: day(-30), nextAction: "lost" }),
        attempt({ id: "nuevo", scheduledAt: day(4), status: "scheduled" }),
      ],
      NOW,
      ZONA
    );
    expect(thread.state).toBe("scheduled");
  });

  it("un próximo paso vencido de tipo `lost` no genera trabajo", () => {
    const thread = buildLeadThread(
      [attempt({ nextAction: "lost", nextActionAt: day(-5) })],
      NOW,
      ZONA
    );
    expect(thread.state).toBe("lost");
  });
});

describe("el hilo", () => {
  it("ordena los intentos del más reciente al más viejo", () => {
    const thread = buildLeadThread(
      [
        attempt({ id: "viejo", scheduledAt: day(-30) }),
        attempt({ id: "nuevo", scheduledAt: day(-1), status: "scheduled" }),
        attempt({ id: "medio", scheduledAt: day(-10) }),
      ],
      NOW,
      ZONA
    );
    expect(thread.attempts.map((a) => a.id)).toEqual(["nuevo", "medio", "viejo"]);
    expect(thread.attemptCount).toBe(3);
  });

  it("una fecha inválida va al final y no desordena el resto", () => {
    const thread = buildLeadThread(
      [
        attempt({ id: "roto", scheduledAt: "vaya-a-saber" }),
        attempt({ id: "sano", scheduledAt: day(-1), status: "scheduled" }),
      ],
      NOW,
      ZONA
    );
    expect(thread.attempts[0]!.id).toBe("sano");
  });

  it("la calificación posterior le gana a la previa", () => {
    const thread = buildLeadThread(
      [attempt({ preCallQualification: "hot", postCallQualification: "cold" })],
      NOW,
      ZONA
    );
    expect(thread.latestQualification).toBe("cold");
  });

  it("sin calificación posterior usa la previa", () => {
    const thread = buildLeadThread([attempt({ preCallQualification: "warm" })], NOW, ZONA);
    expect(thread.latestQualification).toBe("warm");
  });

  it("un lead sin intentos no rompe", () => {
    const thread = buildLeadThread([], NOW, ZONA);
    expect(thread.attemptCount).toBe(0);
    expect(thread.actionableAttemptId).toBeNull();
  });
});

describe("vocabulario", () => {
  it("cada estado tiene etiqueta", () => {
    for (const state of Object.keys(LEAD_THREAD_STATE_LABEL)) {
      expect(LEAD_THREAD_STATE_LABEL[state as keyof typeof LEAD_THREAD_STATE_LABEL]).toBeTruthy();
    }
  });

  it("sólo los tres estados de trabajo son accionables", () => {
    expect(ACTIONABLE_STATES).toHaveLength(3);
    expect(isActionable("won")).toBe(false);
    expect(isActionable("scheduled")).toBe(false);
    expect(isActionable("follow_up_planned")).toBe(false);
    expect(isActionable("lost")).toBe(false);
  });
});

describe("valores de seguimiento propios de la organización", () => {
  // Un valor propio que cierra el hilo tiene que cerrarlo igual que `lost`: si
  // el motor siguiera comparando contra el string `lost`, "Derivado a socio"
  // dejaría al lead dando vueltas en la cola para siempre.
  const CLOSING = ["lost", "derivado_a_socio"];

  it("un próximo paso propio que cierra el hilo lo da por terminado", () => {
    const thread = buildLeadThread(
      [attempt({ nextAction: "derivado_a_socio" })],
      NOW,
      ZONA,
      CLOSING
    );
    expect(thread.state).toBe("lost");
    expect(thread.actionableAttemptId).toBeNull();
  });

  it("un próximo paso propio que pide fecha vence como cualquier otro", () => {
    const thread = buildLeadThread(
      [attempt({ nextAction: "esperando_pago", nextActionAt: day(-1) })],
      NOW,
      ZONA,
      CLOSING
    );
    expect(thread.state).toBe("follow_up_due");
    expect(thread.actionableAttemptId).toBe("a1");
  });

  it("un próximo paso propio con fecha por delante es trabajo agendado", () => {
    const thread = buildLeadThread(
      [attempt({ nextAction: "esperando_pago", nextActionAt: day(4) })],
      NOW,
      ZONA,
      CLOSING
    );
    expect(thread.state).toBe("follow_up_planned");
    expect(isActionable(thread.state)).toBe(false);
  });

  it("sin catálogo propio, sólo `lost` cierra el hilo", () => {
    // Es el default: una organización que nunca creó un valor sigue funcionando
    // exactamente igual que antes, y un slug que no conoce no cierra nada.
    const thread = buildLeadThread(
      [attempt({ nextAction: "derivado_a_socio", nextActionAt: day(-1) })],
      NOW,
      ZONA
    );
    expect(thread.state).toBe("follow_up_due");
  });

  it("un valor que dejó de cerrar el hilo devuelve el lead a la cola", () => {
    // Si la organización archiva su valor y deja de pasarlo como terminal, el
    // lead vuelve a aparecer en vez de quedar escondido como perdido.
    const attempts = [
      attempt({ nextAction: "derivado_a_socio", nextActionAt: day(-1) }),
    ];
    expect(buildLeadThread(attempts, NOW, ZONA, CLOSING).state).toBe("lost");
    expect(buildLeadThread(attempts, NOW, ZONA, ["lost"]).state).toBe("follow_up_due");
  });
});

/**
 * SCRUM-493: el próximo paso es una fecha elegida. Vence el día después de esa
 * fecha en la zona de la organización, no a la hora en que quedó guardado. El
 * servidor corre en UTC, así que el proceso se fija en UTC y los instantes se
 * arman explícitos: con la comparación vieja (instante contra el reloj) estos
 * casos fallan en cualquier máquina.
 */
describe("⭐ el próximo paso vence por día, en la zona de la organización", () => {
  const argentina = "America/Argentina/Buenos_Aires";
  const paso = (nextActionAt: string) =>
    attempt({ nextAction: "follow_up", nextActionAt, scheduledAt: "2026-10-01T15:00:00Z" });

  afterEach(restaurarZona);

  function guardadoEnArgentina(fecha: string): string {
    // Lo que guardan la tabla, el modal y el panel: el mediodía de la zona de la org.
    const valor = fechaAInstanteEnZona(fecha, argentina);
    conZona("UTC");
    return valor;
  }

  it("el día en que vence no está vencido, ni a las 13:00 ni a las 22:00", () => {
    // Lo que guarda la tabla o el modal en Argentina para el 5-oct: 12:00 ART = 15:00 UTC.
    const delCinco = guardadoEnArgentina("2026-10-05");
    // 5-oct 13:00 ART = 16:00 UTC; 5-oct 22:00 ART = 6-oct 01:00 UTC.
    for (const ahora of ["2026-10-05T16:00:00Z", "2026-10-06T01:00:00Z"]) {
      const thread = buildLeadThread([paso(delCinco)], new Date(ahora), argentina);
      expect(thread.state, ahora).toBe("follow_up_planned");
    }
  });

  it("al día siguiente sí está vencido", () => {
    // Lo que guarda la tabla o el modal en Argentina para el 5-oct: 12:00 ART = 15:00 UTC.
    const delCinco = guardadoEnArgentina("2026-10-05");
    // 6-oct 00:30 ART = 6-oct 03:30 UTC.
    const thread = buildLeadThread([paso(delCinco)], new Date("2026-10-06T03:30:00Z"), argentina);
    expect(thread.state).toBe("follow_up_due");
    expect(thread.actionableAttemptId).toBe("a1");
  });

  it("una fila vieja guardada a medianoche UTC se lee con su día", () => {
    conZona("UTC");
    // El seguimiento del lead guardaba el 5-oct como 2026-10-05T00:00:00Z.
    const vieja = paso("2026-10-05T00:00:00+00:00");
    expect(buildLeadThread([vieja], new Date("2026-10-06T01:00:00Z"), argentina).state).toBe(
      "follow_up_planned"
    );
    expect(buildLeadThread([vieja], new Date("2026-10-06T03:30:00Z"), argentina).state).toBe(
      "follow_up_due"
    );
  });

  it("organización sin zona: la de por defecto", () => {
    // Lo que guarda la tabla o el modal en Argentina para el 5-oct: 12:00 ART = 15:00 UTC.
    const delCinco = guardadoEnArgentina("2026-10-05");
    expect(buildLeadThread([paso(delCinco)], new Date("2026-10-06T01:00:00Z"), null).state).toBe(
      "follow_up_planned"
    );
  });
});
