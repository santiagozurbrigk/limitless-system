import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import * as ts from "typescript";

/**
 * Busca en los tests los mocks de `lib/release/escondido` que no parten del
 * objeto real (SCRUM-527, AR pasadas 1 a 3).
 *
 * Un mock que lista a mano sus banderas deja las nuevas en `undefined`, que el
 * código lee como "visible": así la tarjeta Landing corría en el test de
 * Marketing sin que nadie lo supiera.
 *
 * Lee el AST de TypeScript (`ts.createSourceFile`), no el texto: los
 * comentarios, los textos y los regex literales no lo confunden.
 *
 * Qué cuenta como mock: una llamada a `mock` o `doMock` sobre `vi` o sobre
 * cualquier nombre que lo traiga de "vitest" (`import { vi as v }`,
 * `import * as V` y `V.vi`, `const v = vi`), con punto o con corchetes.
 *
 * Qué hace con el primer argumento:
 *   - un texto (comillas, o template sin expresiones) o `import(texto)`: lo
 *     resuelve por el alias `@/` o como ruta relativa al archivo, con o sin
 *     extensión o `/index`; si no llega a `lib/release/escondido`, lo ignora;
 *   - cualquier otra cosa (una variable, un template con `${}`): no se puede
 *     resolver y SIEMPRE cuenta como problema, sea cual sea el módulo.
 *
 * Qué exige de un mock de este módulo: una fábrica (función) cuyo primer
 * parámetro sea el `importOriginal`, que guarde `await importOriginal()` en una
 * variable (`real`), y que TODO objeto que devuelva tenga `ESCONDIDO` igual a
 * un objeto con `...real.ESCONDIDO`, o no tenga `ESCONDIDO` y haga `...real`.
 * No alcanza con nombrar `real.ESCONDIDO` en otro lado de la fábrica.
 */

export type ResultadoDeMock = { especificador: string; ok: boolean; problema: string };

const MODULO = "lib/release/escondido";

function sinEnvoltorios(nodo: ts.Expression): ts.Expression {
  let n = nodo;
  while (
    ts.isParenthesizedExpression(n) ||
    ts.isAsExpression(n) ||
    ts.isNonNullExpression(n) ||
    ts.isTypeAssertionExpression(n) ||
    ts.isSatisfiesExpression(n)
  ) {
    n = n.expression;
  }
  return n;
}

function textoFijo(nodo: ts.Expression): string | null {
  const n = sinEnvoltorios(nodo);
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0]) {
    return textoFijo(n.arguments[0]);
  }
  return null;
}

function apuntaAlModulo(especificador: string, archivo: string, raizWeb: string): boolean {
  let ruta: string;
  if (especificador.startsWith("@/")) ruta = join(raizWeb, especificador.slice(2));
  else if (especificador.startsWith(".")) ruta = resolve(dirname(archivo), especificador);
  else return false;
  const relativa = relative(raizWeb, ruta).replace(/\\/g, "/").replace(/\.(tsx?|jsx?|mjs|cjs)$/, "");
  return relativa === MODULO || relativa === `${MODULO}/index`;
}

/** Los nombres que valen `vi` de vitest en el archivo, y los namespaces de vitest. */
function nombresDeVi(archivo: ts.SourceFile): { vis: Set<string>; espacios: Set<string> } {
  const vis = new Set<string>(["vi"]);
  const espacios = new Set<string>();
  for (const sentencia of archivo.statements) {
    if (!ts.isImportDeclaration(sentencia) || !ts.isStringLiteral(sentencia.moduleSpecifier)) continue;
    if (sentencia.moduleSpecifier.text !== "vitest") continue;
    const enlaces = sentencia.importClause?.namedBindings;
    if (!enlaces) continue;
    if (ts.isNamespaceImport(enlaces)) espacios.add(enlaces.name.text);
    else {
      for (const e of enlaces.elements) {
        if ((e.propertyName ?? e.name).text === "vi") vis.add(e.name.text);
      }
    }
  }
  // `const v = vi` (también encadenado): punto fijo sobre las declaraciones.
  let cambio = true;
  while (cambio) {
    cambio = false;
    const visitar = (nodo: ts.Node) => {
      if (
        ts.isVariableDeclaration(nodo) &&
        ts.isIdentifier(nodo.name) &&
        nodo.initializer &&
        !vis.has(nodo.name.text) &&
        esVi(nodo.initializer, vis, espacios)
      ) {
        vis.add(nodo.name.text);
        cambio = true;
      }
      ts.forEachChild(nodo, visitar);
    };
    visitar(archivo);
  }
  return { vis, espacios };
}

