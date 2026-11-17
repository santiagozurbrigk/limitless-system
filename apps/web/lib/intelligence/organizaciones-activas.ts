import type { OrganizationStatus } from "@ai-coo/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { correProcesosDeFondo } from "@/lib/organization/procesos-de-fondo";

/** El único estado en el que corren los procesos de IA (ver el check de la base). */
const ACTIVA: OrganizationStatus = "active";

/**
 * Las organizaciones sobre las que corren los procesos automáticos de IA
 * (inteligencia, reportes ejecutivos y tono del founder): las founder que
 * siguen activas y cuya experiencia corre procesos de fondo. Una org pausada o
 * dada de baja (`paused`, `churned`) no gasta IA ni genera reportes
 * (SCRUM-210); una cuenta webinar tampoco (SCRUM-525).
 */
export async function listActiveOrganizationIds(): Promise<string[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organizations")
    .select("id, experience")
    .eq("account_type", "founder")
    .eq("status", ACTIVA);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? [])
    .filter((row) => correProcesosDeFondo((row as { experience?: unknown }).experience))
    .map((row) => String(row.id));
}

/**
 * De una lista de organizaciones, las que corren procesos de fondo por su
 * experiencia (SCRUM-525), en el mismo orden y sin repetidos. La usan los
 * crons que arman su lista desde una integración (Discord, Fathom, Zernio) en
 * vez de desde `organizations`. Una org que no aparece en la tabla se descarta.
 * Si la base falla, lanza: el cron responde 500 y no procesa a ciegas.
 */
export async function filtrarOrganizacionesConProcesosDeFondo(
  organizationIds: readonly string[]
): Promise<string[]> {
  const unicas = [...new Set(organizationIds)];
  if (unicas.length === 0) return [];

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organizations")
    .select("id, experience")
    .in("id", unicas);

  if (error) {
    throw new Error(error.message);
  }

  const corren = new Set(
    (data ?? [])
      .filter((row) => correProcesosDeFondo((row as { experience?: unknown }).experience))
      .map((row) => String(row.id))
  );
  return unicas.filter((id) => corren.has(id));
}

/**
 * Si una org sigue activa (`status = 'active'`) en el momento de procesarla, y
 * si su experiencia corre procesos de fondo (una cuenta webinar no; SCRUM-525).
 * No mira el tipo de cuenta: el filtro por `account_type = 'founder'` es del listado
 * de los crons, no del procesamiento. Así una holding activa puede seguir
 * generando a pedido y una pausada o dada de baja (founder u holding) no.
 *
 * La lista se arma al encolar; entre que el trabajo entra en QStash (o en sus
 * reintentos) y que el worker lo procesa, la org puede haberse pausado. Lo
 * mismo con una corrida manual con `?organizationId=`. Por eso cada generador
 * vuelve a preguntar justo antes de llamar a la IA (SCRUM-210).
 *
 * Una org que no existe cuenta como no activa. Si la base falla, lanza: el
 * llamador no procesa y el worker responde 500 para que QStash reintente.
 */
export async function organizacionSigueActiva(
  organizationId: string
): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organizations")
    .select("status, experience")
    .eq("id", organizationId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.status === ACTIVA && correProcesosDeFondo(data.experience);
}

/**
 * Lo que ve el founder cuando pide un reporte a mano y su org no está activa.
 * El botón de reportes lo busca en `errors` para mostrarlo siempre.
 */
export const AVISO_ORG_NO_ACTIVA =
  "La organización no está activa: no se generan reportes ni inteligencia con IA.";
