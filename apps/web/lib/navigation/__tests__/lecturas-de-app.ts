import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";

/**
 * Recorrido de `app/` para el test de lecturas por módulo (SCRUM-540). Vive
 * aparte, como `pantallas-de-app.ts`, para probarlo contra archivos armados a
 * mano.
 *
 * Mira dos cosas, siempre leyendo el código con el parser de TypeScript (no
 * con texto suelto, para que un comentario o un string no cuenten):
 *
 *   1. Que una página o un layout llame al guardia antes de cualquier lectura:
 *      las dos primeras sentencias de la función son
 *      `const x = await exigirModuloDeLaPagina("<módulo>")` y `if (x) return x;`.
 *   2. Qué Server Actions de lectura alcanza cada pantalla, siguiendo los
 *      `import` desde la página o el layout, y si arrancan con
 *      `rechazoPorModulo("<módulo>")`.
 */

export const LLAMADA_AL_GUARDIA = "exigirModuloDeLaPagina";
export const LLAMADA_DE_LA_ACTION = "rechazoPorModulo";

/**
 * Lo que puede ir antes del guardia en un layout: la redirección por
 * experiencia de SCRUM-524 (`exigirRutaDeLaExperiencia`), que tiene que correr
 * primero para que una ruta fuera de la experiencia redirija en vez de mostrar
 * «No tenés acceso». No lee datos de la pantalla.
 */
const PERMITIDO_ANTES_DEL_GUARDIA = new Set(["exigirRutaDeLaExperiencia"]);

/**
 * Los imports con los que un layout sigue siendo "sin lecturas": navegación,
 * banderas de release, rutas y los propios guardias. Un layout que importa
 * cualquier otra cosa (un provider, una query, un componente que lee) o que es
 * de cliente tiene que llamar al guardia.
 */
const IMPORTS_SIN_LECTURAS = new Set([
  "react",
  "next/navigation",
  "@/lib/release/escondido",
  "@/routes",
  "@/routes/paths",
  "@/lib/auth/acceso-a-modulo",
  "@/lib/organization/ruta-de-la-experiencia",
]);

/**
 * Qué cuenta como Server Action de lectura: un export de un archivo
 * `"use server"` cuyo nombre empieza con un verbo de lectura. Las mutaciones
 * (`create`, `update`, `delete`...) quedan afuera: las cubre el permiso de su
 * pantalla y no devuelven listados.
 */
export const NOMBRE_DE_LECTURA =
  /^(get|list|fetch|load|read|leer|obtener|search|buscar|count|preview)/i;

const EXTENSIONES = [".tsx", ".ts", ".jsx", ".js"];

function parsear(archivo: string, texto: string): ts.SourceFile {
  return ts.createSourceFile(archivo, texto, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function directiva(sf: ts.SourceFile): "cliente" | "servidor" | null {
  for (const st of sf.statements) {
    if (!ts.isExpressionStatement(st) || !ts.isStringLiteral(st.expression)) break;
    if (st.expression.text === "use client") return "cliente";
    if (st.expression.text === "use server") return "servidor";
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* 1. El guardia en páginas y layouts                                  */
/* ------------------------------------------------------------------ */

export type Guardia =
  | { estado: "ok"; modulo: string }
  | { estado: "falta"; motivo: string };

function funcionPorDefecto(sf: ts.SourceFile): ts.FunctionLikeDeclaration | null {
  const porNombre = new Map<string, ts.FunctionLikeDeclaration>();
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st)) {
      const mods = ts.getModifiers(st) ?? [];
      const exportada = mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      const porDefecto = mods.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
      if (exportada && porDefecto) return st;
      if (st.name) porNombre.set(st.name.text, st);
    }
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (
          ts.isIdentifier(d.name) &&
          d.initializer &&
          (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))
        ) {
          porNombre.set(d.name.text, d.initializer);
        }
      }
    }
  }
  for (const st of sf.statements) {
    if (ts.isExportAssignment(st) && !st.isExportEquals) {
      const e = st.expression;
      if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) return e;
      if (ts.isIdentifier(e)) return porNombre.get(e.text) ?? null;
    }
  }
  return null;
}

function llamadaAwaited(expr: ts.Expression | undefined, nombre: string): ts.CallExpression | null {
  if (!expr || !ts.isAwaitExpression(expr)) return null;
  const call = expr.expression;
  if (!ts.isCallExpression(call)) return null;
  if (!ts.isIdentifier(call.expression) || call.expression.text !== nombre) return null;
  return call;
}

