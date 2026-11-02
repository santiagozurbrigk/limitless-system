import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ACCESOS_DE_LA_ISLA,
  MENU_POR_EXPERIENCIA,
  RUTAS_EXTRA_POR_EXPERIENCIA,
  RUTAS_LIBRES,
  type EntradaDelMenu,
  type ExperienciaConMenuPropio,
} from "@/lib/navigation/menu-por-experiencia";
import {
  coincide,
  entradasListas,
  hijosVisiblesDelGrupo,
  pantallaDeInicio,
  redireccionPorExperiencia,
  rutaPermitidaParaLaExperiencia,
  segmentoDe,
  type PermisosDeLaBarra,
} from "@/lib/navigation/rutas-por-experiencia";
import { directModules, modulesWithChildren } from "@/lib/navigation/sidebar-modules";
import { emptyPermissions } from "@/constants/permission-modules";
import { permissionModuleForPath } from "@/lib/navigation/module-for-path";
import { NAV_ICON_NAMES } from "@/components/navigation/nav-icons";
import { ESCONDIDO } from "@/lib/release/escondido";
import type { OrganizationExperience } from "@/lib/organization/experience";
import { paths } from "@/routes/paths";
import { pantallas } from "./pantallas-de-app";

/**
 * SCRUM-524 · El menú de cada experiencia y las reglas de rutas por
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
const SOLO_VENTAS: PermisosDeLaBarra = {
  isFounder: false,
  modules: { ...emptyPermissions(), sales: "view" },
};
const SIN_NADA: PermisosDeLaBarra = { isFounder: false, modules: emptyPermissions() };

const CON_MENU_PROPIO = Object.keys(MENU_POR_EXPERIENCIA) as ExperienciaConMenuPropio[];
/**
 * Las tres experiencias. `ACCESOS_DE_LA_ISLA` es un `Record` de
 * `OrganizationExperience`: si se suma una experiencia sin agregarla ahí, no
 * compila. `lib/organization/experience.ts` no se importa: es `server-only`.
 */
const EXPERIENCIAS = Object.keys(ACCESOS_DE_LA_ISLA) as OrganizationExperience[];
const WEBINAR = MENU_POR_EXPERIENCIA.webinar;
const LIMITLESS = MENU_POR_EXPERIENCIA.limitless;

function conListas(menu: readonly EntradaDelMenu[], ...ids: string[]): EntradaDelMenu[] {
  return menu.map((entrada) => ({ ...entrada, lista: ids.includes(entrada.id) }));
}

/** Las pantallas de `app/` como URL, para saber si un `href` existe. */
const RUTAS_DE_PANTALLAS = new Set(pantallas(join(process.cwd(), "app")).map((p) => p.ruta));

