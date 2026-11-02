import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * SCRUM-523 · el inventario de las altas de organizaciones.
 *
 * El default de `organizations.experience` es `full` (AR pasada 1, MAYOR-2):
 * cada alta manda su experiencia explícita (`webinar`, o la del holding en un
 * negocio creado dentro de un holding). Un alta que nadie revisó nace `full`,
 * el lado seguro.
 *
 * Desde la AR pasada 2 el test lee el código con el AST de TypeScript, no con
 * expresiones regulares: los comentarios y el contenido de los strings no
 * cuentan, y las llamadas se reconocen por su forma. Recorre los `.ts`, `.tsx`,
 * `.mts`, `.cts`, `.js`, `.jsx`, `.mjs` y `.cjs` de `apps/` y `packages/`
 * (salvo `node_modules`, `.next`, `dist`, `.turbo`, `__tests__` y los
 * `*.test.*`).
 *
 * Una "llamada a from" es `x.from(t)`, `x?.from(t)`, `x["from"](t)`, con o sin
 * genéricos (`x.from<"organizations">(t)`), y `x.from.call(y, t)` o
 * `x.from.apply(y, [t])`, salvo cuando `x` es `Array`, `Buffer` o un arreglo
 * tipado (`Array.from`, `Buffer.from`). La tabla `t` se resuelve si es un
 * literal de texto, un template sin `${}`, una suma de esos, un arreglo
 * literal de esos (vale cada elemento), o una constante `const X = "..."`
 * declarada en el mismo archivo (en cualquier ámbito: si el nombre tiene
 * varios valores, cuenta cada uno) o importada por nombre (`import { X }` o
 * `import { Y as X }`) de un archivo recorrido, con ruta relativa o `@/`. Lo
 * demás es una tabla dinámica.
 *
 * Falla si:
 *   1. una llamada a from con la tabla `organizations` no sigue directo con
 *      `.select`, `.update`, `.delete`, `.insert` o `.upsert` (por ejemplo,
 *      guardada en una variable);
 *   2. los insert o upsert sobre `organizations` no son exactamente los seis
 *      del inventario, o alguno no tiene en su argumento (un objeto literal, o
 *      un arreglo de objetos literales) la propiedad `experience` con un valor
 *      que no sea `undefined`, `null` ni `void`;
 *   3. una llamada a from con tabla dinámica sigue con `.insert`/`.upsert`, o
 *      no sigue con ningún método en un archivo que hace algún `insert`/
 *      `upsert`, o está en un archivo que hace algún `insert`/`upsert` y tiene
 *      un string que contiene `organizations`; salvo que esté en
 *      `DESTINOS_DINAMICOS_REVISADOS`;
 *   4. se usa `from` como referencia: `x.from.bind(...)`, o guardado en una
 *      variable (`const f = x.from`, `const { from: f } = x`) que en el mismo
 *      archivo se llama (`f(...)`, `f.call`, `f.apply`, `f.bind`), salvo en
 *      `Array`/`Buffer`;
 *   5. algún string o template contiene `rest/v1/organizations`;
 *   6. en un archivo que hace algún `insert`/`upsert` (los mismos de la regla
 *      3), una llamada que no es a from recibe un argumento cuyo texto se
 *      resuelve a `organizations` (un helper `insertar(admin, "organizations",
 *      fila)`, `Reflect.apply(admin.from, admin, ["organizations"])`). En un
 *      archivo que sólo lee no cuenta: un conteo o un log con el nombre de la
 *      tabla es legítimo.
 *
 * Lo que sigue sin verse:
 *   - un acceso con clave calculada (`admin[clave](t)`, `Reflect.apply`)
 *     cuando la tabla tampoco se resuelve o el archivo no escribe (con
 *     `"organizations"` resuelto en un archivo que escribe lo agarra la regla
 *     6);
 *   - una tabla `organizations` pasada a un helper desde un archivo que no
 *     escribe, cuando el helper vive en otro archivo y hace el insert con la
 *     tabla que recibe (la regla 3 marca ese helper sólo si encadena el insert
 *     al from o deja el builder suelto en un archivo que escribe);
 *   - una variable local llamada `Array`, `Buffer` o como un arreglo tipado:
 *     se toma como el global;
 *   - una constante que llega por `import * as`, un re-export o un paquete
 *     (`@ai-coo/...`): queda como tabla dinámica;
 *   - una tabla armada en tiempo de ejecución (`["organiz", "ations"].join("")`)
 *     o guardada en una propiedad de un objeto (`{ table: "organizations" }`) y
 *     usada en un archivo que no escribe;
 *   - un from con tabla dinámica en un archivo de sólo lectura que devuelve el
 *     builder para que otro archivo haga el insert;
 *   - `from` guardado en una variable que se pasa a otra función sin llamarlo;
 *   - una URL de PostgREST armada por partes;
 *   - el código fuera de `apps/` y `packages/` o con otra extensión;
 *   - cualquier SQL: las funciones, triggers y reglas los mira
 *     `supabase/ci/tests/97_experiencia_de_la_organizacion.sql`, y el SQL
 *     dinámico no lo ve nadie.
 * Un alta que se escape nace `full`.
 */

