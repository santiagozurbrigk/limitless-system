import { AI_KEY_REJECTED_MESSAGE } from "@/lib/ai/anthropic-auth-errors";
import { claudeNoCreditsUserMessage } from "@/lib/ai/anthropic-errors";
import {
  GOOGLE_PERMISSION_RECONNECT_MESSAGE,
  GoogleIntegrationPermissionError,
} from "@/lib/google/errors";
import { ErrorEsperable } from "@/lib/server/error-esperable";
import { ZernioHttpError } from "@/lib/zernio/client";

/**
 * Rechazos conocidos de los servicios que usan las acciones de Contenido
 * (SCRUM-502): Zernio, Google Drive y Claude. Cada función recibe lo que lanzó
 * la llamada y devuelve un `ErrorEsperable` con el motivo para el usuario si es
 * un rechazo con motivo claro (integración no conectada, conexión rechazada,
 * clave sin créditos); si no, devuelve el mismo error para que
 * `mutacionConErroresEsperables` lo registre como falla. Se usan así:
 *
 *     await client.listAds(...).catch((error: unknown) => {
 *       throw rechazoDeZernio(error);
 *     });
 *
 * Los helpers de esos servicios lanzan `Error` comunes con textos fijos (no
 * tienen código): se comparan contra el texto exacto que escribe nuestro código,
 * nunca contra un texto del proveedor ni de la base.
 */

/** El texto de `getZernioClientForOrganization` (`lib/zernio/integration.ts`). */
export const ZERNIO_NO_CONECTADO = "Zernio no está conectado";
export const ZERNIO_SIN_ACCESO =
  "Zernio rechazó la conexión de tu organización. Volvé a conectarlo desde Integraciones.";

/** El texto de Trial Reels para la misma situación (`reel-variation-actions.ts`). */
export const DRIVE_NO_CONECTADO = "Conectá Google Drive en Integraciones para usar esta función.";

/** Textos fijos que lanza `downloadDriveFileAction` (`app/marketing/content/drive-actions.ts`). */
const DRIVE_SIN_CONEXION = "GOOGLE_NOT_CONNECTED";
const DRIVE_SIN_PERMISOS = "GOOGLE_INSUFFICIENT_PERMISSIONS";
const DRIVE_ARCHIVO_GRANDE = "El archivo supera el límite de 500 MB";
const SESION_NO_VALIDA = "Sesión no válida";

function esErrorComun(error: unknown): error is Error {
  return error instanceof Error && error.constructor === Error;
}

/**
 * Zernio: sin integración, o una respuesta 401/403 (la clave de la org ya no
 * sirve). Cualquier otra respuesta (404, 429, 5xx, tiempo agotado, HTML) es
 * una falla.
 */
export function rechazoDeZernio(error: unknown): unknown {
  if (esErrorComun(error) && error.message === ZERNIO_NO_CONECTADO) {
    return new ErrorEsperable(ZERNIO_NO_CONECTADO);
  }
  if (error instanceof ZernioHttpError && (error.status === 401 || error.status === 403)) {
    return new ErrorEsperable(ZERNIO_SIN_ACCESO);
  }
  return error;
}

/**
 * Google Drive, al descargar el archivo de una pieza: sin sesión, sin Google
 * conectado, sin permisos sobre el archivo o un archivo de más de 500 MB. Un
 * error de Drive con otro status o una caída de la red es una falla.
 */
export function rechazoDeDrive(error: unknown): unknown {
  if (error instanceof GoogleIntegrationPermissionError) {
    return new ErrorEsperable(GOOGLE_PERMISSION_RECONNECT_MESSAGE);
  }
  if (!esErrorComun(error)) return error;
  switch (error.message) {
    case SESION_NO_VALIDA:
      return new ErrorEsperable(SESION_NO_VALIDA);
    case DRIVE_SIN_CONEXION:
      return new ErrorEsperable(DRIVE_NO_CONECTADO);
    case DRIVE_SIN_PERMISOS:
      return new ErrorEsperable(GOOGLE_PERMISSION_RECONNECT_MESSAGE);
    case DRIVE_ARCHIVO_GRANDE:
      return new ErrorEsperable(DRIVE_ARCHIVO_GRANDE);
    default:
      return error;
  }
}

/**
 * Claude: la clave de la org fue rechazada o la cuenta no tiene créditos (los
 * textos que arma `lib/ai/anthropic.ts`). Es el mismo criterio que
 * `rechazoDeClaude` de `app/clients/plan-duration-actions.ts` (SCRUM-516).
 */
export function rechazoDeClaude(error: unknown): unknown {
  if (
    esErrorComun(error) &&
    (error.message === AI_KEY_REJECTED_MESSAGE || error.message === claudeNoCreditsUserMessage())
  ) {
    return new ErrorEsperable(error.message);
  }
  return error;
}
