/**
 * lib/vturb/stats.ts
 *
 * Trae las estadísticas de un player para un período, con caché.
 *
 * ⭐ POR QUÉ HAY CACHÉ Y NO UNA TABLA DE MÉTRICAS DIARIAS
 *
 * `ad_metrics_daily` guarda una fila por día y el resolver suma. Con VTurb eso
 * no funciona: `engagement_rate` es un **promedio**, y el promedio de los
 * promedios diarios no es el promedio del período — cada día pesa distinto según
 * cuántas sesiones tuvo. Sumarlo daría un número sin significado.
 *
 * Así que se le pide a VTurb el período exacto y se guarda la respuesta cruda.
 * Eso además respeta sus cuotas, que son ajustadas: entre 60 y 800 requests por
 * minuto según el plan, y **una sola llamada HTTP puede contar como más de una
 * query**.
 *
 * ⭐ EL PERÍODO CERRADO NO SE VUELVE A PEDIR
 *
 * Un período que ya terminó no va a cambiar nunca: se cachea indefinidamente
 * (`is_final`). Uno que incluye hoy sí cambia, y se refresca cada 30 minutos.
 *
 * Sólo servidor: usa el service role para leer la API key cifrada.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getVTurbSessionStats,
  getVTurbUserEngagement,
  VTurbApiError,
  type VTurbEngagement,
  type VTurbStats,
} from "./client";
import { decryptVTurbApiKey, getVTurbIntegrationForOrg } from "./integration";
import { resolveVTurbMeasures, type VTurbFunnelMeasures } from "./resolve-stats";

/** Cuánto vale una respuesta de un período que todavía está abierto. */
const OPEN_PERIOD_TTL_MS = 30 * 60 * 1000;

export type VTurbPlayerRow = {
  external_id: string;
  name: string | null;
  duration_seconds: number | null;
  pitch_time: number | null;
};

export type VTurbPeriodResult = VTurbFunnelMeasures & {
  playerId: string;
  /** `true` si la respuesta salió de la caché y no de la API. */
  fromCache: boolean;
  /** Mensaje del último error, si la última consulta falló. */
  error: string | null;
};

/** Todo `null`, que es el resultado correcto cuando no se pudo consultar. */
function emptyResult(playerId: string, error: string | null): VTurbPeriodResult {
  return {
    playerId,
    pageViews: null,
    plays: null,
    avgWatchPct: null,
    ctaClicks: null,
    reachedCta: null,
    reachedCtaReason: null,
    fromCache: false,
    error,
  };
}

/**
 * ¿El período ya terminó?
 *
 * Se compara contra la fecha de hoy en UTC. Un período cuyo último día es hoy
 * (o futuro) sigue abierto: pueden entrar sesiones nuevas.
 */
export function isClosedPeriod(endDate: string, today: string = new Date().toISOString().slice(0, 10)): boolean {
  return endDate < today;
}

function isFresh(fetchedAt: string, isFinal: boolean, now: number): boolean {
  if (isFinal) return true;
  const at = Date.parse(fetchedAt);
  return Number.isFinite(at) && now - at < OPEN_PERIOD_TTL_MS;
}

/**
 * Medidas de VTurb para un player y un período.
 *
 * Devuelve todo en `null` si la org no tiene VTurb, si el player no está en el
 * catálogo o si la API falla. Ninguno de esos casos es un cero.
 */
export async function getVTurbPeriodMeasures(
  organizationId: string,
  playerId: string,
  startDate: string,
  endDate: string,
  /** Segundo del CTA configurado en Limitless, para players sin `pitch_time` en VTurb. */
  configuredPitchTime?: number | null
): Promise<VTurbPeriodResult> {
  const admin = createAdminClient();
  const now = Date.now();

  // 1) Catálogo — de acá salen `duration` (requerido por el endpoint de
  //    retención) y `pitch_time`.
  const { data: playerRow } = await admin
    .from("vturb_players")
    .select("external_id, name, duration_seconds, pitch_time")
    .eq("organization_id", organizationId)
    .eq("external_id", playerId)
    .maybeSingle();

  const player = playerRow as VTurbPlayerRow | null;
  if (!player) {
    return emptyResult(playerId, "El player no está sincronizado todavía");
  }

  // El de VTurb manda; el configurado en Limitless es el respaldo para los players que
  // no lo tienen puesto.
  const pitchTime = player.pitch_time && player.pitch_time > 0
    ? player.pitch_time
    : (configuredPitchTime ?? null);

  // 2) Caché.
  const { data: cached } = await admin
    .from("vturb_stats_cache")
    .select("stats, engagement, pitch_time, is_final, fetched_at, error_message")
    .eq("organization_id", organizationId)
    .eq("player_external_id", playerId)
    .eq("start_date", startDate)
    .eq("end_date", endDate)
    .maybeSingle();

  if (
    cached &&
    // Un `pitch_time` distinto cambia el significado de `total_over_pitch`, así
    // que la fila cacheada ya no responde la pregunta que se está haciendo.
    (cached.pitch_time ?? null) === pitchTime &&
    isFresh(cached.fetched_at as string, Boolean(cached.is_final), now)
  ) {
    return {
      playerId,
      ...resolveVTurbMeasures({
        stats: cached.stats as VTurbStats | null,
        engagement: cached.engagement as VTurbEngagement | null,
        pitchTime,
      }),
      fromCache: true,
      error: (cached.error_message as string | null) ?? null,
    };
  }

  // 3) Consultar VTurb.
  const credentials = await getVTurbIntegrationForOrg(organizationId).catch(() => null);
  if (!credentials) return emptyResult(playerId, "VTurb no está conectado");

  const apiKey = decryptVTurbApiKey(credentials.api_key_encrypted, credentials.organization_id);
  const timezone = credentials.timezone;

  let stats: VTurbStats | null = null;
  let engagement: VTurbEngagement | null = null;
  let errorMessage: string | null = null;

  try {
    stats = await getVTurbSessionStats(apiKey, {
      playerId,
      startDate,
      endDate,
      timezone,
      ...(player.duration_seconds ? { videoDuration: player.duration_seconds } : {}),
      ...(pitchTime ? { pitchTime } : {}),
    });
  } catch (error) {
    errorMessage = describeError(error);
  }

  // La retención necesita `video_duration` sí o sí. Sin duración en el catálogo
  // no se puede pedir, y M11 queda sin fuente en vez de en cero.
  if (player.duration_seconds) {
    try {
      engagement = await getVTurbUserEngagement(apiKey, {
        playerId,
        startDate,
        endDate,
        timezone,
        videoDuration: player.duration_seconds,
      });
    } catch (error) {
      errorMessage = errorMessage ?? describeError(error);
    }
  }

  // 4) Guardar crudo, aun si una de las dos llamadas falló: lo que sí llegó
  //    sirve, y el error queda registrado.
  await admin.from("vturb_stats_cache").upsert(
    {
      organization_id: organizationId,
      player_external_id: playerId,
      start_date: startDate,
      end_date: endDate,
      stats,
      engagement,
      pitch_time: pitchTime,
      is_final: isClosedPeriod(endDate) && stats !== null,
      error_message: errorMessage,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,player_external_id,start_date,end_date" }
  );

  return {
    playerId,
    ...resolveVTurbMeasures({ stats, engagement, pitchTime }),
    fromCache: false,
    error: errorMessage,
  };
}

function describeError(error: unknown): string {
  if (error instanceof VTurbApiError) {
    return error.resetsAt
      ? `${error.message} (cuota agotada, se repone ${error.resetsAt})`
      : error.message;
  }
  return error instanceof Error ? error.message : "Error desconocido";
}