describe("⭐ la config de los menús", () => {
  it("toda experiencia salvo full tiene menú propio, y full no", () => {
    expect([...EXPERIENCIAS].sort()).toEqual(["full", "limitless", "webinar"]);
    expect([...CON_MENU_PROPIO].sort()).toEqual(EXPERIENCIAS.filter((e) => e !== "full").sort());
  });

  it("la isla derecha: reportes y configuración pendiente sólo para full", () => {
    expect(ACCESOS_DE_LA_ISLA).toEqual({
      full: { reportes: true, configuracionPendiente: true },
      webinar: { reportes: false, configuracionPendiente: false },
      limitless: { reportes: false, configuracionPendiente: false },
    });
  });

  it("webinar: Inicio, Lanzamientos, Leads y Equipo, en ese orden (sin Llamadas; PO, 28-oct)", () => {
    expect(WEBINAR.map((e) => e.label)).toEqual(["Inicio", "Lanzamientos", "Leads", "Equipo"]);
  });

  it("limitless: Clientes, Tablero de trabajo, Ventas y Administración, en ese orden (PO, 28-oct)", () => {
    expect(LIMITLESS.map((e) => e.label)).toEqual([
      "Clientes",
      "Tablero de trabajo",
      "Ventas",
      "Administración",
    ]);
    expect(LIMITLESS.map((e) => segmentoDe(e.href))).toEqual([
      "/clients",
      "/workboard",
      "/sales",
      "/administracion",
    ]);
  });

  it("webinar hoy: sólo Equipo está lista (las demás pantallas son de 534, 529 y 537)", () => {
    expect(entradasListas(WEBINAR).map((e) => e.id)).toEqual(["equipo"]);
  });

  it("limitless hoy: Clientes, Tablero y Ventas listas; Administración (SCRUM-551) oculta", () => {
    expect(entradasListas(LIMITLESS).map((e) => e.id)).toEqual(["clientes", "tablero", "ventas"]);
  });

  it("⭐ limitless usa las pantallas del menú completo con el mismo nombre, ícono y permiso", () => {
    for (const id of ["clientes", "tablero"]) {
      const entrada = LIMITLESS.find((e) => e.id === id)!;
      const delMenuCompleto = directModules.find((m) => m.href === entrada.href);
      expect(delMenuCompleto, id).toBeDefined();
      expect({ label: entrada.label, icon: entrada.icon, permissionId: entrada.permissionId }).toEqual({
        label: delMenuCompleto!.label,
        icon: delMenuCompleto!.icon,
        permissionId: delMenuCompleto!.permissionId,
      });
    }
  });

  it("⭐ una entrada con grupo: el grupo existe, sus hijos viven en el segmento de la entrada con su permiso, y href es uno de ellos", () => {
    const conGrupo = CON_MENU_PROPIO.flatMap((x) => MENU_POR_EXPERIENCIA[x]).filter((e) => e.grupo);
    expect(conGrupo.map((e) => e.id)).toEqual(["ventas"]);
    for (const entrada of conGrupo) {
      const grupo = modulesWithChildren[entrada.grupo!];
      expect(grupo.label).toBe(entrada.label);
      expect(grupo.icon).toBe(entrada.icon);
      expect(grupo.children.map((c) => c.href)).toContain(entrada.href);
      for (const hijo of grupo.children) {
        expect(segmentoDe(hijo.href), hijo.href).toBe(segmentoDe(entrada.href));
        expect(hijo.permissionId, hijo.href).toBe(entrada.permissionId);
      }
    }
  });

  for (const experiencia of CON_MENU_PROPIO) {
    describe(experiencia, () => {
      const menu = MENU_POR_EXPERIENCIA[experiencia];

      it("⭐ toda entrada tiene módulo de permisos, y es el mismo que protege su ruta", () => {
        const mal = menu
          .filter((e) => permissionModuleForPath(e.href) !== e.permissionId)
          .map((e) => `${e.id} ${e.href} ${String(permissionModuleForPath(e.href))}`);
        expect(mal).toEqual([]);
      });

      it("ids y segmentos sin repetir, e íconos válidos", () => {
        expect(new Set(menu.map((e) => e.id)).size).toBe(menu.length);
        expect(new Set(menu.map((e) => segmentoDe(e.href))).size).toBe(menu.length);
        for (const entrada of menu) expect(NAV_ICON_NAMES).toContain(entrada.icon);
      });

      it("ninguna entrada es una ruta libre (las libres se abren solas)", () => {
        for (const entrada of menu) expect(RUTAS_LIBRES).not.toContain(segmentoDe(entrada.href));
      });

      it("hay al menos una entrada lista", () => {
        expect(entradasListas(menu).length).toBeGreaterThan(0);
      });

      it("⭐ toda entrada lista lleva a una pantalla que existe (puede ser la pantalla de inicio)", () => {
        const sinPantalla = entradasListas(menu)
          .filter((e) => !RUTAS_DE_PANTALLAS.has(e.href))
          .map((e) => `${e.id} ${e.href}`);
        expect(sinPantalla).toEqual([]);
      });
    });
  }

  it("el /lanzamientos de hoy sigue escondido para todos", () => {
    expect(ESCONDIDO.lanzamientos).toBe(true);
  });

  it("⭐ rutas extra (fuera del menú): limitless abre Integraciones, SOP y contexto del negocio; webinar, ninguna", () => {
    expect(Object.keys(RUTAS_EXTRA_POR_EXPERIENCIA).sort()).toEqual([...CON_MENU_PROPIO].sort());
    expect(RUTAS_EXTRA_POR_EXPERIENCIA.webinar).toEqual([]);
    expect(RUTAS_EXTRA_POR_EXPERIENCIA.limitless.map(segmentoDe)).toEqual([
      "/integrations",
      "/sops",
      "/business-context",
    ]);
  });

  for (const experiencia of CON_MENU_PROPIO) {
    it(`${experiencia}: una ruta extra es una pantalla que existe, no es una entrada del menú ni una libre, y su segmento tiene layout`, () => {
      const segmentosDelMenu = MENU_POR_EXPERIENCIA[experiencia].map((e) => segmentoDe(e.href));
      for (const extra of RUTAS_EXTRA_POR_EXPERIENCIA[experiencia]) {
        const segmento = segmentoDe(extra);
        expect(segmentosDelMenu, extra).not.toContain(segmento);
        expect(RUTAS_LIBRES, extra).not.toContain(segmento);
        expect(RUTAS_DE_PANTALLAS.has(extra), extra).toBe(true);
        expect(existsSync(join(process.cwd(), "app", "(platform)", segmento.slice(1), "layout.tsx")), extra).toBe(true);
      }
    });
  }

  it("las rutas libres son onboarding, holding y ajustes de la cuenta", () => {
    expect([...RUTAS_LIBRES]).toEqual(["/onboarding", "/holding", "/settings"]);
  });
});

