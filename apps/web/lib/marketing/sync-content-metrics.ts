import { createAdminClient } from "@/lib/supabase/admin";
import {
  getZernioClientForOrganization,
  getZernioIntegrationForOrg,
} from "@/lib/zernio/integration";
import { resolvePostAnalytics } from "@/lib/zernio/resolve-analytics";
import type { ContentMetrics } from "@/types/content";
import {
  armarLote,
  esErrorPermanente,
  historiasACerrarHasta,
  historiasListasHasta,
  NUNCA,
  proximoIntento,
  TAMANO_DEL_LOTE,
} from "./cola-de-metricas";

const METRICS_BATCH_LIMIT = TAMANO_DEL_LOTE;

export type SyncContentMetricsResult = {
  attempted: number;
  updated: number;
  failed: number;
};

type PiezaDeLaCola = {
  id: string;
  platform_post_id: string;
  type: string | null;
  published_at: string | null;
  metrics_updated_at: string | null;
  metrics_intentos_sin_dato: number | null;
};

const COLUMNAS_DE_LA_COLA =
  "id, platform_post_id, type, published_at, metrics_updated_at, metrics_intentos_sin_dato";

/**
 * Elige las piezas a medir. Con `contentPieceIds` (refresco manual) toma esas,
 * sin mirar esperas. Si no, arma el lote del cron con las prioridades de
 * `lib/marketing/cola-de-metricas.ts`: nuevas, después las que tienen métricas
 * y, con cupo, los reintentos sin dato cuya espera venció.
 */
async function elegirPiezas(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  ahora: Date,
  contentPieceIds?: string[]
): Promise<PiezaDeLaCola[]> {
  const base = () =>
    admin
      .from("content_pieces")
      .select(COLUMNAS_DE_LA_COLA)
      .eq("organization_id", organizationId)
      .eq("source", "zernio")
      .not("platform_post_id", "is", null);

  const leer = async (
    consulta: PromiseLike<{ data: unknown; error: { message: string } | null }>
  ): Promise<PiezaDeLaCola[]> => {
    const { data, error } = await consulta;
    if (error) throw new Error(error.message);
    return (data ?? []) as PiezaDeLaCola[];
  };

  if (contentPieceIds && contentPieceIds.length > 0) {
    return leer(
      base()
        .in("id", contentPieceIds)
        .order("metrics_checked_at", { ascending: true, nullsFirst: true })
        .limit(METRICS_BATCH_LIMIT)
    );
  }

  // 1. Historias listas: abiertas y publicadas hace entre 30 h y 7 días, con o
  // sin métricas viejas. Van primero porque se piden una sola vez y su ventana
  // es acotada; las más viejas primero. Ninguna otra consulta trae historias.
  const historias = await leer(
    base()
      .eq("type", "story")
      .is("metrics_reintentar_desde", null)
      .lte("published_at", historiasListasHasta(ahora))
      .gt("published_at", historiasACerrarHasta(ahora))
      .order("published_at", { ascending: true })
      .limit(METRICS_BATCH_LIMIT)
  );
  if (historias.length >= METRICS_BATCH_LIMIT) return historias;

  // 2. Otras piezas nuevas: nunca intentadas, por orden de llegada.
  const nuevas = await leer(
    base()
      .neq("type", "story")
      .is("metrics_checked_at", null)
      .order("created_at", { ascending: true })
      .limit(METRICS_BATCH_LIMIT - historias.length)
  );
  const primeras = [...historias, ...nuevas];
  const lugares = METRICS_BATCH_LIMIT - primeras.length;
  if (lugares <= 0) return primeras;

  // 3 y 4. Con métricas y reintentos sin dato, las dos sólo si venció su espera
  // (`metrics_reintentar_desde` null o pasada).
  const esperaVencida = `metrics_reintentar_desde.is.null,metrics_reintentar_desde.lte."${ahora.toISOString()}"`;
  const [conMetricas, reintentos] = await Promise.all([
    leer(
      base()
        .neq("type", "story")
        .not("metrics_checked_at", "is", null)
        .not("metrics_updated_at", "is", null)
        .or(esperaVencida)
        .order("metrics_checked_at", { ascending: true })
        .limit(lugares)
    ),
    leer(
      base()
        .neq("type", "story")
        .not("metrics_checked_at", "is", null)
        .is("metrics_updated_at", null)
        .or(esperaVencida)
        .order("metrics_checked_at", { ascending: true })
        .limit(lugares)
    ),
  ]);

  return [...primeras, ...armarLote(conMetricas, reintentos, lugares)];
}

/**
 * Cierra, en una sola consulta y sin pedirle nada a Zernio, las historias que
 * siguen abiertas a los 7 días (o sin fecha de publicación): ya no se van a
 * pedir. Si falla se loguea y la corrida sigue.
 */
