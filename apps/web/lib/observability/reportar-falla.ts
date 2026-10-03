import * as Sentry from "@sentry/nextjs";

/**
 * Manda a Sentry una falla de un proceso de fondo, con las etiquetas que dicen
 * de qué organización, de qué cron o worker y de qué proveedor es (SCRUM-84).
 *
 * ⭐ Antes los crons, los workers de QStash y los webhooks atrapaban el error y
 * hacían `console.*`: el error quedaba en los logs de Vercel y nadie se
 * enteraba. Así duraron semanas un token de GHL vencido (168 fallas), la clave
 * de Anthropic rechazada en el análisis de llamadas (~3.000) y los 429 de
 * Zernio (849). Con las etiquetas, Sentry agrupa por org y alerta por mail.
 *
 * No tira nunca: reportar no puede romper el trabajo que falló.
 */
export type ContextoDeFalla = {
  /** Ruta del cron (`/api/cron/ghl-sync`) o nombre del worker. */
  cron?: string;
  organizationId?: string | null;
  /** Proveedor externo involucrado: `ghl`, `calendly`, `fathom`, `zernio`... */
  provider?: string;
  /** Datos sueltos para el detalle del evento. Nunca secretos ni transcripts. */
  extra?: Record<string, unknown>;
};

export function etiquetasDeFalla(contexto: ContextoDeFalla): Record<string, string> {
  const etiquetas: Record<string, string> = { proceso_de_fondo: "true" };
  if (contexto.cron) etiquetas.cron = contexto.cron;
  if (contexto.organizationId) etiquetas.org_id = contexto.organizationId;
  if (contexto.provider) etiquetas.provider = contexto.provider;
  return etiquetas;
}

export function reportarFalla(error: unknown, contexto: ContextoDeFalla): void {
  try {
    Sentry.withScope((scope) => {
      scope.setTags(etiquetasDeFalla(contexto));
      if (contexto.extra) scope.setExtras(contexto.extra);
      Sentry.captureException(
        error instanceof Error ? error : new Error(String(error))
      );
    });
  } catch (fallo) {
    console.error("[reportarFalla] no se pudo reportar a Sentry", fallo);
  }
}
