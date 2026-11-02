/**
 * ⭐ El bloqueo de rutas por experiencia, del lado del servidor (SCRUM-524).
 *
 * **Dónde se aplica y por qué ahí.** Cada carpeta de primer nivel de
 * `app/(platform)` tiene un `layout.tsx` que llama a
 * `exigirRutaDeLaExperiencia("/<segmento>")` antes de dibujar nada, como ya
 * hacía `lanzamientos/layout.tsx` con su bandera.
 *
 * El layout de `(platform)` no alcanza: en una navegación del cliente (un
 * `<Link>`, `router.push`) Next no lo vuelve a ejecutar, porque el segmento
 * `(platform)` no cambia. El layout del segmento de primer nivel sí se ejecuta
 * en el servidor cada vez que se entra a ese segmento desde otro, sea tipeando
 * la URL, con un link o con `router.push`, y también al entrar directo a una
 * ruta anidada (`/finance/expenses` pasa por `finance/layout.tsx`). Moverse
 * dentro de un segmento no lo vuelve a ejecutar, pero a un segmento bloqueado
 * no se llega. El test `rutas-por-experiencia-en-disco.test.ts` recorre
 * `app/(platform)` y falla si una pantalla cuelga de un segmento sin esta
 * llamada, o con la llamada de otro segmento.
 *
 * Se descartó el middleware: no puede usar `getOrganizationExperience()`
 * (corre fuera del render, sin `cookies()` de Next) y habría que copiar la
 * resolución del negocio activo de un holding, con el riesgo de que las dos
 * copias dejen de coincidir. Así, la barra y el bloqueo leen el mismo valor.
 *
 * La experiencia no es un límite de seguridad de los datos (eso lo hacen los
 * permisos y la RLS): decide qué producto se muestra. Si no se puede leer,
 * `getOrganizationExperience()` devuelve `full` y no se bloquea nada.
 */
import "server-only";
import { redirect } from "next/navigation";
import { getOrganizationExperience } from "@/lib/organization/experience";
import { getCurrentUserPermissions } from "@/lib/auth/get-current-permissions";
import { emptyPermissions } from "@/constants/permission-modules";
import {
  pantallaDeInicio,
  rutaPermitidaParaLaExperiencia,
  type PermisosDeLaBarra,
} from "@/lib/navigation/rutas-por-experiencia";

/** Para `full` los permisos no cambian la pantalla de inicio: no se leen. */
const SIN_PERMISOS: PermisosDeLaBarra = { isFounder: false, modules: emptyPermissions() };

/**
 * Redirige a la pantalla de inicio si la experiencia de la organización activa
 * no abre `segmento` (la ruta del layout que la llama, por ejemplo
 * `"/finance"`). Si la abre, no hace nada.
 */
export async function exigirRutaDeLaExperiencia(segmento: string): Promise<void> {
  const experiencia = await getOrganizationExperience();
  if (rutaPermitidaParaLaExperiencia(experiencia, segmento)) return;
  // Los permisos se leen sólo cuando hay que redirigir: eligen el destino.
  redirect(pantallaDeInicio(experiencia, await getCurrentUserPermissions()));
}

/**
 * La pantalla de inicio de quien entra, en la organización activa: el destino
 * por defecto después del login. `/dashboard` para `full` (sin leer permisos);
 * para `webinar` y `limitless`, lo que diga `pantallaDeInicio` con sus permisos.
 */
export async function pantallaDeInicioDeLaOrganizacionActiva(): Promise<string> {
  const experiencia = await getOrganizationExperience();
  if (experiencia === "full") return pantallaDeInicio("full", SIN_PERMISOS);
  return pantallaDeInicio(experiencia, await getCurrentUserPermissions());
}
