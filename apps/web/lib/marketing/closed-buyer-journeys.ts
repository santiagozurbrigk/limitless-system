import { repairClosingConversationLinks } from "@/lib/conversations/repair-links";
import { createClient } from "@/lib/supabase/server";
import { getLeadJourney, type LeadJourneyStep } from "@/lib/sales/lead-journey";
import type { ClosedBuyerJourney, JourneyStep } from "@/types/marketing-insights";

const MAX_JOURNEYS = 15;

function shortDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

function mapStep(step: LeadJourneyStep): JourneyStep {
  const date = shortDate(step.date);
  switch (step.type) {
    case "content":
      return { type: "content", label: step.description || step.title, date };
    case "dm":
      return { type: "dm", label: "DM", date };
    case "booking":
      return { type: "booking", label: "Booking", date };
    case "sale":
      return { type: "sale", label: "Venta", date };
    default:
      return { type: step.type, label: step.title, date };
  }
}

/**
 * Reconstruye los journeys reales de los compradores más recientes reutilizando
 * `getLeadJourney()` (misma lógica que el inbox de ventas). Solo incluye clientes
 * cuyo camino se puede reconstruir (con conversación vinculada). Devuelve vacío
 * si ninguno es reconstruible → empty state honesto.
 */
export async function getClosedBuyerJourneys(
  organizationId: string
): Promise<ClosedBuyerJourney[]> {
  const supabase = await createClient();

  await repairClosingConversationLinks(supabase, organizationId);

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, total_amount, closing_call_id, created_at")
    .eq("organization_id", organizationId)
    .not("closing_call_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(MAX_JOURNEYS);

  const clientRows = (clients ?? []).filter((c) => c.closing_call_id);
  if (clientRows.length === 0) return [];

  const closingIds = [
    ...new Set(clientRows.map((c) => String(c.closing_call_id))),
  ];

  const { data: closingCalls } = await supabase
    .from("closing_calls")
    .select("id, conversation_id")
    .eq("organization_id", organizationId)
    .in("id", closingIds);

  const closingToConversation = new Map<string, string>();
  for (const row of closingCalls ?? []) {
    if (row.conversation_id) {
      closingToConversation.set(String(row.id), String(row.conversation_id));
    }
  }
  if (closingToConversation.size === 0) return [];

  const journeys: ClosedBuyerJourney[] = [];

  for (const client of clientRows) {
    const conversationId = closingToConversation.get(
      String(client.closing_call_id)
    );
    if (!conversationId) continue;

    // Las fuentes que faltan ya quedaron registradas en `getLeadJourney`.
    const { pasos: steps } = await getLeadJourney(organizationId, conversationId);
    if (steps.length === 0) continue;

    journeys.push({
      id: String(client.id),
      leadName: String(client.name),
      clientId: String(client.id),
      closedAmount: Number(client.total_amount ?? 0),
      outcome: "closed",
      steps: steps.map(mapStep),
    });
  }

  return journeys;
}
