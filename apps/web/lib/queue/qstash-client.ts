import { Client } from "@upstash/qstash";
import { anotarJobDeOrganizacion } from "@/lib/observability/corrida-en-curso";

export type RagIngestionJobPayload = {
  documentId: string;
  organizationId: string;
  sourceType: "business_context_note" | "business_context_document";
};

export function isQStashConfigured(): boolean {
  return Boolean(process.env.QSTASH_TOKEN?.trim());
}

let qstashClient: Client | null = null;

export function getQStashClient(): Client | null {
  const token = process.env.QSTASH_TOKEN?.trim();
  if (!token) return null;

  if (!qstashClient) {
    qstashClient = new Client({ token });
  }

  return qstashClient;
}

export function getPublicAppUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl.replace(/\/$/, "")}`;

  throw new Error(
    "NEXT_PUBLIC_APP_URL no configurada — necesaria para publicar jobs en QStash"
  );
}

/**
 * Adónde avisa QStash cuando un job agota sus reintentos (SCRUM-84). Se pasa
 * como `failureCallback` en cada `publishJSON`: sin esto, un job que falla
 * siempre quedaba sólo en la cola de mensajes muertos de Upstash.
 */
export function getQueueFailureCallbackUrl(): string {
  return `${getPublicAppUrl()}/api/queue/failure`;
}

export function getRagIngestionWorkerUrl(): string {
  return `${getPublicAppUrl()}/api/queue/process-rag-ingestion`;
}

export function getReelVariationPublishUrl(): string {
  return `${getPublicAppUrl()}/api/queue/publish-reel-variation`;
}

export function getFathomAnalysisQueueUrl(): string {
  return `${getPublicAppUrl()}/api/queue/process-fathom-analysis`;
}

// --- Cron fan-out worker URLs ---

export function getCronSyncMetricsWorkerUrl(): string {
  return `${getPublicAppUrl()}/api/queue/process-cron-sync-metrics`;
}

export function getCronIntelligenceSnapshotWorkerUrl(): string {
  return `${getPublicAppUrl()}/api/queue/process-cron-intelligence-snapshot`;
}

export function getCronExecutiveReportWorkerUrl(): string {
  return `${getPublicAppUrl()}/api/queue/process-cron-executive-report`;
}

export function getCronFounderToneWorkerUrl(): string {
  return `${getPublicAppUrl()}/api/queue/process-cron-founder-tone`;
}

/**
 * Fan-out: publica un job QStash por cada org ID.
 * Los jobs corren en paralelo — QStash maneja backpressure y retries.
 * Usa x-worker-secret si WORKER_AUTH_SECRET está configurado;
 * si no, QStash firma con sus signing keys (verifyQueueRequest lo acepta).
 */
export async function publishCronFanout(
  workerUrl: string,
  orgIds: string[],
  retries = 2,
  /**
   * Campos extra que se agregan al cuerpo de cada job, junto al
   * `organizationId`. Lo usa el cron de reportes ejecutivos para decirle al
   * worker qué cadencia generar.
   */
  extraBody: Record<string, unknown> = {}
): Promise<{ published: number; failed: number }> {
  const client = getQStashClient();
  if (!client) throw new Error("QStash no configurado — QSTASH_TOKEN faltante");

  const workerSecret = process.env.WORKER_AUTH_SECRET?.trim();
  const extraHeaders: Record<string, string> = workerSecret
    ? { "x-worker-secret": workerSecret }
    : {};

  let published = 0;
  let failed = 0;

  // Publicar todos en paralelo — QStash es el throttle
  const results = await Promise.allSettled(
    orgIds.map((organizationId) =>
      client.publishJSON({
        url: workerUrl,
        body: { organizationId, ...extraBody },
        retries,
        headers: extraHeaders,
        failureCallback: getQueueFailureCallbackUrl(),
      })
    )
  );

  // Dentro de la corrida de un cron, cada org queda anotada en el registro de
  // corridas (SCRUM-85): con su job publicado, encolada (no terminada: lo que
  // haga el worker va a Sentry); si no se pudo publicar, fallida.
  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      published++;
      anotarJobDeOrganizacion(orgIds[i], true);
    } else {
      failed++;
      anotarJobDeOrganizacion(orgIds[i], false);
      console.error("[Queue] publishCronFanout: job no publicado", result.reason);
    }
  });

  return { published, failed };
}

export type FathomAnalysisJobPayload = {
  organizationId: string;
  fathomCallId: string;
  transcript: string;
  closerName?: string;
  leadName?: string;
  durationMinutes?: number;
  formAnswers?: Record<string, string>;
  callTitle?: string;
  callDate?: string | null;
  fathomUrl?: string | null;
  clientId?: string | null;
};

export async function publishFathomAnalysisJob(
  payload: FathomAnalysisJobPayload
): Promise<boolean> {
  try {
    const client = getQStashClient();
    if (!client) return false;

    const response = await client.publishJSON({
      url: getFathomAnalysisQueueUrl(),
      body: payload,
      retries: 2,
      failureCallback: getQueueFailureCallbackUrl(),
    });

    console.log("[Queue] fathom-analysis published to QStash", {
      fathomCallId: payload.fathomCallId,
      organizationId: payload.organizationId,
      messageId: response.messageId,
    });
    return true;
  } catch (err) {
    console.error("[Queue] QStash fathom-analysis publish failed", err);
    return false;
  }
}

export async function publishRagIngestionJob(
  payload: RagIngestionJobPayload
): Promise<boolean> {
  try {
    const client = getQStashClient();
    if (!client) return false;

    const response = await client.publishJSON({
      url: getRagIngestionWorkerUrl(),
      body: payload,
      retries: 3,
      failureCallback: getQueueFailureCallbackUrl(),
    });

    console.log("[Queue] rag-ingestion published to QStash", {
      documentId: payload.documentId,
      organizationId: payload.organizationId,
      sourceType: payload.sourceType,
      messageId: response.messageId,
    });
    return true;
  } catch (err) {
    console.error("[Queue] QStash publish failed — inline fallback", err);
    return false;
  }
}
