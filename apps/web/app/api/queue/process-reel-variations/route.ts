/**
 * Endpoint de fallback para procesamiento de variaciones de reels.
 *
 * En PRODUCCIÓN: el job lo maneja el worker en Fly.io (más potente, sin límite
 * de tiempo de ejecución de Vercel). La URL del worker se configura en
 * REEL_WORKER_URL.
 *
 * En DESARROLLO (sin REEL_WORKER_URL): QStash apunta aquí y el procesamiento
 * corre en esta lambda. Tiene límite de 300s — suficiente para videos cortos.
 *
 * IMPORTANTE: FFmpeg debe estar disponible en el entorno donde corra este endpoint.
 * En Vercel no está disponible; usar el worker de Fly.io en producción.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyQStashRequest } from "@/lib/queue/qstash-verify";
import { reportarFalla } from "@/lib/observability/reportar-falla";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min

const payloadSchema = z.object({
  jobId: z.string().uuid(),
  organizationId: z.string().uuid(),
  sourcePieceId: z.string().uuid(),
  sourceStoragePath: z.string().min(1),
  sourceFileName: z.string().min(1),
  originalCaption: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  const rawBody = await request.text();

  const auth = await verifyQStashRequest(request, rawBody);
  if (!auth.ok) {
    console.warn("[Queue] process-reel-variations auth failed", auth);
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 }
    );
  }

  const { jobId } = parsed.data;
  console.log("[Queue] process-reel-variations received", { jobId });

  // En entornos donde FFmpeg no está disponible (Vercel serverless):
  // marcar el job como fallido con instrucción de configurar el worker de Fly.io
  const hasFfmpeg = await checkFfmpegAvailable();
  if (!hasFfmpeg) {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    await admin
      .from("reel_variation_jobs")
      .update({
        status: "failed",
        error_message:
          "FFmpeg no disponible en este entorno. " +
          "Configurá REEL_WORKER_URL con la URL del worker de Fly.io para procesar videos.",
      })
      .eq("id", jobId);

    return NextResponse.json(
      {
        ok: false,
        jobId,
        error: "FFmpeg not available — configure REEL_WORKER_URL",
      },
      { status: 200 } // 200 para que QStash no reintente
    );
  }

  // Si FFmpeg está disponible (dev local con FFmpeg instalado):
  // procesar directamente en esta lambda
  try {
    // Import dinámico para no cargar el procesador en entornos sin FFmpeg
    const { processReelJob } = await import("./processor");
    await processReelJob(parsed.data);
    return NextResponse.json({ ok: true, jobId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Queue] process-reel-variations error", { jobId, message });
    reportarFalla(err, { cron: "/api/queue/process-reel-variations", extra: { jobId } });
    return NextResponse.json({ ok: false, jobId, error: message }, { status: 500 });
  }
}

async function checkFfmpegAvailable(): Promise<boolean> {
  try {
    const { execSync } = await import("child_process");
    execSync("ffmpeg -version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}
