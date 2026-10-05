import { afterEach, describe, expect, it } from "vitest";
import { conZona, restaurarZona } from "@/lib/fechas/__tests__/zona";
import { buildJourney } from "@/lib/checkpoints/journey";
import { buildClientProgress } from "@/lib/checkpoints/progress";
import {
  deriveClientJourneyStatus,
  deriveJourneyStatuses,
  formatDueDate,
  formatOverdue,
  groupEventsByClient,
} from "@/lib/checkpoints/stalled";
import { checkpoint, event, stage } from "@/lib/checkpoints/__tests__/fixtures";

const NOW = new Date("2026-09-03T12:00:00Z");
/** La zona de la organización. */
const ZONA = "America/Argentina/Buenos_Aires";
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

// Recorrido: [a (3d), b (14d)] en Onboarding, [c (30d)] en Escala.
const journey = buildJourney(
  [stage({ id: "s1", name: "Onboarding", color: "cat-1", sortOrder: 1 }),
   stage({ id: "s2", name: "Escala", color: "cat-5", sortOrder: 2 })],
  [
    checkpoint({ id: "a", stageId: "s1", name: "Bienvenida", sortOrder: 1, expectedDays: 3 }),
    checkpoint({ id: "b", stageId: "s1", name: "Primer entregable", sortOrder: 2, expectedDays: 14 }),
    checkpoint({ id: "c", stageId: "s2", name: "Cierre", sortOrder: 1, expectedDays: 30 }),
  ]
).stages;

const statusFor = (events: Parameters<typeof buildClientProgress>[1]) =>
  deriveClientJourneyStatus("cl1", buildClientProgress(journey, events), NOW, ZONA);

describe("trabado: el caso que el módulo viene a mostrar", () => {
  it("⭐ el próximo hito venció: trabado, con los días de atraso", () => {
    // 'a' se alcanzó hace 20 días; 'b' tiene plazo de 14 → 6 días de atraso.
    const s = statusFor([event({ checkpointId: "a", reachedAt: daysAgo(20) })]);
    expect(s.stalled).toBe(true);
    expect(s.overdueDays).toBe(6);
    expect(s.nextCheckpointName).toBe("Primer entregable");
  });

  it("dentro del plazo: no trabado, y el número dice cuánto falta", () => {
    const s = statusFor([event({ checkpointId: "a", reachedAt: daysAgo(10) })]);
    expect(s.stalled).toBe(false);
    expect(s.overdueDays).toBe(-4);
  });

  it("justo el día del plazo todavía no está trabado", () => {
    const s = statusFor([event({ checkpointId: "a", reachedAt: daysAgo(14) })]);
    expect(s.overdueDays).toBe(0);
    expect(s.stalled).toBe(false);
  });
});

