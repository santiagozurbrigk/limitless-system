import { isNextRouterError } from "next/dist/client/components/is-next-router-error";
import type { MutationResult } from "@/lib/server/action-result";

/**
 * Cómo un componente cliente corre una server action (de cualquier módulo).
 *
 * En producción Next no le manda al cliente el mensaje de un error lanzado por
 * una server action: sólo un digest y un párrafo técnico en inglés. Por eso las
 * acciones devuelven sus errores esperables como valor (`MutationResult` de
 * `lib/server/action-result.ts`) y lo que lanzan es inesperado: acá se registra
 * en la consola y se avisa con un texto fijo, nunca con el párrafo de Next.
 */

/**
 * Texto fijo de la interfaz para un error inesperado de una server action.
 * También es el texto de respaldo de `actionErrorMessage` en el servidor.
 */
export const ERROR_INESPERADO = "Ocurrió un error inesperado. Intentá de nuevo.";

export type Aviso = {
  title: string;
  description?: string;
  variant?: "default" | "success";
};

/**
 * Corre una server action desde un componente. Si devuelve un resultado (los
 * errores esperables vuelven como valor), se lo pasa a `alTerminar`. Si lanza,
 * es inesperado: se registra en la consola con `etiqueta` y se avisa con
 * `tituloError` y el texto fijo.
 */
export async function correrAccion<R>(opciones: {
  accion: () => Promise<R>;
  alTerminar: (resultado: R) => void;
  avisar: (aviso: Aviso) => void;
  tituloError: string;
  etiqueta: string;
}): Promise<void> {
  let resultado: R;
  try {
    resultado = await opciones.accion();
  } catch (error) {
    // Un redirect o un notFound de Next (p. ej. `requireAuthContext` manda a
    // cambiar la contraseña) no es un error: Next ya navega. No se avisa ni se
    // registra.
    if (isNextRouterError(error)) return;
    console.error(opciones.etiqueta, error);
    opciones.avisar({ title: opciones.tituloError, description: ERROR_INESPERADO, variant: "default" });
    return;
  }
  opciones.alTerminar(resultado);
}

/**
 * Lo mismo para una acción que devuelve `MutationResult`: con éxito llama a
 * `alExito`; con un error esperable lo muestra con su mensaje.
 */
export function correrMutacion<T>(opciones: {
  accion: () => Promise<MutationResult<T>>;
  alExito: (data: T) => void;
  avisar: (aviso: Aviso) => void;
  tituloError: string;
  etiqueta: string;
}): Promise<void> {
  return correrAccion({
    accion: opciones.accion,
    avisar: opciones.avisar,
    tituloError: opciones.tituloError,
    etiqueta: opciones.etiqueta,
    alTerminar: (resultado) => {
      if (resultado.success) opciones.alExito(resultado.data);
      else opciones.avisar({ title: opciones.tituloError, description: resultado.error, variant: "default" });
    },
  });
}

/**
 * Para una capa que devuelve el dato o lanza, como `PlatformDataProvider`, cuyos
 * llamadores muestran `error.message`. Con éxito devuelve el dato. Con un error
 * esperable lanza un `Error` con ese mensaje: se lanza en el navegador, así que
 * el mensaje llega entero. Si la acción lanzó en el servidor, lo registra con
 * `etiqueta` y lanza el texto fijo. Un redirect o un notFound de Next se relanza
 * tal cual para que Next navegue.
 */
export async function datoDeLaMutacion<T>(
  accion: () => Promise<MutationResult<T>>,
  etiqueta: string
): Promise<T> {
  let resultado: MutationResult<T>;
  try {
    resultado = await accion();
  } catch (error) {
    if (isNextRouterError(error)) throw error;
    console.error(etiqueta, error);
    throw new Error(ERROR_INESPERADO);
  }
  if (!resultado.success) throw new Error(resultado.error);
  return resultado.data;
}
