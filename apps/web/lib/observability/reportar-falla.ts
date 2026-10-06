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
  /**
   * Server action que falló (`[createClient]`...). Con esto el evento no es de un
   * proceso de fondo: lleva el tag `server_action` en vez de `proceso_de_fondo`
   * (SCRUM-497), así las reglas de alerta de los crons no lo mezclan.
   */
  accion?: string;
  /** Datos sueltos para el detalle del evento. Nunca secretos ni transcripts. */
  extra?: Record<string, unknown>;
};

export function etiquetasDeFalla(contexto: ContextoDeFalla): Record<string, string> {
  const etiquetas: Record<string, string> = contexto.accion
    ? { server_action: contexto.accion }
    : { proceso_de_fondo: "true" };
  if (contexto.cron) etiquetas.cron = contexto.cron;
  if (contexto.organizationId) etiquetas.org_id = contexto.organizationId;
  if (contexto.provider) etiquetas.provider = contexto.provider;
  return etiquetas;
}

/**
 * Lo que se le manda a Sentry. Un `Error` va tal cual. Un objeto plano (el
 * error de supabase-js relanzado con `throw error`) llegaba como
 * "[object Object]": se arma un `Error` con su `message` y se devuelve su
 * `code` para la etiqueta. Sólo esos dos campos: nada de `details` ni `hint`,
 * que pueden traer valores de la fila.
 */
export function errorParaReportar(error: unknown): { error: Error; codigo: string | null } {
  const codigoDe = (valor: unknown): string | null => {
    if (typeof valor !== "object" || valor === null || !("code" in valor)) return null;
    const code = (valor as { code?: unknown }).code;
    return typeof code === "string" && code ? code.slice(0, 40) : null;
  };
  if (error instanceof Error) return { error, codigo: codigoDe(error) };
  if (typeof error === "object" && error !== null && "message" in error) {
    const mensaje = (error as { message?: unknown }).message;
    if (typeof mensaje === "string") {
      const envuelto = new Error(mensaje);
      envuelto.name = "ObjetoDeError";
      return { error: envuelto, codigo: codigoDe(error) };
    }
  }
  return { error: new Error(typeof error === "string" ? error : "Error sin mensaje"), codigo: null };
}

export function reportarFalla(error: unknown, contexto: ContextoDeFalla): void {
  try {
    const { error: aReportar, codigo } = errorParaReportar(error);
    Sentry.withScope((scope) => {
      scope.setTags(etiquetasDeFalla(contexto));
      if (codigo) scope.setTag("error_code", codigo);
      if (contexto.extra) scope.setExtras(contexto.extra);
      Sentry.captureException(aReportar);
    });
  } catch (fallo) {
    console.error("[reportarFalla] no se pudo reportar a Sentry", fallo);
  }
}
