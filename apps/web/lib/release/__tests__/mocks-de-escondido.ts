import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

/**
 * Busca en los tests los mocks de `lib/release/escondido` que no parten del
 * objeto real (SCRUM-527, AR pasadas 1 y 2).
 *
 * Un mock que lista a mano sus banderas deja las nuevas en `undefined`, que el
 * código lee como "visible": así la tarjeta Landing corría en el test de
 * Marketing sin que nadie lo supiera.
 *
 * Qué reconoce como mock: cualquier llamada `vi.mock` o `vi.doMock` (con
 * espacios o saltos de línea entre las partes) cuyo primer argumento sea un
 * texto con comillas simples, dobles o backticks, o `import(texto)`, y que
 * resuelva al módulo, sea por el alias `@/` o por una ruta relativa al archivo
 * del test. Un primer argumento que no es un texto fijo (una variable, un
 * template con `${}`) no se puede resolver: cuenta como problema, para no
 * dejar pasar nada sin mirar.
 *
 * Qué exige del mock: una fábrica que reciba `importOriginal`, guarde
 * `await importOriginal(...)` en una variable y devuelva `...esaVariable.ESCONDIDO`.
 * Se mira el código sin comentarios ni contenido de textos: mencionar esas
 * palabras en un comentario no alcanza.
 */

export type ProblemaDeMock = { especificador: string; problema: string };

const LLAMADA = /\bvi\s*\.\s*(?:doMock|mock)\s*\(/g;
const MODULO = "lib/release/escondido";

/** El código con los comentarios y el contenido de los textos en blanco. */
export function soloCodigo(fuente: string): string {
  let salida = "";
  let i = 0;
  while (i < fuente.length) {
    const c = fuente[i];
    const sig = fuente[i + 1];
    if (c === "/" && sig === "/") {
      while (i < fuente.length && fuente[i] !== "\n") {
        salida += " ";
        i++;
      }
      continue;
    }
    if (c === "/" && sig === "*") {
      const fin = fuente.indexOf("*/", i + 2);
      const hasta = fin < 0 ? fuente.length : fin + 2;
      salida += fuente.slice(i, hasta).replace(/[^\n]/g, " ");
      i = hasta;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      salida += c;
      i++;
      while (i < fuente.length && fuente[i] !== c) {
        if (fuente[i] === "\\") {
          salida += "  ";
          i += 2;
        } else {
          salida += fuente[i] === "\n" ? "\n" : " ";
          i++;
        }
      }
      salida += c;
      i++;
      continue;
    }
    salida += c;
    i++;
  }
  return salida;
}

/** Índice del paréntesis que cierra al de `apertura`, sobre código limpio. */
function cierre(codigo: string, apertura: number): number {
  let nivel = 0;
  for (let i = apertura; i < codigo.length; i++) {
    if (codigo[i] === "(") nivel++;
    else if (codigo[i] === ")" && --nivel === 0) return i;
  }
  return codigo.length;
}

/** El texto del primer argumento si es fijo; `null` si no se puede leer. */
function primerArgumento(fuente: string, desde: number): string | null {
  const resto = fuente.slice(desde);
  const literal = /^\s*(?:import\s*\(\s*)?(['"`])((?:\\.|(?!\1).)*)\1/s.exec(resto);
  if (!literal) return null;
  if (literal[1] === "`" && literal[2].includes("${")) return null;
  return literal[2];
}

function apuntaAlModulo(especificador: string, archivo: string, raizWeb: string): boolean {
  let ruta: string;
  if (especificador.startsWith("@/")) ruta = join(raizWeb, especificador.slice(2));
  else if (especificador.startsWith(".")) ruta = resolve(dirname(archivo), especificador);
  else return false;
  const relativa = relative(raizWeb, ruta).replace(/\\/g, "/").replace(/\.(tsx?|jsx?|mjs|cjs)$/, "");
  return relativa === MODULO || relativa === `${MODULO}/index`;
}

/** Los mocks del módulo en una fuente, con su problema si no parten del real. */
export function analizarFuente(
  fuente: string,
  archivo: string,
  raizWeb: string,
): Array<ProblemaDeMock & { ok: boolean }> {
  const codigo = soloCodigo(fuente);
  const resultados: Array<ProblemaDeMock & { ok: boolean }> = [];
  for (const m of codigo.matchAll(LLAMADA)) {
    const apertura = (m.index ?? 0) + m[0].length - 1;
    const especificador = primerArgumento(fuente, apertura + 1);
    const fin = cierre(codigo, apertura);
    const llamada = codigo.slice(apertura, fin + 1);
    if (especificador === null) {
      // Sólo importa si podría ser este módulo: lo que no se puede leer y
      // menciona `escondido` en el texto original cuenta como problema.
      if (/escondido/.test(fuente.slice(apertura, fin + 1))) {
        resultados.push({ especificador: "(no es un texto fijo)", problema: "no se puede resolver", ok: false });
      }
      continue;
    }
    if (!apuntaAlModulo(especificador, archivo, raizWeb)) continue;
    const variable = /\bconst\s+(\w+)\s*=\s*await\s+importOriginal\b/.exec(llamada)?.[1];
    const recibe = /\(\s*importOriginal\b/.test(llamada) || /\bimportOriginal\s*\)\s*=>/.test(llamada);
    const extiende =
      variable !== undefined &&
      new RegExp(`\\.\\.\\.\\s*${variable}\\s*\\.\\s*ESCONDIDO\\b`).test(llamada);
    const ok = recibe && extiende;
    resultados.push({
      especificador,
      problema: ok ? "" : "la fábrica no parte de `...real.ESCONDIDO` con `importOriginal`",
      ok,
    });
  }
  return resultados;
}

/** Todos los archivos de test de `apps/web`, sin dependencias ni builds. */
export function archivosDeTest(raizWeb: string): string[] {
  const salida: string[] = [];
  const recorrer = (dir: string) => {
    for (const nombre of readdirSync(dir)) {
      if (["node_modules", ".next", "e2e", "dist"].includes(nombre)) continue;
      const ruta = join(dir, nombre);
      if (statSync(ruta).isDirectory()) recorrer(ruta);
      else if (/\.(test|spec)\.(tsx?|jsx?|mts|cts)$/.test(nombre)) salida.push(ruta);
    }
  };
  recorrer(raizWeb);
  return salida;
}

/** Recorre los tests del repo: cuántos mocks hay y cuáles tienen problema. */
export function revisarMocksDeEscondido(raizWeb: string): {
  mocks: string[];
  problemas: string[];
} {
  const mocks: string[] = [];
  const problemas: string[] = [];
  for (const archivo of archivosDeTest(raizWeb)) {
    const rel = relative(raizWeb, archivo);
    for (const r of analizarFuente(readFileSync(archivo, "utf8"), archivo, raizWeb)) {
      mocks.push(`${rel} (${r.especificador})`);
      if (!r.ok) problemas.push(`${rel} (${r.especificador}): ${r.problema}`);
    }
  }
  return { mocks, problemas };
}
