/** Pone un job de SOP-desde-video en la cola de QStash. */
import { getQStashClient, getQueueFailureCallbackUrl } from "@/lib/queue/qstash-client";

export async function enqueueSopVideoJob(jobId: string): Promise<void> {
  const client = getQStashClient();
  if (!client) throw new Error("QStash no configurado — QSTASH_TOKEN faltante");

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!baseUrl) throw new Error("NEXT_PUBLIC_APP_URL no configurada");

  const workerSecret = process.env.WORKER_AUTH_SECRET?.trim();

  await client.publishJSON({
    url: `${baseUrl}/api/queue/process-sop-video`,
    body: { jobId },
    // Un reintento: transcribir cuesta plata, y el worker ya guarda la
    // transcripción para que el segundo intento sólo pague la generación.
    retries: 1,
    headers: workerSecret ? { "x-worker-secret": workerSecret } : {},
    failureCallback: getQueueFailureCallbackUrl(),
  });
}
