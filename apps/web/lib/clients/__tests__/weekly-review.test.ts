import { afterEach, describe, expect, it } from "vitest";
import { conZona, restaurarZona } from "@/lib/fechas/__tests__/zona";
import { fechaDeHoyEnZona, sumarDias } from "@/lib/fechas/calendario";
import {
  LEAVING_SOON_DAYS,
  RECENT_WIN_DAYS,
  SILENCE_DAYS,
  buildWeeklyReview,
  hasOverduePayment,
  type WeeklyReviewInput,
} from "@/lib/clients/weekly-review";

/** El día de la organización en que se arma la revisión. */
const HOY = "2026-09-04";

/** Un cliente sin ninguna señal: no tiene que aparecer en ninguna lista. */
function client(overrides: Partial<WeeklyReviewInput> = {}): WeeklyReviewInput {
  return {
    clientId: "cl1",
    name: "Cliente",
    stalled: false,
    overdueDays: null,
    lastWinAt: null,
    measuredDelta: null,
    lastActivityAt: "2026-09-01",
    joinDate: "2026-06-01",
    exitDate: null,
    hasOverduePayment: false,
    ...overrides,
  };
}

describe("un cliente sin señales no aparece en ninguna lista", () => {
  it("las cuatro listas quedan vacías", () => {
    const review = buildWeeklyReview([client()], HOY);
    expect(review.stalled).toHaveLength(0);
    expect(review.aboutToWin).toHaveLength(0);
    expect(review.leavingSoon).toHaveLength(0);
    expect(review.atRisk).toHaveLength(0);
  });
});

describe("1 · quién no se movió", () => {
  it("lista al trabado con sus días de atraso", () => {
    const review = buildWeeklyReview(
      [client({ stalled: true, overdueDays: 12 })],
      HOY
    );
    expect(review.stalled).toHaveLength(1);
    expect(review.stalled[0]!.detail).toContain("12 días");
  });

  it("⭐ trabado sin días de atraso no se lista: no se sabe cuánto", () => {
    const review = buildWeeklyReview(
      [client({ stalled: true, overdueDays: null })],
      HOY
    );
    expect(review.stalled).toHaveLength(0);
  });

  it("el más atrasado va primero", () => {
    const review = buildWeeklyReview(
      [
        client({ clientId: "a", name: "A", stalled: true, overdueDays: 3 }),
        client({ clientId: "b", name: "B", stalled: true, overdueDays: 40 }),
      ],
      HOY
    );
    expect(review.stalled.map((row) => row.name)).toEqual(["B", "A"]);
  });

  it("singular cuando es un solo día", () => {
    const review = buildWeeklyReview(
      [client({ stalled: true, overdueDays: 1 })],
      HOY
    );
    expect(review.stalled[0]!.detail).toContain("1 día de atraso");
  });
});

describe("2 · quién está por tener un resultado", () => {
  it("subió y su último win es reciente", () => {
    const review = buildWeeklyReview(
      [client({ measuredDelta: 2000, lastWinAt: "2026-09-01" })],
      HOY
    );
    expect(review.aboutToWin).toHaveLength(1);
    expect(review.aboutToWin[0]!.detail).toContain("3 días");
  });

  it("⭐ bajar no es estar por tener un resultado", () => {
    const review = buildWeeklyReview(
      [client({ measuredDelta: -500, lastWinAt: "2026-09-01" })],
      HOY
    );
    expect(review.aboutToWin).toHaveLength(0);
  });

  it("⭐ sin medida no entra: no se asume que subió", () => {
    const review = buildWeeklyReview(
      [client({ measuredDelta: null, lastWinAt: "2026-09-01" })],
      HOY
    );
    expect(review.aboutToWin).toHaveLength(0);
  });

  it("un win viejo no cuenta aunque haya subido", () => {
    const old = sumarDias(HOY, -(RECENT_WIN_DAYS + 5));
    const review = buildWeeklyReview(
      [client({ measuredDelta: 2000, lastWinAt: old })],
      HOY
    );
    expect(review.aboutToWin).toHaveLength(0);
  });

  it("el win de hoy se dice 'hoy', no 'hace 0 días'", () => {
    const review = buildWeeklyReview(
      [client({ measuredDelta: 10, lastWinAt: "2026-09-04" })],
      HOY
    );
    expect(review.aboutToWin[0]!.detail).toContain("hoy");
  });
});

