import { NextResponse } from "next/server";
import { z } from "zod";
import { generateDeepCallAnalysis } from "@/lib/fathom/deep-call-analysis";
import { verifyQueueRequest } from "@/lib/queue/verify-queue-request";
import { reportarFalla } from "@/lib/observability/reportar-falla";

export const runtime = "nodejs";
export const maxDuration = 300; // análisis profundo con transcripts largos

const bodySchema = z.object({
  organizationId: z.string().uuid(),
  fathomCallId: z.string().min(1),
  transcript: z.string().min(1),
  closerName: z.string().optional(),
  leadName: z.string().optional(),
  durationMinutes: z.number().optional(),
  formAnswers: z.record(z.string(), z.string()).optional(),
  callTitle: z.string().optional(),
  callDate: z.string().nullable().optional(),
  fathomUrl: z.string().nullable().optional(),
  clientId: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  const rawBody = await request.text();

  const auth = await verifyQueueRequest(request, rawBody);
  if (!auth.ok) {
    console.warn("[Queue] process-fathom-analysis auth failed", {
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

  const { organizationId, fathomCallId } = parsed.data;

  console.log("[Queue] process-fathom-analysis received", {
    organizationId,
    fathomCallId,
    transcriptLength: parsed.data.transcript.length,
    durationMinutes: parsed.data.durationMinutes,
  });

  try {
    await generateDeepCallAnalysis(parsed.data);
    console.log("[Queue] process-fathom-analysis completed", { fathomCallId });
    return NextResponse.json({ ok: true, fathomCallId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    reportarFalla(err, { cron: "/api/queue/process-fathom-analysis", organizationId: organizationId, provider: "anthropic" });
    console.error("[Queue] process-fathom-analysis error", {
      fathomCallId,
      message,
    });
    // Retornar 500 para que QStash reintente (hasta 2 veces configurados)
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
