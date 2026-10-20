"use server";

import {
  isMissingTableError,
  requireOrganizationId,
  tryRequireOrganizationId,
  getCurrentProfile,
} from "@/lib/auth/bootstrap";
import {
  mutacionConErroresEsperables,
  registrarFallaDeAccion,
  runMutation,
  type MutationResult,
} from "@/lib/server/action-result";
import {
  rowToFixedExpense,
  rowToPaymentPlatform,
  rowToSubscription,
  rowToTeamCompensation,
  type FixedExpenseRow,
  type PaymentPlatformRow,
  type SubscriptionRow,
  type TeamCompensationRow,
} from "@/lib/expenses/mapper";
import { createClient } from "@/lib/supabase/server";
import {
  puedeLeerDelMarcoEnElServidor,
  rechazoDeLecturaDelMarco,
  type RechazoPorModulo,
} from "@/lib/auth/acceso-a-modulo";
import { fechaDeHoyDeLaOrganizacion } from "@/lib/fechas/organizacion";
import {
  EMPTY_FINANCE_CONFIG,
  leerConfiguracionDeFinanzas,
  leerEntradasDelResumen,
  paymentPlatformTotals,
  type FinanceConfigPayload,
} from "@/lib/finance/leer-configuracion";
import {
  calcularResumenFinanciero,
  resumenParaVentas,
  type ResumenFinanciero,
} from "@/lib/finance/resumen-financiero";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { leerPagosDeLaOrganizacion } from "@/lib/sales/pagos";
import type { ClientPayment } from "@/types/clients";
import { matchesCloser } from "@/lib/metrics/match-closer";
import type {
  FixedExpense,
  Subscription,
  TeamCompensation,
} from "@/types/expenses";
import type { PaymentPlatformConfig } from "@/types/finance";

export type { MutationResult };
export type { FinanceConfigPayload } from "@/lib/finance/leer-configuracion";
export type { ResumenFinanciero } from "@/lib/finance/resumen-financiero";

function mapFinanceError(msg: string): string {
  if (isMissingTableError(msg)) {
    return "Faltan tablas de gastos. Ejecuta supabase/migrations/20260521800000_finance_expenses.sql en Supabase.";
  }
  return msg;
}

async function requireFounderRole(): Promise<void> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "founder") {
    throw new Error("Solo el founder puede gestionar plataformas de pago");
  }
}


async function configDeDemostracion(): Promise<FinanceConfigPayload> {
  const { mockFixedExpenses, mockSubscriptions, mockTeamCompensation } =
    await import("@/mocks/expenses");
  const { mockPaymentPlatforms } = await import("@/mocks/finance");
  return {
    fixedExpenses: mockFixedExpenses.map((e) => ({ ...e })),
    subscriptions: mockSubscriptions.map((s) => ({ ...s })),
    teamCompensation: mockTeamCompensation.map((t) => ({ ...t })),
    paymentPlatforms: mockPaymentPlatforms.map((p) => ({ ...p })),
    pagosSinLeer: false,
  };
}

/**
 * La configuración de Finanzas que pide el provider del marco en toda pantalla.
 *
 * ⭐ Por partes según el rol (SCRUM-540, mínimo privilegio):
 *   - con Finanzas (`detalleDeFinanzas`): gastos fijos, suscripciones, sueldos
 *     y comisiones por persona, y las plataformas con lo cobrado y la fecha del
 *     último cobro, como siempre;
 *   - con Ventas o Ajustes y sin Finanzas (`plataformasDePago`): sólo las
 *     plataformas, con nombre, clave, moneda y etiqueta; lo cobrado va en 0 y
 *     la fecha vacía, y no se leen gastos, suscripciones, sueldos ni cobros.
 *     Los totales que muestra Ventas llegan por `getResumenFinancieroAction`;
 *   - sin ninguno, el rechazo.
 */
export async function loadFinanceConfigAction(): Promise<
  FinanceConfigPayload | RechazoPorModulo
