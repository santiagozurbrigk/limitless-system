import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * [FATHOM-CLIENTID-SIN-VALIDAR] (SCRUM-43): una llamada sólo se asocia a un
 * cliente de la misma organización.
 *
 * `finalizeAssociatedCall` recibía el `clientId` tal cual (asociar a mano,
 * subir una 1-1 a mano) y escribía con el service role: con el UUID de un
 * cliente de otra org, el nombre de ese cliente terminaba en el análisis de la
 * org atacante y la llamada de la org atacante (título, resumen y URL de
 * Fathom) se sumaba a `linked_calls` del cliente ajeno, visible en su ficha.
 */

export const CLIENTE_DE_OTRA_ORG = "Cliente no encontrado en esta organización.";

/** Devuelve el nombre del cliente si es de la org; si no, lanza. */
export async function assertClienteDeLaOrg(
  client: Pick<SupabaseClient, "from">,
  clientId: string,
  organizationId: string
): Promise<{ name: string | null }> {
  const { data, error } = await client
    .from("clients")
    .select("name")
    .eq("id", clientId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(CLIENTE_DE_OTRA_ORG);
  return { name: (data as { name: string | null }).name ?? null };
}
