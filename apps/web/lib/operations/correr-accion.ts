import { isNextRouterError } from "next/dist/client/components/is-next-router-error";
import type { MutationResult } from "@/lib/server/action-result";

/**
 * Texto fijo de la interfaz para un error inesperado de una server action. En
 * producción Next no le manda al cliente el mensaje de un error lanzado (sólo
 * un digest y un párrafo técnico en inglés): eso no se le muestra a nadie.
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