describe("⭐ pantalla de inicio", () => {
  it("full: el Panel General, como siempre, con cualquier permiso", () => {
    expect(pantallaDeInicio("full", FOUNDER)).toBe("/dashboard");
    expect(pantallaDeInicio("full", SIN_EQUIPO)).toBe("/dashboard");
    expect(pantallaDeInicio("full", SIN_NADA)).toBe("/dashboard");
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
    expect(pantallaDeInicio("webinar", SIN_NADA)).toBe("/settings");
    expect(pantallaDeInicio("limitless", SIN_NADA)).toBe("/settings");
  });

  it("⭐ limitless: Clientes para el founder; la primera que ve un miembro por sus permisos", () => {
    expect(pantallaDeInicio("limitless", FOUNDER)).toBe("/clients");
    expect(pantallaDeInicio("limitless", SOLO_VENTAS)).toBe("/sales/inbox");
    expect(
      pantallaDeInicio("limitless", { isFounder: false, modules: { ...emptyPermissions(), workboard: "view" } })
    ).toBe("/workboard");
  });

  it("limitless, un miembro con sólo Finanzas: Ajustes mientras Administración no esté lista", () => {
    expect(pantallaDeInicio("limitless", SIN_EQUIPO)).toBe("/settings");
    expect(pantallaDeInicio("limitless", SIN_EQUIPO, conListas(LIMITLESS, "clientes", "administracion"))).toBe(
      "/administracion"
    );
  });

  it("webinar con Inicio lista: /inicio", () => {
    expect(pantallaDeInicio("webinar", FOUNDER, conListas(WEBINAR, "inicio", "equipo"))).toBe("/inicio");
  });

  it("Inicio gana aunque no sea la primera del menú", () => {
    const menu = [...conListas(WEBINAR, "inicio", "leads")].reverse();
    expect(pantallaDeInicio("webinar", FOUNDER, menu)).toBe("/inicio");
  });

  it("Inicio lista pero sin permiso de Panel: la primera que se ve", () => {
    const menu = conListas(WEBINAR, "inicio", "leads", "equipo");
    expect(pantallaDeInicio("webinar", { ...CON_EQUIPO, modules: { ...CON_EQUIPO.modules, sales: "view" } }, menu)).toBe("/leads");
  });

  it("sin Inicio: la primera lista en el orden del menú", () => {
    expect(pantallaDeInicio("webinar", FOUNDER, conListas(WEBINAR, "equipo", "leads"))).toBe("/leads");
  });

  it("sin ninguna lista: Ajustes, que es libre (no hay bucle)", () => {
    for (const experiencia of CON_MENU_PROPIO) {
      const vacio = conListas(MENU_POR_EXPERIENCIA[experiencia]);
      expect(pantallaDeInicio(experiencia, FOUNDER, vacio)).toBe("/settings");
      expect(redireccionPorExperiencia(experiencia, "/settings", FOUNDER, vacio)).toBeNull();
    }
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
    "/sales/inbox",
    "/sales/llamadas",
    "/clients",
    "/clients/abc",
    "/workboard",
    "/integrations",
    "/inicio",
    "/leads",
    "/llamadas",
    "/administracion",
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

  it("⭐ limitless: Clientes, Tablero y todo Ventas (con sus subrutas), Integraciones y las libres; ni Equipo ni Administración", () => {
    const abiertas = plataforma.filter((ruta) => rutaPermitidaParaLaExperiencia("limitless", ruta));
    expect(abiertas).toEqual([
      "/sales/inbox",
      "/sales/llamadas",
      "/clients",
      "/clients/abc",
      "/workboard",
      "/integrations",
      "/settings",
      "/holding",
      "/onboarding/holding",
    ]);
  });

  it("webinar: el resto, incluidas las rutas anidadas, va a Equipo (las entradas no listas, en cuanto su carpeta exista)", () => {
    for (const ruta of ["/finance", "/marketing", "/lanzamientos", "/finance/expenses", "/inicio", "/leads", "/llamadas", "/dashboard", "/clients"]) {
      expect(redireccionPorExperiencia("webinar", ruta, FOUNDER)).toBe("/team");
    }
  });

  // La decisión de la función. En la app la aplica el layout del segmento:
  // `/administracion`, `/inicio` y `/leads` todavía no tienen carpeta y dan 404
  // (ver "entradas no listas" más abajo).
  it("⭐ limitless: el resto va a Clientes (para Administración, en cuanto su carpeta exista)", () => {
    for (const ruta of ["/dashboard", "/finance", "/marketing", "/team", "/administracion", "/inicio", "/lanzamientos"]) {
      expect(redireccionPorExperiencia("limitless", ruta, FOUNDER)).toBe("/clients");
    }
    expect(redireccionPorExperiencia("limitless", "/dashboard", SOLO_VENTAS)).toBe("/sales/inbox");
  });

  it("⭐ limitless abre las pantallas fuera del menú adonde enlazan la Bandeja y el Tablero; webinar las manda a Equipo", () => {
    // sales-inbox-layout y zernio-inbox-panel: «Conectar integración», «Conectar
    // Zernio», «Gestionar Zernio». workboard-task-resources: el SOP vinculado y
    // los documentos del contexto del negocio de una tarea.
    const enlazadas = [
      paths.platform.integrations,
      paths.platform.integrationsDiscord,
      paths.platform.sops.detail("abc"),
      paths.platform.businessContext.viewer("abc"),
      paths.platform.businessContext.documents,
    ];
    for (const ruta of enlazadas) {
      expect(rutaPermitidaParaLaExperiencia("limitless", ruta), ruta).toBe(true);
      expect(redireccionPorExperiencia("limitless", ruta, FOUNDER), ruta).toBeNull();
      expect(redireccionPorExperiencia("webinar", ruta, FOUNDER), ruta).toBe("/team");
    }
    // La biblioteca de SOP (/operations/sops) no: nadie de limitless enlaza ahí.
    // `/sops/create` sí pasa el bloqueo, pero next.config la manda a la biblioteca.
    expect(rutaPermitidaParaLaExperiencia("limitless", paths.platform.sops.library)).toBe(false);
  });

  it("un prefijo cuenta sólo si es un segmento entero", () => {
    expect(rutaPermitidaParaLaExperiencia("webinar", "/teamwork")).toBe(false);
    expect(rutaPermitidaParaLaExperiencia("webinar", "/settingsx")).toBe(false);
    expect(rutaPermitidaParaLaExperiencia("limitless", "/salesforce")).toBe(false);
    expect(rutaPermitidaParaLaExperiencia("limitless", "/clientsx")).toBe(false);
  });

  it("cuando una entrada se marca lista, su ruta se abre", () => {
    const menu = conListas(WEBINAR, "leads", "equipo");
    expect(redireccionPorExperiencia("webinar", "/leads", FOUNDER, menu)).toBeNull();
    expect(redireccionPorExperiencia("webinar", "/leads/abc", FOUNDER, menu)).toBeNull();
    expect(redireccionPorExperiencia("webinar", "/inicio", FOUNDER, menu)).toBe("/leads");
    const conAdministracion = conListas(LIMITLESS, "clientes", "administracion");
    expect(redireccionPorExperiencia("limitless", "/administracion", FOUNDER, conAdministracion)).toBeNull();
  });

  it("⭐ el destino de una redirección siempre es una ruta abierta (no hay bucle), en las tres experiencias", () => {
    for (const experiencia of EXPERIENCIAS) {
      for (const permisos of [FOUNDER, CON_EQUIPO, SIN_EQUIPO, SOLO_VENTAS, SIN_NADA]) {
        expect(rutaPermitidaParaLaExperiencia(experiencia, pantallaDeInicio(experiencia, permisos))).toBe(true);
      }
    }
  });
});

describe("⭐ entradas no listas: qué ve hoy quien tipea su URL (fix-pack 1 de A1, BLQ-2)", () => {
  // Redirige sólo si hay una pantalla en esa URL y el layout de su segmento en
  // `app/(platform)` llama a `exigirRutaDeLaExperiencia` (para una pantalla
  // nueva lo exige `rutas-por-experiencia-en-disco.test.ts`). Si no hay
  // pantalla, Next no ejecuta ningún layout de segmento y sirve
  // `app/not-found.tsx`, el 404 sin la barra.
  const PANTALLAS = pantallas(join(process.cwd(), "app"));

  function queVe(href: string): "404" | "redirige" | "pantalla sin bloqueo" {
    const hayPantalla = PANTALLAS.some((p) => p.ruta === href || p.ruta.startsWith(`${href}/`));
    if (!hayPantalla) return "404";
    const layout = join(process.cwd(), "app", "(platform)", segmentoDe(href).slice(1), "layout.tsx");
    const bloquea =
      existsSync(layout) && readFileSync(layout, "utf8").includes(`exigirRutaDeLaExperiencia("${segmentoDe(href)}")`);
    return bloquea ? "redirige" : "pantalla sin bloqueo";
  }

  it("Inicio, Leads y Administración no tienen pantalla: 404; Lanzamientos tiene pantalla y layout con el bloqueo: redirige", () => {
    const resultado = Object.fromEntries(
      CON_MENU_PROPIO.flatMap((experiencia) =>
        MENU_POR_EXPERIENCIA[experiencia]
          .filter((e) => !e.lista)
          .map((e) => [`${experiencia} ${e.href}`, queVe(e.href)])
      )
    );
    expect(resultado).toEqual({
      "webinar /inicio": "404",
      "webinar /lanzamientos": "redirige",
      "webinar /leads": "404",
      "limitless /administracion": "404",
    });
  });

  it("ninguna pantalla dinámica de primer nivel las atrapa (no hay [slug] ni [...todo] en la raíz)", () => {
    const dinamicas = PANTALLAS.filter((p) => /^\/\[/.test(p.ruta)).map((p) => p.ruta);
    expect(dinamicas).toEqual([]);
  });
});

/**
 * Las entradas listas cuyo layout de segmento las sigue escondiendo con una
 * bandera de `ESCONDIDO` que está en `true`. Ese layout manda a `/dashboard`, el
 * layout de `/dashboard` manda a la pantalla de inicio y, si esa entrada es la
 * primera lista, la pantalla de inicio es ella misma: bucle de redirecciones.
 */
function entradasListasEscondidas(menu: readonly EntradaDelMenu[]): string[] {
  const problemas: string[] = [];
  for (const entrada of menu.filter((e) => e.lista)) {
    const segmento = segmentoDe(entrada.href);
    const layout = join(process.cwd(), "app", "(platform)", segmento.slice(1), "layout.tsx");
    if (!existsSync(layout)) continue;
    for (const [, bandera] of readFileSync(layout, "utf8").matchAll(/ESCONDIDO\.(\w+)/g)) {
      if (ESCONDIDO[bandera as keyof typeof ESCONDIDO]) {
        problemas.push(
          `${entrada.label} está lista en MENU_POR_EXPERIENCIA pero app/(platform)${segmento}/layout.tsx la sigue ` +
            `escondiendo con ESCONDIDO.${bandera} = true: ese layout manda a /dashboard, /dashboard manda a la ` +
            `pantalla de inicio, que puede ser ${entrada.href} otra vez (bucle de redirecciones). Al encenderla, ` +
            `pon la bandera en false o saca ese redirect del layout para las organizaciones de esa experiencia.`
        );
      }
    }
  }
  return problemas;
}

describe("⭐ invariante: una entrada lista no puede seguir escondida (SCRUM-529 al encender Lanzamientos)", () => {
  it("ninguna entrada lista de ningún menú está escondida por ESCONDIDO", () => {
    for (const experiencia of CON_MENU_PROPIO) {
      expect(entradasListasEscondidas(MENU_POR_EXPERIENCIA[experiencia])).toEqual([]);
    }
  });

  it("la regla ve el caso de hoy: Lanzamientos lista con ESCONDIDO.lanzamientos en true", () => {
    const problemas = entradasListasEscondidas(conListas(WEBINAR, "lanzamientos", "equipo"));
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toContain("ESCONDIDO.lanzamientos");
    expect(problemas[0]).toContain("bucle de redirecciones");
  });
});

describe("⭐ una sola regla para la barra, la paleta y el bloqueo (fix-pack 1 de A1, MNR-3 y MNR-4)", () => {
  const GRUPO = {
    children: [
      { label: "Bandeja", href: "/sales/inbox", permissionId: "sales" as const },
      { label: "Escondido", href: "/sales/x", permissionId: "sales" as const, hidden: true },
      { label: "Sin módulo", href: "/sales/y" },
      { label: "Finanzas", href: "/sales/z", permissionId: "finance" as const },
    ],
  };

  it("hijosVisiblesDelGrupo: sin los escondidos; sin módulo, sólo el founder; el resto, por su módulo", () => {
    expect(hijosVisiblesDelGrupo(FOUNDER, GRUPO).map((h) => h.label)).toEqual(["Bandeja", "Sin módulo", "Finanzas"]);
    expect(hijosVisiblesDelGrupo(SOLO_VENTAS, GRUPO).map((h) => h.label)).toEqual(["Bandeja"]);
    expect(hijosVisiblesDelGrupo(SIN_NADA, GRUPO)).toEqual([]);
  });

  it("coincide: el prefijo o algo que cuelga de él, por segmentos enteros", () => {
    expect(coincide("/sales", "/sales")).toBe(true);
    expect(coincide("/sales/inbox", "/sales")).toBe(true);
    expect(coincide("/salesforce", "/sales")).toBe(false);
  });

  // La barra y la paleta no vuelven a escribir el filtro de hijos ni la regla
  // de permiso de una entrada, y la barra de un menú propio no vuelve a
  // escribir `coincide`: usan las funciones de `rutas-por-experiencia.ts`.
  it("la barra y la paleta usan hijosVisiblesDelGrupo; sidebar-modules usa coincide", () => {
    const leer = (archivo: string) => readFileSync(join(process.cwd(), archivo), "utf8");
    const paleta = leer("components/navigation/command-palette.tsx");
    const barra = leer("components/navigation/notch-nav/platform-notch-nav.tsx");
    const sidebar = leer("lib/navigation/sidebar-modules.ts");
    for (const [nombre, codigo] of [
      ["command-palette.tsx", paleta],
      ["platform-notch-nav.tsx", barra],
    ] as const) {
      expect(codigo, nombre).toContain("hijosVisiblesDelGrupo(");
      // El filtro de hijos de antes: `.filter((c) => !c.hidden && canSeeNavItem(...))`.
      expect(codigo, nombre).not.toMatch(/\.filter\(\s*\(\s*\w+\s*\)\s*=>\s*!\s*\w+\.hidden\s*&&\s*canSeeNavItem\(/);
    }
    expect(paleta).not.toMatch(/permisos\.modules\[\w+\]\s*\?\?\s*"none"/);
    expect(sidebar).toContain("coincide(pathname, segmentoDe(entrada.href))");
    expect(sidebar).not.toMatch(/pathname\.startsWith\(`\$\{segmentoDe\(entrada\.href\)\}\/`\)/);
  });
});