> {
  if (!isSupabaseConfigured()) return configDeDemostracion();

  const rechazo = await rechazoDeLecturaDelMarco("plataformasDePago");
  if (rechazo) return rechazo;

  const conDetalle = await puedeLeerDelMarcoEnElServidor("detalleDeFinanzas");

  try {
    const organizationId = await tryRequireOrganizationId();
    if (!organizationId) return EMPTY_FINANCE_CONFIG;
    return await leerConfiguracionDeFinanzas(await createClient(), organizationId, conDetalle);
  } catch (e) {
    // Se registra y va a Sentry (SCRUM-504: incluye la falla al leer los pagos).
    registrarFallaDeAccion("[loadFinanceConfig]", e);
    return EMPTY_FINANCE_CONFIG;
  }
}

/**
 * ⭐ Los totales de Finanzas que muestra Ventas, calculados en el servidor
 * (SCRUM-540): facturación, cobrado, gastos y margen del período, el total de
 * gastos del mes y, por mes, facturación y cobrado (`resumenParaVentas`). Sin
 * las filas de gastos, sueldos ni cobros, y sin lo que sólo muestra Finanzas
 * (desglose de gastos, lo cobrado por plataforma, lo pendiente por mes, el
 * desglose por closer). Quien tiene Finanzas recibe las filas y hace la misma cuenta en el
 * navegador (`lib/finance/resumen-financiero.ts`).
 */
export async function getResumenFinancieroAction(): Promise<
  MutationResult<ResumenFinanciero & { pagosSinLeer: boolean }>
> {
  const rechazo = await rechazoDeLecturaDelMarco("resumenFinanciero");
  if (rechazo) return rechazo;

  return mutacionConErroresEsperables("[getResumenFinanciero]", async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const { entradas, pagosSinLeer } = await leerEntradasDelResumen(supabase, organizationId);
    // Como en el navegador con Finanzas: sin cobros, los totales sin ellos y el aviso.
    return { ...resumenParaVentas(calcularResumenFinanciero(entradas)), pagosSinLeer };
  });
}

export async function createFixedExpenseAction(
  expense: Omit<FixedExpense, "id">
): Promise<MutationResult<FixedExpense>> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("fixed_expenses")
      .insert({
        organization_id: organizationId,
        name: expense.name,
        category: expense.category,
        amount: expense.amount,
        currency: expense.currency,
        frequency: expense.frequency,
        status: expense.status,
      })
      .select()
      .single();

    if (error || !data) throw new Error(mapFinanceError(error?.message ?? "Error"));
    return rowToFixedExpense(data as FixedExpenseRow);
  });
}

export async function updateFixedExpenseAction(
  id: string,
  patch: Partial<FixedExpense>
): Promise<MutationResult<FixedExpense>> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name != null) row.name = patch.name;
    if (patch.category != null) row.category = patch.category;
    if (patch.amount != null) row.amount = patch.amount;
    if (patch.currency != null) row.currency = patch.currency;
    if (patch.frequency != null) row.frequency = patch.frequency;
    if (patch.status != null) row.status = patch.status;

    const { data, error } = await supabase
      .from("fixed_expenses")
      .update(row)
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select()
      .single();

    if (error || !data) throw new Error(mapFinanceError(error?.message ?? "Error"));
    return rowToFixedExpense(data as FixedExpenseRow);
  });
}

export async function deleteFixedExpenseAction(
  id: string
): Promise<MutationResult> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const { error } = await supabase
      .from("fixed_expenses")
      .delete()
      .eq("id", id)
      .eq("organization_id", organizationId);
    if (error) throw new Error(mapFinanceError(error.message));
  });
}

export async function createSubscriptionAction(
  sub: Omit<Subscription, "id">
): Promise<MutationResult<Subscription>> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("subscriptions")
      .insert({
        organization_id: organizationId,
        name: sub.name,
        amount: sub.amount,
        currency: sub.currency,
        billing_cycle: sub.billingCycle,
        status: "active",
        icon: sub.icon ?? null,
      })
      .select()
      .single();

    if (error || !data) throw new Error(mapFinanceError(error?.message ?? "Error"));
    return rowToSubscription(data as SubscriptionRow);
  });
}

