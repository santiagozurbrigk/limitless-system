import { FallaDeLaBase } from "@/lib/server/action-result";
import { createAdminClient } from "@/lib/supabase/admin";

export type SocialAudienceStats = {
  followers: number;
  newFollowers: number;
};

/**
 * Suma seguidores/suscriptores de integraciones Instagram + YouTube. Sin
 * integración activa, cero. Si una de las dos lecturas falla, lanza
 * `FallaDeLaBase` (SCRUM-519): antes la falla se veía como cero seguidores.
 */
export async function getSocialAudienceStats(
  organizationId: string
): Promise<SocialAudienceStats> {
  const admin = createAdminClient();

  const [{ data: ig, error: errorIg }, { data: yt, error: errorYt }] = await Promise.all([
    admin
      .from("instagram_integrations")
      .select("followers_count, followers_delta")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .maybeSingle(),
    admin
      .from("youtube_integrations")
      .select("subscriber_count, subscriber_delta")
      .eq("organization_id", organizationId)
      .eq("status", "connected")
      .maybeSingle(),
  ]);
  if (errorIg) throw new FallaDeLaBase(errorIg);
  if (errorYt) throw new FallaDeLaBase(errorYt);

  const igFollowers = Number(ig?.followers_count ?? 0);
  const ytSubs = Number(yt?.subscriber_count ?? 0);
  const igDelta = Number(ig?.followers_delta ?? 0);
  const ytDelta = Number(yt?.subscriber_delta ?? 0);

  return {
    followers: igFollowers + ytSubs,
    newFollowers: igDelta + ytDelta,
  };
}
