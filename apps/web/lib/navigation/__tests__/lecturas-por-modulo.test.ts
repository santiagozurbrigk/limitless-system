import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { permissionModuleForPath } from "@/lib/navigation/module-for-path";
import { pantallas, segmentosAlEntrar } from "./pantallas-de-app";
import {
  GrafoDeImports,
  LLAMADA_DEL_MARCO,
  NOMBRE_DE_LECTURA,
  entradasDeApp,
  guardiaDe,
  layoutLee,
  usosFueraDeLeerDelMarco,
  canalesSinChequeo,
  archivosEspeciales,
  exportsQueCorrenAparte,
  type ArchivoEspecial,
} from "./lecturas-de-app";
import { MODULOS_DE_LAS_LECTURAS_DEL_MARCO } from "@/lib/auth/lecturas-del-marco";

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
 *   4. Toda Server Action de lectura que alcanza el marco de la plataforma
 *      (el layout de `(platform)`: providers, barra, menú del celular) arranca
 *      con `rechazoDeLecturaDelMarco("<lectura>")`, y en el cliente del marco
 *      se pide sólo dentro de `leerDelMarco(permisos, "<lectura>", ...)` con
 *      la misma lectura, salvo las pocas que no son de ningún módulo.
 *
 * Lo que NO ve (documentado en `docs/arquitectura/auth-organizaciones-y-permisos.md`):
 *   - una action de lectura cuyo nombre no empieza con un verbo de lectura
 *     (`NOMBRE_DE_LECTURA`);
 *   - una action que alcanzan pantallas de dos módulos o una ruta libre (las
 *     del marco sí, por el punto 4);
 *   - en el cliente del marco, si `leerDelMarco` recibe los permisos reales:
 *     eso lo prueban los tests de cada provider;
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

/**
 * ⭐ Deuda conocida: Server Actions de lectura de un solo módulo que todavía
 * no chequean el permiso (devuelven el dato directo, sin `MutationResult`, y
 * sumarles el rechazo cambia la forma que esperan sus pantallas). Las
 * pantallas que las llaman ya no se dibujan sin el módulo (guardia de la
 * página), así que sólo se alcanzan llamándolas a mano. Ítem
 * `[PERMISOS-ACTIONS-LECTURA-SIN-MODULO]` en PENDIENTES. Al chequear una,
 * sacala de acá: el test falla si queda una que ya chequea.
 */
