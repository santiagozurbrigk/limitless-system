"use server";

import {
  isMissingTableError,
  requireOrganizationId,
  tryRequireOrganizationId,
} from "@/lib/auth/bootstrap";
import {
  patchToClosingUpdateRow,
  rowToClosingCall,
  type ClosingCallRow,
} from "@/lib/closing/mapper";
import { repairClosingConversationLinks } from "@/lib/conversations/repair-links";
import { getGHLIntegrationForOrg } from "@/lib/ghl/integration";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  firstZodError,
  updateClosingCallSchema,
  uuidSchema,
} from "@/lib/validations";
import type { ClosingCall } from "@/types/closing";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";

function mapDbError(msg: string): string {
  if (isMissingTableError(msg)) {
    return "Falta la tabla closing_calls. Ejecuta supabase/migrations/20260521300000_closing_calls.sql en Supabase.";
  }
  if (msg.includes("infinite recursion")) {
    return "Error RLS en Supabase. Ejecuta 20260521200000_fix_rls_recursion.sql.";
  }
  return msg;
}

export async function listClosingCallsAction(): Promise<ClosingCall[]> {
  if (!isSupabaseConfigured()) return [];

  const organizationId = await tryRequireOrganizationId();
  if (!organizationId) return [];

  const supabase = await createClient();

  await repairClosingConversationLinks(supabase, organizationId);

  // Obtener los calendarios GHL activos para filtrar — ghl_integrations no tiene RLS SELECT
  // por eso usamos admin solo para leer selected_calendar_ids.
  let activeGHLCalendarIds: string[] = [];
  try {
    const ghlRow = await getGHLIntegrationForOrg(organizationId);
    if (ghlRow) {
      activeGHLCalendarIds =
        ghlRow.selected_calendar_ids?.length
          ? ghlRow.selected_calendar_ids
          : ghlRow.default_calendar_id
          ? [ghlRow.default_calendar_id]
          : [];
    }
  } catch {
    // Si falla la lectura de GHL, continuamos sin filtrar por calendario
  }

  // Filtro: mostrar calls que no son de GHL (Calendly, manual),
  // más las de GHL que pertenecen a cualquiera de los calendarios activos.
  // Si no hay integración GHL activa, ocultamos todas las calls de GHL.
  const calendarFilter =
    activeGHLCalendarIds.length > 0
      ? `ghl_appointment_id.is.null,ghl_calendar_id.in.(${activeGHLCalendarIds.join(",")})`
      : "ghl_appointment_id.is.null";

  // ⭐ SCRUM-4 · [CLOSING-LIST-1000]: PostgREST corta en 1.000 filas y el orden es
  // ascendente, así que lo que quedaba afuera eran los turnos **más nuevos**, los
  // que el closer necesita. Se pagina hasta traer todo (con `id` para que el orden
  // entre páginas sea estable) y se filtra por la organización activa: antes
  // dependía sólo de RLS, y un usuario de holding veía los turnos de todo el
  // portfolio mezclados (1.455 en producción, por encima del corte).
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

export async function updateClosingCallAction(
  id: string,
  patch: unknown
): Promise<ClosingCall> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase no configurado");
  }

  const idParsed = uuidSchema.safeParse(id);
  if (!idParsed.success) {
    throw new Error(firstZodError(idParsed.error));
  }

  const patchParsed = updateClosingCallSchema.safeParse(patch);
  if (!patchParsed.success) {
    throw new Error(firstZodError(patchParsed.error));
  }

  const organizationId = await requireOrganizationId();
  const supabase = await createClient();
  const updateRow = patchToClosingUpdateRow(patchParsed.data);

  const { data, error } = await supabase
    .from("closing_calls")
    .update(updateRow)
    .eq("id", idParsed.data)
    .eq("organization_id", organizationId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(mapDbError(error?.message ?? "No se pudo actualizar la llamada"));
  }

  return rowToClosingCall(data as ClosingCallRow);
}