export async function updateSubscriptionAction(
  id: string,
  patch: Partial<Subscription>
): Promise<MutationResult<Subscription>> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name != null) row.name = patch.name;
    if (patch.amount != null) row.amount = patch.amount;
    if (patch.currency != null) row.currency = patch.currency;
    if (patch.billingCycle != null) row.billing_cycle = patch.billingCycle;
    if (patch.icon !== undefined) row.icon = patch.icon ?? null;

    const { data, error } = await supabase
      .from("subscriptions")
      .update(row)
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select()
      .single();

    if (error || !data) throw new Error(mapFinanceError(error?.message ?? "Error"));
    return rowToSubscription(data as SubscriptionRow);
  });
}

export async function deleteSubscriptionAction(
  id: string
): Promise<MutationResult> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const { error } = await supabase
      .from("subscriptions")
      .delete()
      .eq("id", id)
      .eq("organization_id", organizationId);
    if (error) throw new Error(mapFinanceError(error.message));
  });
}

export async function updateTeamCompensationAction(
  id: string,
  patch: Partial<TeamCompensation>
): Promise<MutationResult<TeamCompensation>> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.memberName != null) row.member_name = patch.memberName;
    if (patch.roleLabel != null) row.role_label = patch.roleLabel;
    if (patch.hasFixed != null) row.has_fixed_salary = patch.hasFixed;
    if (patch.fixedMonthly !== undefined) row.fixed_amount = patch.fixedMonthly ?? null;
    if (patch.hasCommission != null) row.has_commission = patch.hasCommission;
    if (patch.commissionPercent !== undefined) {
      row.commission_percentage = patch.commissionPercent ?? null;
    }
    if (patch.commissionBasis !== undefined) {
      row.commission_basis = patch.commissionBasis ?? null;
    }
    if (patch.commissionFixedPerEvent !== undefined) {
      row.commission_fixed_per_event = patch.commissionFixedPerEvent ?? null;
    }
    if (patch.commissionSummary !== undefined) {
      row.commission_applied_to = patch.commissionSummary ?? null;
    }
    if (patch.notes !== undefined) row.notes = patch.notes ?? null;
    if (patch.estimatedThisMonth != null) {
      row.estimated_this_month = patch.estimatedThisMonth;
    }

    const { data, error } = await supabase
      .from("team_compensation")
      .update(row)
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select()
      .single();

    if (error || !data) throw new Error(mapFinanceError(error?.message ?? "Error"));
    return rowToTeamCompensation(data as TeamCompensationRow);
  });
}

export async function createTeamCompensationAction(
  member: Omit<TeamCompensation, "id" | "estimatedThisMonth">
): Promise<MutationResult<TeamCompensation>> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("team_compensation")
      .insert({
        organization_id: organizationId,
        member_id: member.memberId || null,
        member_name: member.memberName,
        role_label: member.roleLabel,
        has_fixed_salary: member.hasFixed,
        fixed_amount: member.fixedMonthly ?? null,
        has_commission: member.hasCommission,
        commission_percentage: member.commissionPercent ?? null,
        commission_basis: member.commissionBasis ?? null,
        commission_fixed_per_event: member.commissionFixedPerEvent ?? null,
        commission_applied_to: member.commissionSummary ?? null,
        notes: member.notes ?? null,
        estimated_this_month: 0,
      })
      .select()
      .single();

    if (error || !data) throw new Error(mapFinanceError(error?.message ?? "Error"));
    return rowToTeamCompensation(data as TeamCompensationRow);
  });
}

export async function deleteTeamCompensationAction(
  id: string
): Promise<MutationResult> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const { error } = await supabase
      .from("team_compensation")
      .delete()
      .eq("id", id)
      .eq("organization_id", organizationId);
    if (error) throw new Error(mapFinanceError(error.message));
  });
}

