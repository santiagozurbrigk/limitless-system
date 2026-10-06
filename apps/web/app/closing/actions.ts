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
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  ErrorEsperable,
  FallaDeLaBase,
  mutacionConErroresEsperables,
  type MutationResult,
} from "@/lib/server/action-result";
import {
  firstZodError,
  updateClosingCallSchema,
  uuidSchema,
} from "@/lib/validations";
import type { ClosingCall } from "@/types/closing";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";

/** Código de PostgREST cuando `.single()` no encuentra la fila. */
const SIN_FILAS = "PGRST116";
/** Código de Postgres de una clave foránea que apunta a algo que no existe. */
const REFERENCIA_INEXISTENTE = "23503";
const LLAMADA_NO_ENCONTRADA = "No se encontró la llamada. Puede que la hayan eliminado.";
const CONVERSACION_INEXISTENTE =
  "La conversación vinculada ya no existe. Recargá la página e intentá de nuevo.";

/**
 * ⭐ Traduce el error de PostgREST de una escritura de llamadas (SCRUM-497).
 * Los rechazos conocidos vuelven con su mensaje (`ErrorEsperable`); cualquier
 * otro es una `FallaDeLaBase`, que se registra, va a Sentry y le muestra al
 * usuario el texto fijo en vez del mensaje técnico de la base.
 */
function errorDeEscritura(error: { message: string; code?: string | null }): Error {
  if (error.code === SIN_FILAS) return new ErrorEsperable(LLAMADA_NO_ENCONTRADA);
  if (error.code === REFERENCIA_INEXISTENTE) return new ErrorEsperable(CONVERSACION_INEXISTENTE);
  if (isMissingTableError(error.message)) {
    return new ErrorEsperable(
      "Falta la tabla closing_calls. Ejecuta supabase/migrations/20260521300000_closing_calls.sql en Supabase."
    );
  }
  if (error.message.includes("infinite recursion")) {
    return new ErrorEsperable("Error RLS en Supabase. Ejecuta 20260521200000_fix_rls_recursion.sql.");
  }
  return new FallaDeLaBase(error);
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

/**
 * SCRUM-497: devuelve sus errores esperables (validación, Supabase no
 * configurado, sesión, llamada de otra org o inexistente) como valor, dentro
 * de `mutacionConErroresEsperables`: lo inesperado se registra, va a Sentry y
 * vuelve con el texto fijo. No redirige.
 */
export async function updateClosingCallAction(
  id: string,
  patch: unknown
): Promise<MutationResult<ClosingCall>> {
  return mutacionConErroresEsperables("[updateClosingCall]", async () => {
    if (!isSupabaseConfigured()) {
      throw new ErrorEsperable("Supabase no configurado");
    }

    const idParsed = uuidSchema.safeParse(id);
    if (!idParsed.success) {
      throw new ErrorEsperable(firstZodError(idParsed.error));
    }

    const patchParsed = updateClosingCallSchema.safeParse(patch);
    if (!patchParsed.success) {
      throw new ErrorEsperable(firstZodError(patchParsed.error));
    }

    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const updateRow = patchToClosingUpdateRow(patchParsed.data);

    // `.single()` sin filas (PGRST116): la llamada no existe o es de otra
    // organización.
    const { data, error } = await supabase
      .from("closing_calls")
      .update(updateRow)
      .eq("id", idParsed.data)
      .eq("organization_id", organizationId)
      .select()
      .single();

    if (error) throw errorDeEscritura(error);
    if (!data) throw new ErrorEsperable(LLAMADA_NO_ENCONTRADA);

    return rowToClosingCall(data as ClosingCallRow);
  });
}
