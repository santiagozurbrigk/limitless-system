import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyQueueRequest } from "@/lib/queue/verify-queue-request";
import { generateAndSaveDailyExecutiveReport } from "@/lib/executive-reports/generate-daily";
import { generateAndSaveMonthlyExecutiveReport } from "@/lib/executive-reports/generate-monthly";
import { generateAndSaveWeeklyExecutiveReport } from "@/lib/executive-reports/generate-weekly";
import { reportarFalla } from "@/lib/observability/reportar-falla";

export const runtime = "nodejs";
export const maxDuration = 120; // Reporte ejecutivo con IA

const bodySchema = z.object({
  organizationId: z.string().uuid(),
  /**
   * Cadencia a generar. Es opcional y cae en `weekly` a propósito: los jobs
   * que ya estaban encolados cuando se agregó el pulso diario no traen el
   * campo, y tienen que seguir generando el semanal que pidieron.
   */
  period: z.enum(["daily", "weekly", "monthly"]).default("weekly"),
});

const GENERATORS = {
  daily: generateAndSaveDailyExecutiveReport,
  weekly: generateAndSaveWeeklyExecutiveReport,
  monthly: generateAndSaveMonthlyExecutiveReport,
} as const;

export async function POST(request: Request) {
  const rawBody = await request.text();

  const auth = await verifyQueueRequest(request, rawBody);
  if (!auth.ok) {
    console.warn("[Queue] process-cron-executive-report auth failed", {
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

  const { organizationId, period } = parsed.data;

  try {
    const result = await GENERATORS[period](organizationId);
    console.log("[Queue] process-cron-executive-report completado", {
      organizationId,
      period,
      result,
    });
    // Los generadores atrapan su error y devuelven "failed". Con un 200 QStash
    // daba el job por hecho y los `retries` configurados no corrían nunca.
    if (result === "failed") {
      return NextResponse.json(
        { ok: false, organizationId, period, result },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, organizationId, period, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    reportarFalla(err, { cron: "/api/queue/process-cron-executive-report", organizationId: organizationId });
    console.error("[Queue] process-cron-executive-report error", {
      organizationId,
      period,
      message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
