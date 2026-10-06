/**
 * Sentry — configuración del servidor (Node.js runtime).
 * Cubre Route Handlers, Server Actions, y API routes.
 */
import * as Sentry from "@sentry/nextjs";
import { limpiarEventoDeSentry } from "@/lib/observability/limpiar-evento-sentry";

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,

  enabled:
    process.env.NODE_ENV === "production" ||
    process.env.SENTRY_FORCE === "true",

  // 100% de errores, 5% de trazas (las lambdas son muchas).
  sampleRate: 1.0,
  tracesSampleRate: 0.05,

  // Contexto extra para filtrar por módulo en el dashboard de Sentry.
  initialScope: {
    tags: {
      runtime: "server",
      app: "ai-coo-web",
    },
  },

  // ⭐ SCRUM-501: sin el cuerpo de los requests. El SDK lo guarda por defecto
  // (hasta 10 KB, aunque `sendDefaultPii` esté apagado) y en una server action
  // son sus argumentos: contraseñas, API keys, datos de clientes. Reemplazan a
  // las integraciones del mismo nombre que arma @sentry/nextjs, así que la de
  // HTTP conserva `disableIncomingRequestSpans` como la de ellos.
  integrations: [
    Sentry.httpIntegration({
      disableIncomingRequestSpans: true,
      maxIncomingRequestBodySize: "none",
    }),
    Sentry.requestDataIntegration({
      include: { data: false, cookies: false, query_string: false },
    }),
  ],

  beforeSend(event) {
    // No enviar errores de rate limit conocidos (ruido).
    const msg = event.exception?.values?.[0]?.value ?? "";
    if (msg.includes("Rate limit exceeded")) return null;
    // Cuerpo, cookies, query, headers no permitidos, breadcrumbs de consola.
    return limpiarEventoDeSentry(event);
  },

  beforeSendTransaction(event) {
    return limpiarEventoDeSentry(event);
  },
});
