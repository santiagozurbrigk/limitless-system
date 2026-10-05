import { createAdminClient } from "@/lib/supabase/admin";
import {
  getZernioClientForOrganization,
  getZernioIntegrationForOrg,
} from "@/lib/zernio/integration";
import { resolvePostAnalytics } from "@/lib/zernio/resolve-analytics";
import type { ContentMetrics } from "@/types/content";

const METRICS_BATCH_LIMIT = 50;

export type SyncContentMetricsResult = {
  attempted: number;
  updated: number;
  failed: number;
};

/**
 * Sincroniza métricas de Zernio para piezas de contenido de una organización.
 * Usa el admin client para poder ejecutarse desde crons (sin sesión de usuario).
 *
 * ⭐ La cola se ordena por `metrics_checked_at` (último intento, con o sin dato),
 * no por `metrics_updated_at`: cada pieza intentada queda marcada y pasa al final,
 * así una pieza que Zernio nunca reconoce (por ejemplo, una historia sin
 * analytics) no tapa a las demás (SCRUM-172).
 *
 * @param contentPieceIds - opcional; si se omite, sincroniza todas las piezas
 *   con platform_post_id de la org (hasta METRICS_BATCH_LIMIT).
 */
export async function syncContentMetricsForOrg(
  organizationId: string,
  contentPieceIds?: string[]
): Promise<SyncContentMetricsResult> {
  const empty: SyncContentMetricsResult = { attempted: 0, updated: 0, failed: 0 };

  const integration = await getZernioIntegrationForOrg(organizationId);
  if (!integration) return empty;

  const admin = createAdminClient();

  let query = admin
    .from("content_pieces")
    .select("id, platform_post_id")
    .eq("organization_id", organizationId)
    .eq("source", "zernio")
    .not("platform_post_id", "is", null);

  if (contentPieceIds && contentPieceIds.length > 0) {
    query = query.in("id", contentPieceIds);
  }

  // Las más viejas primero: sin orden, cada corrida tomaba las mismas 50 piezas
  // y el resto de una org grande no se actualizaba nunca.
  const { data: pieces, error } = await query
    .order("metrics_checked_at", { ascending: true, nullsFirst: true })
    .limit(METRICS_BATCH_LIMIT);
  if (error) throw new Error(error.message);
  if (!pieces || pieces.length === 0) return empty;

  const client = await getZernioClientForOrganization(organizationId);

  const results = await Promise.allSettled(
    pieces.map(async (piece) => {
      const postId = piece.platform_post_id as string;
      const ahora = new Date().toISOString();

      // Un solo update por pieza: siempre marca el intento y, si Zernio mandó
      // números reconocibles, guarda también las métricas. Si no, no se tocan
      // `metrics` ni `metrics_updated_at` (un cero que nadie midió no es un dato).
      let cambios: {
        metrics_checked_at: string;
        metrics?: ContentMetrics;
        metrics_updated_at?: string;
      } = { metrics_checked_at: ahora };
      let motivoSinDato: string | null = null;

      try {
        const analytics = await client.getPostAnalytics(postId);
        const { metrics, lastUpdated, recognized } = resolvePostAnalytics(analytics);
        if (recognized) {
          cambios = { ...cambios, metrics, metrics_updated_at: lastUpdated ?? ahora };
        } else {
          motivoSinDato = `analytics sin datos reconocibles para ${postId}`;
        }
      } catch (err) {
        motivoSinDato = err instanceof Error ? err.message : String(err);
      }

      const { error: updateError } = await admin
        .from("content_pieces")
        .update(cambios)
        .eq("id", piece.id as string)
        .eq("organization_id", organizationId);

      if (updateError) {
        // Sin la marca la pieza no rota en la cola: que quede a la vista.
        console.error("[syncContentMetrics] no se pudo guardar el intento de la pieza", {
          organizationId,
          contentPieceId: piece.id,
          error: updateError.message,
        });
        throw new Error(updateError.message);
      }
      if (motivoSinDato) throw new Error(motivoSinDato);
      return piece.id as string;
    })
  );

  const updated = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.length - updated;

  if (failed > 0) {
    const firstError = results.find(
      (r): r is PromiseRejectedResult => r.status === "rejected"
    );
    console.warn("[syncContentMetrics] algunas piezas fallaron", {
      organizationId,
      attempted: results.length,
      updated,
      failed,
      firstError:
        firstError?.reason instanceof Error
          ? firstError.reason.message
          : String(firstError?.reason),
    });
  }

  return { attempted: results.length, updated, failed };
}

/**
 * Sincroniza métricas para todas las organizaciones con Zernio activo.
 * Pensado para el cron diario.
 */
export async function syncContentMetricsAllOrgs(): Promise<{
  organizations: number;
  results: Array<{ organizationId: string } & SyncContentMetricsResult>;
}> {
  const admin = createAdminClient();

  const { data: integrations, error } = await admin
    .from("zernio_integrations")
    .select("organization_id")
    .eq("is_active", true);

  if (error) throw new Error(error.message);

  const orgIds = [
    ...new Set((integrations ?? []).map((row) => row.organization_id as string)),
  ];

  const results: Array<{ organizationId: string } & SyncContentMetricsResult> = [];

  for (const organizationId of orgIds) {
    try {
      const result = await syncContentMetricsForOrg(organizationId);
      results.push({ organizationId, ...result });
    } catch (err) {
      console.error("[syncContentMetrics] org falló completa", {
        organizationId,
        error: err instanceof Error ? err.message : String(err),
      });
      results.push({ organizationId, attempted: 0, updated: 0, failed: 0 });
    }
  }

  return { organizations: orgIds.length, results };
}
