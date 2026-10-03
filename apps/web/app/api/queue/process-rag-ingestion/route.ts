import { NextResponse } from "next/server";
import { z } from "zod";
import { processRagIngestion } from "@/lib/queue/processors/rag-ingestion";
import { verifyQStashRequest } from "@/lib/queue/qstash-verify";
import { reportarFalla } from "@/lib/observability/reportar-falla";

export const runtime = "nodejs";
export const maxDuration = 300;

const ragIngestionBodySchema = z.object({
  documentId: z.string().uuid(),
  organizationId: z.string().uuid(),
  sourceType: z.enum(["business_context_note", "business_context_document"]),
});

export async function POST(request: Request) {
  const started = Date.now();
  const rawBody = await request.text();

  const auth = await verifyQStashRequest(request, rawBody);
  if (!auth.ok) {
    console.warn("[Queue] process-rag-ingestion auth failed", {
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

  const parsed = ragIngestionBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 }
    );
  }

  console.log("[Queue] process-rag-ingestion received (signature verified)", {
    documentId: parsed.data.documentId,
    organizationId: parsed.data.organizationId,
    sourceType: parsed.data.sourceType,
  });

  try {
    const result = await processRagIngestion(parsed.data);

    console.log("[Queue] process-rag-ingestion done", {
      documentId: parsed.data.documentId,
      durationMs: Date.now() - started,
      ...result,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    reportarFalla(err, { cron: "/api/queue/process-rag-ingestion", organizationId: parsed.data.organizationId });
    console.error("[Queue] process-rag-ingestion error", {
      documentId: parsed.data.documentId,
      durationMs: Date.now() - started,
      error: message,
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
