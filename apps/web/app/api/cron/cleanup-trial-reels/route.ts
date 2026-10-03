/**
 * Cron: limpieza de videos Trial Reels del Storage de Supabase.
 *
 * Schedule: diario a las 3:00 UTC (fuera de horas pico).
 * Auth: CRON_SECRET vía assertCronAuthorized.
 *
 * Qué hace:
 *   1. Busca jobs reel_variation_jobs con status "done" o "failed"
 *      cuyo updated_at sea mayor a RETENTION_DAYS días
 *   2. Para cada job, elimina los archivos en storage path de cada variante
 *      del bucket "trial-reels"
 *   3. Loggea resultados (archivos eliminados / errores)
 *
 * Idempotente: si el archivo ya fue eliminado, Supabase no lanza error.
 */

import { NextResponse } from "next/server";
import { assertCronAuthorized } from "@/lib/integrations/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ReelVariation } from "@/types/reel-variations";
import { soloRutasDeLaOrg } from "@/lib/storage/org-path";
import { conMonitorDeCron } from "@/lib/observability/cron-monitor";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Días de retención: mantener videos en storage hasta este período post-done/failed */
const RETENTION_DAYS = 30;

export const GET = conMonitorDeCron("/api/cron/cleanup-trial-reels", async (request: Request) => {
  return POST(request);
});

export async function POST(request: Request) {
  const unauthorized = assertCronAuthorized(request);
  if (unauthorized) return unauthorized;

  const admin = createAdminClient();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);

  console.log("[cron/cleanup-trial-reels] iniciando", {
    retentionDays: RETENTION_DAYS,
    cutoffDate: cutoffDate.toISOString(),
  });

  // 1. Buscar jobs finalizados más viejos que RETENTION_DAYS
  const { data: jobs, error: jobsError } = await admin
    .from("reel_variation_jobs")
    .select("id, organization_id, variations")
    .in("status", ["done", "failed"])
    .lt("updated_at", cutoffDate.toISOString());

  if (jobsError) {
    console.error("[cron/cleanup-trial-reels] error al consultar jobs", jobsError.message);
    return NextResponse.json({ ok: false, error: jobsError.message }, { status: 500 });
  }

  if (!jobs || jobs.length === 0) {
    console.log("[cron/cleanup-trial-reels] no hay jobs para limpiar");
    return NextResponse.json({ ok: true, cleaned: 0, files: 0, errors: 0 });
  }

  console.log(`[cron/cleanup-trial-reels] ${jobs.length} job(s) a limpiar`);

  let totalFiles = 0;
  let totalErrors = 0;
  const cleanedJobIds: string[] = [];

  for (const job of jobs) {
    const variations = (job.variations ?? []) as ReelVariation[];

    // Recopilar storage paths de todas las variantes que tengan uno
    // SCRUM-81: sólo se borran rutas de la org del job.
    const storagePaths = soloRutasDeLaOrg(
      variations.map((v) => v.storage_path),
      job.organization_id as string,
      "cleanup-trial-reels"
    );

    if (storagePaths.length === 0) {
      cleanedJobIds.push(job.id);
      continue;
    }

    // 2. Eliminar archivos del bucket "trial-reels"
    const { data: removed, error: removeError } = await admin.storage
      .from("trial-reels")
      .remove(storagePaths);

    if (removeError) {
      console.error("[cron/cleanup-trial-reels] error eliminando archivos", {
        jobId: job.id,
        error: removeError.message,
        paths: storagePaths,
      });
      totalErrors++;
    } else {
      const filesRemoved = removed?.length ?? storagePaths.length;
      totalFiles += filesRemoved;
      cleanedJobIds.push(job.id);
      console.log("[cron/cleanup-trial-reels] archivos eliminados", {
        jobId: job.id,
        files: filesRemoved,
      });
    }
  }

  console.log("[cron/cleanup-trial-reels] finalizado", {
    cleaned: cleanedJobIds.length,
    files: totalFiles,
    errors: totalErrors,
  });

  return NextResponse.json({
    ok: true,
    cleaned: cleanedJobIds.length,
    files: totalFiles,
    errors: totalErrors,
  });
}