const LECTURAS_SIN_CHEQUEO_CONOCIDAS: string[] = [
  "app/agent/actions.ts#listAgentWorkspaceAction",
  "app/agent/graph-canvas-actions.ts#getGraphDataForCanvasAction",
  "app/auth/current-user-actions.ts#getCurrentUserIdAction",
  "app/business-context/actions.ts#getBusinessContextDocumentsAction",
  "app/business-context/actions.ts#getCustomCategoriesAction",
  "app/business-context/actions.ts#getDocumentByIdAction",
  "app/business-context/actions.ts#getFathomContextCallsAction",
  "app/business-context/actions.ts#getGoogleDocsListAction",
  "app/business-context/actions.ts#getGoogleSheetsListAction",
  "app/business-context/actions.ts#previewGoogleDriveFileAction",
  "app/clients/custom-field-actions.ts#listFieldDefinitionsAction",
  "app/clients/win-actions.ts#listWinsAction",
  "app/clients/win-page-actions.ts#getWinsPageDataAction",
  "app/discord/actions.ts#getClientDiscordActivityAction",
  "app/discord/actions.ts#getClientsDiscordActivityAction",
  "app/discord/actions.ts#getDiscordSettingsAction",
  "app/discord/actions.ts#listDiscordGuildChannelsAction",
  "app/discord/actions.ts#listWinCandidatesAction",
  "app/executive-reports/actions.ts#getExecutiveReportByIdAction",
  "app/executive-reports/actions.ts#listExecutiveReportsAction",
  "app/fathom/actions.ts#getSalesCallsAction",
  "app/fathom/actions.ts#listPendingFathomCallsAction",
  "app/fathom/actions.ts#loadClientTimelineAction",
  "app/fathom/member-actions.ts#listFathomMemberStatusesAction",
  "app/fathom/one-on-one-actions.ts#getClientOneOnOnesAction",
  "app/fathom/sales-call-actions.ts#listLinkableAppointmentsAction",
  "app/fathom/sales-call-actions.ts#listUnlinkedRecordingsAction",
  "app/forms/actions.ts#getFormDetailAction",
  "app/forms/actions.ts#getGoogleFormsIntegrationStatusAction",
  "app/forms/actions.ts#listFormsAction",
  "app/funnels/actions.ts#getFunnelAction",
  "app/funnels/actions.ts#getFunnelBindingsAction",
  "app/funnels/actions.ts#listFunnelFormOptionsAction",
  "app/funnels/actions.ts#listFunnelIndexAction",
  "app/funnels/actions.ts#listFunnelInstancesAction",
  "app/funnels/actions.ts#listFunnelTemplatesAction",
  "app/ghl/opportunity-actions.ts#getGHLOpportunitiesStatusAction",
  "app/ghl/opportunity-actions.ts#listGHLStageOptionsAction",
  "app/hyros/actions.ts#getHyrosStatusAction",
  "app/integrations/actions.ts#getIntegrationsOverviewAction",
  "app/integrations/clickup/import-actions.ts#fetchClickUpListsAction",
  "app/integrations/clickup/import-actions.ts#fetchClickUpPreviewAction",
  "app/integrations/zernio/actions.ts#getZernioAnalysisBatchAction",
  "app/integrations/zernio/actions.ts#getZernioAnalyticsAction",
  "app/integrations/zernio/actions.ts#getZernioMessagesAction",
  "app/integrations/zernio/actions.ts#listZernioCommentsAction",
  "app/integrations/zernio/actions.ts#listZernioConversationsAction",
  "app/lanzamientos/actions.ts#listLaunchPickerOptionsAction",
  "app/manychat/actions.ts#getManyChatIntegrationStatusAction",
  "app/manychat/cta-actions.ts#getManyChatCTAStatsAction",
  "app/marketing/actions.ts#getClosedBuyerJourneysAction",
  "app/marketing/actions.ts#getSalesContentRankAction",
  "app/marketing/automations-actions.ts#listAutomationFlowsAction",
  "app/marketing/lead-magnets-actions.ts#getLeadMagnetLeadsAction",
  "app/marketing/lead-magnets-actions.ts#getLeadMagnetsAction",
  "app/marketing/utm-actions.ts#getOrganizationWebsiteAction",
  "app/marketing/utm-actions.ts#getUTMLinksAction",
  "app/metrics/actions.ts#getCustomMetricsAction",
  "app/operations/actions.ts#getCurrentWeekStartAction",
  "app/operations/actions.ts#getWeeklyCompletionStatus",
  "app/operations/actions.ts#getWeeklyInputsAction",
  "app/operations/actions.ts#getWeeklyInputsForWeekAction",
  "app/operations/actions.ts#getWeeklyInputsHistoryAction",
  "app/operations/actions.ts#getWeeklyReportAction",
  "app/payments/actions.ts#getPaymentIntegrationsStatusAction",
  "app/product/actions.ts#getSalesFrameworksAction",
  "app/settings/actions.ts#getClaudeApiKeyStatusAction",
  "app/settings/actions.ts#getNotificationPreferencesAction",
  "app/settings/actions.ts#getOrganizationSettingsAction",
  "app/sops/video-actions.ts#getSopVideoJobAction",
  "app/vturb/actions.ts#getVTurbStatusAction",
  "app/vturb/actions.ts#listVTurbPlayerOptionsAction",
  "app/webinarjam/actions.ts#getWebinarJamStatusAction",
];

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

/**
 * Lo que un archivo especial de una ruta con módulo tiene mal, o null.
 * `template` y `default` se tratan como un layout; `loading`, `error` y
 * `not-found` no pueden leer (ni una action de lectura ni la base).
 */