describe("3 · quién está cerca del egreso", () => {
  it("entra el que egresa dentro de la ventana", () => {
    const review = buildWeeklyReview([client({ exitDate: "2026-10-01" })], HOY);
    expect(review.leavingSoon).toHaveLength(1);
    expect(review.leavingSoon[0]!.detail).toBe("egresa en 27 días");
  });

  it("no entra el que egresa mucho después", () => {
    const far = sumarDias(HOY, (LEAVING_SOON_DAYS + 10));
    expect(buildWeeklyReview([client({ exitDate: far })], HOY).leavingSoon).toHaveLength(0);
  });

  it("⭐ el que ya egresó y sigue cargado también aparece", () => {
    const review = buildWeeklyReview([client({ exitDate: "2026-08-30" })], HOY);
    expect(review.leavingSoon[0]!.detail).toBe("ya egresó hace 5 días");
  });

  it("sin fecha de egreso no aparece", () => {
    expect(buildWeeklyReview([client({ exitDate: null })], HOY).leavingSoon).toHaveLength(0);
  });

  it("el más próximo va primero", () => {
    const review = buildWeeklyReview(
      [
        client({ clientId: "a", name: "A", exitDate: "2026-10-20" }),
        client({ clientId: "b", name: "B", exitDate: "2026-09-10" }),
      ],
      HOY
    );
    expect(review.leavingSoon.map((row) => row.name)).toEqual(["B", "A"]);
  });
});

describe("4 · quién está en riesgo", () => {
  it("⭐ una sola señal no alcanza: trabado es trabado, no riesgo", () => {
    const review = buildWeeklyReview([client({ stalled: true, overdueDays: 5 })], HOY);
    expect(review.atRisk).toHaveLength(0);
  });

  it("dos señales sí: trabado y con el pago atrasado", () => {
    const review = buildWeeklyReview(
      [client({ stalled: true, overdueDays: 5, hasOverduePayment: true })],
      HOY
    );
    expect(review.atRisk).toHaveLength(1);
    expect(review.atRisk[0]!.detail).toContain("trabado");
    expect(review.atRisk[0]!.detail).toContain("pago atrasado");
  });

  it("el silencio se cuenta desde lo último que pasó", () => {
    const silent = sumarDias(HOY, -(SILENCE_DAYS + 5));
    const review = buildWeeklyReview(
      [client({ lastActivityAt: silent, hasOverduePayment: true })],
      HOY
    );
    expect(review.atRisk[0]!.detail).toContain("sin novedades");
  });

  it("⭐ si nunca pasó nada, el silencio se cuenta desde el alta", () => {
    const review = buildWeeklyReview(
      [
        client({
          lastActivityAt: null,
          joinDate: "2026-01-01",
          hasOverduePayment: true,
        }),
      ],
      HOY
    );
    expect(review.atRisk).toHaveLength(1);
  });

  it("un cliente recién dado de alta y sin actividad no es riesgo", () => {
    const review = buildWeeklyReview(
      [
        client({
          lastActivityAt: null,
          joinDate: "2026-09-02",
          hasOverduePayment: true,
        }),
      ],
      HOY
    );
    expect(review.atRisk).toHaveLength(0);
  });

  it("el de más señales va primero", () => {
    const silent = sumarDias(HOY, -(SILENCE_DAYS + 5));
    const review = buildWeeklyReview(
      [
        client({ clientId: "a", name: "A", stalled: true, hasOverduePayment: true }),
        client({
          clientId: "b",
          name: "B",
          stalled: true,
          hasOverduePayment: true,
          lastActivityAt: silent,
        }),
      ],
      HOY
    );
    expect(review.atRisk.map((row) => row.name)).toEqual(["B", "A"]);
  });
});

describe("una fecha que no se entiende no cuenta como hoy", () => {
  it("no lista al que tiene una fecha de egreso rota", () => {
    const review = buildWeeklyReview([client({ exitDate: "cuando sea" })], HOY);
    expect(review.leavingSoon).toHaveLength(0);
  });
});

/**
 * SCRUM-493: la revisión se arma en el servidor, que corre en UTC. A las 22:00
 * de Argentina UTC ya está en el día siguiente; con el "hoy" de la organización
 * una cuota que vence hoy no está atrasada y un egreso de hoy es "hoy".
 */
describe("⭐ a las 22:00 de Argentina, con el hoy de la organización", () => {
  /** 1-oct-2026, 22:00 en Buenos Aires = 2-oct, 01:00 UTC. */
  const ahora = new Date("2026-10-02T01:00:00Z");

  afterEach(restaurarZona);

  it("una cuota que vence hoy no es pago atrasado; una de ayer sí", () => {
    conZona("UTC");
    const hoy = fechaDeHoyEnZona("America/Argentina/Buenos_Aires", ahora);
    const cuota = (dueDate: string) => ({
      id: dueDate,
      label: "Cuota 2",
      amount: 100,
      status: "pending" as const,
      dueDate,
    });
    expect(hasOverduePayment([cuota("2026-10-01")], hoy)).toBe(false);
    expect(hasOverduePayment([cuota("2026-09-30")], hoy)).toBe(true);
    expect(hasOverduePayment([{ ...cuota("2026-09-30"), status: "paid" as const }], hoy)).toBe(false);
    expect(hasOverduePayment(undefined, hoy)).toBe(false);
  });

  it("el que egresa hoy figura como que egresa hoy", () => {
    conZona("UTC");
    const hoy = fechaDeHoyEnZona("America/Argentina/Buenos_Aires", ahora);
    const review = buildWeeklyReview([client({ exitDate: "2026-10-01" })], hoy);
    expect(review.leavingSoon[0]!.detail).toBe("egresa hoy");
  });
});
