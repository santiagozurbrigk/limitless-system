import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Recorrido de `app/` para el test de `module-for-path` (SCRUM-18). Vive aparte
 * para poder probarlo contra un árbol armado a mano, con casos que hoy no
 * existen en la app (interceptadas, `page.ts`, slots).
 */

/**
 * Lo que hace que un layout cuente como "con chequeo": llama al helper que
 * decide si la ruta se bloquea. Si alguien saca esa llamada, el layout deja de
 * contar y las pantallas que cuelgan de él quedan señaladas.
 */
export const LLAMADA_AL_CHEQUEO = "moduloBloqueadoParaRuta(";

/** Las extensiones que Next acepta por defecto (`next.config.ts` no define `pageExtensions`). */
const EXTENSIONES = ["tsx", "ts", "jsx", "js"];

export type Pantalla = {
  /** La URL, sin grupos ni slots. */
  ruta: string;
  /** El archivo de la página, relativo a la raíz recorrida. */
  archivo: string;
  /** Los layouts de los que cuelga, de la raíz hacia adentro. */
  layouts: string[];
};

function archivoEspecial(dir: string, nombre: "page" | "layout"): string | null {
  for (const ext of EXTENSIONES) {
    const ruta = join(dir, `${nombre}.${ext}`);
    if (existsSync(ruta)) return ruta;
  }
  return null;
}

/**
 * Los segmentos de URL después de entrar a la carpeta `nombre`, según el App
 * Router:
 *   - `(grupo)` y `@slot` no suman segmento;
 *   - una ruta interceptada suma el segmento que intercepta, resuelto desde
 *     donde apunta: `(.)x` en el mismo nivel, `(..)x` un nivel arriba,
 *     `(..)(..)x` dos niveles arriba, `(...)x` desde la raíz.
 */
export function segmentosAlEntrar(segmentos: string[], nombre: string): string[] {
  if (nombre.startsWith("@")) return segmentos;

  const interceptada = /^((?:\(\.\.\))+|\(\.\)|\(\.\.\.\))(.+)$/.exec(nombre);
  if (interceptada) {
    const marca = interceptada[1]!;
    const segmento = interceptada[2]!;
    if (marca === "(.)") return [...segmentos, segmento];
    if (marca === "(...)") return [segmento];
    const niveles = marca.length / "(..)".length;
    return [...segmentos.slice(0, Math.max(0, segmentos.length - niveles)), segmento];
  }

  if (nombre.startsWith("(") && nombre.endsWith(")")) return segmentos;
  return [...segmentos, nombre];
}

/**
 * Cada página bajo `raiz` con su URL y su cadena de layouts. Una carpeta
 * privada `_x` no es ruta y no se recorre.
 */
export function pantallas(
  raiz: string,
  dir = raiz,
  segmentos: string[] = [],
  layouts: string[] = []
): Pantalla[] {
  const layout = archivoEspecial(dir, "layout");
  const cadena = layout ? [...layouts, layout] : layouts;

  const pagina = archivoEspecial(dir, "page");
  const propias: Pantalla[] = pagina
    ? [
        {
          ruta: `/${segmentos.join("/")}`,
          archivo: relative(raiz, pagina),
          layouts: cadena,
        },
      ]
    : [];

  const hijas = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .flatMap((entry) =>
      pantallas(
        raiz,
        join(dir, entry.name),
        segmentosAlEntrar(segmentos, entry.name),
        cadena
      )
    );

  return [...propias, ...hijas];
}

export function layoutConChequeo(layout: string): boolean {
  return readFileSync(layout, "utf8").includes(LLAMADA_AL_CHEQUEO);
}

export function pasaPorElChequeo(pantalla: Pantalla): boolean {
  return pantalla.layouts.some(layoutConChequeo);
}
