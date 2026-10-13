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
 * El `.catch` de una lectura de una server action que otras pantallas componen
 * sin esperar un `MutationResult` y que nunca rechazó (SCRUM-516 y SCRUM-517:
 * las columnas, el seguimiento, los wins y la facturación por cliente):
 *
 *     lecturaDegradable("clientes:wins", leer, []).catch((error) =>
 *       valorSiNoEsFalla(error, [])
 *     );
 *
 * Es el mismo mecanismo que `lecturaDegradable`: la falla se registra ahí
 * (consola y Sentry con el tag `lectura_degradada`) y la pantalla sigue con el
 * valor por defecto. Acá sólo llega lo que `lecturaDegradable` relanza:
 *   - lo interno de Next (redirect, ruta dinámica) se relanza tal cual;
 *   - un `ErrorEsperable` (sin sesión, cuenta desactivada) devuelve
 *     `porDefecto` sin registrarse: no es una falla, y estas lecturas siempre
 *     devolvieron vacío en ese caso. No abre nada: el vacío no da acceso.
 *   - cualquier otra cosa se relanza: no se esconde una falla sin registrarla.
 *
 * El `.catch` va en el lugar, y no dentro de otro envoltorio, para que se vea
 * en cada lectura que no rechaza (y lo vea el conteo de
 * `[ACTIONS-ERRORES-EN-PRODUCCION]`). Antes cada lectura repetía
 * `try { lecturaDegradable } catch { return [] }` (SCRUM-517) o tenía su propio
 * registro (`respaldoDeLectura`, SCRUM-516).
 */
export function valorSiNoEsFalla<T>(error: unknown, porDefecto: T): T {
  if (esErrorEsperable(error)) return porDefecto;
  throw error;
}
