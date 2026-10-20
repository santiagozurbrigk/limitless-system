/** Las filas de la AR pasada 2 de SCRUM-540 (`ar-p2/tz/datos-comunes.ts`): un cliente y un cobro de octubre, uno de septiembre, una llamada cerrada de octubre y un sueldo con comisión. */
import { rowToClient } from "@/lib/clients/mapper";
import { rowToClosingCall } from "@/lib/closing/mapper";
import { rowToTeamCompensation } from "@/lib/expenses/mapper";
import type { ClientPayment } from "@/types/clients";

const O = "org";
const cliente = (id: string, name: string, total: number, join: string) =>
  rowToClient({
    id, organization_id: O, name, payment_type: "upfront", platform: "other", total_amount: total,
    upfront_amount: total, fee_amount: null, fee_frequency: null, status: "active", is_success_case: false,
    installments: [], join_date: join, created_at: `${join}T12:00:00Z`, updated_at: `${join}T12:00:00Z`,
  } as never);
export const ENTRADAS = {
  clients: [cliente("a2", "C2", 3000, "2026-10-05"), cliente("a3", "C3", 1200, "2026-09-10")],
  payments: [
    { id: "p2", clientId: "a2", amount: 3000, paymentDate: "2026-10-06", storagePath: null, paymentDestinationPlatformId: "pl", createdAt: "2026-10-06T12:00:00Z" },
    { id: "p3", clientId: "a3", amount: 1200, paymentDate: "2026-09-12", storagePath: null, paymentDestinationPlatformId: "pl", createdAt: "2026-09-12T12:00:00Z" },
  ] as unknown as ClientPayment[],
  closingCalls: [
    rowToClosingCall({
      id: "cc2", organization_id: O, lead_name: "L2", scheduled_at: "2026-10-07T15:00:00Z", status: "closed",
      outcome: { revenue: 3000 }, closed_by_name: "Closer Uno", created_at: "2026-10-07T15:00:00Z", updated_at: "2026-10-07T15:00:00Z",
    } as never),
  ],
  teamCompensation: [
    rowToTeamCompensation({
      id: "t1", organization_id: O, member_id: null, member_name: "Closer Uno", role_label: "", has_fixed_salary: true,
      fixed_amount: 800, has_commission: true, commission_basis: "per_deal", commission_percentage: 10, commission_applied_to: null,
      notes: null, estimated_this_month: 0, commission_fixed_per_event: null,
    } as never),
  ],
  fixedExpenses: [],
  subscriptions: [],
  paymentPlatforms: [],
};
