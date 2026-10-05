import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Las organizaciones sobre las que corren los procesos automáticos de IA
 * (inteligencia, reportes ejecutivos y tono del founder): las founder que
 * siguen activas. Una org pausada o dada de baja (`paused`, `churned`) no
 * gasta IA ni genera reportes (SCRUM-210).
 */
export async function listActiveOrganizationIds(): Promise<string[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organizations")
    .select("id")
    .eq("account_type", "founder")
    .eq("status", "active");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => String(row.id));
}
