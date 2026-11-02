import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { pantallas, type Pantalla } from "./pantallas-de-app";
import { redireccionPorExperiencia } from "@/lib/navigation/rutas-por-experiencia";
import { emptyPermissions } from "@/constants/permission-modules";

/**
 * SCRUM-524 · ⭐ Toda pantalla de la plataforma pasa por el bloqueo por
 * experiencia, y lo hace en el layout de su segmento de primer nivel.
 *
 * El layout de `(platform)` no se vuelve a ejecutar en una navegación del
 * cliente; el del segmento de primer nivel sí, cada vez que se entra a ese
 * segmento. Por eso cada carpeta de `app/(platform)` tiene un `layout.tsx` con
 * `exigirRutaDeLaExperiencia("/<su segmento>")`. Este test recorre el disco y
 * falla si aparece una pantalla nueva sin ese layout, o con la ruta de otro
 * segmento (un copiar y pegar que bloquearía con la regla equivocada).
 */

const APP_DIR = join(process.cwd(), "app");
const FOUNDER = { isFounder: true, modules: emptyPermissions() };
const GRUPO = "(platform)";
const LLAMADA = "exigirRutaDeLaExperiencia(";

const todas = pantallas(APP_DIR);
const dePlataforma = todas.filter((p) => p.archivo.split(sep)[0] === GRUPO);
const deAfuera = todas.filter((p) => p.archivo.split(sep)[0] !== GRUPO);

function segmento(p: Pantalla): string {
  return p.archivo.split(sep)[1]!;
}

function layoutDelSegmento(p: Pantalla): string {
  return join(APP_DIR, GRUPO, segmento(p), "layout.tsx");
}

function llamaAlBloqueo(layout: string): boolean {
  return readFileSync(layout, "utf8").includes(LLAMADA);
}

describe("⭐ bloqueo por experiencia en app/(platform)", () => {
  it("el recorrido encuentra las pantallas de la plataforma, también las anidadas", () => {
    const rutas = dePlataforma.map((p) => p.ruta);
    expect(rutas).toContain("/finance");
    expect(rutas).toContain("/finance/expenses");
    expect(rutas).toContain("/team");
    expect(rutas).toContain("/lanzamientos/[id]");
    expect(dePlataforma.length).toBeGreaterThan(50);
  });

  it("⭐ toda pantalla cuelga del layout de su segmento, y ese layout llama al bloqueo con su propia ruta", () => {
    const mal = dePlataforma
      .filter((p) => {
        const layout = layoutDelSegmento(p);
        if (!p.layouts.includes(layout)) return true;
        return !readFileSync(layout, "utf8").includes(`${LLAMADA}"/${segmento(p)}")`);
      })
      .map((p) => `${p.ruta} (app/${p.archivo})`);
    expect(mal).toEqual([]);
  });

  it("ninguna pantalla vive suelta en la raíz de (platform) (no tendría segmento que la bloquee)", () => {
    expect(dePlataforma.filter((p) => p.archivo.split(sep).length < 3)).toEqual([]);
  });

  it("⭐ webinar: toda pantalla fuera de Equipo y de las libres redirige a Equipo", () => {
    const abiertas = new Set<string>();
    for (const p of dePlataforma) {
      const destino = redireccionPorExperiencia("webinar", p.ruta, FOUNDER);
      if (destino === null) abiertas.add(`/${segmento(p)}`);
      else expect(destino, p.ruta).toBe("/team");
    }
    expect([...abiertas].sort()).toEqual(["/holding", "/onboarding", "/settings", "/team"]);
  });

  it("⭐ limitless: toda pantalla fuera de Clientes, Tablero, Ventas y las libres redirige a Clientes", () => {
    const abiertas = new Set<string>();
    for (const p of dePlataforma) {
      const destino = redireccionPorExperiencia("limitless", p.ruta, FOUNDER);
      if (destino === null) abiertas.add(`/${segmento(p)}`);
      else expect(destino, p.ruta).toBe("/clients");
    }
    expect([...abiertas].sort()).toEqual(["/clients", "/holding", "/onboarding", "/sales", "/settings", "/workboard"]);
  });

  it("full: ninguna pantalla se redirige por experiencia", () => {
    expect(dePlataforma.filter((p) => redireccionPorExperiencia("full", p.ruta, FOUNDER) !== null)).toEqual([]);
  });

  it("⭐ las rutas que no son de la plataforma no pasan por el bloqueo", () => {
    const rutas = deAfuera.map((p) => p.ruta);
    for (const ruta of ["/login", "/invite", "/auth/recover", "/auth/update-password", "/super-admin/organizations"]) {
      expect(rutas.some((r) => r === ruta || r.startsWith(`${ruta}/`)), ruta).toBe(true);
    }
    expect(deAfuera.filter((p) => p.layouts.some(llamaAlBloqueo)).map((p) => p.ruta)).toEqual([]);
  });
});
