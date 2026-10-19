import { describe, expect, it } from "vitest";
import { MENU_WEBINAR, RUTAS_LIBRES_WEBINAR, type EntradaDelMenuWebinar } from "@/lib/navigation/menu-webinar";
import {
  entradasListas,
  pantallaDeInicio,
  redireccionPorExperiencia,
  rutaPermitidaParaLaExperiencia,
} from "@/lib/navigation/rutas-por-experiencia";
import { permissionModuleForPath } from "@/lib/navigation/module-for-path";
import { NAV_ICON_NAMES } from "@/components/navigation/nav-icons";
import { ESCONDIDO } from "@/lib/release/escondido";

/**
 * SCRUM-524 · El menú de Limitless Webinars y las reglas de rutas por
 * experiencia, como lógica pura. Cómo se aplican en `app/` lo prueban
 * `rutas-por-experiencia-en-disco.test.ts` y
 * `app/__tests__/bloqueo-por-experiencia.test.ts`.
 */

function conListas(...ids: EntradaDelMenuWebinar["id"][]): EntradaDelMenuWebinar[] {
  return MENU_WEBINAR.map((entrada) => ({ ...entrada, lista: ids.includes(entrada.id) }));
}

describe("⭐ la config del menú webinar", () => {
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
  it("full: el Panel General, como siempre", () => {
    expect(pantallaDeInicio("full")).toBe("/dashboard");
  });

  it("webinar hoy: la primera entrada lista, Equipo", () => {
    expect(pantallaDeInicio("webinar")).toBe("/team");
  });

  it("webinar con Inicio lista: /inicio", () => {
    expect(pantallaDeInicio("webinar", conListas("inicio", "equipo"))).toBe("/inicio");
  });

  it("Inicio gana aunque no sea la primera del menú", () => {
    const menu = [...conListas("inicio", "leads")].reverse();
    expect(pantallaDeInicio("webinar", menu)).toBe("/inicio");
  });

  it("sin Inicio: la primera lista en el orden del menú", () => {
    expect(pantallaDeInicio("webinar", conListas("llamadas", "leads"))).toBe("/leads");
  });

  it("sin ninguna lista: Ajustes, que es libre (no hay bucle)", () => {
    expect(pantallaDeInicio("webinar", conListas())).toBe("/settings");
    expect(redireccionPorExperiencia("webinar", "/settings", conListas())).toBeNull();
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
    for (const ruta of plataforma) expect(redireccionPorExperiencia("full", ruta)).toBeNull();
  });

  it("webinar: las entradas listas (con sus subrutas) y las libres", () => {
    const abiertas = plataforma.filter((ruta) => rutaPermitidaParaLaExperiencia("webinar", ruta));
    expect(abiertas).toEqual(["/team", "/team/roles", "/settings", "/holding", "/onboarding/holding"]);
  });

  it("webinar: el resto, incluidas las entradas no listas y las rutas anidadas, va a Equipo", () => {
    for (const ruta of ["/finance", "/marketing", "/lanzamientos", "/finance/expenses", "/inicio", "/leads", "/dashboard"]) {
      expect(redireccionPorExperiencia("webinar", ruta)).toBe("/team");
    }
  });

  it("un prefijo cuenta sólo si es un segmento entero", () => {
    expect(rutaPermitidaParaLaExperiencia("webinar", "/teamwork")).toBe(false);
    expect(rutaPermitidaParaLaExperiencia("webinar", "/settingsx")).toBe(false);
  });

  it("cuando una entrada se marca lista, su ruta se abre", () => {
    const menu = conListas("leads", "equipo");
    expect(redireccionPorExperiencia("webinar", "/leads", menu)).toBeNull();
    expect(redireccionPorExperiencia("webinar", "/leads/abc", menu)).toBeNull();
    expect(redireccionPorExperiencia("webinar", "/llamadas", menu)).toBe("/leads");
  });

  it("el destino de una redirección siempre es una ruta abierta (no hay bucle)", () => {
    for (const experiencia of ["full", "webinar"] as const) {
      expect(rutaPermitidaParaLaExperiencia(experiencia, pantallaDeInicio(experiencia))).toBe(true);
    }
  });
});
