/**
 * Sentry en el reel-worker (SCRUM-84).
 *
 * ⭐ Antes un job que fallaba en FFmpeg quedaba marcado "failed" en la base y en
 * los logs de Fly.io, sin aviso. Ahora el error va a Sentry con el job y la
 * organización, y la regla de alerta lo manda por mail.
 *
 * Sin `SENTRY_DSN` no hace nada: el worker arranca igual.
 */
import * as Sentry from "@sentry/node";
import { limpiarEventoDeSentry } from "./limpiar-evento-sentry";

const dsn = process.env.SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "production",
    initialScope: { tags: { app: "reel-worker", proceso_de_fondo: "true" } },
    // SCRUM-501: sin el cuerpo de los requests (el SDK lo guarda por defecto,
    // hasta 10 KB) ni cookies, query o headers con secretos.
    integrations: [
      Sentry.httpIntegration({ maxIncomingRequestBodySize: "none" }),
      Sentry.requestDataIntegration({
        include: { data: false, cookies: false, query_string: false },
      }),
    ],
    beforeSend: (event) => limpiarEventoDeSentry(event),
    beforeSendTransaction: (event) => limpiarEventoDeSentry(event),
  });
}

export function reportarErrorDelWorker(
  error: unknown,
  contexto: { jobId?: string; organizationId?: string } = {}
): void {
  if (!dsn) return;
  try {
    Sentry.withScope((scope) => {
      if (contexto.organizationId) scope.setTag("org_id", contexto.organizationId);
      if (contexto.jobId) scope.setTag("job_id", contexto.jobId);
      Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
    });
  } catch {
    // Reportar nunca puede romper el worker.
  }
}

/** Antes de `process.exit`, para que el error llegue. */
export async function vaciarSentry(): Promise<void> {
  if (!dsn) return;
  await Sentry.flush(2000).catch(() => false);
}
