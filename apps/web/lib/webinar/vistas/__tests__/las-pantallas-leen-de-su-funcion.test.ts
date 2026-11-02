/**
 * SCRUM-542: las pantallas leen sólo de sus funciones de lectura. Fuera de
 * `lib/webinar/vistas/` sólo se importa `leer` (las funciones), `contratos` y
 * `dato` (tipos, etiquetas y `tieneValor`): así el ejemplo no puede llegar a
 * una pantalla sin pasar por el chequeo de la organización de demo, y B4
 * cambia la lectura sin tocar las pantallas.
 *
 * Qué ve: cada `import ... from`, `import "x"`, `export ... from`, `import()`
 * y `require()` de los `.ts/.tsx/.mts/.cts/.js/.jsx/.mjs/.cjs` de la app, con
 * comillas simples, dobles o un template sin `${}`, resuelto a una ruta (alias
 * `@/`, `baseUrl` o relativo a la carpeta del archivo, con o sin extensión).
 * Qué no ve: un especificador armado en ejecución (`import(variable)`, un
 * template con `${}`) ni un alias distinto de `@/`; adentro del módulo sólo
 * controla quién importa el escenario. El auto-test de abajo prueba cada forma.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..", "..", "..");
const PROPIOS = join(RAIZ, "lib", "webinar", "vistas");
const PERMITIDOS = new Set(["leer", "contratos", "dato"]);
const IGNORADOS = new Set(["node_modules", ".next", "dist", ".turbo", "e2e", "coverage"]);

function archivos(dir: string, encontrados: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (IGNORADOS.has(nombre)) continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) archivos(ruta, encontrados);
    else if (/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(nombre)) encontrados.push(ruta);
  }
  return encontrados;
}

/**
 * Los especificadores que un archivo importa: `import ... from`, `import "x"`,
 * `export ... from`, `import()` y `require()`, con comillas simples, dobles o
 * un template sin `${}`. Un import comentado también cuenta (falla de más,
 * nunca de menos).
 */
