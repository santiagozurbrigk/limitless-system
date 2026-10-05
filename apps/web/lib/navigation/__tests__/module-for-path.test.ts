import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  isRutaLibre,
  permissionModuleForPath,
} from "@/lib/navigation/module-for-path";
import {
  LLAMADA_AL_CHEQUEO,
  pantallas,
  pasaPorElChequeo,
  segmentosAlEntrar,
} from "./pantallas-de-app";

const APP_DIR = join(process.cwd(), "app");

function primerNivel(ruta: string): string {
  return `/${ruta.split("/")[1] ?? ""}`;
}

describe("permissionModuleForPath", () => {
  const todas = pantallas(APP_DIR);

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

describe("recorrido de app/", () => {
  it("grupos y slots no suman segmento; las interceptadas suman el que interceptan", () => {
    expect(segmentosAlEntrar(["fotos"], "(platform)")).toEqual(["fotos"]);
    expect(segmentosAlEntrar(["fotos"], "@modal")).toEqual(["fotos"]);
    expect(segmentosAlEntrar(["fotos"], "(.)detalle")).toEqual(["fotos", "detalle"]);
    expect(segmentosAlEntrar(["a", "b"], "(..)finance")).toEqual(["a", "finance"]);
    expect(segmentosAlEntrar(["a", "b"], "(..)(..)finance")).toEqual(["finance"]);
    expect(segmentosAlEntrar(["a", "b"], "(...)finance")).toEqual(["finance"]);
    expect(segmentosAlEntrar([], "finance")).toEqual(["finance"]);
  });

  // Un árbol armado a mano con los casos que hoy no existen en la app.
  const raiz = mkdtempSync(join(tmpdir(), "scrum-18-app-"));
  afterAll(() => rmSync(raiz, { recursive: true, force: true }));

  function archivo(ruta: string, contenido = "export default function X() {}") {
    const completo = join(raiz, ruta);
    mkdirSync(dirname(completo), { recursive: true });
    writeFileSync(completo, contenido);
  }

  archivo("(platform)/layout.tsx", `const b = ${LLAMADA_AL_CHEQUEO}"", p);`);
  archivo("(platform)/finance/page.ts");
  archivo("(platform)/team/page.js");
  archivo("(suelto)/layout.tsx");
  archivo("(suelto)/sales/page.jsx");
  archivo("(suelto)/@modal/(...)finance/page.tsx");
  archivo("(suelto)/dashboard/(.)settings/page.tsx");
  archivo("_privada/workboard/page.tsx");

  const encontradas = pantallas(raiz);
  const porRuta = (ruta: string) => encontradas.filter((p) => p.ruta === ruta);

  it("encuentra páginas page.ts, page.js y page.jsx, no sólo page.tsx", () => {
    expect(porRuta("/finance").map((p) => p.archivo)).toContain(
      join("(platform)", "finance", "page.ts")
    );
    expect(porRuta("/team")).toHaveLength(1);
    expect(porRuta("/sales")).toHaveLength(1);
  });

  it("una interceptada no se toma como grupo: queda con la URL que intercepta", () => {
    const interceptada = porRuta("/finance").find((p) =>
      p.archivo.includes("(...)finance")
    );
    expect(interceptada).toBeDefined();
    expect(porRuta("/dashboard/settings")).toHaveLength(1);
    expect(encontradas.map((p) => p.ruta)).not.toContain("/");
  });

  it("las carpetas privadas no son rutas", () => {
    expect(porRuta("/workboard")).toEqual([]);
  });

  it("⭐ señala las pantallas con módulo que cuelgan de un layout sin chequeo", () => {
    const sinChequeo = encontradas
      .filter((p) => permissionModuleForPath(p.ruta) !== null)
      .filter((p) => !pasaPorElChequeo(p))
      .map((p) => p.ruta)
      .sort();
    expect(sinChequeo).toEqual(["/dashboard/settings", "/finance", "/sales"]);
  });
});