const WEB = join(__dirname, "..", "..", "..");
const RAIZ = join(WEB, "..", "..");

const ALTAS_CONOCIDAS: Record<string, number> = {
  // createFounderAccountAction, createOrganizationFromHoldingAction y
  // createHoldingOrgAction: webinar (app/super-admin/__tests__).
  "apps/web/app/super-admin/actions.ts": 3,
  // addBusinessToMyHoldingAction: hereda la del holding.
  "apps/web/app/(platform)/holding/actions.ts": 1,
  // completeHoldingOnboardingAction: hereda la del holding.
  "apps/web/app/(platform)/onboarding/holding/actions.ts": 1,
  // ensureUserBootstrap: webinar.
  "apps/web/lib/auth/bootstrap.ts": 1,
};

/**
 * Llamadas a from con tabla dinámica revisadas a mano: ninguna puede recibir
 * `organizations` como tabla. Clave: `archivo: from(texto del argumento)`.
 */
const DESTINOS_DINAMICOS_REVISADOS: Record<string, string> = {
  "apps/web/lib/onboarding/resolve.ts: from(table)":
    "cuenta filas de tablas de datos de la org para el checklist; sólo select con count",
  "apps/web/app/super-admin/delete-actions.ts: from(tabla)":
    "baja de una organización: borra filas de las tablas hijas por organization_id; sólo delete",
};

const EXTENSIONES: Record<string, ts.ScriptKind> = {
  ".ts": ts.ScriptKind.TS,
  ".mts": ts.ScriptKind.TS,
  ".cts": ts.ScriptKind.TS,
  ".tsx": ts.ScriptKind.TSX,
  ".js": ts.ScriptKind.JS,
  ".mjs": ts.ScriptKind.JS,
  ".cjs": ts.ScriptKind.JS,
  ".jsx": ts.ScriptKind.JSX,
};
const IGNORAR_CARPETAS = new Set(["node_modules", ".next", "dist", ".turbo", "__tests__"]);
const RECEPTORES_QUE_NO_SON_TABLAS = new Set([
  "Array", "Buffer", "Uint8Array", "Uint8ClampedArray", "Int8Array", "Uint16Array", "Int16Array",
  "Uint32Array", "Int32Array", "Float32Array", "Float64Array", "BigInt64Array", "BigUint64Array",
]);
const METODOS_DE_ORGANIZATIONS = new Set(["select", "update", "delete", "insert", "upsert"]);

function archivos(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return IGNORAR_CARPETAS.has(e.name) ? [] : archivos(ruta);
    return extname(e.name) in EXTENSIONES && !/\.test\./.test(e.name) ? [ruta] : [];
  });
}

