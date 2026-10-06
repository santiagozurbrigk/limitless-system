/**
 * Sentry — configuración del cliente (browser).
 * Se carga automáticamente por @sentry/nextjs si NEXT_PUBLIC_SENTRY_DSN está seteado.
 */
import * as Sentry from "@sentry/nextjs";
import { limpiarEventoDeSentry } from "@/lib/observability/limpiar-evento-sentry";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Solo capturar errores en producción a menos que se fuerce con SENTRY_FORCE.
  enabled:
    process.env.NODE_ENV === "production" ||
    process.env.SENTRY_FORCE === "true",

  // Tasa de muestreo de errores: 100% para el beta.
  sampleRate: 1.0,

  // Tasa de muestreo de trazas de performance: 10% para no inflar la cuota.
  tracesSampleRate: 0.1,

  // Ocultar datos personales del usuario en los eventos: cookies, query de la
  // URL (p. ej. el token de /invite), headers y breadcrumbs con datos
  // (SCRUM-501, `lib/observability/limpiar-evento-sentry.ts`).
  beforeSend(event) {
    return limpiarEventoDeSentry(event);
  },

  beforeSendTransaction(event) {
    return limpiarEventoDeSentry(event);
  },

  integrations: [
    Sentry.breadcrumbsIntegration({ console: false }),
  ],
});
