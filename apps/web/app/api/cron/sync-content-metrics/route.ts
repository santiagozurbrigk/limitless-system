import { NextResponse } from "next/server";
import { assertCronAuthorized } from "@/lib/integrations/cron-auth";
import {
  syncContentMetricsAllOrgs,
  syncContentMetricsForOrg,
} from "@/lib/marketing/sync-content-metrics";
import {
  isQStashConfigured,
  publishCronFanout,
  getCronSyncMetricsWorkerUrl,
} from "@/lib/queue/qstash-client";
import { createAdminClient } from "@/lib/supabase/admin";
import { conMonitorDeCron } from "@/lib/observability/cron-monitor";

export const runtime = "nodejs";
export const maxDuration = 60; // Fan-out: solo publica jobs, no procesa orgs

export const GET = conMonitorDeCron("/api/cron/sync-content-metrics", async (request: Request) => {
  return POST(request);
});

export async function POST(request: Request) {
  const unauthorized = assertCronAuthorized(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");

  try {
    // Modo org única — test manual o retry directo
    if (organizationId) {
      const result = await syncContentMetricsForOrg(organizationId);
      return NextResponse.json({ ok: true, organizationId, ...result });
    }

    // Modo fan-out (QStash configurado)
    if (isQStashConfigured()) {
      const admin = createAdminClient();
      const { data: integrations, error } = await admin
        .from("zernio_integrations")
        .select("organization_id")
        .eq("is_active", true);

      if (error) throw new Error(error.message);

      const orgIds = [
        ...new Set(
          (integrations ?? []).map((row) => row.organization_id as string)
        ),
      ];

      const { published, failed } = await publishCronFanout(
        getCronSyncMetricsWorkerUrl(),
        orgIds
      );

      console.log("[cron/sync-content-metrics] fan-out completado", {
        total: orgIds.length,
        published,
        failed,
      });

      return NextResponse.json({
        ok: true,
        mode: "fanout",
        total: orgIds.length,
        published,
        failed,
      });
    }

    // Fallback secuencial (QStash no configurado)
    const bulk = await syncContentMetricsAllOrgs();
    return NextResponse.json({ ok: true, mode: "sequential", ...bulk });
  } catch (e) {
    console.error("[cron/sync-content-metrics] Error:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Error" },
      { status: 500 }
    );
  }
}