export async function createPaymentPlatformAction(
  platform: Omit<PaymentPlatformConfig, "id" | "totalReceived" | "lastTransactionAt">
): Promise<MutationResult<PaymentPlatformConfig>> {
  return runMutation(async () => {
    await requireFounderRole();
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const slug =
      platform.slug ??
      platform.name.toLowerCase().replace(/\s+/g, "_").slice(0, 32);

    const { data, error } = await supabase
      .from("payment_platforms")
      .insert({
        organization_id: organizationId,
        name: platform.name,
        slug,
        currency: platform.currency,
        account_label: platform.accountLabel ?? null,
      })
      .select()
      .single();

    if (error || !data) throw new Error(mapFinanceError(error?.message ?? "Error"));
    // Una plataforma recién creada no tiene transacciones: la última es hoy.
    return rowToPaymentPlatform(data as PaymentPlatformRow, {
      totalReceived: 0,
      lastTransactionAt: await fechaDeHoyDeLaOrganizacion(supabase, organizationId),
    });
  });
}

export async function updatePaymentPlatformAction(
  id: string,
  patch: Partial<PaymentPlatformConfig>
): Promise<MutationResult<PaymentPlatformConfig>> {
  return runMutation(async () => {
    await requireFounderRole();
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name != null) row.name = patch.name;
    if (patch.slug !== undefined) row.slug = patch.slug ?? null;
    if (patch.currency != null) row.currency = patch.currency;
    if (patch.accountLabel !== undefined) row.account_label = patch.accountLabel ?? null;

    const { data, error } = await supabase
      .from("payment_platforms")
      .update(row)
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select()
      .single();

    if (error || !data) throw new Error(mapFinanceError(error?.message ?? "Error"));
    // El cambio ya se guardó: si los pagos no se pueden leer, no se lo
    // presenta como fallido. Los totales quedan en cero y la falla se registra
    // (la pantalla relee la configuración y avisa con `pagosSinLeer`).
    const [payments, hoy] = await Promise.all([
      leerPagosDeLaOrganizacion(supabase, organizationId).catch((e: unknown) => {
        registrarFallaDeAccion("[updatePaymentPlatform] pagos", e);
        return [] as ClientPayment[];
      }),
      fechaDeHoyDeLaOrganizacion(supabase, organizationId),
    ]);
    return paymentPlatformTotals([data as PaymentPlatformRow], payments, hoy)[0];
  });
}


export async function deletePaymentPlatformAction(
  id: string
): Promise<MutationResult> {
  return runMutation(async () => {
    await requireFounderRole();
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const { error } = await supabase
      .from("payment_platforms")
      .delete()
      .eq("id", id)
      .eq("organization_id", organizationId);
    if (error) throw new Error(mapFinanceError(error.message));
  });
}

// ─── Team Payroll auto-computation ───────────────────────────────────────────

export type MemberPayrollResult = {
  memberId: string;
  memberName: string;
  roleLabel: string;
  fixedAmount: number;
  commissionAmount: number;
  total: number;
  breakdown: string;
};

/**
 * Computes each team member's actual compensation for the current month
 * using real data from the DB (closing_calls, conversations, clients).
 */
