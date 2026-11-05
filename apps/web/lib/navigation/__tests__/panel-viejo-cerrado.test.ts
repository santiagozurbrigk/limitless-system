/**
 * SCRUM-553 · El panel viejo de super-admin está cerrado: cada pantalla de
 * `app/(super-admin)/super-admin` redirige (con `next.config.ts`, vía
 * `sectionRedirects`) a una pantalla que existe en la consola de
 * Administración, ninguna pantalla de la consola enlaza a lo que no se mudó, y
 * el staff entra a la consola.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { sectionRedirects } from "../redirects";
import { DESTINO_DEL_STAFF } from "@/lib/auth/require-staff";
import { paths } from "@/routes/paths";

const APP = join(__dirname, "..", "..", "..", "app");
const PANEL = join(APP, "(super-admin)", "super-admin");
const CONSOLA = join(APP, "(platform)", "administracion");

function paginas(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" ? [] : paginas(ruta);
    return e.name === "page.tsx" ? [ruta] : [];
  });
}

/** La URL de una página de `app/` (sin grupos), con `abc` en cada `[param]`. */
function urlDe(raiz: string, base: string, pagina: string): string {
  const partes = relative(raiz, pagina).split(sep).slice(0, -1);
  return `${base}${partes.map((p) => `/${p.replace(/^\[.+\]$/, "abc")}`).join("")}`;
}

/** El primer redirect que coincide, como Next: `:x` = un segmento, `:x*` = cero o más. */
function redirigir(url: string): string | null {
  for (const { source, destination } of sectionRedirects) {
    const patron = new RegExp(
      `^${source.replace(/\/:(\w+)\*/g, "(?:/(?<$1>.*))?").replace(/:(\w+)/g, "(?<$1>[^/]+)")}$`
    );
    const m = patron.exec(url);
    if (!m) continue;
    return destination.replace(/:(\w+)\*?/g, (_, nombre: string) => m.groups?.[nombre] ?? "");
  }
  return null;
}

/** Si `url` es una pantalla de la consola (con `[id]` para cualquier segmento dinámico). */
function existeEnLaConsola(url: string): boolean {
  if (!url.startsWith("/administracion")) return false;
  const consola = paginas(CONSOLA).map((p) => urlDe(CONSOLA, "/administracion", p));
  return consola.includes(url) || consola.includes(url.replace(/\/[^/]+$/, "/abc"));
}

describe("⭐ cada pantalla del panel viejo redirige a la consola", () => {
  const pantallas = paginas(PANEL).map((p) => urlDe(PANEL, "/super-admin", p));

  it("el panel tiene pantallas (si no, el test no prueba nada)", () => {
    expect(pantallas.length).toBeGreaterThan(10);
  });

  it.each(pantallas)("%s", (url) => {
    const destino = redirigir(url);
    expect(destino, url).not.toBeNull();
    expect(existeEnLaConsola(destino!), `${url} → ${destino}`).toBe(true);
  });

  it("las que se mudaron van a la suya; las que no, a Organizaciones", () => {
    expect(redirigir("/super-admin")).toBe(paths.platform.consola.organizaciones);
    expect(redirigir("/super-admin/organizations/abc")).toBe(paths.platform.consola.organizacion("abc"));
    expect(redirigir("/super-admin/organizations/new")).toBe(paths.platform.consola.organizacionNueva);
    expect(redirigir("/super-admin/users")).toBe(paths.platform.consola.usuarios);
    expect(redirigir("/super-admin/holding")).toBe(paths.platform.consola.holdings);
    expect(redirigir("/super-admin/costs")).toBe(paths.platform.consola.sistema);
    expect(redirigir("/super-admin/infrastructure")).toBe(paths.platform.consola.sistema);
    expect(redirigir("/super-admin/onboarding")).toBe(paths.platform.consola.onboarding);
    for (const escondida of ["/super-admin/ai-brain", "/super-admin/ai-brain/abc", "/super-admin/waitlist", "/super-admin/trials", "/super-admin/client-health"]) {
      expect(redirigir(escondida), escondida).toBe(paths.platform.consola.organizaciones);
    }
  });

  it("los alias viejos (founders, ai-usage...) también", () => {
    expect(redirigir("/super-admin/founders")).toBe(paths.platform.consola.usuarios);
    expect(redirigir("/super-admin/profitability")).toBe(paths.platform.consola.sistema);
  });
});

describe("⭐ ninguna pantalla de la consola enlaza a lo que no se mudó", () => {
  // Las pantallas de la consola y los componentes que dibujan.
  const archivos = [
    ...paginas(CONSOLA),
    ...readdirSync(join(APP, "..", "components", "super-admin"))
      .filter((f) => f.endsWith(".tsx"))
      .filter((f) => f !== "super-admin-sidebar.tsx")
      .map((f) => join(APP, "..", "components", "super-admin", f)),
  ];

  it.each(archivos.map((a) => [relative(join(APP, ".."), a), a]))("%s", (_nombre, archivo) => {
    const codigo = readFileSync(archivo, "utf8");
    expect(codigo).not.toMatch(/paths\.superAdmin\.(aiBrain|waitlist|trials|clientHealth)\b/);
    expect(codigo).not.toMatch(/["'`]\/super-admin\//);
  });
});

describe("el staff entra a la consola", () => {
  it("DESTINO_DEL_STAFF es Organizaciones de la consola, y esa pantalla existe", () => {
    expect(DESTINO_DEL_STAFF).toBe(paths.platform.consola.organizaciones);
    expect(existsSync(join(CONSOLA, "organizaciones", "page.tsx"))).toBe(true);
  });

  it("/superadmin/login sigue llevando a /login (SCRUM-552)", () => {
    const pagina = readFileSync(join(APP, "superadmin", "login", "page.tsx"), "utf8");
    expect(pagina).toMatch(/redirect\(paths\.auth\.login\)/);
  });
});
