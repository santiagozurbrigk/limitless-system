/**
 * Servidor HTTP del worker de variaciones de reels.
 *
 * Recibe jobs de QStash (webhook POST) y los procesa con FFmpeg.
 * Se despliega en Fly.io como un servicio persistente.
 *
 * Endpoints:
 *   GET  /health        → 200 OK (health check de Fly.io)
 *   POST /              → Recibe y procesa un job (validado con QStash signature)
 */

// Log inmediato para detectar crash al inicio (visible en fly logs)
console.log("[Worker] starting up, Node.js", process.version, "pid", process.pid);
process.on("uncaughtException", (err) => {
  console.error("[Worker] uncaughtException", err.message, err.stack);
  reportarErrorDelWorker(err);
  void vaciarSentry().finally(() => process.exit(1));
});
process.on("unhandledRejection", (reason) => {
  console.error("[Worker] unhandledRejection", reason);
  reportarErrorDelWorker(reason);
  void vaciarSentry().finally(() => process.exit(1));
});

import express, { type Express } from "express";
import { z } from "zod";
import { Receiver } from "@upstash/qstash";
import { processReelVariationJob } from "./processor";
import { reportarErrorDelWorker, vaciarSentry } from "./sentry";
import type { ReelVariationJobPayload } from "./types";

const app: Express = express();
app.use(express.text({ type: "*/*", limit: "10mb" }));

const PORT = Number(process.env.PORT ?? 8080);

// ─── Health check ─────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "reel-worker", ts: new Date().toISOString() });
});

// ─── Schema de validación ─────────────────────────────────────────────────────

const jobPayloadSchema = z.object({
  jobId: z.string().uuid(),
  organizationId: z.string().uuid(),
  sourcePieceId: z.string().uuid(),
  // Fuente Drive (nuevo): el worker descarga directamente
  driveFileId: z.string().min(1).optional(),
  driveAccessToken: z.string().min(1).optional(),
  driveMimeType: z.string().min(1).optional(),
  // Fuente Storage (legacy)
  sourceStoragePath: z.string().min(1).optional(),
  sourceFileName: z.string().min(1),
  originalCaption: z.string().nullable().optional(),
});

// ─── QStash receiver ──────────────────────────────────────────────────────────

function buildReceiver(): Receiver | null {
  const currentKey = process.env.QSTASH_CURRENT_SIGNING_KEY?.trim();
  const nextKey = process.env.QSTASH_NEXT_SIGNING_KEY?.trim();
  if (!currentKey || !nextKey) return null;
  return new Receiver({ currentSigningKey: currentKey, nextSigningKey: nextKey });
}

const receiver = buildReceiver();

