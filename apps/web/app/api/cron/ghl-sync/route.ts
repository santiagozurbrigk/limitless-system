import { NextResponse } from "next/server";
import { assertCronAuthorized } from "@/lib/integrations/cron-auth";
import {
  syncAllGHLOrganizationsSafe,
  syncGHLOrganizationSafe,
} from "@/lib/ghl/sync-pipeline";
import { conMonitorDeCron } from "@/lib/observability/cron-monitor";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Vercel Cron invoca GET — delegar a la misma lógica que POST. */
export const GET = conMonitorDeCron("/api/cron/ghl-sync", async (request: Request) => {
  return POST(request);
});

/**
 * Cron: sync GHL appointments → closing_calls.
 * - Sin params: sincroniza todas las orgs con GHL configurado.
 * - ?organizationId=<uuid>: sincroniza solo esa org.
 * Requiere Authorization: Bearer <CRON_SECRET>.
 */
export async function POST(request: Request) {
  const unauthorized = assertCronAuthorized(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");

  try {
    if (organizationId) {
      const result = await syncGHLOrganizationSafe(organizationId);
      return NextResponse.json({ ok: true, ...result });
    }

    const bulk = await syncAllGHLOrganizationsSafe();
    return NextResponse.json({
      ok: true,
      synced: bulk.synced,
      orgs: bulk.orgs,
      inserted: bulk.inserted,
      updated: bulk.updated,
      fetched: bulk.fetched,
    });
  } catch (e) {
    console.error("[cron/ghl-sync] Error no controlado:", e);
    // 500 y no `ok: true` con ceros: si no, el monitor de crons de Vercel nunca
    // ve la falla y una sync rota se confunde con "no había nada nuevo".
    return NextResponse.json({ ok: false, error: "sync failed" }, { status: 500 });
  }
}
