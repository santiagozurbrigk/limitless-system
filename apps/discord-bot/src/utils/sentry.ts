/**
 * Sentry en el bot de Discord (SCRUM-84).
 *
 * ⭐ Antes los errores del bot sólo quedaban en los logs de Railway: si se caía
 * el gateway o fallaba el aviso a Limitless, nadie se enteraba. Ahora cada
 * `logError` también va a Sentry y la regla de alerta lo manda por mail.
 *
 * Sin `SENTRY_DSN` no hace nada: el bot arranca igual.
 */
import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "production",
    initialScope: { tags: { app: "discord-bot", proceso_de_fondo: "true" } },
  });
}

export function reportarErrorDelBot(error: unknown, mensaje?: string): void {
  if (!dsn) return;
  try {
    Sentry.captureException(
      error instanceof Error ? error : new Error(mensaje ?? String(error))
    );
  } catch {
    // Reportar nunca puede romper el bot.
  }
}
