import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SCRUM-108 · Test de arquitectura de las pantallas de error.
 *
 * Sin `error.tsx` ni `global-error.tsx`, una falla mostraba la pantalla de
 * Next en inglés y sin reintentar, un módulo roto tumbaba la plataforma
 * entera y los errores de render del navegador no pasaban por Sentry. Este
 * test lee los archivos de `app/` (como `errores-de-next-se-relanzan.test.ts`)
 * y falla si:
 *   - falta alguno de los boundaries que tienen que existir;
 *   - un boundary no es client component, no captura en Sentry o usa
 *     `.message` / `.stack` del error (lo que se dibuja nunca lo muestra);
 *   - una página de la plataforma o del super admin queda sin un `error.tsx`
 *     arriba;
 *   - una página de la plataforma llama a `notFound()` y no hay `not-found`
 *     dentro de la cáscara;
 *   - un client component de la plataforma llama a `notFound()` (en el
 *     navegador rompe con el error #310 de React).
 */

const WEB = join(__dirname, "..", "..");
const APP = join(WEB, "app");
const COMPARTIDO = join(WEB, "components", "platform", "pantalla-de-error.tsx");

const OBLIGATORIOS = [
  "global-error.tsx",
  "(platform)/error.tsx",
  "(super-admin)/error.tsx",
  // Módulos pesados: la caída queda en el módulo.
  "(platform)/marketing/error.tsx",
  "(platform)/workboard/error.tsx",
  "(platform)/agent/error.tsx",
  "(platform)/sales/error.tsx",
];

function archivos(dir: string, nombres: string[]): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" ? [] : archivos(ruta, nombres);
    return nombres.includes(e.name) ? [ruta] : [];
  });
}

/** El código sin comentarios, para que una explicación no cuente como uso. */
function codigoSinComentarios(archivo: string): string {
  return readFileSync(archivo, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Los boundaries que hay hoy en `app/`. */
const BOUNDARIES = archivos(APP, ["error.tsx", "global-error.tsx"]);

describe("los boundaries que tienen que existir", () => {
  it.each(OBLIGATORIOS)("⭐ existe app/%s", (ruta) => {
    expect(existsSync(join(APP, ruta))).toBe(true);
  });
});

describe.each(BOUNDARIES.map((b) => [relative(APP, b), b]))("app/%s", (_ruta, archivo) => {
  const codigo = codigoSinComentarios(archivo);

  it("es client component (lo exige Next para un boundary)", () => {
    expect(codigo.trimStart()).toMatch(/^["']use client["'];/);
  });

  it("⭐ captura en Sentry: usa la pantalla compartida o su hook", () => {
    expect(codigo).toMatch(/<PantallaDeError\b|useBoundaryDeError\(/);
  });

  it("⭐ no usa el mensaje ni el stack del error", () => {
    expect(codigo).not.toMatch(/\.(message|stack)\b/);
  });
});

describe("la pantalla compartida", () => {
  const codigo = codigoSinComentarios(COMPARTIDO);

  it("es client component", () => {
    expect(codigo.trimStart()).toMatch(/^["']use client["'];/);
  });

  it("⭐ captura el error en Sentry dentro de un efecto", () => {
    expect(codigo).toMatch(/useEffect\(\(\) => \{\s*Sentry\.captureException\(error/);
  });

  it("⭐ no usa el mensaje ni el stack del error", () => {
    expect(codigo).not.toMatch(/\.(message|stack)\b/);
  });
});

/** El `error.tsx` más cercano de `pagina`, sin salir de su grupo de rutas. */
function boundaryDe(pagina: string, grupo: string): string | null {
  let dir = dirname(pagina);
  while (dir.startsWith(grupo)) {
    const candidato = join(dir, "error.tsx");
    if (existsSync(candidato)) return candidato;
    dir = dirname(dir);
  }
  return null;
}

describe.each(["(platform)", "(super-admin)"])("las páginas de %s", (grupo) => {
  it("⭐ toda página tiene un error.tsx arriba, dentro de la cáscara", () => {
    const raiz = join(APP, grupo);
    const sinBoundary = archivos(raiz, ["page.tsx"])
      .filter((pagina) => !boundaryDe(pagina, raiz))
      .map((pagina) => relative(APP, pagina));
    expect(sinBoundary).toEqual([]);
  });
});

describe("notFound dentro de la plataforma", () => {
  it("⭐ si una página de (platform) llama a notFound(), hay un not-found dentro de la cáscara", () => {
    const raiz = join(APP, "(platform)");
    const conNotFound = archivos(raiz, ["page.tsx", "layout.tsx"]).filter((archivo) =>
      /\bnotFound\(\)/.test(codigoSinComentarios(archivo))
    );
    expect(conNotFound.length).toBeGreaterThan(0);
    expect(existsSync(join(raiz, "not-found.tsx"))).toBe(true);
  });

  it("⭐ ningún client component de (platform) llama a notFound(): se resuelve en el servidor", () => {
    // Desde el navegador, `notFound()` rompía la app con el error #310 de
    // React en vez de mostrar el not-found (la ficha de cliente, SCRUM-108).
    const raiz = join(APP, "(platform)");
    const enElNavegador = readdirSync(raiz, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".tsx"))
      .map((e) => join(e.parentPath, e.name))
      .filter((archivo) => !archivo.includes("__tests__"))
      .filter((archivo) => {
        const codigo = codigoSinComentarios(archivo);
        return /^\s*["']use client["'];/.test(codigo) && /\bnotFound\(\)/.test(codigo);
      })
      .map((archivo) => relative(APP, archivo));
    expect(enElNavegador).toEqual([]);
  });
});
