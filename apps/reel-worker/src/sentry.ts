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

const dsn = process.env.SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "production",
    initialScope: { tags: { app: "reel-worker", proceso_de_fondo: "true" } },
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
