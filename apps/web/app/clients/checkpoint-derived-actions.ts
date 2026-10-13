"use server";

/**
 * C3 · Derivados del recorrido y buzón de propuestas.
 *
 * Dos cosas distintas que viven juntas porque las dos son "lo que el recorrido
 * te devuelve":
 *   · el resumen por cliente (fase actual + trabado) para la lista de clientes;
 *   · las propuestas de fuentes externas, que alguien acepta o descarta.
 *
 * ⭐ Nada se dispara solo: aceptar una propuesta crea el evento real por el mismo
 * camino que el registro manual (C2), con las mismas validaciones.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  getCurrentProfile,
  isMissingTableError,
  requireOrganizationId,
} from "@/lib/auth/bootstrap";
import type {
  CheckpointProposal,
  CheckpointProposalRow,
  ClientJourneyStatus,
} from "@/types/checkpoints";
import {
  CHECKPOINT_PROPOSAL_SOURCES,
  CHECKPOINT_PROPOSAL_STATUSES,
} from "@/types/checkpoints";
import { leerEstadosDelRecorrido } from "@/lib/checkpoints/lecturas-del-recorrido";
import { createCheckpointProposal } from "@/lib/checkpoints/create-proposal";
import { recordCheckpointAction } from "@/app/clients/checkpoint-event-actions";
import {
  ErrorEsperable,
  FallaDeLaBase,
  mutacionConErroresEsperables,
  type MutationResult,
} from "@/lib/server/action-result";
import { firstZodError } from "@/lib/validations";
import { createClient } from "@/lib/supabase/server";
import { paths } from "@/routes";

// ─── El resumen para la lista de clientes ───────────────────────────────────

/**
 * Fase actual y "trabado" de cada cliente de la organización, en una pasada
 * (ver `leerEstadosDelRecorrido`).
 *
 * SCRUM-517: con un error devuelve el motivo. Antes atrapaba todo y devolvía
 * `{}`: una caída de la base se veía como "ningún cliente trabado".
 */
export async function getClientsJourneyStatusAction(): Promise<
  MutationResult<Record<string, ClientJourneyStatus>>
> {
  return mutacionConErroresEsperables("[getClientsJourneyStatus]", async () => {
    const organizationId = await requireOrganizationId();
    return leerEstadosDelRecorrido(await createClient(), organizationId);
  });
}

// ─── El buzón de propuestas ─────────────────────────────────────────────────

export async function listCheckpointProposalsAction(
  clientId?: string
): Promise<MutationResult<CheckpointProposal[]>> {
  return mutacionConErroresEsperables("[listCheckpointProposals]", async () => {
    const organizationId = await requireOrganizationId();
    const supabase = await createClient();

    let query = supabase
      .from("client_checkpoint_proposals")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (clientId) query = query.eq("client_id", clientId);

    const { data, error } = await query;
    if (error) {
      // Antes de su migración la tabla no existe: no hay propuestas.
      if (isMissingTableError(error.message)) return [];
      throw new FallaDeLaBase(error);
    }
    return ((data ?? []) as CheckpointProposalRow[]).map(rowToCheckpointProposal);
  });
}

/**
 * Aceptar una propuesta: crea el evento real y la marca resuelta.
 *
 * ⭐ Pasa por `recordCheckpointAction`, el mismo camino que el registro manual.
 * Así una propuesta no puede saltear las validaciones de las métricas ni la
 * regla de la fecha, y el estado del cliente se mueve igual que siempre.
 *
 * Si la creación del evento falla, la propuesta **queda pendiente**: no se marca
 * aceptada algo que no se registró.
 */