/** `const x = await <nombre>("lit")` seguido de `if (x) return x;`: el literal, o null. */
function patronDeCorte(
  sentencias: readonly ts.Statement[],
  i: number,
  nombre: string
): string | null {
  const decl = sentencias[i];
  const corte = sentencias[i + 1];
  if (!decl || !ts.isVariableStatement(decl)) return null;
  if (!(decl.declarationList.flags & ts.NodeFlags.Const)) return null;
  const [d] = decl.declarationList.declarations;
  if (decl.declarationList.declarations.length !== 1 || !d || !ts.isIdentifier(d.name)) return null;
  const call = llamadaAwaited(d.initializer, nombre);
  const arg = call?.arguments[0];
  if (!call || call.arguments.length !== 1 || !arg || !ts.isStringLiteral(arg)) return null;

  if (!corte || !ts.isIfStatement(corte) || corte.elseStatement) return null;
  if (!ts.isIdentifier(corte.expression) || corte.expression.text !== d.name.text) return null;
  const entonces = ts.isBlock(corte.thenStatement)
    ? corte.thenStatement.statements.length === 1
      ? corte.thenStatement.statements[0]
      : undefined
    : corte.thenStatement;
  if (
    !entonces ||
    !ts.isReturnStatement(entonces) ||
    !entonces.expression ||
    !ts.isIdentifier(entonces.expression) ||
    entonces.expression.text !== d.name.text
  ) {
    return null;
  }
  return arg.text;
}

function esPermitidoAntes(st: ts.Statement): boolean {
  if (!ts.isExpressionStatement(st)) return false;
  const e = st.expression;
  if (!ts.isAwaitExpression(e) || !ts.isCallExpression(e.expression)) return false;
  const callee = e.expression.expression;
  return ts.isIdentifier(callee) && PERMITIDO_ANTES_DEL_GUARDIA.has(callee.text);
}

/** Si la página o el layout corta con el guardia antes de leer, y con qué módulo. */
export function guardiaDe(archivo: string, texto = readFileSync(archivo, "utf8")): Guardia {
  const sf = parsear(archivo, texto);
  if (directiva(sf) === "cliente") {
    return { estado: "falta", motivo: "es un componente de cliente: no puede llamar al guardia" };
  }
  const fn = funcionPorDefecto(sf);
  if (!fn || !fn.body || !ts.isBlock(fn.body)) {
    return { estado: "falta", motivo: "sin una función exportada por defecto con cuerpo" };
  }
  const sentencias = fn.body.statements;
  let i = 0;
  while (i < sentencias.length && esPermitidoAntes(sentencias[i]!)) i += 1;
  const modulo = patronDeCorte(sentencias, i, LLAMADA_AL_GUARDIA);
  if (modulo === null) {
    return {
      estado: "falta",
      motivo: `no arranca con \`const x = await ${LLAMADA_AL_GUARDIA}("<módulo>"); if (x) return x;\``,
    };
  }
  return { estado: "ok", modulo };
}

