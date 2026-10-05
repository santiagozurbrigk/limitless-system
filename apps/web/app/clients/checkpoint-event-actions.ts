"use server";

/**
 * C2 · Registrar, editar y deshacer que un cliente alcanzó un checkpoint.
 *
 * Al registrarse, un evento puede mover el estado grueso del cliente
 * (clients.status) y siempre recalcula su fase actual (clients.current_stage_id).
 * Las métricas se validan con las reglas de C0: lo que no se entiende se
 * rechaza, no se guarda como cero.
 *
 * A diferencia del catálogo (C1, sólo founder), registrar un checkpoint es
 * trabajo operativo: lo puede hacer cualquier miembro con acceso a clientes. El
 * gate real es la RLS por organización.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  getCurrentProfile,
  isMissingTableError,
  requireOrganizationId,
} from "@/lib/auth/bootstrap";
import type {
  CheckpointEvent,
  CheckpointEventRow,
  CheckpointWithEvent,
} from "@/types/checkpoints";
import {
  buildClientProgress,
  resolveCurrentStageId,
  rowToCheckpointEvent,
} from "@/lib/checkpoints";
import { resolveMetricSchema } from "@/lib/checkpoints/metric-schema";
import { validateFieldValues } from "@/lib/custom-fields";
import {
  listCheckpointsAction,
  listJourneyStagesAction,
} from "@/app/clients/checkpoint-actions";
import { listFieldDefinitionsAction } from "@/app/clients/custom-field-actions";
import { buildJourney } from "@/lib/checkpoints";
import { hitoEsFuturo } from "@/lib/checkpoints/fecha-del-hito";
import { leerZonaHorariaDeLaOrganizacion } from "@/lib/fechas/organizacion";
import { runMutation, type MutationResult } from "@/lib/server/action-result";
import { firstZodError } from "@/lib/validations";
import { createClient } from "@/lib/supabase/server";
import { paths } from "@/routes";

const recordSchema = z.object({
  clientId: z.string().uuid(),
  checkpointId: z.string().uuid(),
  /** Instante ISO. Puede ser de hoy o de antes, nunca de un día futuro (se valida abajo). */
  reachedAt: z.string().datetime().optional(),
  metrics: z.record(z.string(), z.unknown()).default({}),
  note: z.string().trim().max(1000).nullable().default(null),
});

export type RecordCheckpointInput = z.input<typeof recordSchema>;

function revalidate(clientId: string) {
  revalidatePath(paths.platform.clients.detail(clientId));
  revalidatePath(paths.platform.clients.root);
}

// ─── Lectura ────────────────────────────────────────────────────────────────

/** Los eventos de un cliente. */
export async function listCheckpointEventsAction(
  clientId: string
): Promise<CheckpointEvent[]> {
  try {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("client_checkpoint_events")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("client_id", clientId)
      .order("reached_at", { ascending: false });

    if (error) {
      if (isMissingTableError(error.message)) return [];
      console.error("[listCheckpointEvents]", error.message);
      return [];
    }
    return (data as CheckpointEventRow[]).map(rowToCheckpointEvent);
  } catch {
    return [];
  }
}

/**
 * El recorrido de un cliente con sus eventos: lo que dibuja la ficha.
 *
 * Devuelve también los campos de C0 (para el formulario de métricas) y si el
 * recorrido está vacío (para el estado que manda a configurarlo).
 */
export async function getClientJourneyAction(clientId: string): Promise<{
  progress: CheckpointWithEvent[];
  checkpointFields: Awaited<ReturnType<typeof listFieldDefinitionsAction>>;
  journeyConfigured: boolean;
}> {
  const [stages, checkpoints, events, fields] = await Promise.all([
    listJourneyStagesAction(),
    listCheckpointsAction(),
    listCheckpointEventsAction(clientId),
    listFieldDefinitionsAction("checkpoint"),
  ]);

  const journey = buildJourney(stages, checkpoints);
  return {
    progress: buildClientProgress(journey.stages, events),
    checkpointFields: fields,
    journeyConfigured: journey.stages.length > 0,
  };
}

// ─── Escritura ──────────────────────────────────────────────────────────────

/**
 * Registra (o vuelve a registrar) que un cliente alcanzó un checkpoint.
 *
 * El índice único (client_id, checkpoint_id) garantiza un solo evento por
 * cliente: por eso se hace upsert, y "registrar de nuevo" edita el que ya está
 * en vez de duplicar.
 */
