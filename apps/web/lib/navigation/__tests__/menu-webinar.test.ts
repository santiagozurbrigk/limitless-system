import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ACCESOS_DE_LA_ISLA,
  MENU_WEBINAR,
  RUTAS_LIBRES_WEBINAR,
  type EntradaDelMenuWebinar,
} from "@/lib/navigation/menu-webinar";
import {
  entradasListas,
  pantallaDeInicio,
  redireccionPorExperiencia,
  rutaPermitidaParaLaExperiencia,
  type PermisosDeLaBarra,
} from "@/lib/navigation/rutas-por-experiencia";
import { emptyPermissions } from "@/constants/permission-modules";
import { permissionModuleForPath } from "@/lib/navigation/module-for-path";
import { NAV_ICON_NAMES } from "@/components/navigation/nav-icons";
import { ESCONDIDO } from "@/lib/release/escondido";

/**
 * SCRUM-524 · El menú de Limitless Webinars y las reglas de rutas por
 * experiencia, como lógica pura. Cómo se aplican en `app/` lo prueban
 * `rutas-por-experiencia-en-disco.test.ts` y
 * `app/__tests__/bloqueo-por-experiencia.test.ts`.
 */

const FOUNDER: PermisosDeLaBarra = { isFounder: true, modules: emptyPermissions() };
const CON_EQUIPO: PermisosDeLaBarra = {
  isFounder: false,
  modules: { ...emptyPermissions(), team: "view" },
};
const SIN_EQUIPO: PermisosDeLaBarra = {
  isFounder: false,
  modules: { ...emptyPermissions(), finance: "full", settings: "view" },
};

function conListas(...ids: EntradaDelMenuWebinar["id"][]): EntradaDelMenuWebinar[] {
  return MENU_WEBINAR.map((entrada) => ({ ...entrada, lista: ids.includes(entrada.id) }));
}

describe("⭐ la config del menú webinar", () => {
  it("la isla derecha: reportes y configuración pendiente sólo para full", () => {
    expect(ACCESOS_DE_LA_ISLA).toEqual({
      full: { reportes: true, configuracionPendiente: true },
      webinar: { reportes: false, configuracionPendiente: false },
    });
  });

  it("Inicio, Lanzamientos, Leads, Llamadas y Equipo, en ese orden (decisión del PO)", () => {
    expect(MENU_WEBINAR.map((e) => e.label)).toEqual([
      "Inicio",
      "Lanzamientos",
      "Leads",
      "Llamadas",
      "Equipo",
    ]);
  });

  it("hoy sólo Equipo está lista: las demás pantallas son de 534, 529 y 537", () => {
    expect(entradasListas().map((e) => e.id)).toEqual(["equipo"]);
  });

  it("⭐ toda entrada tiene módulo de permisos, y es el mismo que protege su ruta", () => {
    const sinModulo = MENU_WEBINAR.filter(
      (e) => permissionModuleForPath(e.href) === null || permissionModuleForPath(e.href) !== e.permissionId
    ).map((e) => `${e.id} ${e.href} ${String(permissionModuleForPath(e.href))}`);
    expect(sinModulo).toEqual([]);
  });

  it("toda entrada es un solo segmento (el bloqueo se decide en el layout de primer nivel)", () => {
    for (const entrada of MENU_WEBINAR) {
      expect(entrada.href).toMatch(/^\/[a-z0-9-]+$/);
    }
  });

  it("rutas e íconos sin repetir y con nombre de ícono válido", () => {
    expect(new Set(MENU_WEBINAR.map((e) => e.href)).size).toBe(MENU_WEBINAR.length);
    for (const entrada of MENU_WEBINAR) expect(NAV_ICON_NAMES).toContain(entrada.icon);
  });

  it("hay al menos una entrada lista", () => {
    expect(entradasListas().length).toBeGreaterThan(0);
  });

  it("el /lanzamientos de hoy sigue escondido para todos", () => {
    expect(ESCONDIDO.lanzamientos).toBe(true);
  });

  it("las rutas libres son onboarding, holding y ajustes de la cuenta", () => {
    expect([...RUTAS_LIBRES_WEBINAR]).toEqual(["/onboarding", "/holding", "/settings"]);
  });
});

describe("⭐ pantalla de inicio", () => {
  it("full: el Panel General, como siempre, con cualquier permiso", () => {
    expect(pantallaDeInicio("full", FOUNDER)).toBe("/dashboard");
    expect(pantallaDeInicio("full", SIN_EQUIPO)).toBe("/dashboard");
  });

  it("webinar hoy: la primera entrada lista que se ve, Equipo", () => {
    expect(pantallaDeInicio("webinar", FOUNDER)).toBe("/team");
    expect(pantallaDeInicio("webinar", CON_EQUIPO)).toBe("/team");
  });

  it("⭐ webinar, un miembro sin Equipo: Ajustes, no una pantalla con «No tenés acceso»", () => {
    expect(pantallaDeInicio("webinar", SIN_EQUIPO)).toBe("/settings");
    expect(redireccionPorExperiencia("webinar", "/finance", SIN_EQUIPO)).toBe("/settings");
  });

  it("un miembro sin rol cargado (todo en none) tampoco ve entradas: Ajustes", () => {
    expect(pantallaDeInicio("webinar", { isFounder: false, modules: emptyPermissions() })).toBe("/settings");
  });

  it("webinar con Inicio lista: /inicio", () => {
    expect(pantallaDeInicio("webinar", FOUNDER, conListas("inicio", "equipo"))).toBe("/inicio");
  });

  it("Inicio gana aunque no sea la primera del menú", () => {
    const menu = [...conListas("inicio", "leads")].reverse();
    expect(pantallaDeInicio("webinar", FOUNDER, menu)).toBe("/inicio");
  });

  it("Inicio lista pero sin permiso de Panel: la primera que se ve", () => {
    const menu = conListas("inicio", "leads", "equipo");
    expect(pantallaDeInicio("webinar", { ...CON_EQUIPO, modules: { ...CON_EQUIPO.modules, sales: "view" } }, menu)).toBe("/leads");
  });

  it("sin Inicio: la primera lista en el orden del menú", () => {
    expect(pantallaDeInicio("webinar", FOUNDER, conListas("llamadas", "leads"))).toBe("/leads");
  });

  it("sin ninguna lista: Ajustes, que es libre (no hay bucle)", () => {
    expect(pantallaDeInicio("webinar", FOUNDER, conListas())).toBe("/settings");
    expect(redireccionPorExperiencia("webinar", "/settings", FOUNDER, conListas())).toBeNull();
  });
});