export async function acceptCheckpointProposalAction(
  proposalId: string
): Promise<MutationResult<void>> {
  return mutacionConErroresEsperables("[acceptCheckpointProposal]", async () => {
    const organizationId = await requireOrganizationId();
    const profile = await getCurrentProfile();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("client_checkpoint_proposals")
      .select("*")
      .eq("id", proposalId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (error) throw new FallaDeLaBase(error);
    if (!data) throw new ErrorEsperable("La propuesta no existe");

    const proposal = rowToCheckpointProposal(data as CheckpointProposalRow);
    if (proposal.status !== "pending") {
      throw new ErrorEsperable("Esa propuesta ya estaba resuelta");
    }

    const recorded = await recordCheckpointAction({
      clientId: proposal.clientId,
      checkpointId: proposal.checkpointId,
      reachedAt: proposal.suggestedReachedAt ?? undefined,
      metrics: proposal.suggestedMetrics,
      note: proposal.rationale,
    });
    // El motivo ya viene para el usuario (y si fue una falla, ya quedó
    // registrada con la etiqueta de `recordCheckpoint`): pasa tal cual y la
    // propuesta queda pendiente.
    if (!recorded.success) throw new ErrorEsperable(recorded.error);

    await resolveProposal(proposalId, organizationId, "accepted", profile?.id ?? null);
    revalidatePath(paths.platform.clients.detail(proposal.clientId));
  });
}

/** Descartar una propuesta. No crea nada; queda como historial. */
export async function rejectCheckpointProposalAction(
  proposalId: string
): Promise<MutationResult<void>> {
  return mutacionConErroresEsperables("[rejectCheckpointProposal]", async () => {
    const organizationId = await requireOrganizationId();
    const profile = await getCurrentProfile();
    await resolveProposal(proposalId, organizationId, "rejected", profile?.id ?? null);
  });
}

const createProposalSchema = z.object({
  clientId: z.string().uuid(),
  checkpointId: z.string().uuid(),
  source: z.enum(CHECKPOINT_PROPOSAL_SOURCES),
  sourceRef: z.string().trim().max(300).nullable().default(null),
  rationale: z.string().trim().max(1000).nullable().default(null),
  suggestedReachedAt: z.string().datetime().nullable().default(null),
  suggestedMetrics: z.record(z.string(), z.unknown()).default({}),
  confidence: z.number().min(0).max(1).nullable().default(null),
});

export type CreateCheckpointProposalInput = z.input<typeof createProposalSchema>;

/**
 * Entrada del buzón: la usan los Encargos B (Fathom) y E (Discord).
 *
 * Es idempotente por (cliente, checkpoint, fuente) mientras la propuesta esté
 * pendiente: un sync que corre cada hora no deja veinte propuestas iguales. Si
 * el hito **ya está registrado**, no se propone nada — proponer lo que ya pasó
 * es ruido.
 */
export async function createCheckpointProposalAction(
  input: CreateCheckpointProposalInput
): Promise<MutationResult<{ created: boolean }>> {
  return mutacionConErroresEsperables("[createCheckpointProposal]", async () => {
    const organizationId = await requireOrganizationId();

    const parsed = createProposalSchema.safeParse(input);
    if (!parsed.success) throw new ErrorEsperable(firstZodError(parsed.error));
    const values = parsed.data;

    // `createCheckpointProposal` escribe con service role (lo comparten los
    // crons, que no tienen sesión): la RLS no frena un cliente o un checkpoint
    // de otra organización. Acá se verifica con la sesión y la org efectiva.
    await exigirClienteYCheckpointDeLaOrg(organizationId, values.clientId, values.checkpointId);

    const result = await createCheckpointProposal({
      organizationId,
      clientId: values.clientId,
      checkpointId: values.checkpointId,
      source: values.source,
      sourceRef: values.sourceRef,
      rationale: values.rationale,
      suggestedReachedAt: values.suggestedReachedAt,
      suggestedMetrics: values.suggestedMetrics,
      confidence: values.confidence,
    });

    if (!result.created) return { created: false };

    revalidatePath(paths.platform.clients.detail(values.clientId));
    return { created: true };
  });
}

// ─── Ayudas ─────────────────────────────────────────────────────────────────

/**
 * El cliente y el checkpoint de una propuesta tienen que ser de la
 * organización de la sesión (SCRUM-517). Si no, se rechaza con el mismo motivo
 * que si no existieran: no se confirma que exista algo de otra org.
 */
async function exigirClienteYCheckpointDeLaOrg(
  organizationId: string,
  clientId: string,
  checkpointId: string
) {
  const supabase = await createClient();
  const cliente = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (cliente.error) throw new FallaDeLaBase(cliente.error);
  if (!cliente.data) throw new ErrorEsperable("El cliente no existe");

  const checkpoint = await supabase
    .from("client_checkpoints")
    .select("id")
    .eq("id", checkpointId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (checkpoint.error) throw new FallaDeLaBase(checkpoint.error);
  if (!checkpoint.data) throw new ErrorEsperable("El checkpoint no existe");
}

async function resolveProposal(
  proposalId: string,
  organizationId: string,
  status: "accepted" | "rejected",
  resolvedBy: string | null
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("client_checkpoint_proposals")
    .update({
      status,
      resolved_by: resolvedBy,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", proposalId)
    .eq("organization_id", organizationId);

  if (error) throw new FallaDeLaBase(error);
}

function rowToCheckpointProposal(row: CheckpointProposalRow): CheckpointProposal {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    checkpointId: row.checkpoint_id,
    source: (CHECKPOINT_PROPOSAL_SOURCES as readonly string[]).includes(row.source)
      ? (row.source as CheckpointProposal["source"])
      : "automatic",
    sourceRef: row.source_ref,
    rationale: row.rationale,
    suggestedReachedAt: row.suggested_reached_at,
    suggestedMetrics:
      typeof row.suggested_metrics === "object" &&
      row.suggested_metrics !== null &&
      !Array.isArray(row.suggested_metrics)
        ? (row.suggested_metrics as Record<string, unknown>)
        : {},
    confidence: row.confidence,
    status: (CHECKPOINT_PROPOSAL_STATUSES as readonly string[]).includes(row.status)
      ? (row.status as CheckpointProposal["status"])
      : "pending",
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
