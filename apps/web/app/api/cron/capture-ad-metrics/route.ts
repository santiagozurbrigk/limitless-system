import { NextResponse } from "next/server";
import { assertCronAuthorized } from "@/lib/integrations/cron-auth";
import {
  captureAdMetricsForAllOrganizations,
  captureAdMetricsForOrganization,
} from "@/lib/marketing/ad-metrics-snapshot";
import { conMonitorDeCron } from "@/lib/observability/cron-monitor";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * I-1 del plan de integraciones — ver docs/specs/FUNNELS_SOURCE_MAP.md §5.
 *
 * Captura las métricas de anuncios del día y las persiste en `ad_metrics_daily`.
 * Sin este cron el histórico de la etapa Spend no es reconstruible, porque los
 * ads de Zernio son live-fetch (docs/specs/FUNNELS_ARCHITECTURE.md §9.3).
 *
 * Corre después de medianoche para capturar el día ya cerrado. Se puede pedir
 * una fecha puntual con `?date=YYYY-MM-DD` para rellenar un día perdido, dentro
 * de la ventana que Zernio siga devolviendo.
 *
 * Test manual:
 *   curl -X POST "$APP_URL/api/cron/capture-ad-metrics" -H "Authorization: Bearer $CRON_SECRET"
 */
export const GET = conMonitorDeCron("/api/cron/capture-ad-metrics", async (request: Request) => {
  return POST(request);
});

export async function POST(request: Request) {
  const unauthorized = assertCronAuthorized(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");
  const dateParam = url.searchParams.get("date");

  const targetDate = dateParam ? new Date(`${dateParam}T12:00:00.000Z`) : yesterday();
  if (Number.isNaN(targetDate.getTime())) {
    return NextResponse.json(
      { ok: false, error: "Parámetro `date` inválido, se espera YYYY-MM-DD" },
      { status: 400 }
    );
  }

  try {
    if (organizationId) {
      const result = await captureAdMetricsForOrganization(organizationId, targetDate);
      return NextResponse.json({ ok: true, ...result });
    }

    const results = await captureAdMetricsForAllOrganizations(targetDate);

    return NextResponse.json({
      ok: true,
      date: targetDate.toISOString().slice(0, 10),
      organizations: results.length,
      captured: results.filter((r) => r.status === "ok").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      errors: results.filter((r) => r.status === "error"),
    });
  } catch (error) {
    console.error("[capture-ad-metrics]", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}

/** El día anterior: cuando el cron corre, ya cerró y sus métricas están completas. */
function yesterday(): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);
  return date;
}