describe("las tres razones por las que no se puede saber", () => {
  it("1 · recorrido completo: no hay próximo hito", () => {
    const s = statusFor([
      event({ id: "1", checkpointId: "a", reachedAt: daysAgo(60) }),
      event({ id: "2", checkpointId: "b", reachedAt: daysAgo(40) }),
      event({ id: "3", checkpointId: "c", reachedAt: daysAgo(5) }),
    ]);
    expect(s.nextCheckpointId).toBeNull();
    expect(s.overdueDays).toBeNull();
    expect(s.stalled).toBe(false);
    expect(s.reached).toBe(3);
  });

  it("2 · el próximo hito no tiene plazo configurado", () => {
    const sinPlazo = buildJourney(
      [stage({ id: "s1" })],
      [
        checkpoint({ id: "a", stageId: "s1", sortOrder: 1, expectedDays: 3 }),
        checkpoint({ id: "b", stageId: "s1", sortOrder: 2, expectedDays: null }),
      ]
    ).stages;
    const s = deriveClientJourneyStatus(
      "cl1",
      buildClientProgress(sinPlazo, [event({ checkpointId: "a", reachedAt: daysAgo(900) })]),
      NOW,
      ZONA
    );
    expect(s.overdueDays).toBeNull();
    expect(s.stalled).toBe(false);
  });

  it("3 · ⭐ sin ningún hito registrado no hay desde cuándo contar", () => {
    // Es el límite consciente: un cliente que compró y nunca arrancó no aparece
    // como trabado. Anclarlo a la fecha de alta sería otra decisión.
    const s = statusFor([]);
    expect(s.nextCheckpointName).toBe("Bienvenida");
    expect(s.overdueDays).toBeNull();
    expect(s.stalled).toBe(false);
  });

  it("3b · el hito inmediatamente anterior no está registrado: tampoco se cuenta", () => {
    // Alcanzó 'a' y 'c' pero no 'b'. El próximo pendiente es 'b', cuyo anterior
    // ('a') sí está — así que acá sí se puede. El caso sin anterior es el de
    // abajo: próximo 'a', sin anterior por ser el primero.
    const s = statusFor([event({ checkpointId: "c", reachedAt: daysAgo(90) })]);
    expect(s.nextCheckpointName).toBe("Bienvenida");
    expect(s.overdueDays).toBeNull();
    expect(s.stalled).toBe(false);
  });
});

describe("la fase actual", () => {
  it("es la del hito más avanzado, con su nombre y color", () => {
    const s = statusFor([
      event({ id: "1", checkpointId: "a", reachedAt: daysAgo(30) }),
      event({ id: "2", checkpointId: "b", reachedAt: daysAgo(10) }),
    ]);
    expect(s.currentStageName).toBe("Onboarding");
    expect(s.currentStageColor).toBe("cat-1");
  });

  it("⭐ no retrocede por un hito tardío de una fase temprana", () => {
    const s = statusFor([
      event({ id: "viejo", checkpointId: "c", reachedAt: daysAgo(60) }),
      event({ id: "nuevo", checkpointId: "a", reachedAt: daysAgo(1) }),
    ]);
    expect(s.currentStageName).toBe("Escala");
  });

  it("sin hitos no está en ninguna fase", () => {
    expect(statusFor([]).currentStageName).toBeNull();
  });
});

describe("todos los clientes en una pasada", () => {
  it("resuelve cada cliente con sus propios eventos", () => {
    const events = [
      event({ id: "1", clientId: "cl1", checkpointId: "a", reachedAt: daysAgo(20) }),
      event({ id: "2", clientId: "cl2", checkpointId: "a", reachedAt: daysAgo(2) }),
    ];
    const statuses = deriveJourneyStatuses(
      journey,
      groupEventsByClient(events),
      ["cl1", "cl2", "cl3"],
      NOW,
      ZONA
    );
    expect(statuses.get("cl1")?.stalled).toBe(true);
    expect(statuses.get("cl2")?.stalled).toBe(false);
    // Un cliente sin eventos entra igual en el resultado, sin trabar.
    expect(statuses.get("cl3")).toMatchObject({ reached: 0, stalled: false });
  });

  it("agrupa eventos por cliente sin mezclarlos", () => {
    const grouped = groupEventsByClient([
      event({ id: "1", clientId: "cl1" }),
      event({ id: "2", clientId: "cl2" }),
      event({ id: "3", clientId: "cl1" }),
    ]);
    expect(grouped.get("cl1")).toHaveLength(2);
    expect(grouped.get("cl2")).toHaveLength(1);
  });
});

describe("cómo se lee el atraso", () => {
  it("dice los días, en singular y plural", () => {
    expect(formatOverdue(statusFor([event({ checkpointId: "a", reachedAt: daysAgo(15) })])))
      .toBe("trabado hace 1 día");
    expect(formatOverdue(statusFor([event({ checkpointId: "a", reachedAt: daysAgo(20) })])))
      .toBe("trabado hace 6 días");
  });

  it("no dice nada cuando no está trabado", () => {
    expect(formatOverdue(statusFor([]))).toBeNull();
  });
});

