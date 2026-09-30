/**
 * lib/ghl/sync-pipelines.ts
 *
 * Trae los pipelines y sus etapas desde GHL y los guarda.
 *
 * Es sólo un **catálogo**: sirve para que el usuario elija qué etapa alimenta
 * cada paso del embudo. Los conteos no salen de acá — salen de
 * `ghl_stage_transitions`, porque GHL no expone historial de etapas.
 *
 * ⚠️ La doc no expande el objeto pipeline ni el de etapa. Se guarda `raw`
 * completo y se mapean los campos inferidos. Si el response real usa otros
 * nombres, `raw` permite corregirlo sin volver a llamar a la API.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { ghlEntityId, listGHLPipelines } from "./client";
import { decryptGHLApiKey, getGHLIntegrationForOrg } from "./integration";

export type PipelineSyncResult = {
  organizationId: string;
  pipelines: number;
  stages: number;
  /** Pipelines o etapas sin id reconocible: quedan fuera y se reportan. */
  skipped: number;
  error?: string;
};

export async function syncGHLPipelinesForOrg(
  organizationId: string
): Promise<PipelineSyncResult> {
  const empty: PipelineSyncResult = {
    organizationId,
    pipelines: 0,
    stages: 0,
    skipped: 0,
  };

  try {
    const row = await getGHLIntegrationForOrg(organizationId);
    if (!row) return { ...empty, error: "GHL no configurado" };

    const apiKey = decryptGHLApiKey(row.api_key_encrypted, row.organization_id);
    const pipelines = await listGHLPipelines(apiKey, row.location_id);

    const admin = createAdminClient();
    const now = new Date().toISOString();

    let skipped = 0;
    const pipelineRows: Record<string, unknown>[] = [];
    const stageRows: Record<string, unknown>[] = [];

    for (const pipeline of pipelines) {
      const pipelineId = ghlEntityId(pipeline);
      if (!pipelineId) {
        // Sin id no se puede referenciar desde un binding. Se cuenta y se deja
        // afuera en vez de inventarle uno.
        skipped += 1;
        continue;
      }

      pipelineRows.push({
        organization_id: organizationId,
        location_id: row.location_id,
        external_id: pipelineId,
        name: pipeline.name ?? null,
        raw: pipeline,
        synced_at: now,
      });

      const stages = Array.isArray(pipeline.stages) ? pipeline.stages : [];
      stages.forEach((stage, index) => {
        const stageId = ghlEntityId(stage);
        if (!stageId) {
          skipped += 1;
          return;
        }
        stageRows.push({
          organization_id: organizationId,
          pipeline_external_id: pipelineId,
          external_id: stageId,
          name: stage.name ?? null,
          // `position` es lo que la doc sugiere, pero no está documentado:
          // el orden del array es el respaldo.
          position: typeof stage.position === "number" ? stage.position : index,
          raw: stage,
          synced_at: now,
        });
      });
    }

    if (pipelineRows.length) {
      const { error } = await admin
        .from("ghl_pipelines")
        .upsert(pipelineRows, { onConflict: "organization_id,external_id" });
      if (error) return { ...empty, skipped, error: error.message };
    }

    if (stageRows.length) {
      const { error } = await admin
        .from("ghl_pipeline_stages")
        .upsert(stageRows, { onConflict: "organization_id,external_id" });
      if (error) return { ...empty, skipped, error: error.message };
    }

    await admin
      .from("ghl_integrations")
      .update({ pipelines_synced_at: now })
      .eq("organization_id", organizationId);

    return {
      organizationId,
      pipelines: pipelineRows.length,
      stages: stageRows.length,
      skipped,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return { ...empty, error: message };
  }
}