function especialMal(grafo: GrafoDeImports, appDir: string, e: ArchivoEspecial): string | null {
  const ruta = rutaDeCarpeta(appDir, dirname(e.archivo));
  const modulo = permissionModuleForPath(ruta);
  if (modulo === null) return null;
  const rel = `app/${relative(appDir, e.archivo)}`;
  if (e.tipo === "template" || e.tipo === "default") {
    if (!layoutLee(e.archivo)) return null;
    const g = guardiaDe(e.archivo);
    if (g.estado === "falta") return `${rel}: lee y ${g.motivo}`;
    if (g.modulo !== modulo) return `${rel}: pide ${g.modulo}, la ruta es de ${modulo}`;
    return null;
  }
  const lecturas = [...grafo.accionesDesde(e.archivo)].filter((a) => NOMBRE_DE_LECTURA.test(a.split("#")[1]!));
  if (lecturas.length > 0) return `${rel}: alcanza ${lecturas.join(", ")}`;
  if (grafo.leeEnElServidor(e.archivo)) return `${rel}: lee la base en el servidor`;
  return null;
}

describe("lo que Next ejecuta aparte de la página (AR 1 de SCRUM-540)", () => {
  const grafo = new GrafoDeImports(WEB);
  const todas = pantallas(APP_DIR);

  it("⭐ ninguna página ni layout con módulo exporta generateMetadata ni generateViewport (corren aunque la página corte)", () => {
    const archivos = new Set<string>();
    for (const p of todas) {
      if (permissionModuleForPath(p.ruta) === null) continue;
      archivos.add(join(APP_DIR, p.archivo));
      for (const l of p.layouts) {
        if (permissionModuleForPath(rutaDeCarpeta(APP_DIR, dirname(l))) !== null) archivos.add(l);
      }
    }
    const mal = [...archivos]
      .map((f) => ({ f, e: exportsQueCorrenAparte(f) }))
      .filter((x) => x.e.length > 0)
      .map((x) => `app/${relative(APP_DIR, x.f)}: ${x.e.join(", ")}`);
    expect(mal).toEqual([]);
  });

  it("⭐ todo template, default, loading, error y not-found de una ruta con módulo cumple su regla", () => {
    const especiales = archivosEspeciales(APP_DIR);
    // El recorrido ve los que hay (los error.tsx de los segmentos).
    expect(especiales.some((e) => e.tipo === "error" && e.archivo.includes("workboard"))).toBe(true);
    expect(especiales.map((e) => especialMal(grafo, APP_DIR, e)).filter(Boolean)).toEqual([]);
  });
});

/**
 * Lecturas que alcanza el marco y no son de ningún módulo, con el porqué.
 * Agregar una exige decir por qué cualquier miembro puede recibirla.
 */
const LECTURAS_DEL_MARCO_SIN_MODULO: Record<string, string> = {
  "app/conversations/actions.ts#getOrganizationIdAction":
    "sólo el id de la organización activa; el canal en vivo que lo usa se abre con la lectura de conversaciones",
  "app/profile/actions.ts#getProfileAreaDataAction": "el perfil de quien entra, para su propio menú",
};

