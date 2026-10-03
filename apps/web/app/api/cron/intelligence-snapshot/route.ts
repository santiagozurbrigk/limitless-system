import { NextResponse } from "next/server";
import { assertCronAuthorized } from "@/lib/integrations/cron-auth";
import {
  generateAllIntelligenceSnapshots,
  generateAndSaveIntelligenceSnapshot,
  listActiveOrganizationIds,
} from "@/lib/intelligence/generate-snapshot";
import {
  isQStashConfigured,
  publishCronFanout,
  getCronIntelligenceSnapshotWorkerUrl,
} from "@/lib/queue/qstash-client";
import { conMonitorDeCron } from "@/lib/observability/cron-monitor";

export const runtime = "nodejs";
export const maxDuration = 60; // Fan-out: solo publica jobs

export const GET = conMonitorDeCron("/api/cron/intelligence-snapshot", async (request: Request) => {
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
      const result = await generateAndSaveIntelligenceSnapshot(organizationId);
      return NextResponse.json({ ok: true, organizationId, result });
    }

    // Modo fan-out (QStash configurado)
    if (isQStashConfigured()) {
      const orgIds = await listActiveOrganizationIds();

      const { published, failed } = await publishCronFanout(
        getCronIntelligenceSnapshotWorkerUrl(),
        orgIds
      );

      console.log("[cron/intelligence-snapshot] fan-out completado", {
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

    // Fallback secuencial
    const bulk = await generateAllIntelligenceSnapshots();
    return NextResponse.json({ ok: true, mode: "sequential", ...bulk });
  } catch (e) {
    console.error("[cron/intelligence-snapshot] Error:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Error" },
      { status: 500 }
    );
  }
}