describe("⭐ el progreso de la fase actual — el \"3 de 4\" de la tabla", () => {
  it("cuenta sólo los hitos de la fase donde está parado", () => {
    // Onboarding tiene dos hitos (a, b). Alcanzó 'a' → 1 de 2.
    const s = statusFor([event({ checkpointId: "a", reachedAt: daysAgo(2) })]);
    expect(s.currentStageName).toBe("Onboarding");
    expect(s.stageReached).toBe(1);
    expect(s.stageTotal).toBe(2);
  });

  it("⭐ no se confunde con el progreso del recorrido entero", () => {
    // Dos de tres hitos del recorrido, pero dos de dos de su fase.
    const s = statusFor([
      event({ id: "1", checkpointId: "a", reachedAt: daysAgo(30) }),
      event({ id: "2", checkpointId: "b", reachedAt: daysAgo(10) }),
    ]);
    expect(s.reached).toBe(2);
    expect(s.total).toBe(3);
    expect(s.stageReached).toBe(2);
    expect(s.stageTotal).toBe(2);
  });

  it("⭐ una fase completa muestra 4 de 4, no el 0 de la siguiente", () => {
    // Cerró Onboarding entero y no arrancó Escala. La fila dice "Onboarding,
    // 2 de 2" y la próxima tarea dice qué sigue. Contar la fase del próximo
    // hito pendiente haría que la fila se contradijera sola.
    const s = statusFor([
      event({ id: "1", checkpointId: "a", reachedAt: daysAgo(30) }),
      event({ id: "2", checkpointId: "b", reachedAt: daysAgo(10) }),
    ]);
    expect(s.currentStageName).toBe("Onboarding");
    expect(s.nextCheckpointName).toBe("Cierre");
    expect(`${s.stageReached} de ${s.stageTotal}`).toBe("2 de 2");
  });

  it("⭐ sin ningún hito alcanzado no cuenta nada", () => {
    // Sin fase actual no hay qué contar. Mostrar "0 de 2" de la primera fase
    // haría parecer que arrancó el recorrido.
    const s = statusFor([]);
    expect(s.currentStageName).toBeNull();
    expect(s.stageReached).toBe(0);
    expect(s.stageTotal).toBe(0);
  });

  it("sigue al cliente cuando cambia de fase", () => {
    const s = statusFor([
      event({ id: "1", checkpointId: "a", reachedAt: daysAgo(40) }),
      event({ id: "2", checkpointId: "b", reachedAt: daysAgo(30) }),
      event({ id: "3", checkpointId: "c", reachedAt: daysAgo(5) }),
    ]);
    expect(s.currentStageName).toBe("Escala");
    expect(s.stageReached).toBe(1);
    expect(s.stageTotal).toBe(1);
  });
});

