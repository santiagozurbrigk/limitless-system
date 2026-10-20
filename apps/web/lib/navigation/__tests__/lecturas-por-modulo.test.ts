import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { permissionModuleForPath } from "@/lib/navigation/module-for-path";
import { pantallas, segmentosAlEntrar } from "./pantallas-de-app";
import {
  GrafoDeImports,
  NOMBRE_DE_LECTURA,
  entradasDeApp,
  guardiaDe,
  layoutLee,
} from "./lecturas-de-app";

/**
 * SCRUM-540 · Las lecturas de las pantallas chequean el módulo antes de leer.
 *
 * El layout de la plataforma decide qué se dibuja, pero no frena la página:
 * Next la ejecuta igual y sus datos viajan en la respuesta, y en una
 * navegación del cliente ese layout ni se vuelve a ejecutar. Este test exige
 * el chequeo donde sí corta:
 *
 *   1. Toda página con módulo arranca con `exigirModuloDeLaPagina("<módulo>")`
 *      y el módulo es el de `module-for-path` para su ruta.
 *   2. Todo layout con módulo que lee (es de cliente o importa algo más que
 *      navegación y banderas) también.
 *   3. Toda Server Action de lectura que sólo alcanzan pantallas de un módulo
 *      arranca con `rechazoPorModulo("<módulo>")`, salvo las de la lista de
 *      deuda conocida, que tiene que achicarse y nunca crecer.
 *
 * Lo que NO ve (documentado en `docs/arquitectura/auth-organizaciones-y-permisos.md`):
 *   - una action de lectura cuyo nombre no empieza con un verbo de lectura
 *     (`NOMBRE_DE_LECTURA`);
 *   - una action que alcanzan pantallas de dos módulos, una ruta libre o el
 *     marco de la plataforma (`(platform)/layout.tsx`: la barra, la paleta y
 *     los providers globales): ahí no hay un único módulo que exigir;
 *   - una import que no es estático ni `import("literal")`, o un alias que no
 *     es `@/`;
 *   - funciones de servidor que no son Server Actions (`lib/<dominio>/queries.ts`):
 *     ésas sólo las llaman componentes de servidor, y quedan cortadas por el
 *     guardia de la página.
 */

const WEB = process.cwd();
const APP_DIR = join(WEB, "app");

function rutaDeCarpeta(appDir: string, carpeta: string): string {
  const partes = relative(appDir, carpeta).split(sep).filter(Boolean);
  let segmentos: string[] = [];
  for (const p of partes) segmentos = segmentosAlEntrar(segmentos, p);
  return `/${segmentos.join("/")}`;
}

function esLayout(archivo: string): boolean {
  return /[\\/]layout\.(tsx|ts|jsx|js)$/.test(archivo);
}

/**
 * ⭐ Deuda conocida: Server Actions de lectura de un solo módulo que todavía
 * no chequean el permiso (devuelven el dato directo, sin `MutationResult`, y
 * sumarles el rechazo cambia la forma que esperan sus pantallas). Las
 * pantallas que las llaman ya no se dibujan sin el módulo (guardia de la
 * página), así que sólo se alcanzan llamándolas a mano. Ítem
 * `[PERMISOS-ACTIONS-LECTURA-SIN-MODULO]` en PENDIENTES. Al chequear una,
 * sacala de acá: el test falla si queda una que ya chequea.
 */
const LECTURAS_SIN_CHEQUEO_CONOCIDAS: string[] = [];

describe("guardia en páginas y layouts con módulo", () => {
  const todas = pantallas(APP_DIR);
  const conModulo = todas.filter((p) => permissionModuleForPath(p.ruta) !== null);

  it("el recorrido encuentra las pantallas con módulo, incluidas las anidadas y dinámicas", () => {
    const rutas = conModulo.map((p) => p.ruta);
    expect(rutas).toContain("/sops/[id]");
    expect(rutas).toContain("/operations/sops");
    expect(rutas).toContain("/clients");
    expect(conModulo.length).toBeGreaterThan(60);
  });

  it("⭐ toda página con módulo corta con el guardia antes de leer, con el módulo de su ruta", () => {
    const mal = conModulo
      .map((p) => {
        const g = guardiaDe(join(APP_DIR, p.archivo));
        const esperado = permissionModuleForPath(p.ruta);
        if (g.estado === "falta") return `${p.ruta} (app/${p.archivo}): ${g.motivo}`;
        if (g.modulo !== esperado) return `${p.ruta} (app/${p.archivo}): pide ${g.modulo}, la ruta es de ${esperado}`;
        return null;
      })
      .filter(Boolean);
    expect(mal).toEqual([]);
  });

  it("⭐ todo layout con módulo que lee corta con el guardia, con el módulo de su ruta", () => {
    const layouts = [...new Set(todas.flatMap((p) => p.layouts))];
    const mal = layouts
      .map((archivo) => {
        const ruta = rutaDeCarpeta(APP_DIR, dirname(archivo));
        const esperado = permissionModuleForPath(ruta);
        if (esperado === null || !layoutLee(archivo)) return null;
        const g = guardiaDe(archivo);
        const rel = relative(APP_DIR, archivo);
        if (g.estado === "falta") return `${ruta} (app/${rel}): ${g.motivo}`;
        if (g.modulo !== esperado) return `${ruta} (app/${rel}): pide ${g.modulo}, la ruta es de ${esperado}`;
        return null;
      })
      .filter(Boolean);
    expect(mal).toEqual([]);
  });

  it("el layout de /agent lee (provider de cliente) y por eso lleva el guardia", () => {
    const agente = join(APP_DIR, "(platform)", "agent", "layout.tsx");
    expect(layoutLee(agente)).toBe(true);
    expect(guardiaDe(agente)).toEqual({ estado: "ok", modulo: "agent" });
  });
});

