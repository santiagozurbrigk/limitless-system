import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildPlatformNavigation } from "@/lib/navigation/build-platform-navigation";
import { modulesWithChildren } from "@/lib/navigation/sidebar-modules";
import { LISTED_INTEGRATIONS } from "@/lib/integrations/registry";
import { canalesDeLeadMagnetVisibles } from "@/lib/marketing/lead-magnet-canales";
import { paths } from "@/routes/paths";

/**
 * SCRUM-490: lo escondido para el release no aparece en ningún lado — ni en el
 * menú ni en el buscador ⌘K ni en el catálogo de integraciones.
 */
describe("escondido para el release", () => {
  const todosLosHrefs = buildPlatformNavigation().flatMap((item) => [
    item.href,
    ...(item.children ?? []).map((c) => c.href),
  ]);

  it("el ⌘K no lista ninguna pantalla escondida del menú", () => {
    const escondidos = Object.values(modulesWithChildren)
      .flatMap((m) => m.children)
      .filter((c) => c.hidden)
      .map((c) => c.href);

    expect(escondidos.length).toBeGreaterThan(0);
    for (const href of escondidos) expect(todosLosHrefs).not.toContain(href);
  });

  it("el ⌘K no lleva al Overview de Marketing; Marketing entra por Contenido", () => {
    expect(todosLosHrefs).not.toContain(paths.platform.marketing.overview);
    const marketing = buildPlatformNavigation().find((i) => i.label === "Marketing");
    expect(marketing?.href).toBe(paths.platform.marketing.content);
  });

  it("el catálogo de integraciones no ofrece ManyChat", () => {
    expect(LISTED_INTEGRATIONS.map((d) => d.provider)).not.toContain("manychat");
  });

  it("todo mock de ESCONDIDO parte del objeto real (SCRUM-527)", () => {
    // Un mock con sólo las banderas que el test conoce deja las demás en
    // `undefined`, que se lee como visible: la Landing corría en el test de
    // Marketing sin que nadie lo supiera. El factory tiene que usar
    // `importOriginal` y partir de `real.ESCONDIDO`.
    const web = fileURLToPath(new URL("../../../", import.meta.url));
    const tests: string[] = [];
    const recorrer = (dir: string) => {
      for (const nombre of readdirSync(dir)) {
        if (["node_modules", ".next", "e2e"].includes(nombre)) continue;
        const ruta = join(dir, nombre);
        if (statSync(ruta).isDirectory()) recorrer(ruta);
        else if (/\.test\.tsx?$/.test(nombre)) tests.push(ruta);
      }
    };
    recorrer(web);
    const mocks: string[] = [];
    const sinReal: string[] = [];
    const patron = /vi\.(?:mock|doMock)\(\s*"@\/lib\/release\/escondido"([\s\S]*?)\n\s*\}\);|vi\.(?:mock|doMock)\(\s*"@\/lib\/release\/escondido"[^\n]*\);/g;
    for (const ruta of tests) {
      for (const m of readFileSync(ruta, "utf8").matchAll(patron)) {
        const rel = relative(web, ruta);
        mocks.push(rel);
        if (!/importOriginal/.test(m[0]) || !/\.\.\.real\.ESCONDIDO/.test(m[0])) sinReal.push(rel);
      }
    }
    expect(mocks.length).toBeGreaterThanOrEqual(5);
    expect(sinReal).toEqual([]);
  });

  it("el catálogo de integraciones no ofrece la Landing de Webinars (SCRUM-527)", () => {
    expect(LISTED_INTEGRATIONS.map((d) => d.provider)).not.toContain("landing");
  });

  it("Lead Magnets ofrece sólo los canales que no prometen una captura falsa", () => {
    const canales = ["manychat", "instagram_dm", "typeform", "google_forms", "landing", "manual"].map(
      (value) => ({ value })
    );
    expect(canalesDeLeadMagnetVisibles(canales).map((c) => c.value)).toEqual([
      "instagram_dm",
      "manual",
    ]);
    expect(canalesDeLeadMagnetVisibles(canales, false)).toHaveLength(6);
  });
});
