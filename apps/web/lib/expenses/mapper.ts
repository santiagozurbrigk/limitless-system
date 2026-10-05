import type {
  CommissionBasis,
  ExpenseCategory,
  FixedExpense,
  Subscription,
  TeamCompensation,
} from "@/types/expenses";
import type { PaymentPlatformConfig } from "@/types/finance";

export type PaymentPlatformRow = {
  id: string;
  organization_id: string;
  name: string;
  slug: string | null;
  currency: string;
  account_label: string | null;
  created_at?: string;
  updated_at?: string;
};

export type FixedExpenseRow = {
  id: string;
  organization_id: string;
  name: string;
  category: ExpenseCategory;
  amount: number;
  currency: string;
  frequency: "monthly" | "annual";
  status: "active" | "paused";
};

export type SubscriptionRow = {
  id: string;
  organization_id: string;
  name: string;
  amount: number;
  currency: string;
  billing_cycle: "monthly" | "annual";
  status: "active" | "paused";
  icon: string | null;
};

export type TeamCompensationRow = {
  id: string;
  organization_id: string;
  member_id: string | null;
  member_name: string;
  role_label: string;
  has_fixed_salary: boolean;
  fixed_amount: number | null;
  has_commission: boolean;
  commission_basis: string | null;
  commission_percentage: number | null;
  commission_fixed_per_event: number | null;
  commission_applied_to: string | null;
  notes: string | null;
  estimated_this_month: number;
};

/**
 * `totals` es obligatorio: sin transacciones, quien llama pasa
 * `lastTransactionAt` con el "hoy" de la organización. El default de antes era
 * el "hoy" de UTC del servidor, un día adelantado de noche en Argentina
 * (SCRUM-493).
 */
export function rowToPaymentPlatform(
  row: PaymentPlatformRow,
  totals: { totalReceived: number; lastTransactionAt: string }
): PaymentPlatformConfig & { slug?: string } {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug ?? undefined,
    currency: row.currency,
    accountLabel: row.account_label ?? undefined,
    totalReceived: totals.totalReceived,
    lastTransactionAt: totals.lastTransactionAt,
  };
}

export function rowToFixedExpense(row: FixedExpenseRow): FixedExpense {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    amount: Number(row.amount),
    currency: row.currency,
    frequency: row.frequency,
    status: row.status,
  };
}

export function rowToSubscription(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    name: row.name,
    amount: Number(row.amount),
    currency: row.currency,
    billingCycle: row.billing_cycle,
    icon: row.icon ?? undefined,
  };
}

export function rowToTeamCompensation(row: TeamCompensationRow): TeamCompensation {
  return {
    id: row.id,
    memberId: row.member_id ?? row.id,
    memberName: row.member_name,
    roleLabel: row.role_label,
    hasFixed: row.has_fixed_salary,
    fixedMonthly: row.fixed_amount != null ? Number(row.fixed_amount) : undefined,
    hasCommission: row.has_commission,
    commissionPercent:
      row.commission_percentage != null
        ? Number(row.commission_percentage)
        : undefined,
    commissionBasis: (row.commission_basis as CommissionBasis | null) ?? undefined,
    commissionFixedPerEvent:
      row.commission_fixed_per_event != null
        ? Number(row.commission_fixed_per_event)
        : undefined,
    commissionSummary: row.commission_applied_to ?? undefined,
    notes: row.notes ?? undefined,
    estimatedThisMonth: Number(row.estimated_this_month ?? 0),
  };
}
