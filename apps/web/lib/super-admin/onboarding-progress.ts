import "server-only";

import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  progressFromRow,
  sortByNeedsAttention,
  type OrgProgressRow,
  type OrgOnboardingProgress,
} from "./onboarding-progress-mapper";

export type {
  OrgOnboardingProgress,
  OrgProgressRow,
} from "./onboarding-progress-mapper";

/**
 * Progreso de onboarding de todas las organizaciones con al menos un usuario.
 *
 * Las que no tienen usuarios quedan afuera a propósito: son negocios creados
 * desde un holding donde todavía no entra nadie, y una organización sin gente
 * no puede estar trabada.
 *
 * Lee con el service role, así que pide ser super admin acá mismo y no sólo en
 * el layout del panel (SCRUM-111), como las demás lecturas de `lib/super-admin`.
 */
export async function loadOnboardingProgress(): Promise<OrgOnboardingProgress[]> {
  if (!isSupabaseConfigured()) return [];

  await requireSuperAdmin();

  const { data, error } = await createAdminClient().rpc("onboarding_org_progress");

  if (error) {
    console.error("[super-admin] onboarding_org_progress:", error.message);
    return [];
  }

  return ((data ?? []) as OrgProgressRow[])
    .filter((row) => row.member_count > 0)
    .map(progressFromRow)
    .sort(sortByNeedsAttention);
}
