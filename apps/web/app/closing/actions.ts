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
import { createClient } from "@/lib/supabase/server";
import {
  rechazoDeLecturaDelMarco,
  type RechazoPorModulo,
} from "@/lib/auth/acceso-a-modulo";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { leerLlamadasDeCierre } from "@/lib/marco/lecturas-de-servidor";
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

export async function listClosingCallsAction(): Promise<ClosingCall[] | RechazoPorModulo> {
  if (!isSupabaseConfigured()) return [];

  const rechazo = await rechazoDeLecturaDelMarco("llamadasDeCierre");
  if (rechazo) return rechazo;

  const organizationId = await tryRequireOrganizationId();
  if (!organizationId) return [];

  const supabase = await createClient();
  await repairClosingConversationLinks(supabase, organizationId);
  return leerLlamadasDeCierre(supabase, organizationId);
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
