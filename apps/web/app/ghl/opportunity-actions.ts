"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireOrganizationId } from "@/lib/auth/bootstrap";
import {
  rechazoPorModulo,
  type RechazoPorModulo,
} from "@/lib/auth/acceso-a-modulo";
import { runMutation, type MutationResult } from "@/lib/server/action-result";
import { createClient } from "@/lib/supabase/server";
import { paths } from "@/routes";
import {
  getGHLIntegrationForOrg,
  getGHLStageHistorySince,
  setGHLWebhookSecret,
} from "@/lib/ghl/integration";
import { syncGHLPipelinesForOrg } from "@/lib/ghl/sync-pipelines";

/**
 * Server Actions de la unidad I-4 — oportunidades de GoHighLevel.
 *
 * Separadas de `app/ghl/actions.ts` (calendarios y appointments) porque son otro
 * recurso de la API, con otra versión de header y otro modelo de datos.
 */

// ─── Catálogo de pipelines y etapas ───────────────────────────────────────────

export type GHLStageOption = {
  stageId: string;
  stageName: string | null;
  pipelineId: string;
  pipelineName: string | null;
  position: number | null;
};

/**
 * Etapas disponibles para configurar un binding de embudo.
 *
 * Sale del catálogo guardado, no de la API: la UI no debería depender de una
 * llamada externa para pintar un selector. Si está vacío, falta sincronizar.
 */
export async function listGHLStageOptionsAction(): Promise<GHLStageOption[] | RechazoPorModulo> {
  const rechazo = await rechazoPorModulo("funnels");
  if (rechazo) return rechazo;
  const organizationId = await requireOrganizationId();
  const supabase = await createClient();

  const [{ data: stages }, { data: pipelines }] = await Promise.all([
    supabase
      .from("ghl_pipeline_stages")
      .select("external_id, name, position, pipeline_external_id")
      .eq("organization_id", organizationId)
      .order("position", { ascending: true }),
    supabase
      .from("ghl_pipelines")
      .select("external_id, name")
      .eq("organization_id", organizationId),
  ]);

  const pipelineName = new Map(
    (pipelines ?? []).map((p) => [p.external_id as string, (p.name as string | null) ?? null])
  );

  return (stages ?? []).map((stage) => ({
    stageId: stage.external_id as string,
    stageName: (stage.name as string | null) ?? null,
    pipelineId: stage.pipeline_external_id as string,
    pipelineName: pipelineName.get(stage.pipeline_external_id as string) ?? null,
    position: (stage.position as number | null) ?? null,
  }));
}

export type GHLPipelineSyncActionResult = {
  pipelines: number;
  stages: number;
  skipped: number;
};

/** Trae los pipelines y etapas desde GHL y los guarda. */
export async function syncGHLPipelinesAction(): Promise<
  MutationResult<GHLPipelineSyncActionResult>
> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();
    const result = await syncGHLPipelinesForOrg(organizationId);
    if (result.error) throw new Error(result.error);

    revalidatePath(paths.platform.integrations);
    return {
      pipelines: result.pipelines,
      stages: result.stages,
      skipped: result.skipped,
    };
  });
}

// ─── Estado del historial de etapas ───────────────────────────────────────────

export type GHLOpportunitiesStatus = {
  connected: boolean;
  /** Desde cuándo Limitless tiene historial. `null` = todavía no llegó ningún evento. */
  stageHistorySince: string | null;
  pipelinesSyncedAt: string | null;
  pipelineCount: number;
  stageCount: number;
  transitionCount: number;
  /** URL a pegar en la acción "Webhook" de un Workflow de GHL. */
  workflowWebhookUrl: string | null;
  hasWebhookSecret: boolean;
};

export async function getGHLOpportunitiesStatusAction(): Promise<GHLOpportunitiesStatus> {
  const organizationId = await requireOrganizationId();
  const supabase = await createClient();

  const empty: GHLOpportunitiesStatus = {
    connected: false,
    stageHistorySince: null,
    pipelinesSyncedAt: null,
    pipelineCount: 0,
    stageCount: 0,
    transitionCount: 0,
    workflowWebhookUrl: null,
    hasWebhookSecret: false,
  };

  const row = await getGHLIntegrationForOrg(organizationId).catch(() => null);
  if (!row) return empty;

  const [pipelines, stages, transitions] = await Promise.all([
    supabase
      .from("ghl_pipelines")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    supabase
      .from("ghl_pipeline_stages")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    supabase
      .from("ghl_stage_transitions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
  ]);

  const rowWithExtras = row as typeof row & {
    webhook_secret_encrypted?: string | null;
    pipelines_synced_at?: string | null;
  };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? null;

  return {
    connected: true,
    stageHistorySince: await getGHLStageHistorySince(organizationId),
    pipelinesSyncedAt: rowWithExtras.pipelines_synced_at ?? null,
    pipelineCount: pipelines.count ?? 0,
    stageCount: stages.count ?? 0,
    transitionCount: transitions.count ?? 0,
    // El secreto NO se devuelve: la URL se arma del lado del cliente sólo
    // después de regenerarlo, que es cuando se muestra una única vez.
    workflowWebhookUrl: appUrl
      ? `${appUrl}/api/webhooks/ghl?organizationId=${organizationId}`
      : null,
    hasWebhookSecret: Boolean(rowWithExtras.webhook_secret_encrypted),
  };
}

/**
 * Genera un secreto nuevo para la vía de Workflow y lo devuelve **una sola vez**.
 *
 * Se devuelve en claro sólo en esta respuesta porque el usuario tiene que
 * pegarlo en la URL del workflow de GHL. Después queda cifrado y no se puede
 * volver a leer: regenerarlo invalida el anterior, que es el comportamiento
 * esperado de un secreto.
 */
export async function regenerateGHLWebhookSecretAction(): Promise<
  MutationResult<{ secret: string; url: string | null }>
> {
  return runMutation(async () => {
    const organizationId = await requireOrganizationId();

    const row = await getGHLIntegrationForOrg(organizationId);
    if (!row) throw new Error("GHL no está conectado para esta organización");

    const secret = randomBytes(32).toString("hex");
    await setGHLWebhookSecret(organizationId, secret);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? null;
    revalidatePath(paths.platform.integrations);

    return {
      secret,
      url: appUrl
        ? `${appUrl}/api/webhooks/ghl?organizationId=${organizationId}&secret=${secret}`
        : null,
    };
  });
}
