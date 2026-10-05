/**
 * "Hoy" en el servidor: la fecha calendario en la zona horaria de la
 * organización.
 *
 * El servidor corre en UTC, así que su reloj local no sirve para decir qué día
 * es para la organización. La zona sale de `organizations.timezone`, que no
 * tiene default y puede ser null (la organización todavía no la eligió); en ese
 * caso, o si la zona guardada no existe, se usa `ZONA_HORARIA_POR_DEFECTO`.
 *
 * Una sola consulta por pedido, filtrada por el id de la organización: quien
 * llama la hace una vez y reparte la fecha, nunca una por cliente o por fila.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fechaDeHoyEnZona } from "./calendario";

/** La zona guardada de la organización, tal cual (null si no hay o no se pudo leer). */
export async function leerZonaHorariaDeLaOrganizacion(
  supabase: SupabaseClient,
  organizationId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("organizations")
    .select("timezone")
    .eq("id", organizationId)
    .maybeSingle();

  if (error) {
    console.warn("[fechas] no se pudo leer la zona horaria de la organización:", error.message);
    return null;
  }
  return (data?.timezone as string | null | undefined) ?? null;
}

/** La fecha de hoy (`YYYY-MM-DD`) para la organización. */
export async function fechaDeHoyDeLaOrganizacion(
  supabase: SupabaseClient,
  organizationId: string,
  ahora: Date = new Date()
): Promise<string> {
  const zona = await leerZonaHorariaDeLaOrganizacion(supabase, organizationId);
  return fechaDeHoyEnZona(zona, ahora);
}
