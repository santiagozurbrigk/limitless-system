import { NextResponse } from "next/server";
import { assertCronAuthorized } from "@/lib/integrations/cron-auth";
import { syncAllFathomIntegrations } from "@/lib/fathom/sync";
import { sincronizarTodosLosMiembrosFathom } from "@/lib/fathom/member-sync";
import { conMonitorDeCron } from "@/lib/observability/cron-monitor";
import {
  miembrosPrimero,
  numeroDeCorrida,
  plazoDeLaCorrida,
} from "@/lib/fathom/plazo-del-cron";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Sincroniza reuniones de Fathom vía API key. Invocable por cron o manualmente con CRON_SECRET.
 *
 * Primero la key de cada organización y después la de cada miembro conectado
 * desde la sección por miembro (SCRUM-448): así las grabaciones de un miembro
 * entran solas aunque el aviso de Fathom no llegue.
 *
 * ⭐ Las dos tandas comparten un plazo (`lib/fathom/plazo-del-cron.ts`, SCRUM-36)
 * para no pasarse de `maxDuration`: lo que no entra queda para la próxima
 * corrida. Para que no sean siempre los mismos los que quedan afuera, las tandas
 * se alternan (en las corridas impares van primero los miembros) y dentro de
 * cada una el orden rota.
 */
async function runSync(request: Request) {
  const unauthorized = assertCronAuthorized(request);
  if (unauthorized) return unauthorized;

  const inicio = Date.now();
  const opciones = { plazo: plazoDeLaCorrida(inicio), corrida: numeroDeCorrida(inicio) };

  if (miembrosPrimero(opciones.corrida)) {
    const miembros = await sincronizarTodosLosMiembrosFathom(opciones);
    const result = await syncAllFathomIntegrations(opciones);
    return NextResponse.json({ ok: true, ...result, miembros });
  }
  const result = await syncAllFathomIntegrations(opciones);
  const miembros = await sincronizarTodosLosMiembrosFathom(opciones);
  return NextResponse.json({ ok: true, ...result, miembros });
}

export async function POST(request: Request) {
  return runSync(request);
}

export const GET = conMonitorDeCron("/api/integrations/fathom/sync", async (request: Request) => {
  return runSync(request);
});