/** Las carpetas que recorre: `apps/web` y todas las demás de `apps/` y `packages/`. */
function carpetasRecorridas(): string[] {
  const hijas = (padre: string) =>
    existsSync(padre)
      ? readdirSync(padre, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => join(padre, e.name))
      : [];
  return [WEB, ...hijas(join(RAIZ, "apps")).filter((d) => d !== WEB), ...hijas(join(RAIZ, "packages"))];
}

/** Saca paréntesis, `as`, `satisfies`, `!` y aserciones de tipo. */
function sinEnvoltorios(n: ts.Node): ts.Node {
  let x = n;
  while (
    ts.isParenthesizedExpression(x) ||
    ts.isAsExpression(x) ||
    ts.isSatisfiesExpression(x) ||
    ts.isNonNullExpression(x) ||
    ts.isTypeAssertionExpression(x)
  ) {
    x = x.expression;
  }
  return x;
}

/** El padre de `n` salteando los envoltorios. */
function padreReal(n: ts.Node): ts.Node {
  let p = n.parent;
  while (
    p &&
    (ts.isParenthesizedExpression(p) ||
      ts.isAsExpression(p) ||
      ts.isSatisfiesExpression(p) ||
      ts.isNonNullExpression(p) ||
      ts.isTypeAssertionExpression(p))
  ) {
    p = p.parent;
  }
  return p;
}

/** El nombre de un acceso a propiedad (`x.nombre` o `x["nombre"]`), o null. */
function nombreDeAcceso(n: ts.Node): { nombre: string; receptor: ts.Expression } | null {
  const x = sinEnvoltorios(n);
  if (ts.isPropertyAccessExpression(x)) return { nombre: x.name.text, receptor: x.expression };
  if (ts.isElementAccessExpression(x) && ts.isStringLiteralLike(sinEnvoltorios(x.argumentExpression))) {
    return { nombre: (sinEnvoltorios(x.argumentExpression) as ts.StringLiteralLike).text, receptor: x.expression };
  }
  return null;
}

function esReceptorQueNoEsTabla(receptor: ts.Expression): boolean {
  const r = sinEnvoltorios(receptor);
  return ts.isIdentifier(r) && RECEPTORES_QUE_NO_SON_TABLAS.has(r.text);
}

/** Por archivo: sus constantes de texto y lo que importa por nombre. */
type Modulo = {
  constantes: Map<string, Set<string>>;
  importados: Map<string, { ruta: string | null; nombre: string }>;
};
type Modulos = Map<string, Modulo>;

const EXTENSIONES_DE_IMPORT = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

/** La ruta de un import relativo o con `@/`, si es un archivo recorrido. */
function resolverImport(desde: string, especificador: string): string | null {
  const base = especificador.startsWith("@/")
    ? join(WEB, especificador.slice(2))
    : especificador.startsWith(".")
      ? join(desde, "..", especificador)
      : null;
  if (!base) return null;
  const candidatas = [base, ...EXTENSIONES_DE_IMPORT.map((e) => base + e), ...EXTENSIONES_DE_IMPORT.map((e) => join(base, "index" + e))];
  return candidatas.find((c) => existsSync(c) && extname(c) in EXTENSIONES) ?? null;
}

/** El texto de una expresión si se puede saber sin correr el código. */
function textoEstatico(n: ts.Node | undefined, archivo: string, modulos: Modulos): string[] | null {
  if (!n) return null;
  const x = sinEnvoltorios(n);
  if (ts.isStringLiteralLike(x)) return [x.text];
  if (ts.isIdentifier(x)) {
    const modulo = modulos.get(archivo);
    const propias = modulo?.constantes.get(x.text);
    if (propias && propias.size > 0) return [...propias];
    const importado = modulo?.importados.get(x.text);
    const ajenas = importado?.ruta ? modulos.get(importado.ruta)?.constantes.get(importado.nombre) : undefined;
    return ajenas && ajenas.size > 0 ? [...ajenas] : null;
  }
  if (ts.isArrayLiteralExpression(x)) {
    const valores = x.elements.flatMap((e) => textoEstatico(e, archivo, modulos) ?? []);
    return valores.length > 0 ? valores : null;
  }
  if (ts.isBinaryExpression(x) && x.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const a = textoEstatico(x.left, archivo, modulos);
    const b = textoEstatico(x.right, archivo, modulos);
    return a && b ? a.flatMap((i) => b.map((j) => i + j)) : null;
  }
  if (ts.isTemplateExpression(x)) {
    let partes: string[] = [x.head.text];
    for (const span of x.templateSpans) {
      const v = textoEstatico(span.expression, archivo, modulos);
      if (!v) return null;
      partes = partes.flatMap((p) => v.map((s) => p + s + span.literal.text));
    }
    return partes;
  }
  return null;
}

