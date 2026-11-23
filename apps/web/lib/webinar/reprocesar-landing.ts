import type { SupabaseClient } from "@supabase/supabase-js";
import { reportarFalla } from "@/lib/observability/reportar-falla";
import { limiteDePendienteTrabado } from "@/lib/webhooks/reclamar";
import { procesarEventoCrudo, type EventoCrudo } from "@/lib/webinar/ingesta-landing";
import {
  codigoSeguro,
  MAXIMO_DE_REPROCESOS,
  MENSAJE_REPROCESO_SIN_TERMINAR,
} from "@/lib/webinar/normalize/reproceso";

/**
 * Reproceso de los eventos de la landing (SCRUM-528), con el patrón de
 * `lib/webhooks/reclamar.ts`: lo corre el cron `/api/cron/reprocesar-landing`
 * cada 10 minutos.
 *
 * Toma los eventos en `error` y los trabados en `pending` (llegaron hace más
 * de `MINUTOS_PENDIENTE_TRABADO` y nadie los cerró: la función se cortó antes
 * o durante la normalización), filtrando por columnas (condición exacta sobre
 * el índice `landing_events_status_received`). Cada uno se reclama con un UPDATE
 * condicionado a lo que se leyó (estado, `reprocess_attempts` y, en un
 * `pending`, la marca `processed_at`) que suma uno a `reprocess_attempts`: dos
 * corridas a la vez no lo procesan dos veces ni cuentan mal.
 *
 * Hasta `MAXIMO_DE_REPROCESOS` reprocesos por evento. Si el último falla (o
 * se cortó sin cerrarse), el evento pasa a `failed`, el error definitivo que
 * el cron ya no lee, y se avisa a Sentry (sin datos personales: el id del
 * evento, la organización, el paso y el SQLSTATE). Para revivirlo, ver
 * `docs/operacion/alertas.md`.
 *
 * `unmapped` no se reprocesa: un lanzamiento desconocido o cerrado no cambia
 * por reintentar.
 */

export const RUTA_DEL_CRON_DE_REPROCESO = "/api/cron/reprocesar-landing";

/** Cuántos eventos toma por corrida, como mucho. */
export const EVENTOS_POR_CORRIDA = 200;

type Candidato = EventoCrudo & {
  status: "error" | "pending";
  processed_at: string | null;
  reprocess_attempts: number;
};

const COLUMNAS =
  "id, organization_id, kind, payload, received_at, status, processed_at, reprocess_attempts";

export type ResumenDeReproceso = {
  encontrados: number;
  procesados: number;
  sinAsignar: number;
  conError: number;
  /** Los que fallaron su último reproceso y no se reintentan más. */
  definitivos: number;
  /** Otro proceso los tomó entre la lectura y el reclamo, o no se pudieron cerrar. */
  omitidos: number;
};

export type OpcionesDeReproceso = {
  limite?: number;
  ahora?: Date;
};

/** Los candidatos, de todas las organizaciones (es el cron), del más viejo al más nuevo. */
async function leerCandidatos(
  admin: SupabaseClient,
  limite: number,
  ahora: Date,
): Promise<Candidato[]> {
  const trabadoAntesDe = limiteDePendienteTrabado(ahora);
  const [fallidos, trabados] = await Promise.all([
    admin
      .from("landing_events")
      .select(COLUMNAS)
      .eq("status", "error")
      .order("received_at", { ascending: true })
      .limit(limite),
    admin
      .from("landing_events")
      .select(COLUMNAS)
      .eq("status", "pending")
      .lt("received_at", trabadoAntesDe)
      .order("received_at", { ascending: true })
      .limit(limite),
  ]);
  const error = fallidos.error ?? trabados.error;
  if (error) {
    throw new Error(
      `No se pudieron leer los eventos de la landing para reprocesar (código ${codigoSeguro(error.code) ?? "sin código"}).`,
    );
  }
  return ([...(fallidos.data ?? []), ...(trabados.data ?? [])] as Candidato[])
    .sort((a, b) => a.received_at.localeCompare(b.received_at))
    .slice(0, limite);
}