/** Un layout lee si es de cliente o importa algo que no está en `IMPORTS_SIN_LECTURAS`. */
export function layoutLee(archivo: string, texto = readFileSync(archivo, "utf8")): boolean {
  const sf = parsear(archivo, texto);
  if (directiva(sf) === "cliente") return true;
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    if (st.importClause?.isTypeOnly) continue;
    if (!IMPORTS_SIN_LECTURAS.has(st.moduleSpecifier.text)) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* 2. Las Server Actions de lectura que alcanza cada pantalla           */
/* ------------------------------------------------------------------ */

type Importado = { archivo: string; nombres: string[] | "*" };
type InfoDeArchivo = { directiva: "cliente" | "servidor" | null; imports: Importado[]; sf: ts.SourceFile };

export class GrafoDeImports {
  private cache = new Map<string, InfoDeArchivo>();

  constructor(private readonly raizWeb: string) {}

  resolver(desde: string, spec: string): string | null {
    let base: string;
    if (spec.startsWith("@/")) base = join(this.raizWeb, spec.slice(2));
    else if (spec.startsWith(".")) base = resolve(dirname(desde), spec);
    else return null;
    if (existsSync(base) && statSync(base).isFile()) return base;
    for (const e of EXTENSIONES) if (existsSync(base + e)) return base + e;
    for (const e of EXTENSIONES) {
      const indice = join(base, `index${e}`);
      if (existsSync(indice)) return indice;
    }
    return null;
  }

  info(archivo: string): InfoDeArchivo {
    const guardado = this.cache.get(archivo);
    if (guardado) return guardado;
    const sf = parsear(archivo, readFileSync(archivo, "utf8"));
    const imports: Importado[] = [];
    const agregar = (spec: string, nombres: string[] | "*") => {
      const r = this.resolver(archivo, spec);
      if (r) imports.push({ archivo: r, nombres });
    };
    const visitar = (nodo: ts.Node) => {
      if (ts.isImportDeclaration(nodo) && ts.isStringLiteral(nodo.moduleSpecifier)) {
        const c = nodo.importClause;
        if (!c) agregar(nodo.moduleSpecifier.text, []);
        else if (!c.isTypeOnly) {
          const nombres: string[] = [];
          let todo = false;
          if (c.name) nombres.push("default");
          if (c.namedBindings && ts.isNamespaceImport(c.namedBindings)) todo = true;
          if (c.namedBindings && ts.isNamedImports(c.namedBindings)) {
            for (const el of c.namedBindings.elements) {
              if (el.isTypeOnly) continue;
              nombres.push((el.propertyName ?? el.name).text);
            }
          }
          if (todo || nombres.length > 0 || !c.namedBindings) agregar(nodo.moduleSpecifier.text, todo ? "*" : nombres);
        }
      } else if (
        ts.isExportDeclaration(nodo) &&
        !nodo.isTypeOnly &&
        nodo.moduleSpecifier &&
        ts.isStringLiteral(nodo.moduleSpecifier)
      ) {
        const nombres =
          nodo.exportClause && ts.isNamedExports(nodo.exportClause)
            ? nodo.exportClause.elements.filter((el) => !el.isTypeOnly).map((el) => (el.propertyName ?? el.name).text)
            : "*";
        agregar(nodo.moduleSpecifier.text, nombres);
      } else if (
        ts.isCallExpression(nodo) &&
        nodo.expression.kind === ts.SyntaxKind.ImportKeyword &&
        nodo.arguments[0] &&
        ts.isStringLiteral(nodo.arguments[0])
      ) {
        agregar(nodo.arguments[0].text, "*");
      }
      ts.forEachChild(nodo, visitar);
    };
    visitar(sf);
    const info = { directiva: directiva(sf), imports, sf };
    this.cache.set(archivo, info);
    return info;
  }

  /** Los exports `async function` (o `const x = async`) de un archivo `"use server"`. */
  exportsDeAcciones(archivo: string): string[] {
    const { sf } = this.info(archivo);
    const nombres: string[] = [];
    for (const st of sf.statements) {
      const exportada = (ts.getModifiers(st as ts.HasModifiers) ?? []).some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword
      );
      if (!exportada) continue;
      if (ts.isFunctionDeclaration(st) && st.name) nombres.push(st.name.text);
      if (ts.isVariableStatement(st)) {
        for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) nombres.push(d.name.text);
      }
    }
    return nombres;
  }

  /**
   * Las acciones (`archivo#nombre`, relativo a la raíz web) que alcanza
   * `entrada` siguiendo imports. El recorrido no entra a los archivos
   * `"use server"`: se queda con lo que se importa de ellos.
   */
  accionesDesde(entrada: string): Set<string> {
    const acciones = new Set<string>();
    const vistos = new Set<string>();
    const cola = [entrada];
    while (cola.length > 0) {
      const archivo = cola.pop()!;
      if (vistos.has(archivo)) continue;
      vistos.add(archivo);
      const info = this.info(archivo);
      if (info.directiva === "servidor" && archivo !== entrada) continue;
      for (const imp of info.imports) {
        if (this.info(imp.archivo).directiva === "servidor") {
          const nombres = imp.nombres === "*" ? this.exportsDeAcciones(imp.archivo) : imp.nombres;
          for (const n of nombres) acciones.add(`${relative(this.raizWeb, imp.archivo)}#${n}`);
        } else {
          cola.push(imp.archivo);
        }
      }
    }
    return acciones;
  }

  /**
   * El módulo con el que arranca la action (`const r = await
   * rechazoPorModulo("<módulo>"); if (r) return r;` sin ningún `await`
   * antes), o null si no lo chequea así.
   */
  chequeoDeLaAccion(accion: string): string | null {
    const [rel, nombre] = accion.split("#") as [string, string];
    const { sf } = this.info(join(this.raizWeb, rel));
    let cuerpo: ts.Block | null = null;
    for (const st of sf.statements) {
      if (ts.isFunctionDeclaration(st) && st.name?.text === nombre && st.body) cuerpo = st.body;
      if (ts.isVariableStatement(st)) {
        for (const d of st.declarationList.declarations) {
          if (
            ts.isIdentifier(d.name) &&
            d.name.text === nombre &&
            d.initializer &&
            (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer)) &&
            ts.isBlock(d.initializer.body)
          ) {
            cuerpo = d.initializer.body;
          }
        }
      }
    }
    if (!cuerpo) return null;
    const sentencias = cuerpo.statements;
    for (let i = 0; i < sentencias.length; i += 1) {
      const modulo = patronDeCorte(sentencias, i, LLAMADA_DE_LA_ACTION);
      if (modulo !== null) return modulo;
      if (tieneAwait(sentencias[i]!)) return null;
    }
    return null;
  }
}

function tieneAwait(nodo: ts.Node): boolean {
  if (ts.isAwaitExpression(nodo)) return true;
  return ts.forEachChild(nodo, tieneAwait) ?? false;
}

/** Las entradas de `app/`: todo `page`, `layout` y `route`, en cualquier grupo. */
export function entradasDeApp(appDir: string, dir = appDir, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      entradasDeApp(appDir, ruta, out);
    } else if (/^(page|layout|route|template|default|error|loading|not-found|global-error)\.(tsx|ts|jsx|js)$/.test(e.name)) {
      out.push(ruta);
    }
  }
  return out;
}
