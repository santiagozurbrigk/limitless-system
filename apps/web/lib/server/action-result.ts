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
 * ⭐ Heurística (no garantía) para saber si un error atrapado por
 * `runMutation` es una falla de infraestructura o un bug y no un rechazo de
 * negocio escrito a mano.
 *
 * Los módulos que todavía no distinguen sus errores (SCRUM-496) lanzan
 * `new Error("texto para el usuario")` para todo. Mandar eso a Sentry sería
 * ruido; dejar de mandar una caída de la base, perder la alerta. Se reporta:
 *   - lo que no es un `Error` (por ejemplo, el objeto de error de supabase-js
 *     lanzado tal cual);
 *   - un error de otra clase (`TypeError`, `RangeError`, `FallaDeLaBase`...);
 *   - un error con `code` de PostgREST (`PGRST*`, salvo `PGRST116`, que es
 *     "no encontrado") o de Postgres de una clase de infraestructura o de
 *     datos (`CODIGO_DE_INFRAESTRUCTURA`);
 *   - un `Error` cuyo texto es el típico de la red, de Postgres, de PostgREST,
 *     de la RLS o de un gateway (`TEXTO_DE_INFRAESTRUCTURA`), que es lo que
 *     esos módulos relanzan con `error.message`.
 * Un rechazo de negocio con un texto que no matchea queda como aviso en el
 * log, sin Sentry; una falla con un texto que no está en la lista, también.
 */
const TEXTO_DE_INFRAESTRUCTURA = new RegExp(
  [
    // Red y runtime.
    "fetch failed", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN",
    "socket hang up", "network", "timed? ?out", "TypeError",
    // Postgres.
    "violates", "permission denied", "does not exist", "infinite recursion", "duplicate key",
    "syntax error", "invalid input syntax", "value too long", "out of range",
    "deadlock detected", "could not serialize access", "canceling statement",
    "too many (clients|connections)", "column .* of relation", 'relation "',
    // PostgREST y Supabase.
    "PGRST", "JWT", "Cannot coerce", "in the schema cache",
    "invalid response was received from the upstream server",
    // Gateway.
    "Bad Gateway", "Service Unavailable", "Gateway Time-?out", "Internal Server Error",
  ].join("|"),
  "i"
);

/**
 * Clases de SQLSTATE que indican una falla y no un rechazo de negocio:
 * 08 conexión, 22 dato inválido, 23 restricción, 40 transacción (deadlock,
 * serialización), 42 sintaxis, objeto inexistente o permiso, 53 recursos,
 * 54 límite del programa, 55 estado del objeto, 57 intervención del operador,
 * 58 sistema, XX interno.
 */
const CODIGO_DE_INFRAESTRUCTURA = /^(08|22|23|40|42|53|54|55|57|58|XX)[0-9A-Z]{3}$/;

function codigoDelError(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code ? code : null;
}

export function esFallaParaReportar(error: unknown): boolean {
  if (esErrorEsperable(error)) return false;
  if (!(error instanceof Error)) return true;
  if (error.constructor !== Error) return true;
  const code = codigoDelError(error);
  if (code) {
    if (code.startsWith("PGRST")) return code !== "PGRST116";
    if (CODIGO_DE_INFRAESTRUCTURA.test(code)) return true;
  }
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