const FORMAS_DE_IMPORT = [
  /\bfrom\s*(["'])([^"'\n]+)\1/g,
  /\bimport\s*(["'])([^"'\n]+)\1/g,
  /\bimport\s*\(\s*(["'`])([^"'`$\n]+)\1/g,
  /\brequire\s*\(\s*(["'`])([^"'`$\n]+)\1/g,
];

function especificadores(texto: string): string[] {
  return FORMAS_DE_IMPORT.flatMap((forma) => [...texto.matchAll(forma)].map((m) => m[2]));
}

/**
 * Dónde cae un especificador, como lo resuelven TypeScript y Next: `@/` y lo
 * que no empieza con `.` (por el `baseUrl` de tsconfig) desde la raíz de la
 * app; lo relativo, desde la carpeta del archivo.
 */
function resolver(especificador: string, archivo: string): string {
  if (especificador.startsWith("@/")) return join(RAIZ, especificador.slice(2));
  if (especificador.startsWith(".")) return resolve(dirname(archivo), especificador);
  return resolve(RAIZ, especificador);
}

/**
 * Los archivos de `lib/webinar/vistas/` que importa un texto, sin extensión
 * (`escenario-de-ejemplo`, `__tests__/x`; la carpeta sola da `""`).
 */
function modulosDelPropioImportados(texto: string, archivo: string): string[] {
  const modulos: string[] = [];
  for (const especificador of especificadores(texto)) {
    const ruta = resolver(especificador, archivo);
    if (ruta !== PROPIOS && !ruta.startsWith(PROPIOS + sep)) continue;
    modulos.push(
      relative(PROPIOS, ruta)
        .split(sep)
        .join("/")
        .replace(/\.(d\.ts|ts|tsx|js|jsx|mjs|cjs|mts|cts)$/, "")
    );
  }
  return modulos;
}

function prohibidosFueraDelModulo(texto: string, archivo: string): string[] {
  return modulosDelPropioImportados(texto, archivo).filter((m) => !PERMITIDOS.has(m));
}

function importaElEscenario(texto: string, archivo: string): boolean {
  return modulosDelPropioImportados(texto, archivo).includes("escenario-de-ejemplo");
}

describe("el detector de imports (auto-test)", () => {
  const PAGINA = join(RAIZ, "app", "(platform)", "webinar", "inicio", "page.tsx");
  const HERMANO = join(RAIZ, "lib", "webinar", "otra", "x.ts");

  it.each([
    ["alias, comillas dobles", PAGINA, `import { escenarioDeEjemplo } from "@/lib/webinar/vistas/escenario-de-ejemplo";`],
    ["alias, comillas simples", PAGINA, `import { escenarioDeEjemplo } from '@/lib/webinar/vistas/escenario-de-ejemplo';`],
    ["alias con .ts", PAGINA, `import { escenarioDeEjemplo } from "@/lib/webinar/vistas/escenario-de-ejemplo.ts";`],
    ["alias con .js", PAGINA, `import { calcularInicio } from "@/lib/webinar/vistas/calcular.js";`],
    ["alias con segmentos de más", PAGINA, `import { calcularInicio } from "@/lib/webinar/../webinar/vistas/calcular";`],
    ["relativo", PAGINA, `import { escenarioDeEjemplo } from "../../../../lib/webinar/vistas/escenario-de-ejemplo";`],
    ["relativo con .ts y comillas simples", PAGINA, `import { escenarioDeEjemplo } from '../../../../lib/webinar/vistas/escenario-de-ejemplo.ts';`],
    ["relativo desde una carpeta hermana", HERMANO, `import { calcularInicio } from "../vistas/calcular";`],
    ["sin alias, por baseUrl", PAGINA, `import { calcularInicio } from "lib/webinar/vistas/calcular";`],
    ["import type", PAGINA, `import type { FilasDelWebinar } from "@/lib/webinar/vistas/filas.ts";`],
    ["en varias líneas", PAGINA, `import {\n  calcularInicio,\n} from\n  "../../../../lib/webinar/vistas/calcular";`],
    ["import sin nombres", PAGINA, `import "../../../../lib/webinar/vistas/calcular";`],
    ["export ... from", PAGINA, `export { escenarioDeEjemplo } from "../../../../lib/webinar/vistas/escenario-de-ejemplo";`],
    ["export * from", PAGINA, `export * from '@/lib/webinar/vistas/calcular.ts';`],
    ["import()", PAGINA, `const m = await import("../../../../lib/webinar/vistas/escenario-de-ejemplo");`],
    ["import() con template", PAGINA, "const m = await import(`@/lib/webinar/vistas/calcular`);"],
    ["require", PAGINA, `const m = require('@/lib/webinar/vistas/escenario-de-ejemplo.ts');`],
    ["un archivo de una subcarpeta", PAGINA, `import { x } from "@/lib/webinar/vistas/__tests__/ayuda";`],
  ])("detecta: %s", (_forma, archivo, texto) => {
    expect(prohibidosFueraDelModulo(texto, archivo)).not.toEqual([]);
  });

  it.each([
    ["leer con alias", PAGINA, `import { leerInicio } from "@/lib/webinar/vistas/leer";`],
    ["contratos relativo con .ts", PAGINA, `import type { VistaInicio } from '../../../../lib/webinar/vistas/contratos.ts';`],
    ["dato por baseUrl", PAGINA, `import { tieneValor } from "lib/webinar/vistas/dato";`],
    ["otra carpeta que empieza igual", PAGINA, `import { x } from "@/lib/webinar/vistas-viejas/calcular";`],
    ["otro módulo de webinar", PAGINA, `import { x } from "@/lib/webinar/calcular";`],
    ["un paquete", PAGINA, `import { useState } from "react";`],
  ])("deja pasar: %s", (_forma, archivo, texto) => {
    expect(prohibidosFueraDelModulo(texto, archivo)).toEqual([]);
  });

  const CONTRATOS = join(PROPIOS, "contratos.ts");
  it.each([
    ["comillas dobles", `import { escenarioDeEjemplo } from "./escenario-de-ejemplo";`],
    ["comillas simples", `import { escenarioDeEjemplo } from './escenario-de-ejemplo';`],
    ["con .ts", `import { escenarioDeEjemplo } from "./escenario-de-ejemplo.ts";`],
    ["reexportado", `export { escenarioDeEjemplo } from './escenario-de-ejemplo';`],
    ["import()", `const m = import("./escenario-de-ejemplo");`],
    ["con alias", `import { escenarioDeEjemplo } from "@/lib/webinar/vistas/escenario-de-ejemplo";`],
  ])("dentro del módulo, detecta el escenario: %s", (_forma, texto) => {
    expect(importaElEscenario(texto, CONTRATOS)).toBe(true);
  });
});

describe("quién importa los contratos de vista", () => {
  const ajenos = archivos(RAIZ).filter((f) => !f.startsWith(PROPIOS + sep));

  it("fuera del módulo, sólo leer, contratos y dato", () => {
    const malos: string[] = [];
    for (const archivo of ajenos) {
      for (const m of prohibidosFueraDelModulo(readFileSync(archivo, "utf8"), archivo)) {
        malos.push(`${relative(RAIZ, archivo)} → ${m}`);
      }
    }
    expect(malos).toEqual([]);
  });

  it("el escenario sólo lo importa leer.ts (y sus tests)", () => {
    const enElModulo = archivos(PROPIOS).filter(
      (f) => !f.includes("__tests__") && importaElEscenario(readFileSync(f, "utf8"), f)
    );
    expect(enElModulo.map((f) => relative(PROPIOS, f))).toEqual(["leer.ts"]);
  });

  // Lo que no tiene que llegar al navegador: la lectura, el escenario, el
  // cálculo, la org de demo y el estado de las demás orgs. `dato` y
  // `contratos` sí (etiquetas y `tieneValor`); `filas` es sólo de tipos.
  it.each(["leer.ts", "escenario-de-ejemplo.ts", "calcular.ts", "org-de-demo.ts", "sin-lectura-real.ts"])(
    "%s es sólo de servidor",
    (archivo) => {
      expect(readFileSync(join(PROPIOS, archivo), "utf8").startsWith('import "server-only";')).toBe(true);
    }
  );
});
