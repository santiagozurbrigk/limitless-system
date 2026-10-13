import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingTableError } from "@/lib/auth/bootstrap";
import { FallaDeLaBase } from "@/lib/server/action-result";
import { leerZonaHorariaDeLaOrganizacion } from "@/lib/fechas/organizacion";
import {
  buildClientProgress,
  buildJourney,
  deriveJourneyStatuses,
  groupEventsByClient,
  rowToCheckpoint,
  rowToCheckpointEvent,
  rowToJourneyStage,
} from "@/lib/checkpoints";
import { leerColumnas } from "@/lib/custom-fields/leer-columnas";
import type {
  Checkpoint,
  CheckpointEvent,
  CheckpointEventRow,
  CheckpointRow,
  CheckpointWithEvent,
  ClientJourneyStatus,
  JourneyStage,
  JourneyStageRow,
} from "@/types/checkpoints";
import type { FieldDefinition } from "@/types/custom-fields";

/**
 * Las lecturas del recorrido del cliente (fases, checkpoints y eventos), con
 * la falla a la vista (SCRUM-517).
 *
 * Antes cada acción de lectura atrapaba todo y devolvía `[]`: una caída de la
 * base se veía como "todavía no hay un recorrido", y las escrituras que usaban
 * esas listas para validar rechazaban con un motivo falso ("La fase elegida no
 * existe", "El checkpoint no existe") o, al recalcular la fase de un cliente,
 * la dejaban en blanco.
 *
 * Acá una tabla que todavía no existe (antes de su migración) sigue contando
 * como vacía, igual que antes; cualquier otro error de la base lanza una
 * `FallaDeLaBase`. Quien llama decide: las acciones la devuelven como valor
 * (se registra y el usuario ve el texto fijo) y las escrituras no siguen con
 * datos que no se pudieron leer.
 */

type ErrorDeConsulta = { message: string; code?: string | null };

function fallaSalvoTablaAusente(error: ErrorDeConsulta): void {
  if (isMissingTableError(error.message)) return;
  throw new FallaDeLaBase(error);
}

export async function leerFasesDelRecorrido(
  supabase: SupabaseClient,
  organizationId: string
): Promise<JourneyStage[]> {
  const { data, error } = await supabase
    .from("client_journey_stages")
    .select("*")
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: true });

  if (error) {
    fallaSalvoTablaAusente(error);
    return [];
  }
  return ((data ?? []) as JourneyStageRow[]).map(rowToJourneyStage);
}

export async function leerCheckpoints(
  supabase: SupabaseClient,
  organizationId: string
): Promise<Checkpoint[]> {
  const { data, error } = await supabase
    .from("client_checkpoints")
    .select("*")
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: true });

  if (error) {
    fallaSalvoTablaAusente(error);
    return [];
  }
  return ((data ?? []) as CheckpointRow[]).map(rowToCheckpoint);
}

/** Los eventos de un cliente, del más nuevo al más viejo. */
export async function leerEventosDelCliente(
  supabase: SupabaseClient,
  organizationId: string,
  clientId: string
): Promise<CheckpointEvent[]> {
  const { data, error } = await supabase
    .from("client_checkpoint_events")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("client_id", clientId)
    .order("reached_at", { ascending: false });

  if (error) {
    fallaSalvoTablaAusente(error);
    return [];
  }
  return ((data ?? []) as CheckpointEventRow[]).map(rowToCheckpointEvent);
}

export type RecorridoDelCliente = {
  progress: CheckpointWithEvent[];
  checkpointFields: FieldDefinition[];
  journeyConfigured: boolean;
};

/** El recorrido de un cliente con sus eventos y las columnas de las métricas. */
export async function leerRecorridoDelCliente(
  supabase: SupabaseClient,
  organizationId: string,
  clientId: string
): Promise<RecorridoDelCliente> {
  const [stages, checkpoints, events, fields] = await Promise.all([
    leerFasesDelRecorrido(supabase, organizationId),
    leerCheckpoints(supabase, organizationId),
    leerEventosDelCliente(supabase, organizationId, clientId),
    leerColumnas(supabase, organizationId, "checkpoint"),
  ]);

  const journey = buildJourney(stages, checkpoints);
  return {
    progress: buildClientProgress(journey.stages, events),
    checkpointFields: fields,
    journeyConfigured: journey.stages.length > 0,
  };
}

/**
 * Fase actual y "trabado" de cada cliente de la organización, en una pasada.
 *
 * Trae **todos** los eventos de la org de una y los agrupa en memoria. Cargar el
 * recorrido por cliente sería una consulta por fila de la lista.
 */
export async function leerEstadosDelRecorrido(
  supabase: SupabaseClient,
  organizationId: string
): Promise<Record<string, ClientJourneyStatus>> {
  // Las consultas armadas en el lugar van primero: si `from()` lanzara al
  // armarse, ninguna de las lecturas async quedaría con su rechazo sin atender.
  const [eventsResult, clientsResult, stages, checkpoints, zona] = await Promise.all([
    supabase
      .from("client_checkpoint_events")
      .select("*")
      .eq("organization_id", organizationId),
    supabase.from("clients").select("id").eq("organization_id", organizationId),
    leerFasesDelRecorrido(supabase, organizationId),
    leerCheckpoints(supabase, organizationId),
    // "Vence el" y "trabado hace N días" se cuentan en días de la organización.
    leerZonaHorariaDeLaOrganizacion(supabase, organizationId),
  ]);

  if (eventsResult.error) {
    fallaSalvoTablaAusente(eventsResult.error);
    return {};
  }
  if (clientsResult.error) throw new FallaDeLaBase(clientsResult.error);

  const journey = buildJourney(stages, checkpoints);
  // Sin recorrido configurado no hay nada que derivar: la lista no muestra
  // columna en vez de mostrar una vacía para cada fila.
  if (journey.stages.length === 0) return {};

  const events = ((eventsResult.data ?? []) as CheckpointEventRow[]).map(rowToCheckpointEvent);
  const clientIds = ((clientsResult.data ?? []) as { id: string }[]).map((row) => row.id);

  const statuses = deriveJourneyStatuses(
    journey.stages,
    groupEventsByClient(events),
    clientIds,
    new Date(),
    zona
  );

  return Object.fromEntries(statuses);
}

/** La fase fijada a mano de cada cliente que la tiene. */
export async function leerFasesFijadas(
  supabase: SupabaseClient,
  organizationId: string
): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from("clients")
    .select("id, manual_stage_id")
    .eq("organization_id", organizationId)
    .not("manual_stage_id", "is", null);

  if (error) throw new FallaDeLaBase(error);

  const result: Record<string, string> = {};
  for (const row of (data ?? []) as { id: string; manual_stage_id: string }[]) {
    result[row.id] = row.manual_stage_id;
  }
  return result;
}
