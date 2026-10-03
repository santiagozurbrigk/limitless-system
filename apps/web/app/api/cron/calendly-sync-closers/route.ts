/**
 * Cron: sync Calendly para todos los closers con integración propia.
 * Requiere CRON_SECRET si está configurado.
 */
import { NextResponse } from "next/server";
import { assertCronAuthorized } from "@/lib/integrations/cron-auth";
import { syncAllClosersGlobal, syncAllClosersForOrganization } from "@/lib/calendly/closer-sync";
import { conMonitorDeCron } from "@/lib/observability/cron-monitor";

export const runtime = "nodejs";
export const maxDuration = 60;

export const GET = conMonitorDeCron("/api/cron/calendly-sync-closers", async (request: Request) => {
  return POST(request);
});

export async function POST(request: Request) {
  const unauthorized = assertCronAuthorized(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");

  try {
    if (organizationId) {
      const results = await syncAllClosersForOrganization(organizationId);
      const inserted = results.reduce((s, r) => s + r.inserted, 0);
      const updated = results.reduce((s, r) => s + r.updated, 0);
      return NextResponse.json({ ok: true, closers: results.length, inserted, updated });
    }

    const { orgs, results } = await syncAllClosersGlobal();
    const inserted = results.reduce((s, r) => s + r.inserted, 0);
    const updated = results.reduce((s, r) => s + r.updated, 0);
    return NextResponse.json({ ok: true, orgs, closers: results.length, inserted, updated });
  } catch (e) {
    console.error("[cron/calendly-sync-closers] Error no controlado:", e);
    return NextResponse.json({ ok: true, orgs: 0, closers: 0, inserted: 0, updated: 0 });
  }
}
