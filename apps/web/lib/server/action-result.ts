import { ERROR_INESPERADO } from "@/lib/client/correr-accion";

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

export async function runMutation<T>(
  fn: () => Promise<T>
): Promise<MutationResult<T>> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: actionErrorMessage(error) };
  }
}
