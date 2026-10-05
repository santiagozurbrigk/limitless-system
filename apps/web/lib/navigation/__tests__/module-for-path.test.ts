import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import {
  isRutaLibre,
  permissionModuleForPath,
} from "@/lib/navigation/module-for-path";

const APP_DIR = join(process.cwd(), "app");

/**
 * Lo que hace que un layout cuente como "con chequeo": llama al helper que
 * decide si la ruta se bloquea. Si alguien saca esa llamada, el layout deja de
 * contar y las pantallas que cuelgan de él quedan señaladas.
 */
const LLAMADA_AL_CHEQUEO = "moduloBloqueadoParaRuta(";

type Pantalla = {
  /** La URL, sin los grupos `(x)`. */
  ruta: string;
  /** El `page.tsx`, relativo a `app/`. */
  archivo: string;
  /** Los `layout.tsx` de los que cuelga, de `app/` hacia adentro. */
  layouts: string[];
};

/**
 * Recorre `app/` entero y devuelve cada `page.tsx` con su URL y su cadena de
 * layouts. Sigue las reglas del App Router: un grupo `(x)` y un slot `@x` no
 * suman segmento a la URL, y una carpeta privada `_x` no es ruta.
 */
function pantallas(
  dir = APP_DIR,
  segmentos: string[] = [],
  layouts: string[] = []
): Pantalla[] {
  const cadena = existsSync(join(dir, "layout.tsx"))
    ? [...layouts, join(dir, "layout.tsx")]
    : layouts;

  const propias: Pantalla[] = existsSync(join(dir, "page.tsx"))
    ? [
        {
          ruta: `/${segmentos.join("/")}`,
          archivo: relative(APP_DIR, join(dir, "page.tsx")),
          layouts: cadena,
        },
      ]
    : [];

  const hijas = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .flatMap((entry) => {
      const sinSegmento =
        entry.name.startsWith("(") || entry.name.startsWith("@");
      return pantallas(
        join(dir, entry.name),
        sinSegmento ? segmentos : [...segmentos, entry.name],
        cadena
      );
    });

  return [...propias, ...hijas];
}

function layoutConChequeo(layout: string): boolean {
  return readFileSync(layout, "utf8").includes(LLAMADA_AL_CHEQUEO);
}

function pasaPorElChequeo(pantalla: Pantalla): boolean {
  return pantalla.layouts.some(layoutConChequeo);
}

function primerNivel(ruta: string): string {
  return `/${ruta.split("/")[1] ?? ""}`;
}

describe("permissionModuleForPath", () => {
  const todas = pantallas();

  it("el recorrido encuentra las pantallas de todos los grupos, incluido /founder", () => {
    const rutas = todas.map((p) => p.ruta);
    expect(rutas).toContain("/founder");
    expect(rutas).toContain("/finance");
    expect(rutas).toContain("/super-admin/organizations");
    expect(rutas).toContain("/login");
  });

  it("⭐ toda pantalla con módulo cuelga de un layout que chequea el permiso", () => {
    const sinChequeo = todas
      .filter((p) => permissionModuleForPath(p.ruta) !== null)
      .filter((p) => !pasaPorElChequeo(p))
      .map((p) => `${p.ruta} (app/${p.archivo})`);
    expect(sinChequeo).toEqual([]);
  });

  it("⭐ /founder pasa por el chequeo de Operaciones", () => {
    const founder = todas.find((p) => p.ruta === "/founder");
    expect(founder && pasaPorElChequeo(founder)).toBe(true);
    expect(permissionModuleForPath("/founder")).toBe("operations");
  });

  it("toda ruta bajo un layout con chequeo tiene módulo o está declarada como libre", () => {
    const huerfanas = [
      ...new Set(
        todas
          .filter(pasaPorElChequeo)
          .map((p) => primerNivel(p.ruta))
          .filter(
            (ruta) => permissionModuleForPath(ruta) === null && !isRutaLibre(ruta)
          )
      ),
    ];
    expect(huerfanas).toEqual([]);
  });

  it("las subrutas heredan el módulo del padre", () => {
    expect(permissionModuleForPath("/finance/expenses")).toBe("finance");
    expect(permissionModuleForPath("/clients/algun-id/detalle")).toBe("clients");
    expect(permissionModuleForPath("/marketing/content/abc")).toBe("marketing");
  });

  it("un prefijo no cuenta si no termina en un segmento entero", () => {
    // /teamwork no es /team
    expect(permissionModuleForPath("/teamwork")).toBeNull();
    expect(permissionModuleForPath("/financeiro")).toBeNull();
  });

  it("las rutas previas al rol quedan libres", () => {
    expect(permissionModuleForPath("/onboarding")).toBeNull();
    expect(permissionModuleForPath("/onboarding/holding")).toBeNull();
    expect(permissionModuleForPath("/holding")).toBeNull();
  });

  it("SOPs y Producto caen bajo Operaciones", () => {
    expect(permissionModuleForPath("/sops/create")).toBe("operations");
    expect(permissionModuleForPath("/operations/sops")).toBe("operations");
    expect(permissionModuleForPath("/product/value-ladder")).toBe("operations");
  });

  it("una ruta desconocida no se bloquea, pero tampoco inventa módulo", () => {
    expect(permissionModuleForPath("/ruta-que-no-existe")).toBeNull();
  });
});