/**
 * UPDATE condicionado a lo que se leyó. Devuelve si lo tomó esta corrida.
 * Un `pending` sólo se toma si su marca `processed_at` es vieja o no tiene,
 * igual que en `reclamarEvento`.
 */
async function reclamar(
  admin: SupabaseClient,
  candidato: Candidato,
  cambios: Record<string, unknown>,
  ahora: Date,
): Promise<boolean> {
  const limite = limiteDePendienteTrabado(ahora);
  let consulta = admin
    .from("landing_events")
    .update(cambios)
    .eq("organization_id", candidato.organization_id)
    .eq("id", candidato.id)
    .eq("status", candidato.status)
    .eq("reprocess_attempts", candidato.reprocess_attempts);
  if (candidato.status === "pending") {
    if (candidato.processed_at !== null && candidato.processed_at >= limite) return false;
    consulta = consulta.lt("received_at", limite);
    consulta =
      candidato.processed_at === null
        ? consulta.is("processed_at", null)
        : consulta.lt("processed_at", limite);
  }
  const { data, error } = await consulta.select("id").maybeSingle();
  return !error && Boolean(data);
}

function avisarErrorDefinitivo(
  candidato: Candidato,
  detalle: { paso?: string; codigo?: string | null },
): void {
  console.error("[reprocesar-landing] Un evento de la landing quedó en error definitivo.", {
    organizationId: candidato.organization_id,
    eventoId: candidato.id,
  });
  reportarFalla(
    new Error(
      `Un evento de la landing falló sus ${MAXIMO_DE_REPROCESOS} reprocesos y quedó en error definitivo.`,
    ),
    {
      cron: RUTA_DEL_CRON_DE_REPROCESO,
      organizationId: candidato.organization_id,
      provider: "landing",
      extra: { landing_event_id: candidato.id, paso: detalle.paso ?? null, codigo: codigoSeguro(detalle.codigo) },
    },
  );
}

export async function reprocesarEventosDeLanding(
  admin: SupabaseClient,
  opciones: OpcionesDeReproceso = {},
): Promise<ResumenDeReproceso> {
  const ahora = opciones.ahora ?? new Date();
  const candidatos = await leerCandidatos(admin, opciones.limite ?? EVENTOS_POR_CORRIDA, ahora);
  const resumen: ResumenDeReproceso = {
    encontrados: candidatos.length,
    procesados: 0,
    sinAsignar: 0,
    conError: 0,
    definitivos: 0,
    omitidos: 0,
  };

  for (const candidato of candidatos) {
    const hechos = candidato.reprocess_attempts;

    // Ya agotó sus reprocesos (se cortó en el último sin cerrarse): definitivo sin procesar.
    if (hechos >= MAXIMO_DE_REPROCESOS) {
      const tomado = await reclamar(
        admin,
        candidato,
        { status: "failed", error_message: MENSAJE_REPROCESO_SIN_TERMINAR, processed_at: ahora.toISOString() },
        ahora,
      );
      if (tomado) {
        resumen.definitivos++;
        avisarErrorDefinitivo(candidato, {});
      } else {
        resumen.omitidos++;
      }
      continue;
    }

    const reproceso = hechos + 1;
    const tomado = await reclamar(
      admin,
      candidato,
      { status: "pending", reprocess_attempts: reproceso, processed_at: ahora.toISOString() },
      ahora,
    );
    if (!tomado) {
      resumen.omitidos++;
      continue;
    }

    const resultado = await procesarEventoCrudo(admin, candidato, {
      ultimoIntento: reproceso >= MAXIMO_DE_REPROCESOS,
    });
    if (resultado.status === "processed") resumen.procesados++;
    else if (resultado.status === "unmapped") resumen.sinAsignar++;
    else if (resultado.status === "sin_cerrar") resumen.omitidos++;
    else if (resultado.status === "failed") {
      resumen.definitivos++;
      avisarErrorDefinitivo(candidato, { paso: resultado.paso, codigo: resultado.codigo });
    } else {
      resumen.conError++;
    }
  }
  return resumen;
}
