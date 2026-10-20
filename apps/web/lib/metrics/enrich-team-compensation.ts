import type { ClosingCall } from "@/types/closing";
import type { TeamCompensation } from "@/types/expenses";
import { matchesCloser } from "@/lib/metrics/match-closer";

function isInCurrentMonth(iso: string, now: Date): boolean {
  // Comparar YYYY-MM como string evita el bug UTC-midnight de new Date("YYYY-MM-DD")
  // que en zonas UTC-N reporta el mes anterior para timestamps al inicio del mes.
  const dYearMonth = iso.slice(0, 7);
  const nowYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return dYearMonth === nowYearMonth;
}

/**
 * Estima comisiones del mes desde closing_calls cerradas (por nombre del closer).
 *
 * `ahora` decide "este mes" con sus componentes locales. En el navegador es el
 * reloj de quien mira, como siempre; en el servidor (el Panel y el resumen de
 * Ventas, SCRUM-540) se pasa el día de la organización (`diaLocal(hoy)`), para
 * que el mes no cambie con el reloj UTC del proceso.
 */
export function enrichTeamCompensationWithCommissions(
  team: TeamCompensation[],
  closingCalls: ClosingCall[],
  ahora: Date = new Date()
): TeamCompensation[] {
  const closedThisMonth = closingCalls.filter(
    (c) =>
      c.status === "closed" &&
      c.outcome?.revenue != null &&
      c.outcome.revenue > 0 &&
      isInCurrentMonth(c.scheduledAt, ahora)
  );

  return team.map((member) => {
    const fixed = member.hasFixed ? (member.fixedMonthly ?? 0) : 0;
    let commission = 0;

    if (member.hasCommission && member.commissionPercent != null) {
      const rate = member.commissionPercent / 100;

      if (
        member.commissionBasis === "per_deal" ||
        member.commissionBasis === "custom" ||
        !member.commissionBasis
      ) {
        for (const call of closedThisMonth) {
          // ⭐ La misma regla que usa el cálculo de la liquidación. Antes eran
          // dos reglas distintas y el mismo mes daba dos números.
          if (matchesCloser(member, { closerName: call.closedByName })) {
            commission += (call.outcome?.revenue ?? 0) * rate;
          }
        }
      }
    }

    return {
      ...member,
      estimatedThisMonth: Math.round(fixed + commission),
    };
  });
}