describe("⭐ rutas por experiencia", () => {
  const plataforma = [
    "/dashboard",
    "/finance",
    "/finance/expenses",
    "/marketing",
    "/marketing/content/abc",
    "/lanzamientos",
    "/lanzamientos/abc",
    "/sales/llamadas",
    "/clients/abc",
    "/integrations",
    "/inicio",
    "/leads",
    "/llamadas",
    "/team",
    "/team/roles",
    "/settings",
    "/holding",
    "/onboarding/holding",
  ];

  it("full abre todas las rutas: nada se redirige", () => {
    for (const ruta of plataforma) expect(redireccionPorExperiencia("full", ruta, FOUNDER)).toBeNull();
  });

  it("webinar: las entradas listas (con sus subrutas) y las libres", () => {
    const abiertas = plataforma.filter((ruta) => rutaPermitidaParaLaExperiencia("webinar", ruta));
    expect(abiertas).toEqual(["/team", "/team/roles", "/settings", "/holding", "/onboarding/holding"]);
  });

  it("webinar: el resto, incluidas las entradas no listas y las rutas anidadas, va a Equipo", () => {
    for (const ruta of ["/finance", "/marketing", "/lanzamientos", "/finance/expenses", "/inicio", "/leads", "/dashboard"]) {
      expect(redireccionPorExperiencia("webinar", ruta, FOUNDER)).toBe("/team");
    }
  });

  it("un prefijo cuenta sólo si es un segmento entero", () => {
    expect(rutaPermitidaParaLaExperiencia("webinar", "/teamwork")).toBe(false);
    expect(rutaPermitidaParaLaExperiencia("webinar", "/settingsx")).toBe(false);
  });

  it("cuando una entrada se marca lista, su ruta se abre", () => {
    const menu = conListas("leads", "equipo");
    expect(redireccionPorExperiencia("webinar", "/leads", FOUNDER, menu)).toBeNull();
    expect(redireccionPorExperiencia("webinar", "/leads/abc", FOUNDER, menu)).toBeNull();
    expect(redireccionPorExperiencia("webinar", "/llamadas", FOUNDER, menu)).toBe("/leads");
  });

  it("el destino de una redirección siempre es una ruta abierta (no hay bucle)", () => {
    for (const experiencia of ["full", "webinar"] as const) {
      for (const permisos of [FOUNDER, CON_EQUIPO, SIN_EQUIPO]) {
        expect(rutaPermitidaParaLaExperiencia(experiencia, pantallaDeInicio(experiencia, permisos))).toBe(true);
      }
    }
  });
});

/**
 * Las entradas listas cuyo layout de segmento las sigue escondiendo con una
 * bandera de `ESCONDIDO` que está en `true`. Ese layout manda a `/dashboard`, el
 * layout de `/dashboard` manda a la pantalla de inicio y, si esa entrada es la
 * primera lista, la pantalla de inicio es ella misma: bucle de redirecciones.
 */
function entradasListasEscondidas(menu: readonly EntradaDelMenuWebinar[]): string[] {
  const problemas: string[] = [];
  for (const entrada of menu.filter((e) => e.lista)) {
    const layout = join(process.cwd(), "app", "(platform)", entrada.href.slice(1), "layout.tsx");
    if (!existsSync(layout)) continue;
    for (const [, bandera] of readFileSync(layout, "utf8").matchAll(/ESCONDIDO\.(\w+)/g)) {
      if (ESCONDIDO[bandera as keyof typeof ESCONDIDO]) {
        problemas.push(
          `${entrada.label} está lista en MENU_WEBINAR pero app/(platform)${entrada.href}/layout.tsx la sigue ` +
            `escondiendo con ESCONDIDO.${bandera} = true: ese layout manda a /dashboard, /dashboard manda a la ` +
            `pantalla de inicio, que puede ser ${entrada.href} otra vez (bucle de redirecciones). Al encenderla, ` +
            `pon la bandera en false o saca ese redirect del layout para las organizaciones webinar.`
        );
      }
    }
  }
  return problemas;
}

describe("⭐ invariante: una entrada lista no puede seguir escondida (SCRUM-529 al encender Lanzamientos)", () => {
  it("ninguna entrada lista del menú webinar está escondida por ESCONDIDO", () => {
    expect(entradasListasEscondidas(MENU_WEBINAR)).toEqual([]);
  });

  it("la regla ve el caso de hoy: Lanzamientos lista con ESCONDIDO.lanzamientos en true", () => {
    const problemas = entradasListasEscondidas(conListas("lanzamientos", "equipo"));
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toContain("ESCONDIDO.lanzamientos");
    expect(problemas[0]).toContain("bucle de redirecciones");
  });
});
