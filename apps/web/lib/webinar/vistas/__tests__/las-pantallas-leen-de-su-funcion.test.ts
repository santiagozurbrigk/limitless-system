/**
 * SCRUM-542: las pantallas leen sólo de sus funciones de lectura. Fuera de
 * `lib/webinar/vistas/` nadie importa el escenario de ejemplo, las filas ni el
 * cálculo: así el ejemplo no puede llegar a una pantalla sin pasar por el
 * chequeo de la organización de demo, y B4 cambia la lectura sin tocar las
 * pantallas. Se permite `leer` (las funciones), `contratos` y `dato` (tipos,
 * etiquetas y `tieneValor`).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..", "..", "..");
const PERMITIDOS = new Set(["leer", "contratos", "dato"]);
const IGNORADOS = new Set(["node_modules", ".next", "dist", ".turbo", "e2e", "coverage"]);

function archivos(dir: string, encontrados: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (IGNORADOS.has(nombre)) continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) archivos(ruta, encontrados);
    else if (/\.(ts|tsx)$/.test(nombre)) encontrados.push(ruta);
  }
  return encontrados;
}

describe("quién importa los contratos de vista", () => {
  const propios = join(RAIZ, "lib", "webinar", "vistas");
  const ajenos = archivos(RAIZ).filter((f) => !f.startsWith(propios));

  it("fuera del módulo, sólo leer, contratos y dato", () => {
    const malos: string[] = [];
    for (const archivo of ajenos) {
      const texto = readFileSync(archivo, "utf8");
      for (const m of texto.matchAll(/["']@\/lib\/webinar\/vistas\/([\w-]+)["']/g)) {
        if (!PERMITIDOS.has(m[1])) malos.push(`${relative(RAIZ, archivo)} → ${m[1]}`);
      }
    }
    expect(malos).toEqual([]);
  });

  it("el escenario sólo lo importa leer.ts (y sus tests)", () => {
    const enElModulo = archivos(propios).filter(
      (f) => !f.includes("__tests__") && /from "\.\/escenario-de-ejemplo"/.test(readFileSync(f, "utf8"))
    );
    expect(enElModulo.map((f) => relative(propios, f))).toEqual(["leer.ts"]);
  });

  it("leer.ts es sólo de servidor", () => {
    expect(readFileSync(join(propios, "leer.ts"), "utf8").startsWith('import "server-only";')).toBe(true);
  });
});
