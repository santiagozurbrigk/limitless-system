import { NextResponse } from "next/server";
import { assertCronAuthorized } from "@/lib/integrations/cron-auth";
import {
  generateAllMonthlyExecutiveReports,
  generateAndSaveMonthlyExecutiveReport,
} from "@/lib/executive-reports/generate-monthly";
import { listActiveOrganizationIds } from "@/lib/intelligence/generate-snapshot";
import {
  isQStashConfigured,
  publishCronFanout,
  getCronExecutiveReportWorkerUrl,
} from "@/lib/queue/qstash-client";
import { conMonitorDeCron } from "@/lib/observability/cron-monitor";

export const runtime = "nodejs";
export const maxDuration = 300;

export const GET = conMonitorDeCron("/api/cron/executive-report-monthly", async (request: Request) => {
  return POST(request);
});

export async function POST(request: Request) {
  const unauthorized = assertCronAuthorized(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");

  try {
    if (organizationId) {
      const result =
        await generateAndSaveMonthlyExecutiveReport(organizationId);
      return NextResponse.json({ ok: true, organizationId, result });
    }

    // Fan-out por org, como el diario y el semanal: en serie, una generación con
    // Sonnet por org dentro de un solo maxDuration dejaba sin reporte a las
    // últimas orgs en cuanto hubiera más de un puñado, y el mensual no reintenta.
    if (isQStashConfigured()) {
      const orgIds = await listActiveOrganizationIds();
      const { published, failed } = await publishCronFanout(
        getCronExecutiveReportWorkerUrl(),
        orgIds,
        2,
        { period: "monthly" }
      );
      console.log("[cron/executive-report-monthly] fan-out completado", {
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

    // Fallback secuencial (sin QStash)
    const bulk = await generateAllMonthlyExecutiveReports();
    return NextResponse.json({ ok: true, ...bulk });
  } catch (e) {
    console.error("[cron/executive-report-monthly] Error:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Error" },
      { status: 500 }
    );
  }
}