function esVi(nodo: ts.Expression, vis: Set<string>, espacios: Set<string>): boolean {
  const n = sinEnvoltorios(nodo);
  if (ts.isIdentifier(n)) return vis.has(n.text);
  if (ts.isPropertyAccessExpression(n)) {
    return ts.isIdentifier(n.expression) && espacios.has(n.expression.text) && n.name.text === "vi";
  }
  return false;
}

/** `vi.mock(...)` o `vi.doMock(...)` (o `vi["mock"](...)`), sobre cualquier alias de vi. */
function esLlamadaDeMock(llamada: ts.CallExpression, vis: Set<string>, espacios: Set<string>): boolean {
  const callee = sinEnvoltorios(llamada.expression);
  let objeto: ts.Expression;
  let metodo: string | null = null;
  if (ts.isPropertyAccessExpression(callee)) {
    objeto = callee.expression;
    metodo = callee.name.text;
  } else if (ts.isElementAccessExpression(callee)) {
    objeto = callee.expression;
    const arg = sinEnvoltorios(callee.argumentExpression);
    if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) metodo = arg.text;
  } else {
    return false;
  }
  return (metodo === "mock" || metodo === "doMock") && esVi(objeto, vis, espacios);
}

/** Las expresiones que devuelve la función (sin entrar en funciones anidadas). */
function devueltos(fn: ts.ArrowFunction | ts.FunctionExpression): ts.Expression[] {
  if (!ts.isBlock(fn.body)) return [fn.body];
  const salida: ts.Expression[] = [];
  const visitar = (nodo: ts.Node) => {
    if (ts.isFunctionLike(nodo)) return;
    if (ts.isReturnStatement(nodo) && nodo.expression) salida.push(nodo.expression);
    ts.forEachChild(nodo, visitar);
  };
  ts.forEachChild(fn.body, visitar);
  return salida;
}

function nombreDeIdentificador(nodo: ts.Expression): string | null {
  const n = sinEnvoltorios(nodo);
  return ts.isIdentifier(n) ? n.text : null;
}

function revisarFabrica(fabrica: ts.Expression | undefined): string {
  if (!fabrica) return "sin fábrica: no parte del objeto real";
  const fn = sinEnvoltorios(fabrica);
  if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) {
    return "la fábrica no es una función que se pueda leer";
  }
  const parametro = fn.parameters[0]?.name;
  if (!parametro || !ts.isIdentifier(parametro)) return "la fábrica no recibe importOriginal";
  const importOriginal = parametro.text;

  // Las variables que guardan `await importOriginal(...)`.
  const originales = new Set<string>();
  const buscar = (nodo: ts.Node) => {
    if (ts.isVariableDeclaration(nodo) && ts.isIdentifier(nodo.name) && nodo.initializer) {
      const ini = sinEnvoltorios(nodo.initializer);
      if (ts.isAwaitExpression(ini)) {
        const llamada = sinEnvoltorios(ini.expression);
        if (ts.isCallExpression(llamada) && nombreDeIdentificador(llamada.expression) === importOriginal) {
          originales.add(nodo.name.text);
        }
      }
    }
    ts.forEachChild(nodo, buscar);
  };
  buscar(fn.body);
  if (originales.size === 0) return "la fábrica no guarda await importOriginal() en una variable";

  const esSpreadDe = (p: ts.ObjectLiteralElementLike, propiedad: string | null) => {
    if (!ts.isSpreadAssignment(p)) return false;
    const e = sinEnvoltorios(p.expression);
    if (propiedad === null) {
      const nombre = nombreDeIdentificador(e);
      return nombre !== null && originales.has(nombre);
    }
    if (!ts.isPropertyAccessExpression(e) || e.name.text !== propiedad) return false;
    const nombre = nombreDeIdentificador(e.expression);
    return nombre !== null && originales.has(nombre);
  };

  const retornos = devueltos(fn);
  if (retornos.length === 0) return "la fábrica no devuelve nada que se pueda leer";
  for (const r of retornos) {
    const objeto = sinEnvoltorios(r);
    if (!ts.isObjectLiteralExpression(objeto)) return "la fábrica devuelve algo que no es un objeto literal";
    const escondido = objeto.properties.find(
      (p) => p.name !== undefined && ts.isIdentifier(p.name) && p.name.text === "ESCONDIDO",
    );
    if (!escondido) {
      if (!objeto.properties.some((p) => esSpreadDe(p, null))) {
        return "el objeto devuelto no tiene ESCONDIDO ni parte del módulo real";
      }
      continue;
    }
    if (!ts.isPropertyAssignment(escondido)) return "ESCONDIDO no es un objeto literal";
    const valor = sinEnvoltorios(escondido.initializer);
    if (!ts.isObjectLiteralExpression(valor) || !valor.properties.some((p) => esSpreadDe(p, "ESCONDIDO"))) {
      return "el ESCONDIDO devuelto no parte de ...real.ESCONDIDO";
    }
  }
  return "";
}