export async function recordCheckpointAction(
  input: RecordCheckpointInput
): Promise<MutationResult<CheckpointEvent>> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const profile = await getCurrentProfile();

    const parsed = recordSchema.safeParse(input);
    if (!parsed.success) throw new Error(firstZodError(parsed.error));
    const values = parsed.data;

    const supabase = await createClient();
    const [checkpoints, fields, zona] = await Promise.all([
      listCheckpointsAction(),
      listFieldDefinitionsAction("checkpoint"),
      leerZonaHorariaDeLaOrganizacion(supabase, organizationId),
    ]);

    // Registrar algo que todavía no ocurrió lo convierte en una intención, y
    // eso rompe todo lo que se mide después. Se decide por día en la zona de la
    // organización: el diálogo guarda el mediodía del día elegido, que a la
    // mañana todavía no llegó y no por eso es futuro.
    const reachedAt = values.reachedAt ?? new Date().toISOString();
    if (hitoEsFuturo(reachedAt, zona)) {
      throw new Error("La fecha no puede ser futura: registrás algo que ya pasó.");
    }
    const checkpoint = checkpoints.find((c) => c.id === values.checkpointId);
    if (!checkpoint) throw new Error("El checkpoint no existe");

    // Las métricas se validan con las reglas de C0, contra sólo los campos que
    // este checkpoint pide y que todavía existen. Una referencia rota no pide
    // nada (no se puede validar contra algo que no está).
    const resolved = resolveMetricSchema(checkpoint.metricSchema, fields);
    const askedFields = resolved
      .filter((entry) => entry.field !== null)
      .map((entry) => ({ ...entry.field!, isRequired: entry.required }));

    const validation = validateFieldValues(askedFields, values.metrics);
    if (!validation.ok) {
      throw new Error(Object.values(validation.errors)[0] ?? "Métricas inválidas");
    }

    const { data, error } = await supabase
      .from("client_checkpoint_events")
      .upsert(
        {
          organization_id: organizationId,
          client_id: values.clientId,
          checkpoint_id: values.checkpointId,
          reached_at: reachedAt,
          metrics: validation.values,
          note: values.note,
          recorded_by: profile?.id ?? null,
          source: "manual",
        },
        { onConflict: "client_id,checkpoint_id" }
      )
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    // Si el checkpoint fija un estado, el cliente pasa a ese estado solo. Es la
    // mitad del pedido: configurar una vez y que el estado se mantenga.
    if (checkpoint.setsClientStatus) {
      await applyClientStatus(values.clientId, organizationId, checkpoint.setsClientStatus);
    }

    await recomputeCurrentStage(values.clientId, organizationId);

    revalidate(values.clientId);
    return rowToCheckpointEvent(data as CheckpointEventRow);
  });
}

/**
 * Deshace un registro.
 *
 * ⭐ No revierte el estado grueso del cliente: volver automáticamente sería
 * adivinar a cuál estado. Sí recalcula la fase actual, porque eso se deriva del
 * recorrido sin ambigüedad. El llamador avisa lo primero en la UI.
 */
export async function undoCheckpointAction(
  eventId: string,
  clientId: string
): Promise<MutationResult<void>> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    const { error } = await supabase
      .from("client_checkpoint_events")
      .delete()
      .eq("id", eventId)
      .eq("organization_id", organizationId);

    if (error) throw new Error(error.message);

    await recomputeCurrentStage(clientId, organizationId);
    revalidate(clientId);
  });
}

// ─── Ayudas ─────────────────────────────────────────────────────────────────

/**
 * Escribe clients.status. No pasa por updateClientAction para no arrastrar su
 * schema entero; es un solo campo y la RLS filtra por organización igual.
 */
async function applyClientStatus(
  clientId: string,
  organizationId: string,
  status: string
) {
  const supabase = await createClient();
  const patch: Record<string, unknown> = { status };
  // Coherente con cómo la ficha marca el caso de éxito hoy.
  if (status === "success_case") patch.is_success_case = true;

  const { error } = await supabase
    .from("clients")
    .update(patch)
    .eq("id", clientId)
    .eq("organization_id", organizationId);

  if (error) throw new Error(error.message);
}

/** Recalcula clients.current_stage_id desde los eventos vigentes del cliente. */
async function recomputeCurrentStage(clientId: string, organizationId: string) {
  const [stages, checkpoints, events] = await Promise.all([
    listJourneyStagesAction(),
    listCheckpointsAction(),
    listCheckpointEventsAction(clientId),
  ]);

  const journey = buildJourney(stages, checkpoints);
  const currentStageId = resolveCurrentStageId(journey.stages, events);

  const supabase = await createClient();
  const { error } = await supabase
    .from("clients")
    .update({ current_stage_id: currentStageId })
    .eq("id", clientId)
    .eq("organization_id", organizationId);

  if (error && !isMissingTableError(error.message)) {
    console.error("[recomputeCurrentStage]", error.message);
  }
}