describe("⭐ la fecha límite del próximo hito", () => {
  it("es el hito anterior más su plazo", () => {
    // 'a' alcanzado el 2026-08-14 (20 días antes del NOW), 'b' con plazo de 14
    // días → vence el 2026-08-28.
    const s = statusFor([event({ checkpointId: "a", reachedAt: daysAgo(20) })]);
    expect(s.nextCheckpointDueAt).toBe("2026-08-28");
  });

  it("⭐ concuerda siempre con el atraso: si venció, está atrasado", () => {
    const atrasado = statusFor([event({ checkpointId: "a", reachedAt: daysAgo(20) })]);
    expect(atrasado.overdueDays).toBe(6);
    expect(atrasado.nextCheckpointDueAt! < "2026-09-03").toBe(true);

    const aTiempo = statusFor([event({ checkpointId: "a", reachedAt: daysAgo(10) })]);
    expect(aTiempo.overdueDays).toBe(-4);
    expect(aTiempo.nextCheckpointDueAt! > "2026-09-03").toBe(true);
  });

  it("las tres razones que dejan el atraso en null dejan la fecha en null", () => {
    // 1 · recorrido completo
    const completo = statusFor([
      event({ id: "1", checkpointId: "a", reachedAt: daysAgo(60) }),
      event({ id: "2", checkpointId: "b", reachedAt: daysAgo(40) }),
      event({ id: "3", checkpointId: "c", reachedAt: daysAgo(5) }),
    ]);
    expect(completo.nextCheckpointDueAt).toBeNull();

    // 3 · sin hito anterior registrado
    const sinArrancar = statusFor([]);
    expect(sinArrancar.nextCheckpointDueAt).toBeNull();
    expect(sinArrancar.overdueDays).toBeNull();
  });

  it("2 · sin plazo configurado no hay fecha que calcular", () => {
    const sinPlazo = buildJourney(
      [stage({ id: "s1" })],
      [
        checkpoint({ id: "a", stageId: "s1", sortOrder: 1, expectedDays: 3 }),
        checkpoint({ id: "b", stageId: "s1", sortOrder: 2, expectedDays: null }),
      ]
    ).stages;
    const s = deriveClientJourneyStatus(
      "cl1",
      buildClientProgress(sinPlazo, [event({ checkpointId: "a", reachedAt: daysAgo(900) })]),
      NOW,
      ZONA
    );
    expect(s.nextCheckpointDueAt).toBeNull();
  });
});

describe("cómo se lee la fecha límite", () => {
  it("la escribe en el orden que se lee en es-AR", () => {
    const s = statusFor([event({ checkpointId: "a", reachedAt: daysAgo(20) })]);
    expect(formatDueDate(s)).toBe("28/08/2026");
  });

  it("⭐ no corre el día por zona horaria", () => {
    // `new Date("2026-08-28").toLocaleDateString("es-AR")` daría 27/08 en
    // Buenos Aires. Por eso la cadena se parte a mano.
    const s = statusFor([event({ checkpointId: "a", reachedAt: daysAgo(20) })]);
    expect(formatDueDate(s)).toContain("28");
  });

  it("no dice nada cuando no se puede saber", () => {
    expect(formatDueDate(statusFor([]))).toBeNull();
  });
});

/**
 * SCRUM-493: "vence el" del próximo hito y "trabado hace N días" se cuentan en
 * días calendario de la zona de la organización. Antes la fecha límite era el
 * instante del hito anterior más el plazo, cortado en UTC: un hito registrado
 * a las 22:00 de Argentina corría un día el vencimiento.
 */
describe("⭐ fecha límite del próximo hito en la zona de la organización", () => {
  afterEach(restaurarZona);

  it("un hito alcanzado a las 22:00 de Argentina vence contando desde ese día", () => {
    conZona("UTC");
    // 'a' alcanzado el 20-ago a las 22:00 ART (21-ago 01:00 UTC, un instante real);
    // 'b' tiene 14 días de plazo: vence el 3-sep.
    const progress = buildClientProgress(journey, [
      event({ checkpointId: "a", reachedAt: "2026-08-21T01:00:00.000Z" }),
    ]);
    // 3-sep 22:00 ART = 4-sep 01:00 UTC: vence hoy, todavía no está trabado.
    const hoy = deriveClientJourneyStatus("cl1", progress, new Date("2026-09-04T01:00:00Z"), ZONA);
    expect(hoy.nextCheckpointDueAt).toBe("2026-09-03");
    expect(hoy.overdueDays).toBe(0);
    expect(hoy.stalled).toBe(false);
    // 4-sep a la tarde en Argentina: 1 día de atraso.
    const manana = deriveClientJourneyStatus("cl1", progress, new Date("2026-09-04T18:00:00Z"), ZONA);
    expect(manana.overdueDays).toBe(1);
    expect(manana.stalled).toBe(true);
  });
});
