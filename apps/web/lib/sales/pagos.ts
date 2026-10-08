import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingTableError } from "@/lib/auth/bootstrap";
import { FallaDeLaBase } from "@/lib/server/action-result";
import {
  rowToClientPayment,
  type ClientPaymentRow,
} from "@/lib/clients/payment-mapper";
import type { ClientPayment } from "@/types/clients";

/**
 * Lecturas de `client_payments` para el servidor (SCRUM-504).
 *
 * Viven fuera de `app/sales/payment-actions.ts` para que otras acciones
 * (Finanzas, Clientes, registrar una cuota) las usen sin pasar por una server
 * action. Si falta la tabla, no hay pagos (como antes); cualquier otro error
 * de la base lanza `FallaDeLaBase`: una lista vacía haría creer que no hay
 * pagos, y en Cobros y Finanzas eso son montos (todo adeudado, nada cobrado).
 */

function pagosOFalla(
  data: unknown[] | null,
  error: { message: string; code?: string | null } | null
): ClientPayment[] {
  if (error) {
    if (isMissingTableError(error.message)) return [];
    throw new FallaDeLaBase(error);
  }
  return ((data ?? []) as ClientPaymentRow[]).map(rowToClientPayment);
}

/** Todos los pagos de la organización, del más nuevo al más viejo. */
export async function leerPagosDeLaOrganizacion(
  supabase: SupabaseClient,
  organizationId: string
): Promise<ClientPayment[]> {
  const { data, error } = await supabase
    .from("client_payments")
    .select("*")
    .eq("organization_id", organizationId)
    .order("payment_date", { ascending: false });
  return pagosOFalla(data, error);
}

/** Los pagos de un cliente de la organización, del más nuevo al más viejo. */
export async function leerPagosDelCliente(
  supabase: SupabaseClient,
  organizationId: string,
  clientId: string
): Promise<ClientPayment[]> {
  const { data, error } = await supabase
    .from("client_payments")
    .select("*")
    .eq("client_id", clientId)
    .eq("organization_id", organizationId)
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false });
  return pagosOFalla(data, error);
}