async function verifySignature(req: express.Request, rawBody: string): Promise<boolean> {
  // 1. Bearer token auth (WORKER_AUTH_SECRET) — método primario.
  //    Se verifica en tres formas para mayor robustez:
  //    a) Header X-Worker-Secret (custom, nunca stripped por proxies)
  //    b) Header Authorization: Bearer <secret>
  //    c) Query param ?workerSecret=<secret> (fallback absoluto)
  const workerSecret = process.env.WORKER_AUTH_SECRET?.trim();
  if (workerSecret) {
    // a) Custom header (más confiable — los proxies no lo tocan)
    const xWorkerSecret = req.headers["x-worker-secret"];
    if (typeof xWorkerSecret === "string" && xWorkerSecret === workerSecret) {
      console.log("[Worker] auth via X-Worker-Secret header OK");
      return true;
    }

    // b) Authorization: Bearer <secret>
    const authHeader = req.headers["authorization"];
    if (typeof authHeader === "string" && authHeader === `Bearer ${workerSecret}`) {
      console.log("[Worker] auth via Authorization header OK");
      return true;
    }

    // c) Query parameter (fallback si QStash stripea headers)
    const querySecret = (req.query.workerSecret as string | undefined)?.trim();
    if (querySecret && querySecret === workerSecret) {
      console.log("[Worker] auth via query param OK");
      return true;
    }

    // Log de diagnóstico — muestra qué llegó (parcialmente) para detectar mismatches
    const receivedSecret = workerSecret.substring(0, 4) + "..."; // primeros 4 chars del esperado
    console.warn("[Worker] WORKER_AUTH_SECRET configurado pero ningún método coincidió", {
      xWorkerSecretPresent: typeof xWorkerSecret === "string",
      xWorkerSecretMatch: typeof xWorkerSecret === "string"
        ? `(got ${xWorkerSecret.length} chars, expected ${workerSecret.length})`
        : "not present",
      authHeaderPresent: typeof authHeader === "string",
      authHeaderSnippet: typeof authHeader === "string"
        ? authHeader.substring(0, Math.min(20, authHeader.length)) + "..."
        : "not present",
      querySecretPresent: Boolean(querySecret),
      secretExpectedPrefix: receivedSecret,
    });
    return false;
  }

  // 2. QStash signature verification (fallback si no hay WORKER_AUTH_SECRET)
  if (!receiver) {
    // Sin signing keys: en dev se acepta si viene de la red interna
    const isLocalOrInternal =
      req.ip === "127.0.0.1" ||
      req.ip?.startsWith("10.") ||
      req.ip?.startsWith("172.") ||
      !process.env.NODE_ENV?.includes("prod");
    return isLocalOrInternal;
  }

  const signature =
    req.headers["upstash-signature"] ??
    req.headers["Upstash-Signature"];

  if (!signature || typeof signature !== "string") return false;

  try {
    const valid = await receiver.verify({ signature, body: rawBody });
    if (valid) console.log("[Worker] auth via QStash signature OK");
    return valid;
  } catch {
    return false;
  }
}

// ─── Endpoint principal ───────────────────────────────────────────────────────

app.post("/", async (req, res) => {
  const rawBody = req.body as string;

  // 1. Verificar firma QStash
  const signatureValid = await verifySignature(req, rawBody);
  if (!signatureValid) {
    console.warn("[Worker] invalid QStash signature from", req.ip);
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // 2. Parsear y validar payload
  let payload: ReelVariationJobPayload;
  try {
    const parsed = jobPayloadSchema.safeParse(JSON.parse(rawBody));
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" });
      return;
    }
    payload = parsed.data as ReelVariationJobPayload;
  } catch {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  console.log("[Worker] received job", { jobId: payload.jobId });

  // 3. Procesar sincrónicamente — la conexión HTTP queda abierta durante todo el
  //    proceso FFmpeg. QStash espera hasta timeout:900s (configurado en el publish),
  //    por lo que Fly.io NO apaga la máquina mientras el trabajo está en curso.
  //    Si respondemos 200 antes y procesamos en background, Fly.io puede matar
  //    la máquina al cerrar la conexión HTTP (auto_stop_machines = true).
  try {
    await processReelVariationJob(payload);
    res.json({ ok: true, jobId: payload.jobId, status: "done" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Worker] unhandled error in processReelVariationJob", {
      jobId: payload.jobId,
      error: message,
    });
    reportarErrorDelWorker(err, {
      jobId: payload.jobId,
      organizationId: payload.organizationId,
    });
    // Responder 200 aunque haya error — el job ya fue marcado como "failed"
    // en DB por el processor. Si respondemos 5xx, QStash reintentaría.
    res.json({ ok: false, jobId: payload.jobId, status: "failed", error: message });
  }
});

// ─── Inicio ───────────────────────────────────────────────────────────────────

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[Worker] reel-worker listening on port ${PORT}`);
  console.log(`[Worker] env: ${process.env.NODE_ENV ?? "development"}`);
  console.log(`[Worker] auth: WORKER_AUTH_SECRET=${process.env.WORKER_AUTH_SECRET ? "configured" : "MISSING"} | QStash signing=${receiver ? "enabled" : "disabled"}`);
  console.log(`[Worker] Supabase URL: ${process.env.SUPABASE_URL ? "configured" : "MISSING"}`);
  console.log(`[Worker] Anthropic API: ${process.env.ANTHROPIC_API_KEY ? "configured" : "MISSING"}`);
});

export default app;