/** Las llamadas a vi.mock/vi.doMock de una fuente que tocan el módulo, o que no se pueden resolver. */
export function analizarFuente(fuente: string, archivo: string, raizWeb: string): ResultadoDeMock[] {
  const tipo = archivo.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(archivo, fuente, ts.ScriptTarget.Latest, true, tipo);
  const { vis, espacios } = nombresDeVi(sf);
  const resultados: ResultadoDeMock[] = [];
  const visitar = (nodo: ts.Node) => {
    if (ts.isCallExpression(nodo) && esLlamadaDeMock(nodo, vis, espacios)) {
      const primero = nodo.arguments[0];
      const especificador = primero ? textoFijo(primero) : null;
      if (especificador === null) {
        resultados.push({
          especificador: primero ? `(no es un texto fijo: ${primero.getText(sf)})` : "(sin argumento)",
          ok: false,
          problema: "no se puede resolver a qué módulo apunta",
        });
      } else if (apuntaAlModulo(especificador, archivo, raizWeb)) {
        const problema = revisarFabrica(nodo.arguments[1]);
        resultados.push({ especificador, ok: problema === "", problema });
      }
    }
    ts.forEachChild(nodo, visitar);
  };
  visitar(sf);
  return resultados;
}

/**
 * Los archivos de test de `apps/web`: todo `.ts` o `.tsx` dentro de una carpeta
 * `__tests__` o que termine en `.test` o `.spec` (los helpers de `__tests__`
 * también pueden llamar a vi.mock y Vitest los aplica).
 */
export function archivosDeTest(raizWeb: string): string[] {
  const salida: string[] = [];
  const recorrer = (dir: string, enTests: boolean) => {
    for (const nombre of readdirSync(dir)) {
      if (["node_modules", ".next", "e2e", "dist"].includes(nombre)) continue;
      const ruta = join(dir, nombre);
      if (statSync(ruta).isDirectory()) recorrer(ruta, enTests || nombre === "__tests__");
      else if (/\.(tsx?|mts|cts)$/.test(nombre) && !nombre.endsWith(".d.ts")) {
        if (enTests || /\.(test|spec)\.(tsx?|mts|cts)$/.test(nombre)) salida.push(ruta);
      }
    }
  };
  recorrer(raizWeb, false);
  return salida;
}

/** Recorre los tests del repo: qué mocks del módulo hay y cuáles tienen problema. */
export function revisarMocksDeEscondido(raizWeb: string): {
  archivos: string[];
  mocks: string[];
  problemas: string[];
} {
  const archivos = archivosDeTest(raizWeb);
  const mocks: string[] = [];
  const problemas: string[] = [];
  for (const archivo of archivos) {
    const rel = relative(raizWeb, archivo).replace(/\\/g, "/");
    for (const r of analizarFuente(readFileSync(archivo, "utf8"), archivo, raizWeb)) {
      mocks.push(rel);
      if (!r.ok) problemas.push(`${rel} (${r.especificador}): ${r.problema}`);
    }
  }
  return { archivos: archivos.map((a) => relative(raizWeb, a).replace(/\\/g, "/")), mocks, problemas };
}