export async function computeTeamPayrollAction(): Promise<MemberPayrollResult[]> {
  const organizationId = await requireOrganizationId();
  const supabase = await createClient();

  // Current month boundaries (UTC)
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  // Fetch team members
  const { data: teamRows, error: teamErr } = await supabase
    .from("team_compensation")
    .select("*")
    .eq("organization_id", organizationId)
    .order("member_name");

  if (teamErr || !teamRows) return [];

  const members = (teamRows as TeamCompensationRow[]).map(rowToTeamCompensation);

  // Fetch source data once for all members
  const [closedCallsRes, bookedConvsRes, activeClientsRes, newClientsRes] =
    await Promise.all([
      // Closed deals this month
      supabase
        .from("closing_calls")
        .select("id, closed_by_name, outcome")
        .eq("organization_id", organizationId)
        .eq("status", "closed")
        .gte("scheduled_at", monthStart)
        .lte("scheduled_at", monthEnd),

      // Booked conversations this month (for setters)
      supabase
        .from("conversations")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("status", "booked")
        .gte("updated_at", monthStart)
        .lte("updated_at", monthEnd),

      // Active clients MRR
      supabase
        .from("clients")
        .select("total_amount")
        .eq("organization_id", organizationId)
        .eq("status", "active"),

      // New clients this month (upsells / new sales)
      supabase
        .from("clients")
        .select("total_amount")
        .eq("organization_id", organizationId)
        .gte("join_date", monthStart)
        .lte("join_date", monthEnd),
    ]);

  type ClosingRow = { id: string; closed_by_name: string | null; outcome: Record<string, unknown> | null };
  const closedCalls = (closedCallsRes.data ?? []) as ClosingRow[];
  const bookedCount = bookedConvsRes.data?.length ?? 0;
  const totalMRR = (activeClientsRes.data ?? []).reduce(
    (s, c) => s + Number(c.total_amount ?? 0),
    0
  );
  const newClientsRevenue = (newClientsRes.data ?? []).reduce(
    (s, c) => s + Number(c.total_amount ?? 0),
    0
  );
  const newClientsCount = newClientsRes.data?.length ?? 0;

  return members.map((m) => {
    const fixedAmount = m.hasFixed ? (m.fixedMonthly ?? 0) : 0;
    let commissionAmount = 0;
    let breakdown = "";

    if (m.hasCommission && m.commissionBasis) {
      switch (m.commissionBasis) {
        case "per_deal": {
          /**
           * ⭐ La misma regla que la estimación del mes.
           *
           * Acá había un `incluye` con el primer nombre: con un "Juan" en el
           * equipo, cualquier closer llamado Juan le sumaba comisiones a esa
           * fila. Dos pantallas del mismo cálculo daban números distintos.
           */
          const myDeals = closedCalls.filter((c) =>
            matchesCloser(
              { memberId: m.memberId, memberName: m.memberName },
              { closerName: c.closed_by_name }
            )
          );
          const totalRevenue = myDeals.reduce((s, c) => {
            const rev = (c.outcome as { revenue?: number } | null)?.revenue ?? 0;
            return s + Number(rev);
          }, 0);
          const pct = m.commissionPercent ?? 0;
          commissionAmount = (totalRevenue * pct) / 100;
          breakdown = totalRevenue > 0
            ? `${myDeals.length} deal${myDeals.length !== 1 ? "s" : ""} cerrado${myDeals.length !== 1 ? "s" : ""} · $${totalRevenue.toLocaleString("es-AR")} total · ${pct}%`
            : `${myDeals.length} deal${myDeals.length !== 1 ? "s" : ""} cerrado${myDeals.length !== 1 ? "s" : ""} (sin revenue registrado)`;
          break;
        }

        case "monthly_revenue": {
          const pct = m.commissionPercent ?? 0;
          commissionAmount = (totalMRR * pct) / 100;
          breakdown = `MRR activo: $${totalMRR.toLocaleString("es-AR")} · ${pct}%`;
          break;
        }

        case "upsells": {
          const pct = m.commissionPercent ?? 0;
          commissionAmount = (newClientsRevenue * pct) / 100;
          breakdown = `${newClientsCount} cliente${newClientsCount !== 1 ? "s" : ""} nuevo${newClientsCount !== 1 ? "s" : ""} este mes · $${newClientsRevenue.toLocaleString("es-AR")} · ${pct}%`;
          break;
        }

        case "per_booking": {
          const fixedPerEvent = m.commissionFixedPerEvent ?? 0;
          commissionAmount = bookedCount * fixedPerEvent;
          breakdown = `${bookedCount} llamada${bookedCount !== 1 ? "s" : ""} agendada${bookedCount !== 1 ? "s" : ""} × $${fixedPerEvent.toLocaleString("es-AR")}`;
          break;
        }

        case "custom":
        default: {
          commissionAmount = Math.max(0, m.estimatedThisMonth - fixedAmount);
          breakdown = "Estimación manual";
          break;
        }
      }
    }

    return {
      memberId: m.id,
      memberName: m.memberName,
      roleLabel: m.roleLabel,
      fixedAmount,
      commissionAmount,
      total: fixedAmount + commissionAmount,
      breakdown,
    };
  });
}
