import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SCRUM-523 · el inventario de las altas de organizaciones.
 *
 * El default de `organizations.experience` es `full` (AR pasada 1, MAYOR-2):
 * cada alta manda su experiencia explícita (`webinar`, o la del holding en un
 * negocio creado dentro de un holding). Un alta que nadie revisó nace `full`,
 * el lado seguro. Este test lee el código (sin comentarios) de todo `apps/` y
 * `packages/` (salvo `node_modules`, `.next`, `dist`, `.turbo`, `__tests__` y
 * los `*.test.*`) y falla si:
 *
 *   1. hay un `.from("organizations")` (comillas simples, dobles o backticks
 *      sin `${}`) que no sigue directo con `.select`, `.update`, `.delete`,
 *      `.insert` o `.upsert`: por ejemplo, guardado en una variable para hacer
 *      el insert después;
 *   2. los `.from("organizations").insert(` o `.upsert(` no son exactamente los
 *      seis del inventario, o alguno no tiene la palabra `experience` en su
 *      argumento;
 *   3. hay un `.from(X)` con X que no es un literal de texto y sigue directo con
 *      `.insert(` o `.upsert(`, y no está en `DESTINOS_DINAMICOS_REVISADOS`;
 *   4. hay un `.from(X)` con X que no es un literal en un archivo cuyo código
 *      tiene un `.insert(` o un `.upsert(` y la palabra `organizations`, y no
 *      está en `DESTINOS_DINAMICOS_REVISADOS`;
 *   5. aparece `rest/v1/organizations` (un insert por HTTP a PostgREST).
 *
 * Para 3 y 4 no cuentan los `.from(` de `Array`, `Buffer`, `Uint8Array` ni los
 * de Storage (`.storage.from(bucket)`).
 *
 * Lo que NO ve: un `["from"]("organizations")`, un nombre de tabla armado en
 * otro archivo y pasado a un helper que no hace el insert en la misma cadena
 * ni vive en un archivo que diga `organizations`, y SQL dinámico. Las altas
 * por SQL (funciones y triggers que insertan en `organizations`) las mira
 * `supabase/ci/tests/97_experiencia_de_la_organizacion.sql`.
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
 * `.from(X)` con X variable, revisados a mano: ninguno puede recibir
 * `organizations` como tabla. Clave: `archivo: from(X)`.
 */
const DESTINOS_DINAMICOS_REVISADOS: Record<string, string> = {
  "apps/web/lib/onboarding/resolve.ts: from(table)":
    "cuenta filas de tablas de datos de la org para el checklist; sólo select con count",
  "apps/web/app/super-admin/delete-actions.ts: from(tabla)":
    "baja de una organización: borra filas de las tablas hijas por organization_id; sólo delete",
  "apps/web/lib/observability/registro-de-corridas.ts: from(TABLA_DE_CORRIDAS)":
    'constante del mismo archivo: "corridas_de_procesos"',
};

const IGNORAR_CARPETAS = new Set(["node_modules", ".next", "dist", ".turbo", "__tests__"]);

function archivos(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return IGNORAR_CARPETAS.has(e.name) ? [] : archivos(ruta);
    return /\.(ts|tsx|js|mjs|cjs)$/.test(e.name) && !/\.test\./.test(e.name) ? [ruta] : [];
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

/** El código sin comentarios, para que una explicación no cuente como uso. */
function codigoSinComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** El texto entre el paréntesis que abre en `inicio` y su cierre. */
function argumento(codigo: string, inicio: number): { texto: string; fin: number } {
  let nivel = 0;
  for (let i = inicio; i < codigo.length; i++) {
    if (codigo[i] === "(") nivel++;
    else if (codigo[i] === ")") {
      nivel--;
      if (nivel === 0) return { texto: codigo.slice(inicio + 1, i), fin: i + 1 };
    }
  }
  return { texto: codigo.slice(inicio + 1), fin: codigo.length };
}

const LITERAL_ORGANIZATIONS = /^(["'`])organizations\1$/;
const LITERAL = /^(["'])[^"'\n]*\1$|^`[^`$]*`$/;
const METODOS_DE_ORGANIZATIONS = new Set(["select", "update", "delete", "insert", "upsert"]);
const RECEPTORES_QUE_NO_SON_TABLAS = /(\bArray|\bBuffer|\bUint8Array|\bstorage)\s*$/;

type Analisis = {
  altas: Record<string, number>;
  altasSinExperiencia: string[];
  sinEncadenar: string[];
  dinamicosSinRevisar: string[];
  porHttp: string[];
};

function analizar(rutas: string[]): Analisis {
  const r: Analisis = { altas: {}, altasSinExperiencia: [], sinEncadenar: [], dinamicosSinRevisar: [], porHttp: [] };
  for (const ruta of rutas) {
    const archivo = relative(RAIZ, ruta);
    const codigo = codigoSinComentarios(readFileSync(ruta, "utf8"));
    if (codigo.includes("rest/v1/organizations")) r.porHttp.push(archivo);
    const escribe = /\.(insert|upsert)\s*\(/.test(codigo);
    const nombraOrganizations = codigo.includes("organizations");
    for (const m of codigo.matchAll(/\.\s*from\s*\(/g)) {
      const abre = (m.index ?? 0) + m[0].length - 1;
      const { texto, fin } = argumento(codigo, abre);
      const arg = texto.trim();
      const sigue = /^\s*\.\s*(\w+)\s*\(/.exec(codigo.slice(fin));
      const metodo = sigue?.[1] ?? null;
      if (LITERAL_ORGANIZATIONS.test(arg)) {
        if (!metodo || !METODOS_DE_ORGANIZATIONS.has(metodo)) {
          r.sinEncadenar.push(`${archivo}: from(${arg})${metodo ? `.${metodo}` : ""}`);
          continue;
        }
        if (metodo === "insert" || metodo === "upsert") {
          r.altas[archivo] = (r.altas[archivo] ?? 0) + 1;
          const abreMetodo = fin + (sigue?.[0].length ?? 0) - 1;
          if (!/\bexperience\b/.test(argumento(codigo, abreMetodo).texto)) {
            r.altasSinExperiencia.push(archivo);
          }
        }
        continue;
      }
      if (LITERAL.test(arg)) continue;
      if (RECEPTORES_QUE_NO_SON_TABLAS.test(codigo.slice(0, m.index ?? 0))) continue;
      const clave = `${archivo}: from(${arg})`;
      const escribeDirecto = metodo === "insert" || metodo === "upsert";
      if ((escribeDirecto || (escribe && nombraOrganizations)) && !(clave in DESTINOS_DINAMICOS_REVISADOS)) {
        r.dinamicosSinRevisar.push(clave + (metodo ? `.${metodo}` : ""));
      }
    }
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
