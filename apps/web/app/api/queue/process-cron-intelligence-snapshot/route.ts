import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyQueueRequest } from "@/lib/queue/verify-queue-request";
import { generateAndSaveIntelligenceSnapshot } from "@/lib/intelligence/generate-snapshot";
import { reportarFalla } from "@/lib/observability/reportar-falla";

export const runtime = "nodejs";
export const maxDuration = 120; // Snapshot con IA — más lento que métricas

const bodySchema = z.object({
  organizationId: z.string().uuid(),
});

export async function POST(request: Request) {
  const rawBody = await request.text();

  const auth = await verifyQueueRequest(request, rawBody);
  if (!auth.ok) {
    console.warn("[Queue] process-cron-intelligence-snapshot auth failed", {
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
    const result = await generateAndSaveIntelligenceSnapshot(organizationId);
    console.log("[Queue] process-cron-intelligence-snapshot completado", { organizationId, result });
    return NextResponse.json({ ok: true, organizationId, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    reportarFalla(err, { cron: "/api/queue/process-cron-intelligence-snapshot", organizationId: organizationId });
    console.error("[Queue] process-cron-intelligence-snapshot error", { organizationId, message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
