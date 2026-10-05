import { NextResponse } from "next/server";
import { assertCronAuthorized } from "@/lib/integrations/cron-auth";
import {
  generateAllWeeklyExecutiveReports,
  generateAndSaveWeeklyExecutiveReport,
} from "@/lib/executive-reports/generate-weekly";
import { listActiveOrganizationIds } from "@/lib/intelligence/organizaciones-activas";
import {
  isQStashConfigured,
  publishCronFanout,
  getCronExecutiveReportWorkerUrl,
} from "@/lib/queue/qstash-client";
import { conMonitorDeCron } from "@/lib/observability/cron-monitor";

export const runtime = "nodejs";
export const maxDuration = 60; // Fan-out: solo publica jobs

export const GET = conMonitorDeCron("/api/cron/executive-report-weekly", async (request: Request) => {
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
      const result = await generateAndSaveWeeklyExecutiveReport(organizationId);
      return NextResponse.json({ ok: true, organizationId, result });
    }

    // Modo fan-out (QStash configurado)
    if (isQStashConfigured()) {
      const orgIds = await listActiveOrganizationIds();

      const { published, failed } = await publishCronFanout(
        getCronExecutiveReportWorkerUrl(),
        orgIds
      );

      console.log("[cron/executive-report-weekly] fan-out completado", {
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
    const bulk = await generateAllWeeklyExecutiveReports();
    return NextResponse.json({ ok: true, mode: "sequential", ...bulk });
  } catch (e) {
    console.error("[cron/executive-report-weekly] Error:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Error" },
      { status: 500 }
    );
  }
}
