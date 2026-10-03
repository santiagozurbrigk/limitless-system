import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyQueueRequest } from "@/lib/queue/verify-queue-request";
import { syncContentMetricsForOrg } from "@/lib/marketing/sync-content-metrics";
import { reportarFalla } from "@/lib/observability/reportar-falla";

export const runtime = "nodejs";
export const maxDuration = 60; // Una sola org — mucho menos que los 300s del batch

const bodySchema = z.object({
  organizationId: z.string().uuid(),
});

export async function POST(request: Request) {
  const rawBody = await request.text();

  const auth = await verifyQueueRequest(request, rawBody);
  if (!auth.ok) {
    console.warn("[Queue] process-cron-sync-metrics auth failed", {
      status: auth.status,
      error: auth.error,
    });
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 }
    );
  }

  const { organizationId } = parsed.data;

  try {
    const result = await syncContentMetricsForOrg(organizationId);
    console.log("[Queue] process-cron-sync-metrics completado", { organizationId, ...result });
    return NextResponse.json({ ok: true, organizationId, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    reportarFalla(err, { cron: "/api/queue/process-cron-sync-metrics", organizationId: organizationId, provider: "zernio" });
    console.error("[Queue] process-cron-sync-metrics error", { organizationId, message });
    // 500 → QStash reintenta según `retries` configurado en el publish
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
