import { NextResponse } from "next/server";
import { assertCronAuthorized } from "@/lib/integrations/cron-auth";
import { conMonitorDeCron } from "@/lib/observability/cron-monitor";
import { reportarFalla } from "@/lib/observability/reportar-falla";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  reprocesarEventosDeLanding,
  RUTA_DEL_CRON_DE_REPROCESO,
} from "@/lib/webinar/reprocesar-landing";

export const runtime = "nodejs";
/** Hasta 200 eventos por corrida, en serie. */
export const maxDuration = 300;

/**
 * ⭐ Reproceso de los eventos de la landing de Limitless Webinars (SCRUM-528),
 * cada 10 minutos: los que quedaron en `error` o trabados en `pending`, hasta 5
 * reprocesos por evento (`lib/webinar/reprocesar-landing.ts`). Autenticado con
 * `CRON_SECRET` y con el monitor de crons, como los demás.
 *
 * La respuesta sólo trae conteos. Si la lectura de candidatos falla, 500: el
 * monitor marca la corrida como fallida.
 */
export const GET = conMonitorDeCron("/api/cron/reprocesar-landing", async (request: Request) => {
  return POST(request);
});

export async function POST(request: Request) {
  const unauthorized = assertCronAuthorized(request);
  if (unauthorized) return unauthorized;

  try {
    const resumen = await reprocesarEventosDeLanding(createAdminClient());
    return NextResponse.json({ ok: true, ...resumen });
  } catch (error) {
    console.error("[cron/reprocesar-landing] No se pudo reprocesar.");
    reportarFalla(error, { cron: RUTA_DEL_CRON_DE_REPROCESO, provider: "landing" });
    return NextResponse.json({ ok: false, error: "No se pudo reprocesar." }, { status: 500 });
  }
}
