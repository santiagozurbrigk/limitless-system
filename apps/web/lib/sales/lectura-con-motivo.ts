import { isNextRouterError } from "next/dist/client/components/is-next-router-error";
import { ERROR_INESPERADO } from "@/lib/client/correr-accion";
import type { MutationResult } from "@/lib/server/action-result";

/**
 * Cómo un componente cliente de Ventas carga una lectura que devuelve
 * `MutationResult` (SCRUM-504) para mostrar su propio estado de error.
 *
 * - Con éxito, el dato.
 * - Con un error que la acción devolvió como valor, ese motivo (por ejemplo
 *   "Sesión no válida", o el texto fijo si en el servidor fue inesperado).
 * - Si la acción lanzó (en producción el cliente sólo recibe un digest), es
 *   inesperado: se registra en la consola con `etiqueta` y el motivo es el
 *   texto fijo de la interfaz.
 * Un redirect o un notFound de Next se relanza para que Next navegue.
 */
export type Lectura<T> = { ok: true; data: T } | { ok: false; motivo: string };

export async function leerConMotivo<T>(
  accion: () => Promise<MutationResult<T>>,
  etiqueta: string
): Promise<Lectura<T>> {
  let resultado: MutationResult<T>;
  try {
    resultado = await accion();
  } catch (error) {
    if (isNextRouterError(error)) throw error;
    console.error(etiqueta, error);
    return { ok: false, motivo: ERROR_INESPERADO };
  }
  return resultado.success
    ? { ok: true, data: resultado.data }
    : { ok: false, motivo: resultado.error };
}
