/**
 * Sentry — configuración del Edge runtime.
 * Cubre el middleware de Next.js (que corre en Edge).
 */
import * as Sentry from "@sentry/nextjs";
import { limpiarEventoDeSentry } from "@/lib/observability/limpiar-evento-sentry";

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,

  enabled:
    process.env.NODE_ENV === "production" ||
    process.env.SENTRY_FORCE === "true",

  sampleRate: 1.0,
  tracesSampleRate: 0.05,

  // SCRUM-501: sin cuerpo, cookies ni query del request, como en el servidor.
  integrations: [
    Sentry.requestDataIntegration({
      include: { data: false, cookies: false, query_string: false },
    }),
  ],

  beforeSend(event) {
    return limpiarEventoDeSentry(event);
  },

  beforeSendTransaction(event) {
    return limpiarEventoDeSentry(event);
  },
});
