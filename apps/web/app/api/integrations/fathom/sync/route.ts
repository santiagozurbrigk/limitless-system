import { NextResponse } from "next/server";
import { assertCronAuthorized } from "@/lib/integrations/cron-auth";
import { syncAllFathomIntegrations } from "@/lib/fathom/sync";
import { sincronizarTodosLosMiembrosFathom } from "@/lib/fathom/member-sync";
import { conMonitorDeCron } from "@/lib/observability/cron-monitor";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Sincroniza reuniones de Fathom vía API key. Invocable por cron o manualmente con CRON_SECRET.
 *
 * Primero la key de cada organización y después la de cada miembro conectado
 * desde la sección por miembro (SCRUM-448): así las grabaciones de un miembro
 * entran solas aunque el aviso de Fathom no llegue.
 */
async function runSync(request: Request) {
  const unauthorized = assertCronAuthorized(request);
  if (unauthorized) return unauthorized;

  const result = await syncAllFathomIntegrations();
  const miembros = await sincronizarTodosLosMiembrosFathom();
  return NextResponse.json({ ok: true, ...result, miembros });
}

export async function POST(request: Request) {
  return runSync(request);
}

export const GET = conMonitorDeCron("/api/integrations/fathom/sync", async (request: Request) => {
  return runSync(request);
});