function parsear(ruta: string): ts.SourceFile {
  return ts.createSourceFile(ruta, readFileSync(ruta, "utf8"), ts.ScriptTarget.Latest, true, EXTENSIONES[extname(ruta)]);
}

function recorrer(n: ts.Node, visitar: (n: ts.Node) => void): void {
  visitar(n);
  ts.forEachChild(n, (h) => recorrer(h, visitar));
}

/** Las `const X = "texto"` y los imports por nombre de cada archivo. */
function juntarModulos(fuentes: ts.SourceFile[]): Modulos {
  const modulos: Modulos = new Map();
  for (const f of fuentes) {
    const modulo: Modulo = { constantes: new Map(), importados: new Map() };
    recorrer(f, (n) => {
      if (
        ts.isVariableDeclaration(n) &&
        ts.isIdentifier(n.name) &&
        n.initializer &&
        ts.isVariableDeclarationList(n.parent) &&
        (n.parent.flags & ts.NodeFlags.Const) !== 0
      ) {
        const v = sinEnvoltorios(n.initializer);
        if (ts.isStringLiteralLike(v)) {
          const set = modulo.constantes.get(n.name.text) ?? new Set<string>();
          set.add(v.text);
          modulo.constantes.set(n.name.text, set);
        }
      }
      if (ts.isImportDeclaration(n) && ts.isStringLiteralLike(n.moduleSpecifier)) {
        const nombres = n.importClause?.namedBindings;
        if (nombres && ts.isNamedImports(nombres)) {
          const ruta = resolverImport(f.fileName, n.moduleSpecifier.text);
          for (const e of nombres.elements) {
            modulo.importados.set(e.name.text, { ruta, nombre: (e.propertyName ?? e.name).text });
          }
        }
      }
    });
    modulos.set(f.fileName, modulo);
  }
  return modulos;
}

/** Si el argumento de un insert o upsert manda `experience` con un valor. */
function mandaExperience(arg: ts.Node | undefined): boolean {
  if (!arg) return false;
  const x = sinEnvoltorios(arg);
  if (ts.isArrayLiteralExpression(x)) return x.elements.length > 0 && x.elements.every(mandaExperience);
  if (!ts.isObjectLiteralExpression(x)) return false;
  return x.properties.some((p) => {
    if (ts.isShorthandPropertyAssignment(p)) return p.name.text === "experience";
    if (!ts.isPropertyAssignment(p)) return false;
    const nombre = ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name) ? p.name.text : null;
    if (nombre !== "experience") return false;
    const v = sinEnvoltorios(p.initializer);
    return !(
      (ts.isIdentifier(v) && v.text === "undefined") ||
      v.kind === ts.SyntaxKind.NullKeyword ||
      ts.isVoidExpression(v)
    );
  });
}

type Analisis = {
  altas: Record<string, number>;
  altasSinExperiencia: string[];
  sinEncadenar: string[];
  dinamicosSinRevisar: string[];
  fromSinLlamar: string[];
  organizationsAOtraFuncion: string[];
  porHttp: string[];
};

