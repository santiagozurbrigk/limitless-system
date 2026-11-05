/**
 * SCRUM-551 · La consola de Administración dentro de la org de Limitless:
 * sólo el staff la ve en el menú, sus enlaces no sacan al panel viejo y cada
 * pantalla usa los componentes del super-admin con `base="consola"`.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyPermissions } from "@/constants/permission-modules";
import { itemsDeLaPaleta } from "@/components/navigation/command-palette";
import { buildPlatformSidebarNav } from "@/lib/navigation/sidebar-modules";
import { paths } from "@/routes/paths";
import { rutasDeAdministracion } from "../rutas";

const FOUNDER = { isFounder: true, modules: emptyPermissions() };
const CONSOLA = join(__dirname, "..", "..", "..", "app", "(platform)", "administracion");

describe("⭐ el menú limitless", () => {
  it("con esStaff, la barra tiene el grupo Administración con sus cinco pantallas", () => {
    const barra = buildPlatformSidebarNav([], "limitless", true);
    expect(barra.rootItems).toContainEqual({ type: "parent", key: "administracion" });
    expect(barra.modulesWithChildren.administracion.children.map((c) => c.label)).toEqual([
      "Organizaciones",
      "Usuarios",
      "Holdings",
      "Sistema",
      "Onboarding",
    ]);
    expect(barra.getParentFromPath(paths.platform.consola.usuarios)).toBe("administracion");
  });

  it("⭐ sin esStaff (aunque sea founder), no hay Administración en la barra ni en la paleta", () => {
    const barra = buildPlatformSidebarNav([], "limitless", false);
    expect(barra.rootItems).not.toContainEqual({ type: "parent", key: "administracion" });
    expect(barra.modulesWithChildren.administracion).toBeUndefined();
    expect(itemsDeLaPaleta("limitless", FOUNDER).map((i) => i.group)).not.toContain("Administración");
  });

  it("la paleta del staff lista las pantallas de Administración", () => {
    const items = itemsDeLaPaleta("limitless", { ...FOUNDER, esStaff: true }).filter((i) => i.group === "Administración");
    expect(items.map((i) => i.href)).toEqual([
      paths.platform.consola.organizaciones,
      paths.platform.consola.usuarios,
      paths.platform.consola.holdings,
      paths.platform.consola.sistema,
      paths.platform.consola.onboarding,
    ]);
  });

  it("el menú completo y el webinar no tienen Administración, ni siquiera para el staff", () => {
    expect(buildPlatformSidebarNav([], "full", true).rootItems).not.toContainEqual({ type: "parent", key: "administracion" });
    expect(buildPlatformSidebarNav([], "webinar", true).rootItems).not.toContainEqual({ type: "parent", key: "administracion" });
  });
});

describe("rutasDeAdministracion", () => {
  it("sin base, el panel viejo como siempre; con «consola», todo bajo /administracion", () => {
    expect(rutasDeAdministracion().organizacion("x")).toBe(paths.superAdmin.organizationDetail("x"));
    const consola = rutasDeAdministracion("consola");
    for (const valor of [
      consola.organizaciones,
      consola.organizacion("x"),
      consola.organizacionNueva,
      consola.usuarios,
      consola.holdings,
      consola.sistema,
      consola.onboarding,
    ]) {
      expect(valor.startsWith(`${paths.platform.administracion}/`), valor).toBe(true);
    }
  });
});

function paginas(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" ? [] : paginas(ruta);
    return e.name === "page.tsx" ? [ruta] : [];
  });
}

describe("⭐ las pantallas de la consola", () => {
  const COMPONENTES_CON_ENLACES =
    /<(OrganizationsList|OrganizationDetailView|CreateFounderForm|UsersTable|HoldingsAdminPanel|HoldingPortfolioContent|OnboardingDeClientes)\b[^>]*>/g;

  it.each(paginas(CONSOLA).map((p) => [relative(CONSOLA, p), p]))(
    "%s: cada componente con enlaces recibe base=\"consola\"",
    (_ruta, archivo) => {
      const codigo = readFileSync(archivo, "utf8");
      for (const [etiqueta] of codigo.matchAll(COMPONENTES_CON_ENLACES)) {
        expect(etiqueta).toContain('base="consola"');
      }
    }
  );

  it("el layout exige la experiencia y la lista de staff", () => {
    const layout = readFileSync(join(CONSOLA, "layout.tsx"), "utf8");
    expect(layout).toContain('exigirRutaDeLaExperiencia("/administracion")');
    expect(layout).toMatch(/if \(!\(await isStaffUser\(\)\)\) redirect\(/);
  });
});
