import { NextResponse } from "next/server";
import { assertCronAuthorized } from "@/lib/integrations/cron-auth";
import {
  applyCalendlyEventsSafe,
  syncAllCalendlyOrganizationsSafe,
  syncCalendlyOrganizationSafe,
} from "@/lib/calendly/sync-pipeline";
import type { CalendlyEventSyncPayload } from "@/types/calendly";
import { conMonitorDeCron } from "@/lib/observability/cron-monitor";

export const runtime = "nodejs";
/**
 * ⭐ 300, no 60: el sync de todas las orgs tarda 43–59 s y el 2026-10-08/09 se cortó
 * en 10 de 30 corridas por pasarse de 60 s (quedaban "en_curso" en corridas_de_procesos
 * sin terminar de guardar los turnos).
 */
export const maxDuration = 300;

type SyncBody = {
  events?: CalendlyEventSyncPayload[];
  organizationId?: string;
};

async function parseBody(request: Request): Promise<SyncBody | null> {
  try {
    const text = await request.text();
    if (!text.trim()) return null;
    return JSON.parse(text) as SyncBody;
  } catch {
    return null;
  }
}

/**
 * Cron: sync Calendly → closing_calls (requiere CRON_SECRET si está configurado).
 * Ruta dedicada para evitar colisión con Server Actions en /api/integrations/calendly/sync.
 */
/** Vercel Cron invoca GET — delegar a la misma lógica que POST. */
export const GET = conMonitorDeCron("/api/cron/calendly-sync", async (request: Request) => {
  return POST(request);
});

export async function POST(request: Request) {
  const unauthorized = assertCronAuthorized(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const organizationIdParam = url.searchParams.get("organizationId");

  try {
    const body = await parseBody(request);

    if (body && Array.isArray(body.events)) {
      const orgId = organizationIdParam ?? body.organizationId;
      if (!orgId) {
        return NextResponse.json({
          ok: true,
          synced: 0,
          inserted: 0,
          updated: 0,
          skippedManualStatus: 0,
          fetched: 0,
        });
      }
      const result = await applyCalendlyEventsSafe(orgId, body.events);
      return NextResponse.json({ ok: true, ...result });
    }

    if (organizationIdParam) {
      const result = await syncCalendlyOrganizationSafe(organizationIdParam);
      return NextResponse.json({ ok: true, ...result });
    }

    const bulk = await syncAllCalendlyOrganizationsSafe();
    return NextResponse.json({
      ok: true,
      synced: bulk.synced,
      orgs: bulk.orgs,
      inserted: bulk.inserted,
      updated: bulk.updated,
      skippedManualStatus: bulk.skippedManualStatus,
      fetched: bulk.fetched,
    });
  } catch (e) {
    console.error("[cron/calendly-sync] Error no controlado:", e);
    // 500 y no `ok: true` con ceros: si no, el monitor de crons de Vercel nunca
    // ve la falla y una sync rota se confunde con "no había nada nuevo".
    return NextResponse.json({ ok: false, error: "sync failed" }, { status: 500 });
  }
}