describe("Server Actions de lectura de un módulo", () => {
  const grafo = new GrafoDeImports(WEB);
  const entradas = entradasDeApp(APP_DIR);

  /** Por cada action de lectura, los módulos de las entradas que la alcanzan ("fuera" si no hay). */
  const modulosPorAccion = new Map<string, Set<string>>();
  for (const entrada of entradas) {
    const esPantalla = /[\\/](page|layout)\.(tsx|ts|jsx|js)$/.test(entrada);
    const modulo = esPantalla ? permissionModuleForPath(rutaDeCarpeta(APP_DIR, dirname(entrada))) : null;
    for (const accion of grafo.accionesDesde(entrada)) {
      if (!NOMBRE_DE_LECTURA.test(accion.split("#")[1]!)) continue;
      const set = modulosPorAccion.get(accion) ?? new Set<string>();
      set.add(modulo ?? "fuera");
      modulosPorAccion.set(accion, set);
    }
  }
  const deUnModulo = [...modulosPorAccion]
    .filter(([, mods]) => mods.size === 1 && !mods.has("fuera"))
    .map(([accion, mods]) => ({ accion, modulo: [...mods][0]! }));

  it("el recorrido encuentra las lecturas que se sabe que existen", () => {
    const nombres = deUnModulo.map((a) => a.accion);
    expect(nombres).toContain("app/intelligence/actions.ts#getIntelligenceSnapshotAction");
    expect(nombres).toContain("app/sops/actions.ts#getSOPVersionsAction");
    // La del marco de la plataforma no es de un solo módulo.
    expect(modulosPorAccion.get("app/clients/actions.ts#listClientsAction")?.has("fuera")).toBe(true);
  });

  it("⭐ toda action de lectura de un solo módulo arranca con rechazoPorModulo de ese módulo", () => {
    const mal = deUnModulo
      .filter((a) => !LECTURAS_SIN_CHEQUEO_CONOCIDAS.includes(a.accion))
      .map((a) => {
        const chequeo = grafo.chequeoDeLaAccion(a.accion);
        if (chequeo === null) return `${a.accion}: no arranca con rechazoPorModulo("${a.modulo}")`;
        if (chequeo !== a.modulo) return `${a.accion}: chequea ${chequeo}, la usan pantallas de ${a.modulo}`;
        return null;
      })
      .filter(Boolean);
    expect(mal).toEqual([]);
  });

  it("la lista de deuda sólo tiene lecturas que existen y que todavía no chequean", () => {
    const vigentes = new Set(deUnModulo.map((a) => a.accion));
    const sobran = LECTURAS_SIN_CHEQUEO_CONOCIDAS.filter(
      (a) => !vigentes.has(a) || grafo.chequeoDeLaAccion(a) !== null
    );
    expect(sobran).toEqual([]);
  });

  it("una action que chequea un módulo lo hace con el mismo módulo que sus pantallas", () => {
    const mal = deUnModulo
      .map((a) => ({ ...a, chequeo: grafo.chequeoDeLaAccion(a.accion) }))
      .filter((a) => a.chequeo !== null && a.chequeo !== a.modulo)
      .map((a) => `${a.accion}: ${a.chequeo} en vez de ${a.modulo}`);
    expect(mal).toEqual([]);
  });
});

