import { NextResponse } from "next/server";
import { assertCronAuthorized } from "@/lib/integrations/cron-auth";
import { syncAllInstagramIntegrations } from "@/lib/instagram/sync";
import { conMonitorDeCron } from "@/lib/observability/cron-monitor";

export const runtime = "nodejs";
export const maxDuration = 60;

async function runSync(request: Request) {
  const unauthorized = assertCronAuthorized(request);
  if (unauthorized) return unauthorized;

  const result = await syncAllInstagramIntegrations();
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(request: Request) {
  return runSync(request);
}

export const GET = conMonitorDeCron("/api/integrations/instagram/sync", async (request: Request) => {
  return runSync(request);
});
