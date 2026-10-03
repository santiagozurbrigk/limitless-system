import { NextResponse } from "next/server";
import { assertCronAuthorized } from "@/lib/integrations/cron-auth";
import { probeFathomListEndpoint } from "@/lib/fathom/api";
import { getFathomIntegrationDiagnostics } from "@/lib/fathom/diagnostics";
import { processPendingFathomCalls } from "@/lib/fathom/process-call";
import { reclaimStuckFathomCalls } from "@/lib/fathom/reclaim-stuck";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { conMonitorDeCron } from "@/lib/observability/cron-monitor";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Cron Fathom — **procesa la cola, no habla con Fathom**.
 *
 * ⭐ Este cron corre cada diez minutos y hasta ahora, antes de procesar,
 * salía a pedirle a Fathom la lista completa de reuniones de **todas** las
 * organizaciones. Sumado al cron horario que hace exactamente lo mismo, eran
 * ~168 listados por día por organización cuando con 24 alcanzaba.
 *
 * El resultado se veía en producción: **110 respuestas 429 ("Too Many
 * Requests") en 24 horas**. Nos quemábamos la cuota nosotros mismos, y cuando
 * una persona apretaba "sincronizar" a mano le rebotaba — así que la
 * integración era imposible de probar.
 *
 * Traer las reuniones quedó donde corresponde: en `/api/integrations/fathom/sync`,
 * que corre una vez por hora. Acá sólo se trabaja con lo que ya está guardado:
 *
 * 1. Rescatar las que quedaron trabadas en `processing`
 * 2. Procesar las pending cuyo delay de 30 min ya venció
 *
 * El delay de 30 minutos es justamente para que el cron horario tenga tiempo de
 * traerlas: procesar más seguido que eso no acelera nada.
 */
async function runFathomProcess(request: Request) {
  console.log("[Fathom:process] START - version 3");

  const unauthorized = assertCronAuthorized(request);
  if (unauthorized) {
    console.log("[Fathom:process] Early return: unauthorized (CRON_SECRET mismatch)");
    return unauthorized;
  }

  console.log("[Fathom:process] Auth passed, starting sync...", {
    method: request.method,
    hasCronSecret: Boolean(process.env.CRON_SECRET?.trim()),
    supabaseConfigured: isSupabaseConfigured(),
  });

  if (!isSupabaseConfigured()) {
    console.log("[Fathom:process] Early return: Supabase not configured");
    return NextResponse.json({ error: "Supabase no configurado." }, { status: 500 });
  }

  let adminOk = false;
  try {
    createAdminClient();
    adminOk = true;
  } catch (e) {
    console.error("[Fathom:process] Early return: admin client failed:", e);
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY no configurado." },
      { status: 500 }
    );
  }

  console.log("[Fathom:process] Admin client OK:", adminOk);

  const diagnostics = await getFathomIntegrationDiagnostics();

  const admin = createAdminClient();
  const { data: sampleIntegration, error: sampleError } = await admin
    .from("fathom_integrations")
    .select("organization_id, api_key, status")
    .eq("status", "connected")
    .not("api_key", "is", null)
    .neq("api_key", "")
    .limit(1)
    .maybeSingle();

  if (sampleError) {
    console.error("[Fathom:process] Sample integration query error:", sampleError.message);
  }

  /**
   * ⭐ La sonda de diagnóstico ahora es a pedido, no automática.
   *
   * Servía para depurar el mapeo cuando se construyó la integración, pero le
   * pega a Fathom **una vez más cada diez minutos**, encima del listado que ya
   * se sacó de acá. Son ~144 pedidos diarios extra gastados en mirar si el
   * endpoint responde, cuando nadie está mirando el resultado.
   *
   * Sigue disponible agregando `?probe=1` a la URL, que es cuando de verdad se
   * la necesita: alguien depurando, a mano, mirando la respuesta.
   */
  const probeSolicitada =
    new URL(request.url).searchParams.get("probe") === "1";

  let probe: Awaited<ReturnType<typeof probeFathomListEndpoint>> | null = null;

  if (probeSolicitada && sampleIntegration?.api_key?.trim()) {
    console.log("[Fathom:process] Probing documented list endpoint for org", {
      organizationId: sampleIntegration.organization_id,
      hasApiKey: true,
    });
    probe = await probeFathomListEndpoint(
      sampleIntegration.api_key.trim(),
      "process-probe"
    );
    console.log("[Fathom:process] Probe summary:", {
      endpoint: probe.endpoint,
      status: probe.status,
      itemCount: probe.itemCount,
      topLevelKeys: probe.topLevelKeys,
      nextCursor: probe.nextCursor,
    });
  } else if (probeSolicitada) {
    console.log("[Fathom:process] Probe pedida pero sin org conectada con api_key", {
      sampleFound: Boolean(sampleIntegration),
      sampleStatus: sampleIntegration?.status,
      hasApiKey: Boolean(sampleIntegration?.api_key?.trim()),
      diagnostics,
    });
  }

  // Antes de procesar la cola, devolver a `pending` lo que quedó colgado en
  // `processing`. Lo rescatado se procesa en la corrida siguiente.
  const reclaimed = await reclaimStuckFathomCalls();

  // Sólo se arrancan llamadas nuevas en los primeros 20 s: una que empieza tarde
  // todavía necesita sus ~30 s de análisis dentro del maxDuration de 60. Lo que
  // no entra queda `pending` para la corrida siguiente (cada 10 min).
  const processed = await processPendingFathomCalls(50, 20_000);
  console.log("[Fathom:process] Pending processed:", processed);

  return NextResponse.json({
    ok: true,
    version: 3,
    processed,
    reclaimed,
    diagnostics,
    probe: probe
      ? {
          endpoint: probe.endpoint,
          status: probe.status,
          itemCount: probe.itemCount,
          topLevelKeys: probe.topLevelKeys,
          nextCursor: probe.nextCursor,
          rawPreview: probe.rawPreview,
        }
      : null,
  });
}

export async function POST(request: Request) {
  return runFathomProcess(request);
}

export const GET = conMonitorDeCron("/api/integrations/fathom/process", async (request: Request) => {
  return runFathomProcess(request);
});
