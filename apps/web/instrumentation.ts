/**
 * Arranque de Sentry en el servidor.
 *
 * Con @sentry/nextjs 8+ los `sentry.server.config.ts` / `sentry.edge.config.ts`
 * no se cargan solos: los importa este `register()`. Sin este archivo,
 * `Sentry.captureException` en route handlers y server actions no hacía nada y
 * los errores del backend sólo quedaban en los logs de Vercel.
 */
import * as Sentry from "@sentry/nextjs";
import { digestDeNext } from "@/lib/observability/digest-de-next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

/**
 * Errores no capturados de Server Components, route handlers y middleware.
 *
 * ⭐ Con el tag `error_digest` (SCRUM-108): es el "código de referencia" que la
 * pantalla de error le muestra al usuario, y el evento del navegador lleva el
 * mismo tag. Así soporte encuentra con ese código el evento del servidor, que
 * es el que tiene el mensaje real y el stack (el del navegador sólo trae el
 * texto genérico de Next). `captureRequestError` abre su propio scope encima
 * de éste, así que hereda el tag. Si el SDK ya había capturado el mismo error
 * al envolver el Server Component (antes de que Next le pusiera el digest),
 * este evento se descarta y el tag lo pone `beforeSend` de
 * `sentry.server.config.ts` (`etiquetarDigest`).
 */
export function onRequestError(
  ...args: Parameters<typeof Sentry.captureRequestError>
): void {
  const digest = digestDeNext(args[0]);
  Sentry.withScope((scope) => {
    if (digest) scope.setTag("error_digest", digest);
    Sentry.captureRequestError(...args);
  });
}