describe("lecturas del marco de la plataforma (SCRUM-540)", () => {
  const grafo = new GrafoDeImports(WEB);
  const marco = join(APP_DIR, "(platform)", "layout.tsx");
  const delMarco = [...grafo.accionesDesde(marco)]
    .filter((a) => NOMBRE_DE_LECTURA.test(a.split("#")[1]!))
    .sort();
  const lecturaDe = new Map(
    delMarco
      .map((a) => [a, grafo.chequeoDeLaAccion(a, LLAMADA_DEL_MARCO)] as const)
      .filter((par): par is readonly [string, string] => par[1] !== null)
  );

  it("el recorrido encuentra las de los providers, la barra y el menú del celular", () => {
    expect(delMarco).toEqual(
      expect.arrayContaining([
        "app/clients/actions.ts#listClientsAction",
        "app/finance/actions.ts#loadFinanceConfigAction",
        "app/executive-reports/actions.ts#getLatestReportsByCadenceAction",
        "app/fathom/actions.ts#countPendingFathomCallsAction",
      ])
    );
  });

  it("⭐ toda lectura del marco arranca con rechazoDeLecturaDelMarco de una lectura de la tabla, o no es de ningún módulo", () => {
    const mal = delMarco
      .filter((a) => !(a in LECTURAS_DEL_MARCO_SIN_MODULO))
      .map((a) => {
        const lectura = lecturaDe.get(a);
        if (!lectura) return `${a}: no arranca con ${LLAMADA_DEL_MARCO}("<lectura>")`;
        if (!(lectura in MODULOS_DE_LAS_LECTURAS_DEL_MARCO)) return `${a}: "${lectura}" no está en la tabla`;
        return null;
      })
      .filter(Boolean);
    expect(mal).toEqual([]);
  });

  it("⭐ en el cliente del marco, cada lectura se pide dentro de leerDelMarco con la misma lectura que chequea el servidor", () => {
    expect(usosFueraDeLeerDelMarco(grafo, marco, lecturaDe)).toEqual([]);
  });

  it("⭐ todo canal en vivo de Supabase que abre el marco corta antes si la persona no puede leer", () => {
    // El recorrido sí pasa por el canal de conversaciones del provider de la plataforma.
    const provider = join(WEB, "providers", "platform-data-provider.tsx");
    expect(grafo.archivosDesde(marco)).toContain(provider);
    expect(readFileSync(provider, "utf8")).toContain(".channel(");
    expect(canalesSinChequeo(grafo, marco)).toEqual([]);
  });

  it("⭐ quien pide con leerDelMarco toma los permisos con identidad estable (usePermisosDeModulo), no con usePermissions", () => {
    // Con `usePermissions()` los providers volverían a pedir todo en cada `router.refresh()`: el layout
    // manda los permisos como un objeto nuevo aunque no cambien.
    const conLeer = grafo
      .archivosDesde(marco)
      .filter((f) => grafo.info(f).directiva !== "servidor")
      .filter((f) => /\bleerDelMarco\s*[<(]/.test(readFileSync(f, "utf8")));
    expect(conLeer.length).toBeGreaterThanOrEqual(5);
    const mal = conLeer
      .filter((f) => /\busePermissions\(\)/.test(readFileSync(f, "utf8")))
      .map((f) => relative(WEB, f));
    expect(mal).toEqual([]);
  });

  it("la lista de las que no son de ningún módulo sólo tiene lecturas del marco que no chequean", () => {
    const sobran = Object.keys(LECTURAS_DEL_MARCO_SIN_MODULO).filter(
      (a) => !delMarco.includes(a) || lecturaDe.has(a)
    );
    expect(sobran).toEqual([]);
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

  it("⭐ el marco: señala una lectura pedida fuera de leerDelMarco o con otra lectura", () => {
    archivo(
      "marco/app/datos/actions.ts",
      `"use server";
export async function listDatosAction() {
  const rechazo = await rechazoDeLecturaDelMarco("clientes");
  if (rechazo) return rechazo;
  return [];
}`
    );
    archivo(
      "marco/providers/bien.tsx",
      `"use client";
import { listDatosAction } from "@/app/datos/actions";
export const leer = (p) => leerDelMarco(p, "clientes", listDatosAction, []);
export const leerEnvuelto = (p) => leerDelMarco(p, "clientes", () => listDatosAction(), []);`
    );
    archivo(
      "marco/providers/mal.tsx",
      `"use client";
import { listDatosAction as listar } from "@/app/datos/actions";
export const directo = () => listar();
export const otra = (p) => leerDelMarco(p, "reportesEjecutivos", listar, []);`
    );
    archivo(
      "marco/providers/espacio.tsx",
      `"use client";
import * as acciones from "@/app/datos/actions";
export const bien = (p) => leerDelMarco(p, "clientes", acciones.listDatosAction, []);
export const directo = () => acciones.listDatosAction();`
    );
    const layout = archivo(
      "marco/app/(platform)/layout.tsx",
      `import "@/providers/bien";\nimport "@/providers/mal";\nimport "@/providers/espacio";\nexport default function L() { return null; }`
    );
    const grafo = new GrafoDeImports(join(raiz, "marco"));
    const accion = "app/datos/actions.ts#listDatosAction";
    expect(grafo.chequeoDeLaAccion(accion, LLAMADA_DEL_MARCO)).toBe("clientes");
    expect(usosFueraDeLeerDelMarco(grafo, layout, new Map([[accion, "clientes"]])).sort()).toEqual([
      "providers/espacio.tsx:4 acciones.listDatosAction fuera de leerDelMarco",
      "providers/mal.tsx:3 listar fuera de leerDelMarco",
      'providers/mal.tsx:4 listar con "reportesEjecutivos" en vez de "clientes"',
    ]);
  });

  it("⭐ el marco: señala un canal en vivo sin chequeo, con el chequeo tarde o con la lectura de otra tabla", () => {
    const canal = (tabla: string) =>
      `supabase.channel("x").on("postgres_changes", { event: "INSERT", schema: "public", table: "${tabla}" }, () => {})`;
    archivo(
      "canal/providers/p.tsx",
      `"use client";
export function bien(permisos, supabase) {
  useEffect(() => {
    if (!puedeLeerDelMarco(permisos, "conversaciones")) return;
    void (async () => { ${canal("conversations")}; })();
  }, []);
}
export function mal(supabase) {
  useEffect(() => {
    void (async () => { ${canal("conversations")}; })();
  }, []);
}
export function tarde(permisos, supabase) {
  ${canal("conversations")};
  if (!puedeLeerDelMarco(permisos, "conversaciones")) return;
}
export function otraLectura(permisos, supabase) {
  if (!puedeLeerDelMarco(permisos, "clientes")) return;
  ${canal("conversations")};
}
export function tablaSinLectura(permisos, supabase) {
  if (!puedeLeerDelMarco(permisos, "clientes")) return;
  ${canal("fixed_expenses")};
}`
    );
    const layout = archivo("canal/app/layout.tsx", `import "@/providers/p";\nexport default function L() { return null; }`);
    expect(canalesSinChequeo(new GrafoDeImports(join(raiz, "canal")), layout)).toEqual([
      "providers/p.tsx:10 sin chequeo",
      "providers/p.tsx:14 sin chequeo",
      'providers/p.tsx:19 chequea "clientes" y escucha conversations',
      "providers/p.tsx:23 escucha fixed_expenses, sin lectura del marco",
    ]);
  });


  it("⭐ lo que corre aparte: generateMetadata, un template que lee, uno de cliente, y un error o un loading que leen", () => {
    const app = join(raiz, "esp", "app");
    const meta = archivo(
      "esp/app/(platform)/sops/[id]/page.tsx",
      `import { exigirModuloDeLaPagina } from "@/lib/auth/acceso-a-modulo";
export async function generateMetadata({ params }) { return { title: (await leerSop(params)).title }; }
export default async function P() {
  const sinAcceso = await exigirModuloDeLaPagina("operations");
  if (sinAcceso) return sinAcceso;
  return null;
}`
    );
    expect(exportsQueCorrenAparte(meta)).toEqual(["generateMetadata"]);
    expect(exportsQueCorrenAparte(archivo("esp/static/page.tsx", `export const metadata = { title: "X" };\nexport default function P() { return null; }`))).toEqual([]);
    archivo("esp/app/finance/actions.ts", `"use server";\nexport async function loadDatosAction() { return []; }`);
    archivo("esp/lib/supabase/server.ts", `export async function createClient() { return null; }`);
    archivo(
      "esp/app/(platform)/finance/template.tsx",
      `import { createClient } from "@/lib/supabase/server";\nexport default async function T({ children }) { await createClient(); return children; }`
    );
    archivo(
      "esp/app/(platform)/finance/expenses/template.tsx",
      `"use client";\nimport { loadDatosAction } from "@/app/finance/actions";\nexport default function T({ children }) { void loadDatosAction(); return children; }`
    );
    archivo(
      "esp/app/(platform)/finance/error.tsx",
      `"use client";\nimport { loadDatosAction } from "@/app/finance/actions";\nexport default function E() { void loadDatosAction(); return null; }`
    );
    archivo(
      "esp/app/(platform)/finance/expenses/loading.tsx",
      `import { createClient } from "@/lib/supabase/server";\nexport default async function L() { await createClient(); return null; }`
    );
    archivo("esp/app/(platform)/workboard/error.tsx", `"use client";\nexport default function E() { return null; }`);
    const grafo = new GrafoDeImports(join(raiz, "esp"));
    const mal = archivosEspeciales(app)
      .map((e) => especialMal(grafo, app, e))
      .filter(Boolean)
      .sort();
    expect(mal).toEqual([
      "app/(platform)/finance/error.tsx: alcanza app/finance/actions.ts#loadDatosAction",
      expect.stringMatching(/^app\/\(platform\)\/finance\/expenses\/loading\.tsx: lee la base/),
      expect.stringMatching(/^app\/\(platform\)\/finance\/expenses\/template\.tsx: lee y es un componente de cliente/),
      expect.stringMatching(/^app\/\(platform\)\/finance\/template\.tsx: lee y no arranca con/),
    ]);
  });
});
