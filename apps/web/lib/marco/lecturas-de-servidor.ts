/**
 * Las lecturas de los datos que usa el marco de la plataforma, sin el chequeo
 * de permisos (SCRUM-540).
 *
 * Las usan las Server Actions del marco (que chequean primero con
 * `rechazoDeLecturaDelMarco`) y las lecturas de servidor que arman totales
 * (el Panel y el resumen financiero de Ventas), que chequean su propio módulo.
 * No es un archivo `"use server"`: nada de esto se puede llamar desde el
 * navegador. Cada función es el cuerpo que antes tenía su action, sin cambios,
 * salvo la reparación de vínculos entre llamadas y conversaciones, que sigue en
 * las actions.
 */

import { isMissingTableError } from "@/lib/auth/bootstrap";
import { FallaDeLaBase } from "@/lib/server/action-result";
import { rowToClient, type ClientRow } from "@/lib/clients/mapper";
import { rowToClosingCall, type ClosingCallRow } from "@/lib/closing/mapper";
import { rowToConversation, type ConversationRow } from "@/lib/conversations/mapper";
import { getGHLIntegrationForOrg } from "@/lib/ghl/integration";
import {
  fetchConnectedUnipileAccounts,
  filterConversationsForInbox,
} from "@/lib/sales/unipile-inbox-filter";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import type { createClient } from "@/lib/supabase/server";
import type { Client } from "@/types/clients";
import type { ClosingCall } from "@/types/closing";
import type { Conversation } from "@/types/sales";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Los clientes que deja ver la RLS, del más nuevo al más viejo (lo de `listClientsAction`). */
export async function leerClientes(supabase: Supabase): Promise<Client[]> {
  const { data, error } = await supabase
    .from("clients")
    .select(
      // El autor de la marca de satisfacción viene embebido: mostrar "marcada
      // el 3 de marzo" sin decir por quién deja el dato a medias.
      "*, satisfaction_author:profiles!clients_satisfaction_updated_by_fkey(full_name, email)"
    )
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingTableError(error.message)) {
      console.error(
        "[listClients] Ejecuta supabase/migrations/20260521100000_clients.sql en el SQL Editor de Supabase."
      );
    } else {
      console.error("[listClients]", error.message);
    }
    return [];
  }

  return (data as ClientRow[]).map(rowToClient);
}

/** Las llamadas de cierre de la org, con el filtro de calendarios de GHL (lo de `listClosingCallsAction`). */
export async function leerLlamadasDeCierre(
  supabase: Supabase,
  organizationId: string
): Promise<ClosingCall[]> {
  // Los calendarios GHL activos: ghl_integrations no tiene RLS SELECT, se
  // leen con admin sólo los ids.
  let activeGHLCalendarIds: string[] = [];
  try {
    const ghlRow = await getGHLIntegrationForOrg(organizationId);
    if (ghlRow) {
      activeGHLCalendarIds = ghlRow.selected_calendar_ids?.length
        ? ghlRow.selected_calendar_ids
        : ghlRow.default_calendar_id
          ? [ghlRow.default_calendar_id]
          : [];
    }
  } catch {
    // Si falla la lectura de GHL, se sigue sin filtrar por calendario.
  }

  // Las que no son de GHL (Calendly, manual) y las de GHL de algún calendario
  // activo; sin integración GHL activa, ninguna de GHL.
  const calendarFilter =
    activeGHLCalendarIds.length > 0
      ? `ghl_appointment_id.is.null,ghl_calendar_id.in.(${activeGHLCalendarIds.join(",")})`
      : "ghl_appointment_id.is.null";

  // ⭐ SCRUM-4 · [CLOSING-LIST-1000]: PostgREST corta en 1.000 filas; se pagina
  // hasta traer todo (con `id` para un orden estable) y se filtra por la org.
  const { rows, error } = await fetchAllRows<ClosingCallRow>((from, to) =>
    supabase
      .from("closing_calls")
      .select("*")
      .eq("organization_id", organizationId)
      .or(calendarFilter)
      .order("scheduled_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)
  );

  if (error) {
    console.error("[listClosingCalls]", error);
    return [];
  }

  return rows.map(rowToClosingCall);
}

/** Las conversaciones del inbox de la org (lo de `listConversationsAction`). */
export async function leerConversaciones(
  supabase: Supabase,
  organizationId: string
): Promise<Conversation[]> {
  const connectedAccounts = await fetchConnectedUnipileAccounts(supabase, organizationId);

  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("organization_id", organizationId)
    .order("last_message_at", { ascending: false });

  if (error) {
    if (isMissingTableError(error.message)) {
      console.error("[listConversations] Ejecuta supabase/migrations/20260521500000_conversations.sql");
    } else {
      console.error("[listConversations]", error.message);
    }
    return [];
  }

  return filterConversationsForInbox(data as ConversationRow[], connectedAccounts).map(
    rowToConversation
  );
}

export type MetricsSnapshot = {
  id: string;
  periodStart: string; // "YYYY-MM-DD"
  periodLabel: string; // "Enero 2025"
  metrics: Record<string, number>;
};

/** Las métricas de ventas importadas a mano, de la más nueva a la más vieja (lo de `getSalesMetricsSnapshotsAction`). */
export async function leerMetricasImportadas(
  supabase: Supabase,
  organizationId: string
): Promise<MetricsSnapshot[]> {
  const { data, error } = await supabase
    .from("metrics_snapshots")
    .select("id, period_start, period_label, metrics")
    .eq("organization_id", organizationId)
    .eq("category", "sales")
    .order("period_start", { ascending: false });

  if (error) throw new FallaDeLaBase(error);

  return (data ?? []).map((row) => ({
    id: row.id,
    periodStart: row.period_start as string,
    periodLabel: (row.period_label as string | null) ?? (row.period_start as string).slice(0, 7),
    metrics: (row.metrics as Record<string, number>) ?? {},
  }));
}