describe("el detector, contra archivos armados a mano", () => {
  const raiz = mkdtempSync(join(tmpdir(), "scrum-540-app-"));
  afterAll(() => rmSync(raiz, { recursive: true, force: true }));

  function archivo(ruta: string, contenido: string): string {
    const completo = join(raiz, ruta);
    mkdirSync(dirname(completo), { recursive: true });
    writeFileSync(completo, contenido);
    return completo;
  }

  const BIEN = `import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";
export default async function P() {
  const sinAcceso = await exigirModuloDeLaPagina("operations");
  if (sinAcceso) return sinAcceso;
  const x = await leer();
  return x;
}`;

  it("acepta el patrón y devuelve el módulo", () => {
    expect(guardiaDe(archivo("bien/page.tsx", BIEN))).toEqual({ estado: "ok", modulo: "operations" });
  });

  it("acepta el `if` con bloque y una función nombrada exportada aparte", () => {
    const texto = `async function P() {
  const s = await exigirModuloDeLaPagina("finance");
  if (s) { return s; }
  return null;
}
export default P;`;
    expect(guardiaDe(archivo("bloque/page.tsx", texto))).toEqual({ estado: "ok", modulo: "finance" });
  });

  it("⭐ señala una lectura antes del guardia", () => {
    const texto = BIEN.replace(
      '  const sinAcceso = await exigirModuloDeLaPagina("operations");',
      '  const antes = await leer();\n  const sinAcceso = await exigirModuloDeLaPagina("operations");'
    );
    expect(guardiaDe(archivo("tarde/page.tsx", texto)).estado).toBe("falta");
  });

  it("⭐ señala el guardia sin el corte (se llama pero no se devuelve)", () => {
    const texto = BIEN.replace("  if (sinAcceso) return sinAcceso;\n", "");
    expect(guardiaDe(archivo("sin-corte/page.tsx", texto)).estado).toBe("falta");
  });

  it("señala un guardia sólo en un comentario o un string", () => {
    const texto = `// exigirModuloDeLaPagina("operations")
export default async function P() {
  const t = "exigirModuloDeLaPagina(\\"operations\\")";
  return t;
}`;
    expect(guardiaDe(archivo("comentario/page.tsx", texto)).estado).toBe("falta");
  });

  it("señala una página de cliente", () => {
    const texto = `"use client";\n${BIEN}`;
    expect(guardiaDe(archivo("cliente/page.tsx", texto)).estado).toBe("falta");
  });

  it("deja la redirección por experiencia antes del guardia, y nada más", () => {
    const conExperiencia = `export default async function L({ children }) {
  await exigirRutaDeLaExperiencia("/agent");
  const sinAcceso = await exigirModuloDeLaPagina("agent");
  if (sinAcceso) return sinAcceso;
  return children;
}`;
    expect(guardiaDe(archivo("exp/layout.tsx", conExperiencia))).toEqual({ estado: "ok", modulo: "agent" });
    const conOtra = conExperiencia.replace("exigirRutaDeLaExperiencia", "leerAlgo");
    expect(guardiaDe(archivo("otra/layout.tsx", conOtra)).estado).toBe("falta");
  });

  it("un layout de navegación o banderas no lee; uno de cliente o con un provider, sí", () => {
    const soloBandera = `import { redirect } from "next/navigation";
import { ESCONDIDO } from "@/lib/release/escondido";
import type { ReactNode } from "react";
export default function L({ children }: { children: ReactNode }) { return children; }`;
    expect(layoutLee(archivo("bandera/layout.tsx", soloBandera))).toBe(false);
    expect(layoutLee(archivo("cliente/layout.tsx", `"use client";\nexport default function L() { return null; }`))).toBe(true);
    const conProvider = `import { AgentDataProvider } from "@/providers/agent-data-provider";\n${soloBandera}`;
    expect(layoutLee(archivo("provider/layout.tsx", conProvider))).toBe(true);
  });

  it("⭐ las actions: sigue imports de cliente y señala la lectura sin chequeo", () => {
    const web = join(raiz, "web");
    const accionesTs = `"use server";
import { rechazoPorModulo } from "@/lib/auth/acceso-a-modulo";
export async function listarBienAction() {
  if (!configurado()) return { success: true, data: [] };
  const rechazo = await rechazoPorModulo("operations");
  if (rechazo) return rechazo;
  return { success: true, data: await leer() };
}
export async function listarTardeAction() {
  const org = await requireOrganizationId();
  const rechazo = await rechazoPorModulo("operations");
  if (rechazo) return rechazo;
  return org;
}
export async function listarSinChequeoAction() {
  return leer();
}`;
    archivo("web/app/ops/actions.ts", accionesTs);
    archivo(
      "web/components/lista.tsx",
      `"use client";\nimport { listarBienAction, listarTardeAction } from "@/app/ops/actions";\nexport function Lista() { return null; }`
    );
    archivo(
      "web/components/index.ts",
      `export { Lista } from "./lista";\nexport const otra = () => import("../app/ops/actions");`
    );
    const pagina = archivo(
      "web/app/(platform)/ops/page.tsx",
      `import { Lista } from "@/components";\nimport type { X } from "@/app/ops/tipos";\nexport default function P() { return null; }`
    );
    const grafo = new GrafoDeImports(web);
    const acciones = [...grafo.accionesDesde(pagina)].sort();
    expect(acciones).toEqual([
      "app/ops/actions.ts#listarBienAction",
      "app/ops/actions.ts#listarSinChequeoAction",
      "app/ops/actions.ts#listarTardeAction",
    ]);
    expect(grafo.chequeoDeLaAccion("app/ops/actions.ts#listarBienAction")).toBe("operations");
    expect(grafo.chequeoDeLaAccion("app/ops/actions.ts#listarTardeAction")).toBeNull();
    expect(grafo.chequeoDeLaAccion("app/ops/actions.ts#listarSinChequeoAction")).toBeNull();
  });
});
