import { NextResponse } from "next/server";
import { assertCronAuthorized } from "@/lib/integrations/cron-auth";
import {
  syncAllTypeformOrganizations,
  syncTypeformForOrganization,
} from "@/lib/typeform/sync";
import { conMonitorDeCron } from "@/lib/observability/cron-monitor";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Vercel Cron invoca GET — delegar a la misma lógica que POST. */
export const GET = conMonitorDeCron("/api/integrations/typeform/sync", async (request: Request) => {
  return POST(request);
});

export async function POST(request: Request) {
  const unauthorized = assertCronAuthorized(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");

  if (organizationId) {
    const result = await syncTypeformForOrganization(organizationId);
    return NextResponse.json({ ok: true, ...result });
  }

  const result = await syncAllTypeformOrganizations();
  return NextResponse.json({ ok: true, ...result });
}
