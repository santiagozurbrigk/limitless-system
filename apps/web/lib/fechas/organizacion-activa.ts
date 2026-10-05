/**
 * La zona horaria de la organización activa, para el layout de la plataforma.
 *
 * Se lee una vez por render del layout y se pasa al cliente con
 * `ZonaDeLaOrganizacionProvider`: así ningún componente la consulta por su
 * cuenta (SCRUM-493). Sin base configurada o sin organización (modo demo,
 * sesión vencida), `null`: la zona por defecto.
 */
import "server-only";
import { tryRequireOrganizationId } from "@/lib/auth/bootstrap";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { leerZonaHorariaDeLaOrganizacion } from "./organizacion";

export async function zonaDeLaOrganizacionActiva(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const organizationId = await tryRequireOrganizationId();
  if (!organizationId) return null;
  const supabase = await createClient();
  return leerZonaHorariaDeLaOrganizacion(supabase, organizationId);
}
