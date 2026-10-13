import { unstable_rethrow } from "next/navigation";
import { reportarFalla } from "@/lib/observability/reportar-falla";
import { esErrorEsperable } from "@/lib/server/error-esperable";

/**
 * Una lectura secundaria de una pantalla que, si falla, no puede tirar la
 * pantalla entera (SCRUM-108).
 *
 * El layout de la plataforma esperaba cinco lecturas con un `Promise.all`: con
 * que fallara una (el selector de negocios del holding, el checklist de
 * onboarding, la zona horaria), toda la app quedaba en la pantalla de error
 * para todos los usuarios de la org. Las que tienen un valor por defecto seguro
 * pasan por acá: si fallan, se registran en Sentry con el tag
 * `lectura_degradada` y la pantalla sigue con `porDefecto`.
 *
 * Qué NO se degrada, y por qué se relanza:
 *   - los errores internos de Next (redirect, notFound, ruta dinámica): siguen
 *     su camino con `unstable_rethrow`, nunca son una falla;
 *   - un `ErrorEsperable` (sesión no válida, cuenta desactivada): es una
 *     decisión, no una caída; tragarlo dejaría pasar a quien no debe;
 *   - las lecturas imprescindibles (los permisos) no usan esto: si fallan, la
 *     pantalla cae en el boundary. Un valor por defecto ahí abriría el acceso.
 */
export async function lecturaDegradable<T>(
  etiqueta: string,
  leer: () => Promise<T>,
  porDefecto: T
): Promise<T> {
  try {
    return await leer();
  } catch (error) {
    unstable_rethrow(error);
    if (esErrorEsperable(error)) throw error;
    console.warn(`[${etiqueta}] la lectura falló; se usa el valor por defecto`);
    reportarFalla(error, { lectura: etiqueta });
    return porDefecto;
  }
}

/**
 * El `catch` de una lectura que ya devolvía un valor por defecto ante cualquier
 * error y que otras pantallas componen sin esperar un `MutationResult`
 * (SCRUM-516: los wins y la facturación por cliente, que leen la revisión
 * semanal y el tablero de Clientes).
 *
 * Antes esas lecturas hacían `catch { return [] }`: una caída de la base se
 * veía como "sin datos" y nadie se enteraba. Ahora la falla se registra como en
 * `lecturaDegradable` (consola y Sentry con el tag `lectura_degradada`) y la
 * pantalla sigue con `porDefecto`. Lo interno de Next se relanza. A diferencia
 * de `lecturaDegradable`, un `ErrorEsperable` (sin sesión, cuenta desactivada)
 * no se relanza: devuelve `porDefecto` sin registrarse, como antes, porque no es
 * una falla y estas lecturas nunca lanzaron.
 */
export function respaldoDeLectura<T>(etiqueta: string, error: unknown, porDefecto: T): T {
  unstable_rethrow(error);
  if (!esErrorEsperable(error)) {
    console.warn(`[${etiqueta}] la lectura falló; se usa el valor por defecto`);
    reportarFalla(error, { lectura: etiqueta });
  }
  return porDefecto;
}