/** Un método encadenado directo a `nodo` (`nodo.metodo(...)`), con sus argumentos. */
function metodoEncadenado(nodo: ts.Node): { metodo: string; args: ts.NodeArray<ts.Expression> | null } | null {
  const acceso = padreReal(nodo);
  const nombre = acceso ? nombreDeAcceso(acceso) : null;
  if (!nombre || sinEnvoltorios(nombre.receptor) !== nodo) return null;
  const llamada = padreReal(acceso);
  const llamado = llamada && ts.isCallExpression(llamada) && sinEnvoltorios(llamada.expression) === acceso;
  return { metodo: nombre.nombre, args: llamado ? (llamada as ts.CallExpression).arguments : null };
}

function analizar(rutas: string[]): Analisis {
  const r: Analisis = {
    altas: {},
    altasSinExperiencia: [],
    sinEncadenar: [],
    dinamicosSinRevisar: [],
    fromSinLlamar: [],
    organizationsAOtraFuncion: [],
    porHttp: [],
  };
  const fuentes = rutas.map(parsear);
  const modulos = juntarModulos(fuentes);

  for (const f of fuentes) {
    const archivo = relative(RAIZ, f.fileName);
    let escribe = false;
    let nombraOrganizations = false;
    recorrer(f, (n) => {
      if (ts.isStringLiteralLike(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
        if (n.text.includes("organizations")) nombraOrganizations = true;
        if (n.text.includes("rest/v1/organizations")) r.porHttp.push(archivo);
      }
      if (ts.isCallExpression(n)) {
        const acceso = nombreDeAcceso(n.expression);
        if (acceso && (acceso.nombre === "insert" || acceso.nombre === "upsert")) escribe = true;
      }
    });

    // 4: `from` como referencia: `x.from.bind(...)`, o guardado en una variable
    // (`const f = x.from`, `const { from: f } = x`) que después se llama.
    const llamados = new Set<string>();
    recorrer(f, (n) => {
      if (ts.isCallExpression(n)) {
        const c = sinEnvoltorios(n.expression);
        if (ts.isIdentifier(c)) llamados.add(c.text);
        const acc = nombreDeAcceso(c);
        if (acc && ["call", "apply", "bind"].includes(acc.nombre) && ts.isIdentifier(sinEnvoltorios(acc.receptor))) {
          llamados.add((sinEnvoltorios(acc.receptor) as ts.Identifier).text);
        }
      }
    });
    recorrer(f, (n) => {
      const acceso = nombreDeAcceso(n);
      if (acceso && acceso.nombre === "from" && n === sinEnvoltorios(n) && !esReceptorQueNoEsTabla(acceso.receptor)) {
        const m = metodoEncadenado(n);
        if (m?.metodo === "bind") r.fromSinLlamar.push(`${archivo}: ${n.getText(f)}.bind`);
        const p = padreReal(n);
        if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name) && llamados.has(p.name.text)) {
          r.fromSinLlamar.push(`${archivo}: ${p.getText(f)}`);
        }
      }
      if (ts.isBindingElement(n) && n.parent && ts.isObjectBindingPattern(n.parent) && ts.isIdentifier(n.name)) {
        const propiedad = n.propertyName && (ts.isIdentifier(n.propertyName) || ts.isStringLiteralLike(n.propertyName))
          ? n.propertyName.text
          : n.name.text;
        if (propiedad === "from" && llamados.has(n.name.text)) r.fromSinLlamar.push(`${archivo}: ${n.getText(f)}`);
      }

      // 6: en un archivo que escribe, la tabla organizations pasada a una
      // función que no es from.
      if (ts.isCallExpression(n)) {
        const callee = nombreDeAcceso(n.expression);
        const esFrom = callee?.nombre === "from" || ((callee?.nombre === "call" || callee?.nombre === "apply") && nombreDeAcceso(callee.receptor)?.nombre === "from");
        if (escribe && !esFrom && n.arguments.some((arg) => textoEstatico(arg, f.fileName, modulos)?.includes("organizations"))) {
          r.organizationsAOtraFuncion.push(`${archivo}: ${n.expression.getText(f)}(...)`);
        }
      }

      if (!ts.isCallExpression(n)) return;
      const callee = nombreDeAcceso(n.expression);
      if (!callee) return;
      let tabla: ts.Node | undefined;
      let receptor: ts.Expression;
      if (callee.nombre === "from") {
        tabla = n.arguments[0];
        receptor = callee.receptor;
      } else if (callee.nombre === "call" || callee.nombre === "apply") {
        const interno = nombreDeAcceso(callee.receptor);
        if (!interno || interno.nombre !== "from") return;
        receptor = interno.receptor;
        const a = n.arguments[1];
        tabla = callee.nombre === "call" ? a : a && ts.isArrayLiteralExpression(sinEnvoltorios(a)) ? (sinEnvoltorios(a) as ts.ArrayLiteralExpression).elements[0] : undefined;
      } else {
        return;
      }
      if (esReceptorQueNoEsTabla(receptor)) return;

      const valores = textoEstatico(tabla, f.fileName, modulos);
      const siguiente = metodoEncadenado(n);
      const metodo = siguiente?.metodo ?? null;

      if (valores && valores.includes("organizations")) {
        if (!metodo || !METODOS_DE_ORGANIZATIONS.has(metodo)) {
          r.sinEncadenar.push(`${archivo}: ${n.getText(f)}${metodo ? `.${metodo}` : ""}`);
          return;
        }
        if (metodo === "insert" || metodo === "upsert") {
          r.altas[archivo] = (r.altas[archivo] ?? 0) + 1;
          if (!mandaExperience(siguiente?.args?.[0])) r.altasSinExperiencia.push(archivo);
        }
        return;
      }
      if (valores) return;

      const clave = `${archivo}: from(${tabla ? tabla.getText(f) : ""})`;
      const escribeDirecto = metodo === "insert" || metodo === "upsert";
      const sueltoEnArchivoQueEscribe = metodo === null && escribe;
      if ((escribeDirecto || sueltoEnArchivoQueEscribe || (escribe && nombraOrganizations)) && !(clave in DESTINOS_DINAMICOS_REVISADOS)) {
        r.dinamicosSinRevisar.push(clave + (metodo ? `.${metodo}` : ""));
      }
    });
  }
  return r;
}

