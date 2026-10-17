import { ERROR_INESPERADO } from "@/lib/client/correr-accion";
import { requireAuthContext, type AuthContext } from "@/lib/auth/require-auth";
import { ErrorEsperable } from "@/lib/server/error-esperable";
import { uuidSchema } from "@/lib/validations";

/**
 * Lo que comparten las acciones del Agente (`app/agent/actions.ts`) y el envío
 * por streaming (`lib/agent/stream-agent-message.ts`, la ruta
 * `/api/agent/send`) para separar un rechazo esperable de una falla
 * (SCRUM-506). Vive fuera del archivo `"use server"`: una función exportada de
 * ahí sería un endpoint más.
 */

export const SESION_NO_VALIDA = "Sesión no válida";
export const CONVERSACION_NO_ENCONTRADA = "Conversación no encontrada";

/** Lo que ve el usuario cuando no se pudo generar la respuesta del agente. */
export const AGENT_ERROR_REPLY =
  "No pudimos generar la respuesta. Intentá de nuevo en unos segundos.";

/**
 * `requireAuthContext` lanza un `Error` común "Unauthorized" cuando no hay
 * sesión, la cuenta está desactivada o no tiene organización: es un rechazo
 * esperable y se traduce al mismo texto que `requireOrganizationId`. Lo demás
 * (el redirect de Next al cambio de contraseña, una falla) sigue de largo.
 */
export async function contextoDeSesion(): Promise<AuthContext> {
  try {
    return await requireAuthContext();
  } catch (error) {
    if (
      error instanceof Error &&
      error.constructor === Error &&
      error.message === "Unauthorized"
    ) {
      throw new ErrorEsperable(SESION_NO_VALIDA);
    }
    throw error;
  }
}

export function exigirUuid(id: unknown): string {
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) throw new ErrorEsperable("ID inválido");
  return parsed.data;
}

/**
 * Una falla que ya registró (consola y Sentry) la acción que la devolvió: quien
 * la recibe no la vuelve a reportar. Su mensaje es el texto fijo.
 */
export class FallaYaRegistrada extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "FallaYaRegistrada";
  }
}

/**
 * El error de una acción del Agente que el streaming usa como paso intermedio.
 * La acción devuelve el texto fijo (`ERROR_INESPERADO`) sólo para una falla, que
 * ella ya registró; cualquier otro texto es un rechazo esperable con su motivo.
 */
export function errorDeLaAccion(error: string): Error {
  return error === ERROR_INESPERADO ? new FallaYaRegistrada(error) : new ErrorEsperable(error);
}