async function cerrarHistoriasVencidas(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  ahora: Date
): Promise<void> {
  const { error } = await admin
    .from("content_pieces")
    .update({ metrics_reintentar_desde: NUNCA })
    .eq("organization_id", organizationId)
    .eq("source", "zernio")
    .eq("type", "story")
    .is("metrics_reintentar_desde", null)
    .or(`published_at.is.null,published_at.lte."${historiasACerrarHasta(ahora)}"`);
  if (error) {
    console.warn("[syncContentMetrics] no se pudieron cerrar las historias vencidas", {
      organizationId,
      error: error.message,
    });
  }
}

/**
 * Sincroniza métricas de Zernio para piezas de contenido de una organización.
 * Usa el admin client para poder ejecutarse desde crons (sin sesión de usuario).
 *
 * ⭐ Cada pieza intentada queda con `metrics_checked_at`, con o sin dato. Si
 * Zernio no manda datos reconocibles, la pieza suma un intento sin dato y espera
 * (`metrics_reintentar_desde`) antes de volver a la cola; una historia vencida no
 * se reintenta más. Así las piezas que no se pueden medir no tapan ni diluyen la
 * cola de las que sí (SCRUM-172). Reglas en `lib/marketing/cola-de-metricas.ts`.
 *
 * @param contentPieceIds - opcional; si se omite, arma el lote del cron
 *   (hasta METRICS_BATCH_LIMIT piezas).
 */
export async function syncContentMetricsForOrg(
  organizationId: string,
  contentPieceIds?: string[]
): Promise<SyncContentMetricsResult> {
  const empty: SyncContentMetricsResult = { attempted: 0, updated: 0, failed: 0 };

  const integration = await getZernioIntegrationForOrg(organizationId);
  if (!integration) return empty;

  const admin = createAdminClient();
  const inicio = new Date();
  if (!contentPieceIds || contentPieceIds.length === 0) {
    await cerrarHistoriasVencidas(admin, organizationId, inicio);
  }
  const pieces = await elegirPiezas(admin, organizationId, inicio, contentPieceIds);
  if (pieces.length === 0) return empty;

  const client = await getZernioClientForOrganization(organizationId);

  const results = await Promise.allSettled(
    pieces.map(async (piece) => {
      const postId = piece.platform_post_id;
      const momento = new Date();
      const ahora = momento.toISOString();

      // Un solo update por pieza: siempre marca el intento. Con métricas
      // reconocibles las guarda y limpia la espera; sin dato no toca `metrics`
      // ni `metrics_updated_at` (un cero que nadie midió no es un dato).
      let cambios: {
        metrics_checked_at: string;
        metrics?: ContentMetrics;
        metrics_updated_at?: string;
        metrics_intentos_sin_dato?: number;
        metrics_reintentar_desde?: string | null;
      } = { metrics_checked_at: ahora };
      let motivoSinDato: string | null = null;

      // Sin dato (analytics no reconocidos o un error permanente de Zernio): suma
      // un intento y espera antes de volver a la cola.
      const sinDato = (motivo: string) => {
        const intentos = (piece.metrics_intentos_sin_dato ?? 0) + 1;
        cambios = {
          ...cambios,
          metrics_intentos_sin_dato: intentos,
          metrics_reintentar_desde: proximoIntento(piece, intentos, momento),
        };
        motivoSinDato = motivo;
      };

      try {
        const analytics = await client.getPostAnalytics(postId);
        const { metrics, lastUpdated, recognized } = resolvePostAnalytics(analytics);
        if (recognized) {
          cambios = {
            ...cambios,
            metrics,
            metrics_updated_at: lastUpdated ?? ahora,
            metrics_intentos_sin_dato: 0,
            // Una historia se mide una vez: con sus números finales, queda cerrada.
            metrics_reintentar_desde: piece.type === "story" ? NUNCA : null,
          };
        } else {
          sinDato(`analytics sin datos reconocibles para ${postId}`);
        }
      } catch (err) {
        const mensaje = err instanceof Error ? err.message : String(err);
        if (esErrorPermanente(err)) {
          // 4xx distinto de 408 y 429 (por ejemplo 404 de un post borrado): no se
          // arregla reintentando al día siguiente, cuenta como sin dato.
          sinDato(mensaje);
        } else {
          // Un error pasajero (408, 429, 5xx, red) no es "sin dato": no suma intento.
          motivoSinDato = mensaje;
          // Una historia con error pasajero no se marca: sigue como estaba y se
          // vuelve a pedir en la próxima corrida, hasta el cierre de los 7 días.
          if (piece.type === "story") throw new Error(mensaje);
        }
      }

      const { error: updateError } = await admin
        .from("content_pieces")
        .update(cambios)
        .eq("id", piece.id)
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
      return piece.id;
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