describe("altas de organizaciones", () => {
  const rutas = carpetasRecorridas().flatMap(archivos);
  const a = analizar(rutas);

  it("⭐ las únicas que hay son las seis del inventario", () => {
    expect(a.altas).toEqual(ALTAS_CONOCIDAS);
  });

  it("⭐ cada alta manda su experiencia explícita", () => {
    expect(a.altasSinExperiencia).toEqual([]);
  });

  it('⭐ ningún from("organizations") queda sin encadenar (en una variable)', () => {
    expect(a.sinEncadenar).toEqual([]);
  });

  it("⭐ ningún from() con la tabla en una variable escribe sin estar revisado", () => {
    expect(a.dinamicosSinRevisar).toEqual([]);
  });

  it("⭐ nadie usa from como referencia (bind, guardado en una variable que se llama)", () => {
    expect(a.fromSinLlamar).toEqual([]);
  });

  it("⭐ en un archivo que escribe, la tabla organizations no se le pasa a otra función", () => {
    expect(a.organizationsAOtraFuncion).toEqual([]);
  });

  it("nadie inserta en organizations por HTTP a PostgREST", () => {
    expect(a.porHttp).toEqual([]);
  });

  it("recorre apps/web, las demás apps y packages", () => {
    const nombres = carpetasRecorridas().map((d) => relative(RAIZ, d));
    expect(nombres).toEqual(expect.arrayContaining(["apps/web", "apps/discord-bot", "apps/reel-worker", "packages/ui"]));
    expect(rutas.length).toBeGreaterThan(500);
  });

  it("los destinos dinámicos revisados siguen existiendo (la lista no queda vieja)", () => {
    for (const clave of Object.keys(DESTINOS_DINAMICOS_REVISADOS)) {
      expect(existsSync(join(RAIZ, clave.split(": ")[0])), clave).toBe(true);
    }
  });
});
