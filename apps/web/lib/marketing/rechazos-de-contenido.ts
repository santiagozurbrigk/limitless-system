import { ErrorEsperable } from "@/lib/server/error-esperable";
import { ZernioHttpError } from "@/lib/zernio/client";

/**
 * Rechazos conocidos de Zernio en las acciones de Contenido (SCRUM-502). La
 * función recibe lo que lanzó la llamada y devuelve un `ErrorEsperable` con el
 * motivo para el usuario si es un rechazo con motivo claro (integración no
 * conectada, clave rechazada); si no, el error (sin el cuerpo de la respuesta)
 * para que `mutacionConErroresEsperables` lo registre como falla. Los de Google
 * Drive los lanza ya como `ErrorEsperable` `descargarArchivoDeDrive`
 * (`lib/google/drive-archivos.ts`) y los de Claude se traducen con
 * `rechazoConocidoDeClaude` (`lib/ai/rechazo-de-claude.ts`), los dos de
 * SCRUM-519. Se usa así:
 *
 *     await client.listAds(...).catch((error: unknown) => {
 *       throw rechazoDeZernio(error);
 *     });
 *
 * `getZernioClientForOrganization` lanza un `Error` común con un texto fijo
 * (sin código): se compara contra el texto exacto que escribe nuestro código,
 * nunca contra un texto del proveedor ni de la base.
 */

/** El texto de `getZernioClientForOrganization` (`lib/zernio/integration.ts`). */
export const ZERNIO_NO_CONECTADO = "Zernio no está conectado";
export const ZERNIO_SIN_ACCESO =
  "Zernio rechazó la conexión de tu organización. Volvé a conectarlo desde Integraciones.";

function esErrorComun(error: unknown): error is Error {
  return error instanceof Error && error.constructor === Error;
}

/**
 * Zernio: sin integración, o una respuesta 401/403 (la clave de la org ya no
 * sirve). Cualquier otra respuesta (404, 429, 5xx, tiempo agotado, HTML) es
 * una falla, y se registra sin el cuerpo de la respuesta (`sinCuerpoDeZernio`).
 */
export function rechazoDeZernio(error: unknown): unknown {
  if (esErrorComun(error) && error.message === ZERNIO_NO_CONECTADO) {
    return new ErrorEsperable(ZERNIO_NO_CONECTADO);
  }
  if (error instanceof ZernioHttpError && (error.status === 401 || error.status === 403)) {
    return new ErrorEsperable(ZERNIO_SIN_ACCESO);
  }
  return sinCuerpoDeZernio(error);
}

/**
 * El texto que ve el usuario en la tarjeta de una variante de Trial Reels
 * cuando Zernio rechaza o falla al crear el post (SCRUM-502, AR pasada 2).
 * Desde la AR pasada 1, `createPost` lanza `ZernioHttpError` con el status y
 * sin el cuerpo de la respuesta (puede repetir el caption), así que el motivo
 * se elige por el status. Cualquier otro error devuelve `null` y quien llama
 * guarda su mensaje como antes.
 */
export function motivoDeFallaAlPublicarEnZernio(error: unknown): string | null {
  if (!(error instanceof ZernioHttpError)) return null;
  if (error.status === 400 || error.status === 422) {
    return "Zernio rechazó el contenido del post. Revisá el caption o el video y probá de nuevo.";
  }
  if (error.status === 401 || error.status === 403) return ZERNIO_SIN_ACCESO;
  if (error.status === 429) return "Zernio está limitando los pedidos. Probá de nuevo más tarde.";
  return "Zernio falló al crear el post. Probá de nuevo.";
}

/**
 * `zernioFetchJson` (`lib/zernio/client.ts`) arma sus errores como
 * `Zernio <pedido>: <qué pasó>`, un guion largo entre espacios (U+2014) y los
 * primeros 200 caracteres del cuerpo. El mensaje de una falla viaja a Sentry,
 * así que se corta antes del cuerpo y se
 * conserva la clase y el status. Es el formato de nuestro propio cliente, no
 * un texto del proveedor.
 */
const SEPARADOR_DEL_CUERPO = " \u2014 ";

export function sinCuerpoDeZernio(error: unknown): unknown {
  if (!(error instanceof Error) || !error.message.startsWith("Zernio ")) return error;
  const corte = error.message.indexOf(SEPARADOR_DEL_CUERPO);
  if (corte === -1) return error;
  const mensaje = error.message.slice(0, corte);
  if (error instanceof ZernioHttpError) return new ZernioHttpError(mensaje, error.status);
  if (esErrorComun(error)) return new Error(mensaje);
  return error;
}
