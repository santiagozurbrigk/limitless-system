import { isNextRouterError } from "next/dist/client/components/is-next-router-error";
import { ERROR_INESPERADO } from "@/lib/client/correr-accion";
import { reportarFalla } from "@/lib/observability/reportar-falla";
import { esErrorEsperable } from "@/lib/server/error-esperable";

export { ErrorEsperable, esErrorEsperable } from "@/lib/server/error-esperable";

/** Resultado serializable para mutaciones desde Server Actions (evita throws en el cliente). */
export type MutationResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Mensaje de un error atrapado. Lo que devuelve llega a la pantalla (es el
 * `error` de `runMutation`), así que el respaldo es el mismo texto fijo en
 * voseo que muestra la interfaz ante un error inesperado.
 */
export function actionErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return ERROR_INESPERADO;
}

/**
 * Un error de PostgREST o de Supabase que llegó como valor (`{ error }` de
 * supabase-js) y no es un rechazo conocido. Lleva el código para que el
 * registro y Sentry digan qué pasó; el usuario no lo ve.
 */
export class FallaDeLaBase extends Error {
  readonly code: string | undefined;
  constructor(error: { message: string; code?: string | null }) {
    super(error.message);
    this.name = "FallaDeLaBase";
    this.code = error.code ?? undefined;
  }
}

/**
 * Registra en el servidor y manda a Sentry una falla inesperada de una server
 * action. Sólo el error y la etiqueta: nunca los argumentos de la acción, que
 * pueden traer datos personales o contraseñas.
 */
export function registrarFallaDeAccion(etiqueta: string, error: unknown): void {
  console.error(etiqueta, error);
  reportarFalla(error, { accion: etiqueta });
}

/**
 * ⭐ Lo que deja ver que un error atrapado por `runMutation` es una falla de
 * infraestructura o un bug y no un rechazo de negocio escrito a mano.
 *
 * Los módulos que todavía no distinguen sus errores (SCRUM-496) lanzan
 * `new Error("texto para el usuario")` para todo. Mandar eso a Sentry sería
 * ruido; dejar de mandar una caída de la base, perder la alerta. Se reporta:
 * lo que no es un `Error`, un error de otra clase (`TypeError`, `RangeError`,
 * `FallaDeLaBase`...) y un `Error` con el texto típico de la red, Postgres,
 * PostgREST o la RLS (lo que esos módulos relanzan con `error.message`).
 */
const TEXTO_DE_INFRAESTRUCTURA =
  /fetch failed|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|network|timed? ?out|TypeError|violates|permission denied|does not exist|infinite recursion|duplicate key|syntax error|invalid input syntax|JWT|PGRST|Cannot coerce|column .* of relation|relation "/i;

export function esFallaParaReportar(error: unknown): boolean {
  if (esErrorEsperable(error)) return false;
  if (!(error instanceof Error)) return true;
  if (error.constructor !== Error) return true;
  return TEXTO_DE_INFRAESTRUCTURA.test(error.message);
}

/**
 * La forma vieja: cualquier excepción vuelve como valor con su mensaje. La usan
 * los módulos que todavía no separan lo esperable de lo inesperado
 * (`[ACTIONS-ERRORES-EN-PRODUCCION]`, SCRUM-496): su mensaje no cambia. Lo que
 * sí suma (SCRUM-497) es que lo inesperado no se pierde: una falla que
 * `esFallaParaReportar` reconoce se registra y va a Sentry; el resto de los
 * `Error` sin marcar se anota como aviso en los logs del servidor.
 */
export async function runMutation<T>(
  fn: () => Promise<T>
): Promise<MutationResult<T>> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (error) {
    if (!esErrorEsperable(error) && !isNextRouterError(error)) {
      if (esFallaParaReportar(error)) registrarFallaDeAccion("[runMutation]", error);
      else console.warn("[runMutation] rechazo sin marcar:", actionErrorMessage(error));
    }
    return { success: false, error: actionErrorMessage(error) };
  }
}

/**
 * ⭐ La forma de los módulos que ya distinguen sus errores (SCRUM-497): sólo un
 * `ErrorEsperable` vuelve con su mensaje. Cualquier otra excepción (una
 * `FallaDeLaBase`, un `TypeError` de la red, un bug) se registra en el
 * servidor y en Sentry con `etiqueta`, y vuelve con un texto fijo en voseo
 * (`mensajeInesperado`, por defecto el de la interfaz): el usuario nunca ve el
 * texto técnico. Un redirect o un notFound de Next se relanza.
 */
export async function mutacionConErroresEsperables<T>(
  etiqueta: string,
  fn: () => Promise<T>,
  mensajeInesperado: string = ERROR_INESPERADO
): Promise<MutationResult<T>> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (error) {
    if (isNextRouterError(error)) throw error;
    if (esErrorEsperable(error)) return { success: false, error: error.message };
    registrarFallaDeAccion(etiqueta, error);
    return { success: false, error: mensajeInesperado };
  }
}
